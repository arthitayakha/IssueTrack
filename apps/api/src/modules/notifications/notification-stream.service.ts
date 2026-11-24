import { Injectable } from "@nestjs/common";
import { Subject } from "rxjs";

/** Shape Nest's `@Sse()` serializer understands (see SseStream._transform). */
export interface NotificationStreamMessage {
  type?: string;
  data?: unknown;
  id?: string;
  retry?: number;
}

/**
 * In-memory fan-out of brand-new notification rows to the browsers that are
 * currently connected. One Subject per open `/notifications/stream` request,
 * grouped by user id, so `notify()` only pokes the people it was addressed to.
 *
 * Deliberately best-effort: `emit()` is a plain synchronous `next()` with no
 * I/O and no throw path — a disconnected or half-open browser can never break
 * (or even slow down) the request that created the notification. Single-process
 * only; a multi-instance deploy would need Redis pub/sub behind this class.
 */
@Injectable()
export class NotificationStreamService {
  private readonly clients = new Map<number, Set<Subject<NotificationStreamMessage>>>();

  /** Register a browser and return the Subject the SSE route will subscribe to. */
  subscribe(userId: number): Subject<NotificationStreamMessage> {
    const subject = new Subject<NotificationStreamMessage>();
    let set = this.clients.get(userId);
    if (!set) {
      set = new Set();
      this.clients.set(userId, set);
    }
    set.add(subject);
    return subject;
  }

  /** Called from the SSE route's `finalize` when the browser goes away. */
  unsubscribe(userId: number, subject: Subject<NotificationStreamMessage>): void {
    const set = this.clients.get(userId);
    if (!set) return;
    set.delete(subject);
    if (set.size === 0) this.clients.delete(userId);
  }

  /** Push one freshly-created row to every open tab of that user. */
  emit(userId: number, payload: unknown): void {
    this.emitTo(userId, { type: "notification", data: payload });
  }

  /** A row was marked read — other tabs drop it from their unread list. */
  emitRead(userId: number, id: number): void {
    this.emitTo(userId, { type: "read", data: { id } });
  }

  /** "Mark all as read" — other tabs clear their unread list. */
  emitReadAll(userId: number): void {
    this.emitTo(userId, { type: "read-all", data: {} });
  }

  private emitTo(userId: number, message: NotificationStreamMessage): void {
    const set = this.clients.get(userId);
    if (!set) return;
    for (const subject of set) subject.next(message);
  }
}
