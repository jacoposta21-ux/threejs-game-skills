/**
 * Pure (DOM-free) notification scheduling: at most `maxVisible` prominent
 * notifications at once, a priority-ordered waiting queue, grouping of
 * duplicates (same text → "×N"), bounded queue size, and expiry of stale
 * low-priority items. The DOM layer (Notifications.ts) only renders it.
 */
export interface QueuedNotice {
  key: string;
  text: string;
  sub?: string;
  kind: string;
  priority: number;
  count: number;
  createdAt: number;
  shownAt: number;
  duration: number;
}

export class NotificationQueue {
  readonly visible: QueuedNotice[] = [];
  readonly waiting: QueuedNotice[] = [];

  constructor(
    readonly maxVisible = 2,
    readonly maxWaiting = 6,
    readonly staleAfter = 9,
  ) {}

  /** Returns 'shown' | 'queued' | 'grouped' | 'dropped'. */
  push(text: string, kind: string, priority: number, now: number, sub?: string, duration?: number): 'shown' | 'queued' | 'grouped' | 'dropped' {
    const key = `${kind}:${text}:${sub ?? ''}`;
    const dup = this.visible.find((n) => n.key === key) ?? this.waiting.find((n) => n.key === key);
    if (dup) {
      dup.count++;
      if (sub) dup.sub = sub;
      if (this.visible.includes(dup)) dup.shownAt = Math.max(dup.shownAt, now - dup.duration * 0.5); // extend a little
      return 'grouped';
    }
    const notice: QueuedNotice = { key, text, sub, kind, priority, count: 1, createdAt: now, shownAt: 0, duration: duration ?? (sub ? 4.4 : 3.4) };
    if (this.visible.length < this.maxVisible) {
      notice.shownAt = now;
      this.visible.push(notice);
      return 'shown';
    }
    // A critical notice bumps the lowest-priority visible one back into the queue.
    const lowest = [...this.visible].sort((a, b) => a.priority - b.priority)[0];
    if (priority >= 3 && lowest && lowest.priority < priority) {
      this.visible.splice(this.visible.indexOf(lowest), 1);
      this.insertWaiting(lowest);
      notice.shownAt = now;
      this.visible.push(notice);
      return 'shown';
    }
    if (this.waiting.length >= this.maxWaiting) {
      const weakest = [...this.waiting].sort((a, b) => a.priority - b.priority || b.createdAt - a.createdAt)[0];
      if (weakest.priority > priority) return 'dropped';
      this.waiting.splice(this.waiting.indexOf(weakest), 1);
    }
    this.insertWaiting(notice);
    return 'queued';
  }

  private insertWaiting(n: QueuedNotice): void {
    this.waiting.push(n);
    this.waiting.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
  }

  /** Advance time: expire visible notices, drop stale low-priority waiters, promote the next. */
  tick(now: number): { expired: QueuedNotice[]; shown: QueuedNotice[] } {
    const expired: QueuedNotice[] = [];
    for (let i = this.visible.length - 1; i >= 0; i--) {
      const n = this.visible[i];
      if (now - n.shownAt >= n.duration) {
        expired.push(n);
        this.visible.splice(i, 1);
      }
    }
    for (let i = this.waiting.length - 1; i >= 0; i--) {
      const n = this.waiting[i];
      if (n.priority <= 1 && now - n.createdAt > this.staleAfter) this.waiting.splice(i, 1);
    }
    const shown: QueuedNotice[] = [];
    while (this.visible.length < this.maxVisible && this.waiting.length) {
      const n = this.waiting.shift()!;
      n.shownAt = now;
      this.visible.push(n);
      shown.push(n);
    }
    return { expired, shown };
  }

  clear(): void {
    this.visible.length = 0;
    this.waiting.length = 0;
  }
}
