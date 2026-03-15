import type { AddToQueueInput, PrintQueueEntry } from "../domain/queue.ts";

export interface QueueRepository {
  add(input: AddToQueueInput): PrintQueueEntry;
  getByClient(clientId: number, status?: 'queued' | 'printed'): PrintQueueEntry[];
  findById(id: string): PrintQueueEntry | null;
  findByOrderId(orderId: string, clientId: number): PrintQueueEntry | null;
  markPrinted(ids: string[], printedAt: number): void;
  remove(id: string): void;
  clearByClient(clientId: number): number;
}
