import type { TransitionalSecrets } from "../../../../../../../packages/shared/src/config/secrets-adapter.ts";

export interface AlertingConfig {
  slackWebhookUrl?: string;
  sentryDsn?: string;
}

export class AlertingService {
  private readonly config: AlertingConfig;

  constructor(secrets: TransitionalSecrets) {
    this.config = {
      slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
      sentryDsn: process.env.SENTRY_DSN,
    };
  }

  async alertCriticalSync(unresolvedCount: number, alignmentPct: number, affectedOrderIds: number[] = []): Promise<void> {
    if (this.config.slackWebhookUrl) {
      await this.postSlackAlert(unresolvedCount, alignmentPct, affectedOrderIds);
    }

    if (this.config.sentryDsn) {
      this.captureToSentry(unresolvedCount, alignmentPct);
    }
  }

  async alertWarningSync(unresolvedCount: number, alignmentPct: number): Promise<void> {
    if (this.config.sentryDsn && unresolvedCount > 0) {
      this.captureToSentry(unresolvedCount, alignmentPct, "warning");
    }
  }

  private async postSlackAlert(unresolvedCount: number, alignmentPct: number, affectedOrderIds: number[]): Promise<void> {
    const webhook = this.config.slackWebhookUrl;
    if (!webhook) return;

    const orderIds = affectedOrderIds.slice(0, 3);
    const orderIdList = orderIds.length > 0 
      ? `\nAffected orders: ${orderIds.join(", ")}${affectedOrderIds.length > 3 ? `... and ${affectedOrderIds.length - 3} more` : ""}`
      : "";

    const dashboardLink = process.env.MANUAL_REVIEW_DASHBOARD_URL 
      ? `\n<${process.env.MANUAL_REVIEW_DASHBOARD_URL}|View manual review dashboard>`
      : "";

    const payload = {
      text: `⚠️ Order sync critical: ${unresolvedCount} unresolved discrepancies detected`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `⚠️ *Order Sync Critical Alert*\n\n*Unresolved Discrepancies:* ${unresolvedCount}\n*Alignment:* ${alignmentPct.toFixed(2)}%${orderIdList}${dashboardLink}`,
          },
        },
      ],
    };

    try {
      const response = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error(`[alerting] Slack alert failed: ${response.statusText}`);
      }
    } catch (error) {
      console.error(`[alerting] Slack alert error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private captureToSentry(unresolvedCount: number, alignmentPct: number, level: "warning" | "error" = "error"): void {
    // Sentry integration would go here
    // For now, just log it
    const message = `Order sync ${level}: ${unresolvedCount} unresolved discrepancies, alignment ${alignmentPct.toFixed(2)}%`;
    
    if (level === "error") {
      console.error(`[sentry] ${message}`);
    } else {
      console.warn(`[sentry] ${message}`);
    }

    // TODO: Integrate actual Sentry SDK when available
    // Sentry.captureMessage(message, { level, extra: { unresolved_count: unresolvedCount, alignment_pct: alignmentPct } });
  }
}
