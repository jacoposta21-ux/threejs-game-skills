import type { NotifyKind } from '../core/EventBus';
import { $, el, escapeHtml } from './dom';
import { NotificationQueue, type QueuedNotice } from './NotificationQueue';

const BADGE: Record<NotifyKind, string> = { good: '✓', bad: '!', info: 'i', chaos: '?', culture: '✦' };
const SIGNOFFS = [
  '— Sent from my cloud',
  '— God (out of office, reachable by thunder)',
  '— This memo will self-destruct',
  '— P.S. Do not touch the volcano',
  '— cc: Accounts Receivable, Heaven',
];

/**
 * Renders the NotificationQueue (max 2 prominent toasts, priority ordering,
 * "×N" duplicate grouping, expiry) and the God memo channel (one at a time).
 * Important events are also recorded in the history book by the simulation,
 * so nothing is lost when a low-priority toast expires unseen.
 */
export class Notifications {
  private readonly root = $('#notifications');
  private readonly memoRoot = $('#god-memo');
  readonly queue = new NotificationQueue(2, 6);
  private readonly nodes = new Map<QueuedNotice, HTMLElement>();
  private readonly memoQueue: string[] = [];
  private memoBusy = false;
  private signoff = 0;
  onShow: (kind: NotifyKind) => void = () => {};
  onMemo: () => void = () => {};

  private now(): number {
    return performance.now() / 1000;
  }

  push(text: string, kind: NotifyKind, sub?: string, priority = 1): void {
    const result = this.queue.push(text, kind, priority, this.now(), sub);
    if (result === 'grouped') this.refreshCounts();
    this.sync();
  }

  /** Called every frame: expire, promote and render. */
  update(): void {
    const { expired, shown } = this.queue.tick(this.now());
    for (const n of expired) this.remove(n);
    if (shown.length) this.sync();
  }

  private remove(n: QueuedNotice): void {
    const node = this.nodes.get(n);
    if (!node) return;
    this.nodes.delete(n);
    node.classList.add('out');
    window.setTimeout(() => node.remove(), 350);
  }

  private refreshCounts(): void {
    for (const [n, node] of this.nodes) {
      const c = node.querySelector<HTMLElement>('.t-count');
      if (c) {
        c.textContent = n.count > 1 ? `×${n.count}` : '';
        node.classList.remove('bump');
        void node.offsetWidth;
        if (n.count > 1) node.classList.add('bump');
      }
    }
  }

  private sync(): void {
    // Anything visible in the queue but not yet rendered gets a node.
    for (const n of this.queue.visible) {
      if (this.nodes.has(n)) continue;
      const kind = n.kind as NotifyKind;
      const node = el(
        'div',
        `toast ${kind} p${n.priority}`,
        `<span class="t-badge">${BADGE[kind] ?? 'i'}</span><div><strong>${escapeHtml(n.text)}<em class="t-count">${n.count > 1 ? `×${n.count}` : ''}</em></strong>${n.sub ? `<small>${escapeHtml(n.sub)}</small>` : ''}</div>`,
      );
      this.root.append(node);
      this.nodes.set(n, node);
      this.onShow(kind);
    }
    // Nodes whose notice was bumped back to waiting are removed (they will return).
    for (const [n] of this.nodes) if (!this.queue.visible.includes(n)) this.remove(n);
  }

  memo(text: string): void {
    if (this.memoQueue.includes(text) || this.memoQueue.length > 3) return;
    this.memoQueue.push(text);
    this.pumpMemo();
  }

  private pumpMemo(): void {
    if (this.memoBusy || !this.memoQueue.length) return;
    this.memoBusy = true;
    const text = this.memoQueue.shift()!;
    const sign = SIGNOFFS[this.signoff++ % SIGNOFFS.length];
    const node = el(
      'div',
      'memo',
      `<header><span>Urgent memo</span><span>From: GOD · To: Intern</span></header><p>${escapeHtml(text)}</p><footer>${sign}</footer>`,
    );
    this.memoRoot.append(node);
    this.onMemo();
    window.setTimeout(() => {
      node.classList.add('out');
      window.setTimeout(() => {
        node.remove();
        this.memoBusy = false;
        this.pumpMemo();
      }, 400);
    }, 5200);
  }

  clear(): void {
    this.queue.clear();
    for (const node of this.nodes.values()) node.remove();
    this.nodes.clear();
    this.memoQueue.length = 0;
  }
}
