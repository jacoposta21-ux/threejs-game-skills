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
  private readonly memoQueue: Array<{ text: string; from: string }> = [];
  private memoBusy = false;
  private signoff = 0;
  onShow: (kind: NotifyKind) => void = () => {};
  onMemo: () => void = () => {};

  private now(): number {
    return performance.now() / 1000;
  }

  /** v0.5 tiers: critical (disasters, shortages; stays longer), important (short and
   *  celebratory), ambient (one quiet line at the bottom-left; also kept in History). */
  static tier(text: string, kind: NotifyKind, priority: number): 'critical' | 'important' | 'ambient' {
    if (priority >= 3 || (kind === 'bad' && priority >= 2)) return 'critical';
    if (priority >= 2 || kind === 'culture' || /PROMOT|CHALLENGE|RELIGION|UNLOCKED|DISCOVERY|LOADED|SAVED/.test(text)) return 'important';
    return 'ambient';
  }

  push(text: string, kind: NotifyKind, sub?: string, priority = 1): void {
    const tier = Notifications.tier(text, kind, priority);
    if (tier === 'ambient') return this.ambient(text, sub);
    const result = this.queue.push(text, kind, tier === 'critical' ? Math.max(3, priority) : priority, this.now(), sub, tier === 'critical' ? 7 : sub ? 4 : 3.2);
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
        `toast ${kind} p${n.priority} ${n.priority >= 3 ? 'tier-critical' : 'tier-important'}`,
        `<span class="t-badge">${BADGE[kind] ?? 'i'}</span><div><strong>${escapeHtml(n.text)}<em class="t-count">${n.count > 1 ? `×${n.count}` : ''}</em></strong>${n.sub ? `<small>${escapeHtml(n.sub)}</small>` : ''}</div>`,
      );
      this.root.append(node);
      this.nodes.set(n, node);
      this.onShow(kind);
    }
    // Nodes whose notice was bumped back to waiting are removed (they will return).
    for (const [n] of this.nodes) if (!this.queue.visible.includes(n)) this.remove(n);
  }

  private readonly ambientRoot = $('#ambient-line');
  private ambientTimer = 0;
  private ambientLast = '';
  private ambientCount = 1;

  /** One unobtrusive line; repeats are grouped (×N). */
  private ambient(text: string, sub?: string): void {
    const line = `${text.charAt(0)}${text.slice(1).toLowerCase()}${sub ? ` — ${sub}` : ''}`;
    this.ambientCount = line === this.ambientLast ? this.ambientCount + 1 : 1;
    this.ambientLast = line;
    this.ambientRoot.textContent = this.ambientCount > 1 ? `${line} ×${this.ambientCount}` : line;
    this.ambientRoot.classList.remove('hidden');
    window.clearTimeout(this.ambientTimer);
    this.ambientTimer = window.setTimeout(() => {
      this.ambientRoot.classList.add('hidden');
      this.ambientLast = '';
    }, 3200);
  }

  memo(text: string, from = 'GOD'): void {
    if (this.memoQueue.some((m) => m.text === text) || this.memoQueue.length > 3) return;
    this.memoQueue.push({ text, from });
    this.pumpMemo();
  }

  private pumpMemo(): void {
    if (this.memoBusy || !this.memoQueue.length) return;
    this.memoBusy = true;
    const { text, from } = this.memoQueue.shift()!;
    const sign = SIGNOFFS[this.signoff++ % SIGNOFFS.length];
    const node = el(
      'div',
      'memo',
      `<header><span>Urgent memo</span><span>From: ${escapeHtml(from)} · To: Intern</span></header><p>${escapeHtml(text)}</p><footer>${sign}</footer>`,
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
