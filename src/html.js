// Dependency-free HTML → { title, text } for indexing built sites.
//
// Body is taken from, in order: the element with [data-sagasu-body], <main>,
// <body>. Skipped: script/style/svg/..., anything with [data-sagasu-ignore],
// <nav> always, and header/footer/aside when falling back to <body>.

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea', 'title']);
const ALWAYS_SKIP = new Set(['script', 'style', 'noscript', 'template', 'svg', 'math', 'iframe', 'object', 'canvas', 'select', 'textarea', 'head', 'nav']);
const CHROME = new Set(['header', 'footer', 'aside']);
const BLOCK = new Set([
  'address', 'article', 'aside', 'blockquote', 'br', 'dd', 'details', 'div', 'dl', 'dt', 'figcaption', 'figure',
  'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'ol', 'p', 'pre',
  'section', 'summary', 'table', 'td', 'th', 'tr', 'ul', 'option', 'label', 'button', 'caption',
]);
const TAG = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!(?:[^>])*>|<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', trade: '™', hellip: '…',
  mdash: '—', ndash: '–', laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', yen: '¥',
  middot: '·', times: '×', divide: '÷', bull: '•', deg: '°', larr: '←', rarr: '→', uarr: '↑', darr: '↓',
};

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

const hasAttr = (attrs, name) => new RegExp(`(?:^|\\s)${name}(?:\\s|=|/|$)`, 'i').test(attrs);
const clean = (s) => decodeEntities(s).replace(/\s+/g, ' ').trim();

/**
 * Walk the document collecting text inside the first element that satisfies
 * `isRoot`. Returns null when no such element exists.
 */
function collect(html, isRoot, skip) {
  let out = '';
  let rootTag = null;
  let rootDepth = 0;
  let rootDone = false;
  let skipTag = null;
  let skipDepth = 0;
  let last = 0;
  TAG.lastIndex = 0;
  let m;
  while ((m = TAG.exec(html))) {
    if (rootTag && !skipTag) out += html.slice(last, m.index);
    last = TAG.lastIndex;
    if (!m[2]) continue; // comment / doctype
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const attrs = m[3] ?? '';
    const selfClosing = VOID.has(tag) || /\/\s*$/.test(attrs);

    if (!closing && RAW.has(tag) && !selfClosing) {
      const close = new RegExp(`</${tag}`, 'ig');
      close.lastIndex = TAG.lastIndex;
      const stop = close.exec(html)?.index ?? html.length;
      if (rootTag && !skipTag && !ALWAYS_SKIP.has(tag) && tag !== 'title') out += html.slice(TAG.lastIndex, stop);
      TAG.lastIndex = stop;
      last = stop;
      continue;
    }

    if (rootTag && BLOCK.has(tag)) out += ' ';

    if (skipTag) {
      if (tag === skipTag && !selfClosing) skipDepth += closing ? -1 : 1;
      if (skipDepth === 0) skipTag = null;
    } else if (rootTag && !closing && !selfClosing && (skip(tag) || hasAttr(attrs, 'data-sagasu-ignore'))) {
      skipTag = tag;
      skipDepth = 1;
    }

    if (rootTag) {
      if (tag === rootTag && !selfClosing) rootDepth += closing ? -1 : 1;
      if (rootDepth === 0) {
        rootTag = null;
        rootDone = true;
        break;
      }
    } else if (!rootDone && !closing && !selfClosing && isRoot(tag, attrs)) {
      rootTag = tag;
      rootDepth = 1;
    }
  }
  if (rootTag) out += html.slice(last);
  return rootTag || rootDone ? clean(out) : null;
}

function innerText(html, tag) {
  const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(html);
  return m ? clean(m[1].replace(TAG, '')) : '';
}

/**
 * @param {string} html
 * @param {{ titleFrom?: 'h1' | 'title' }} [opts]
 * @returns {{ title: string, text: string, noindex: boolean, lang: string }}
 */
export function extract(html, { titleFrom = 'h1' } = {}) {
  const skipInMain = (t) => ALWAYS_SKIP.has(t);
  const skipInBody = (t) => ALWAYS_SKIP.has(t) || CHROME.has(t);
  const text =
    collect(html, (_, a) => hasAttr(a, 'data-sagasu-body'), skipInMain) ??
    collect(html, (t) => t === 'main', skipInMain) ??
    collect(html, (t) => t === 'body', skipInBody) ??
    clean(html.replace(TAG, ' '));

  const docTitle = innerText(html, 'title');
  const h1 = innerText(html, 'h1');
  const title = (titleFrom === 'h1' ? h1 || docTitle : docTitle || h1) || '';

  const noindex = [...html.matchAll(/<meta\b[^>]*>/gi)].some(
    ([tag]) => /name\s*=\s*["']?robots/i.test(tag) && /content\s*=\s*["'][^"']*noindex/i.test(tag),
  );
  const lang = /<html\b[^>]*\blang\s*=\s*["']?([\w-]+)/i.exec(html)?.[1] ?? '';
  return { title, text, noindex, lang };
}
