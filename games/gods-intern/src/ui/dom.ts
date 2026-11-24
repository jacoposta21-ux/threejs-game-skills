import { ICON, type IconName } from './Icons';

export function $(selector: string): HTMLElement {
  const node = document.querySelector<HTMLElement>(selector);
  if (!node) throw new Error(`Missing element ${selector}`);
  return node;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', html = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html) node.innerHTML = html;
  return node;
}

export function icon(name: IconName): string {
  return `<span data-icon="${name}">${ICON[name]}</span>`;
}

/** Fill every [data-icon] placeholder in the static HTML. */
export function hydrateIcons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-icon]').forEach((node) => {
    const name = node.dataset.icon as IconName;
    if (!node.innerHTML && ICON[name]) node.innerHTML = ICON[name];
  });
}

/** Only touch the DOM when text actually changes. */
export function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function formatClock(timeOfDay: number): string {
  const minutes = Math.floor(timeOfDay * 24 * 60);
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(Math.floor(m / 10) * 10).padStart(2, '0')}`;
}

/**
 * v0.5: panels rebuild their HTML only when the pointer is not over them (or when a
 * rebuild is forced by the panel's own button), so a click never lands on a node that
 * was replaced between press and release.
 */
export function mayRebuild(root: HTMLElement, forced: boolean): boolean {
  return forced || !root.matches(':hover');
}
