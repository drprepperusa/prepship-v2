import { randomUUID } from "node:crypto";
import type { QueueRepository } from "./queue-repository.ts";
import type { AddToQueueInput, PrintQueueEntry, PrintQueueSummary } from "../domain/queue.ts";
import { InputValidationError } from "../../../../../../packages/contracts/src/common/input-validation.ts";

// ─── In-memory PDF merge job tracker ─────────────────────────────────────────
export interface MergeJob {
  jobId: string;
  status: 'pending' | 'running' | 'done' | 'error';
  progress: number;  // 0–100
  total: number;
  current: number;
  message: string;
  mergedPdfBase64?: string;
  fileName?: string;
  errorMessage?: string;
  createdAt: number;
}

const mergeJobs = new Map<string, MergeJob>();

// Clean up jobs older than 30 minutes
function cleanOldJobs(): void {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, job] of mergeJobs.entries()) {
    if (job.createdAt < cutoff) mergeJobs.delete(id);
  }
}

export class QueueServices {
  private readonly repo: QueueRepository;

  constructor(repo: QueueRepository) {
    this.repo = repo;
  }

  // ── CRITICAL #1: GET /api/queue — hydrate from DB ────────────────────────
  getQueueForClient(clientId: number, includePrinted = false): { ok: true; queuedOrders: object[]; totalOrders: number; totalQty: number } {
    if (!clientId || !Number.isFinite(clientId)) {
      throw new InputValidationError("client_id is required");
    }

    // Return queued + optionally printed (for history view)
    const allEntries = includePrinted
      ? this.repo.getByClient(clientId)
      : this.repo.getByClient(clientId, 'queued');
    const entries = allEntries;
    const totalQty = entries.reduce((sum, e) => sum + (e.orderQty ?? 1), 0);

    return {
      ok: true,
      queuedOrders: entries.map(e => ({
        queue_entry_id: e.id,
        order_id: e.orderId,
        order_number: e.orderNumber,
        client_id: e.clientId,
        label_url: e.labelUrl,
        sku_group_id: e.skuGroupId,
        primary_sku: e.primarySku,
        item_description: e.itemDescription,
        order_qty: e.orderQty,
        multi_sku_data: e.multiSkuData,
        status: e.status,
        print_count: e.printCount,
        last_printed_at: e.lastPrintedAt ? new Date(e.lastPrintedAt * 1000).toISOString() : null,
        queued_at: new Date(e.queuedAt * 1000).toISOString(),
      })),
      totalOrders: entries.length,
      totalQty,
    };
  }

  // ── CRITICAL #2: Atomic add-to-queue ─────────────────────────────────────
  addToQueue(body: unknown): { ok: true; queue_entry_id: string; queued_at: string; already_queued: boolean } {
    const raw = body as Record<string, unknown>;

    if (!raw.order_id || typeof raw.order_id !== 'string') {
      throw new InputValidationError("order_id is required");
    }
    if (!raw.client_id || !Number.isFinite(Number(raw.client_id))) {
      throw new InputValidationError("client_id is required");
    }
    if (!raw.label_url || typeof raw.label_url !== 'string') {
      throw new InputValidationError("label_url is required");
    }
    if (!raw.sku_group_id || typeof raw.sku_group_id !== 'string') {
      throw new InputValidationError("sku_group_id is required");
    }

    const clientId = Number(raw.client_id);
    const orderId = raw.order_id;

    // Check if already queued (for already_queued flag in response)
    const existing = this.repo.findByOrderId(orderId, clientId);
    const alreadyQueued = existing !== null && existing.status === 'queued';

    // Always upsert — this ensures label_url is updated if re-queued with fresh URL
    // (e.g. after void + re-create). UPSERT in DB handles the ON CONFLICT logic.
    const input: AddToQueueInput = {
      clientId,
      orderId,
      orderNumber: typeof raw.order_number === 'string' ? raw.order_number : undefined,
      labelUrl: raw.label_url,
      skuGroupId: raw.sku_group_id,
      primarySku: typeof raw.primary_sku === 'string' ? raw.primary_sku : undefined,
      itemDescription: typeof raw.item_description === 'string' ? raw.item_description : undefined,
      orderQty: typeof raw.order_qty === 'number' ? raw.order_qty : 1,
      multiSkuData: Array.isArray(raw.multi_sku_data) ? raw.multi_sku_data as never : undefined,
    };

    const entry = this.repo.add(input);

    return {
      ok: true,
      queue_entry_id: entry.id,
      queued_at: new Date(entry.queuedAt * 1000).toISOString(),
      already_queued: alreadyQueued,
    };
  }

  removeFromQueue(entryId: string, clientId: number): { ok: true; removed_entry: string } {
    const entry = this.repo.findById(entryId);
    if (!entry) throw new Error(`Queue entry not found: ${entryId}`);
    if (entry.clientId !== clientId) throw new Error("Unauthorized");
    this.repo.remove(entryId);
    return { ok: true, removed_entry: entryId };
  }

  clearQueue(clientId: number): { ok: true; cleared_count: number } {
    if (!clientId || !Number.isFinite(clientId)) {
      throw new InputValidationError("client_id is required");
    }
    const count = this.repo.clearByClient(clientId);
    return { ok: true, cleared_count: count };
  }

  // ── CRITICAL #5: Async PDF merge — start job, return jobId ───────────────
  startPrintJob(body: unknown): { ok: true; job_id: string; total: number } {
    const raw = body as Record<string, unknown>;
    if (!raw.client_id) throw new InputValidationError("client_id is required");
    if (!Array.isArray(raw.queue_entry_ids) || raw.queue_entry_ids.length === 0) {
      throw new InputValidationError("queue_entry_ids must be a non-empty array");
    }

    const clientId = Number(raw.client_id);
    const entryIds = raw.queue_entry_ids as string[];
    const mergeHeaders = raw.merge_headers !== false;

    // Fetch all entries to validate
    const entries: PrintQueueEntry[] = [];
    for (const id of entryIds) {
      const entry = this.repo.findById(id);
      if (!entry) throw new Error(`Queue entry not found: ${id}`);
      if (entry.clientId !== clientId) throw new Error(`Unauthorized entry: ${id}`);
      entries.push(entry);
    }

    cleanOldJobs();

    const jobId = randomUUID();
    const job: MergeJob = {
      jobId,
      status: 'pending',
      progress: 0,
      total: entries.length,
      current: 0,
      message: `Starting merge of ${entries.length} label${entries.length !== 1 ? 's' : ''}…`,
      createdAt: Date.now(),
    };
    mergeJobs.set(jobId, job);

    // Run async (do not await)
    void this.runMergeJob(jobId, entries, mergeHeaders, clientId);

    return { ok: true, job_id: jobId, total: entries.length };
  }

  getMergeJobStatus(jobId: string): MergeJob | null {
    return mergeJobs.get(jobId) ?? null;
  }

  // ── Private: actual PDF merge logic ──────────────────────────────────────
  private async runMergeJob(
    jobId: string,
    entries: PrintQueueEntry[],
    mergeHeaders: boolean,
    clientId: number,
  ): Promise<void> {
    const job = mergeJobs.get(jobId)!;
    job.status = 'running';
    job.message = 'Initializing PDF merge…';

    try {
      // Dynamic import of pdf-lib to avoid top-level import issues
      const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");

      const mergedPdf = await PDFDocument.create();
      const font = await mergedPdf.embedFont(StandardFonts.HelveticaBold);
      const fontRegular = await mergedPdf.embedFont(StandardFonts.Helvetica);

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]!;
        job.current = i;
        job.progress = Math.round((i / entries.length) * 90);
        job.message = `Merging label ${i + 1} of ${entries.length}…`;

        // ── CRITICAL #4: ShipStation URL 404/410 error handling ────────────
        // No caching — fetch directly, handle 404/410 gracefully
        let labelPdfBytes: Uint8Array | null = null;
        let labelError: string | null = null;

        try {
          const response = await fetch(entry.labelUrl, {
            headers: { 'Accept': 'application/pdf' },
            signal: AbortSignal.timeout(15_000),
          });

          if (response.status === 404 || response.status === 410) {
            labelError = `Label expired for order ${entry.orderNumber ?? entry.orderId} (HTTP ${response.status}). Re-create label and re-queue.`;
          } else if (!response.ok) {
            labelError = `Failed to fetch label for order ${entry.orderNumber ?? entry.orderId} (HTTP ${response.status}).`;
          } else {
            const buffer = await response.arrayBuffer();
            labelPdfBytes = new Uint8Array(buffer);
          }
        } catch (fetchErr) {
          const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
          labelError = `Network error fetching label for order ${entry.orderNumber ?? entry.orderId}: ${msg}`;
        }

        if (labelError) {
          // Add an error page instead of the label
          const errPage = mergedPdf.addPage([288, 432]); // 4"×6" at 72dpi
          errPage.drawText('LABEL FETCH ERROR', { x: 20, y: 390, size: 14, font, color: rgb(0.8, 0, 0) });
          errPage.drawText(`Order: ${entry.orderNumber ?? entry.orderId}`, { x: 20, y: 365, size: 10, font: fontRegular, color: rgb(0.2, 0.2, 0.2) });
          errPage.drawText(labelError, { x: 20, y: 345, size: 8, font: fontRegular, color: rgb(0.5, 0, 0), maxWidth: 248, lineHeight: 12 });
          continue;
        }

        // Add header page if requested
        if (mergeHeaders) {
          const headerPage = mergedPdf.addPage([288, 432]); // 4"×6" at 72dpi
          this.drawHeaderPage(headerPage, entry, i + 1, entries.length, font, fontRegular, rgb);
        }

        // Embed the label PDF
        try {
          const labelDoc = await PDFDocument.load(labelPdfBytes!);
          const pageIndices = labelDoc.getPageIndices();
          const copiedPages = await mergedPdf.copyPages(labelDoc, pageIndices);
          for (const page of copiedPages) {
            mergedPdf.addPage(page);
          }
        } catch (pdfErr) {
          // If the label PDF is malformed, add error page
          const errPage = mergedPdf.addPage([288, 432]);
          errPage.drawText('PDF ERROR', { x: 20, y: 390, size: 14, font, color: rgb(0.8, 0, 0) });
          errPage.drawText(`Order: ${entry.orderNumber ?? entry.orderId}`, { x: 20, y: 365, size: 10, font: fontRegular, color: rgb(0.2, 0.2, 0.2) });
        }
      }

      job.progress = 95;
      job.message = 'Finalizing PDF…';

      const pdfBytes = await mergedPdf.save();
      const base64 = Buffer.from(pdfBytes).toString('base64');

      const now = new Date();
      const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
      const fileName = `batch_print_${ts}.pdf`;

      // Mark entries as printed
      const printedAt = Math.floor(Date.now() / 1000);
      this.repo.markPrinted(entries.map(e => e.id), printedAt);

      job.status = 'done';
      job.progress = 100;
      job.current = entries.length;
      job.message = `Done — ${entries.length} label${entries.length !== 1 ? 's' : ''} merged.`;
      job.mergedPdfBase64 = base64;
      job.fileName = fileName;

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      job.status = 'error';
      job.errorMessage = message;
      job.message = `Error: ${message}`;
    }
  }

  private drawHeaderPage(
    page: ReturnType<import("pdf-lib").PDFDocument['addPage']>,
    entry: PrintQueueEntry,
    orderIndex: number,
    totalOrders: number,
    font: import("pdf-lib").PDFFont,
    fontRegular: import("pdf-lib").PDFFont,
    rgb: typeof import("pdf-lib").rgb,
  ): void {
    const { width, height } = page.getSize();
    const cx = width / 2;

    // Background
    page.drawRectangle({
      x: 0, y: 0, width, height,
      color: rgb(1, 1, 1),
    });

    // Header band
    page.drawRectangle({
      x: 0, y: height - 36, width, height: 36,
      color: rgb(0.1, 0.1, 0.1),
    });
    page.drawText('BATCH HEADER', {
      x: cx - 42, y: height - 24,
      size: 10, font, color: rgb(1, 1, 1),
    });

    let y = height - 60;

    if (entry.multiSkuData && entry.multiSkuData.length > 0) {
      // Multi-SKU header
      page.drawText('MULTI-SKU', {
        x: cx - font.widthOfTextAtSize('MULTI-SKU', 22) / 2,
        y, size: 22, font, color: rgb(0.1, 0.1, 0.1),
      });
      y -= 32;

      for (const item of entry.multiSkuData) {
        const skuLine = `${item.sku}: Qty ${item.qty}`;
        page.drawText(skuLine, {
          x: cx - fontRegular.widthOfTextAtSize(skuLine, 11) / 2,
          y, size: 11, font: fontRegular, color: rgb(0.3, 0.3, 0.3),
        });
        y -= 16;
      }
      y -= 8;

      const totalQty = entry.multiSkuData.reduce((s, i) => s + i.qty, 0);
      const qtyLine = `QTY: ${totalQty} (per order)`;
      page.drawText(qtyLine, {
        x: cx - font.widthOfTextAtSize(qtyLine, 16) / 2,
        y, size: 16, font, color: rgb(0.1, 0.1, 0.1),
      });
    } else {
      // Single-SKU header
      const sku = entry.primarySku ?? 'UNKNOWN SKU';
      page.drawText(sku, {
        x: cx - font.widthOfTextAtSize(sku, Math.min(26, 18)) / 2,
        y, size: Math.min(26, 18), font, color: rgb(0.1, 0.1, 0.1),
      });
      y -= 32;

      if (entry.itemDescription) {
        page.drawText(entry.itemDescription, {
          x: cx - fontRegular.widthOfTextAtSize(entry.itemDescription, 12) / 2,
          y, size: 12, font: fontRegular, color: rgb(0.3, 0.3, 0.3),
        });
        y -= 22;
      }

      const qtyLine = `QTY: ${entry.orderQty} (per order)`;
      page.drawText(qtyLine, {
        x: cx - font.widthOfTextAtSize(qtyLine, 18) / 2,
        y, size: 18, font, color: rgb(0.1, 0.1, 0.1),
      });
    }

    y -= 28;

    // Order count
    const orderLine = `${orderIndex} of ${totalOrders} ORDERS`;
    page.drawText(orderLine, {
      x: cx - fontRegular.widthOfTextAtSize(orderLine, 14) / 2,
      y, size: 14, font: fontRegular, color: rgb(0.2, 0.2, 0.2),
    });

    // Bottom divider
    page.drawLine({
      start: { x: 20, y: 24 }, end: { x: width - 20, y: 24 },
      thickness: 0.5, color: rgb(0.8, 0.8, 0.8),
    });

    const orderNum = entry.orderNumber ?? entry.orderId;
    page.drawText(`Order: ${orderNum}`, {
      x: cx - fontRegular.widthOfTextAtSize(`Order: ${orderNum}`, 9) / 2,
      y: 10, size: 9, font: fontRegular, color: rgb(0.5, 0.5, 0.5),
    });
  }
}
