import type { NotifyKind } from '../core/EventBus';
import { $, el, escapeHtml } from './dom';

const BADGE: Record<NotifyKind, string> = { good: '✓', bad: '!', info: 'i', chaos: '?' };
const SIGNOFFS = [
  '— Sent from my cloud',
  '— God (out of office, reachable by thunder)',
  '— This memo will self-destruct',
  '— P.S. Do not touch the volcano',
  '— cc: Accounts Receivable, Heaven',
];

interface Toast {
  text: string;
  kind: NotifyKind;
  sub?: string;
}

/**
 * Notification queue (max 3 on screen, de-duplicated) and the God memo
 * channel (one at a time, queued, auto-dismissed).
 */
export class Notifications {
  private readonly root = $('#notifications');
  private readonly memoRoot = $('#god-memo');
  private readonly queue: Toast[] = [];
  private readonly visible: HTMLElement[] = [];
  private readonly memoQueue: string[] = [];
  private memoBusy = false;
  private signoff = 0;
  private recent = new Map<string, number>();
  onShow: (kind: NotifyKind) => void = () => {};
  onMemo: () => void = () => {};

  push(text: string, kind: NotifyKind, sub?: string): void {
    const now = performance.now();
    if (now - (this.recent.get(text) ?? -1e9) < 4000) return;
    this.recent.set(text, now);
    if (this.queue.length > 6) this.queue.shift();
    this.queue.push({ text, kind, sub });
    this.pump();
  }

  private pump(): void {
    while (this.visible.length < 3 && this.queue.length) {
      const t = this.queue.shift()!;
      const node = el(
        'div',
        `toast ${t.kind}`,
        `<span class="t-badge">${BADGE[t.kind]}</span><div><strong>${escapeHtml(t.text)}</strong>${t.sub ? `<small>${escapeHtml(t.sub)}</small>` : ''}</div>`,
      );
      this.root.append(node);
      this.visible.push(node);
      this.onShow(t.kind);
      window.setTimeout(() => {
        node.classList.add('out');
        window.setTimeout(() => {
          node.remove();
          const i = this.visible.indexOf(node);
          if (i >= 0) this.visible.splice(i, 1);
          this.pump();
        }, 350);
      }, t.sub ? 4200 : 3200);
    }
  }

  memo(text: string): void {
    if (this.memoQueue.includes(text)) return;
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
    this.queue.length = 0;
    this.memoQueue.length = 0;
  }
}
