// <sagasu-search src="/sagasu.json"></sagasu-search>
//
// A search button + modal. Opens with ⌘K / Ctrl+K or "/", arrow keys move,
// Enter opens. The index is fetched on first open. Theme with CSS variables:
//   --sagasu-accent, --sagasu-bg, --sagasu-fg, --sagasu-muted, --sagasu-mark,
//   --sagasu-radius, --sagasu-font

import { SagasuIndex } from './search.js';

const CSS = `
:host { --a: var(--sagasu-accent, #6b5cff); --bg: var(--sagasu-bg, #fff); --fg: var(--sagasu-fg, #1b1b1f);
  --mu: var(--sagasu-muted, #6b6b76); --mk: var(--sagasu-mark, #ffe58a); --line: color-mix(in srgb, var(--fg) 12%, transparent);
  --r: var(--sagasu-radius, 12px); font-family: var(--sagasu-font, system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif);
  display: inline-block; }
@media (prefers-color-scheme: dark) { :host { --bg: var(--sagasu-bg, #18181c); --fg: var(--sagasu-fg, #ececf1); --mu: var(--sagasu-muted, #9a9aa6); --mk: var(--sagasu-mark, #6b5a12); } }
button.open { display: inline-flex; gap: .6em; align-items: center; font: inherit; font-size: .9rem; color: var(--mu);
  background: var(--bg); border: 1px solid var(--line); border-radius: 999px; padding: .45em .9em; cursor: pointer; }
button.open:hover { border-color: var(--a); color: var(--fg); }
kbd { font: inherit; font-size: .75em; border: 1px solid var(--line); border-radius: 4px; padding: 0 .35em; }
dialog { width: min(640px, calc(100vw - 32px)); max-height: min(70vh, 640px); padding: 0; border: 1px solid var(--line);
  border-radius: var(--r); background: var(--bg); color: var(--fg); box-shadow: 0 24px 80px rgb(0 0 0 / .35); margin-top: 10vh; overflow: hidden; }
dialog[open] { display: flex; flex-direction: column; }
dialog::backdrop { background: rgb(0 0 0 / .45); backdrop-filter: blur(3px); }
.bar { display: flex; align-items: center; gap: .6em; padding: .9em 1em; border-bottom: 1px solid var(--line); }
input { flex: 1; font: inherit; font-size: 1.05rem; border: 0; outline: 0; background: transparent; color: var(--fg); min-width: 0; }
.meta { font-size: .75rem; color: var(--mu); white-space: nowrap; }
ul { list-style: none; margin: 0; padding: .4em; overflow-y: auto; }
li a { display: block; padding: .7em .8em; border-radius: calc(var(--r) - 4px); color: inherit; text-decoration: none; }
li a[aria-selected="true"] { background: color-mix(in srgb, var(--a) 14%, transparent); outline: 1px solid color-mix(in srgb, var(--a) 40%, transparent); }
.t { font-weight: 600; } .u { font-size: .75rem; color: var(--mu); margin-left: .5em; }
.s { font-size: .85rem; color: var(--mu); margin-top: .25em; line-height: 1.6; overflow-wrap: anywhere; }
mark { background: var(--mk); color: inherit; border-radius: 2px; padding: 0 1px; }
@media (max-width: 520px) { .u { display: block; margin: 0; } }
.empty { padding: 2em 1em; text-align: center; color: var(--mu); font-size: .9rem; }
`;

const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);

export class SagasuSearch extends HTMLElement {
  static get observedAttributes() { return ['src']; }

  constructor() {
    super();
    this._index = null;
    this._sel = 0;
    this._hits = [];
    const root = this.attachShadow({ mode: 'open' });
    const ph = this.getAttribute('placeholder') ?? 'サイト内を検索';
    root.innerHTML = `<style>${CSS}</style>
      <button class="open" part="button" type="button" aria-haspopup="dialog">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <span>${this.getAttribute('label') ?? '検索'}</span><kbd>${isMac ? '⌘' : 'Ctrl'} K</kbd>
      </button>
      <dialog part="dialog" aria-label="検索">
        <div class="bar"><input type="search" part="input" autocomplete="off" spellcheck="false" enterkeyhint="search" role="combobox" aria-expanded="true" aria-controls="r"><span class="meta"></span></div>
        <ul id="r" role="listbox"></ul>
      </dialog>`;
    this.$ = (s) => root.querySelector(s);
    this.$('button.open').addEventListener('click', () => this.open());
    this.$('input').addEventListener('input', () => this._run());
    this.$('input').addEventListener('keydown', (e) => this._key(e));
    this.$('dialog').addEventListener('click', (e) => { if (e.target === this.$('dialog')) this.close(); });
    this._global = (e) => {
      const typing = /input|textarea|select/i.test(e.composedPath()[0]?.tagName ?? '') || e.composedPath()[0]?.isContentEditable;
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        this.open();
      }
    };
  }

  connectedCallback() { document.addEventListener('keydown', this._global); }
  disconnectedCallback() { document.removeEventListener('keydown', this._global); }
  attributeChangedCallback() { this._index = null; }

  /** Load (once) and return the index. */
  index() {
    return (this._index ??= SagasuIndex.load(this.getAttribute('src') ?? '/sagasu.json').catch((err) => {
      this._index = null;
      throw err;
    }));
  }

  open() {
    const d = this.$('dialog');
    if (!d.open) d.showModal();
    this.$('input').select();
    this.index().then(() => this._run(), (err) => this._message(`索引を読み込めませんでした (${err.message})`));
  }

  close() { this.$('dialog').close(); }

  _message(text) {
    this.$('ul').innerHTML = '';
    const p = document.createElement('li');
    p.className = 'empty';
    p.textContent = text;
    this.$('ul').append(p);
  }

  async _run() {
    const q = this.$('input').value;
    const meta = this.$('.meta');
    if (!q.trim()) { this._hits = []; meta.textContent = ''; this.$('ul').innerHTML = ''; return; }
    const idx = await this.index();
    if (q !== this.$('input').value) return;
    const t0 = performance.now();
    const hits = idx.search(q, { limit: Number(this.getAttribute('limit') ?? 10) });
    meta.textContent = `${hits.total}件 · ${(performance.now() - t0).toFixed(1)}ms`;
    this._hits = hits;
    this._sel = 0;
    if (!hits.length) return this._message(`「${q}」に一致するページはありません`);
    this.$('ul').innerHTML = hits
      .map((h, i) => `<li role="none"><a role="option" id="o${i}" href="${encodeURI(h.url)}" aria-selected="${i === 0}">
        <span class="t">${h.titleHTML || '(無題)'}</span><span class="u">${h.url.replace(/[<>&"]/g, '')}</span>
        ${h.snippet ? `<div class="s">${h.snippet}</div>` : ''}</a></li>`)
      .join('');
    this.dispatchEvent(new CustomEvent('sagasu:results', { detail: { query: q, hits } }));
  }

  _key(e) {
    const n = this._hits.length;
    if (e.isComposing) return; // IME 変換中の Enter は無視
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!n) return;
      this._sel = (this._sel + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
      this.$('ul').querySelectorAll('a').forEach((a, i) => a.setAttribute('aria-selected', String(i === this._sel)));
      this.$(`#o${this._sel}`)?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && n) {
      e.preventDefault();
      this.$(`#o${this._sel}`)?.click();
    }
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('sagasu-search')) {
  customElements.define('sagasu-search', SagasuSearch);
}
