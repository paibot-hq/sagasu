import { fold } from './fold.js';

// a latin-ish letter/digit; kana and kanji count as a boundary
const WORD_CHAR = /(?![\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}])[\p{L}\p{N}]/u;

const escapeHTML = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * Find needle occurrences in `source` (compared folded) and return ranges in
 * the NFKC form of source.
 * @param {string} source
 * @param {{ text: string, word?: boolean }[]} needles folded needles
 */
export function findRanges(source, needles) {
  const { text, map, source: src } = fold(source, true);
  const ranges = [];
  for (const n of needles) {
    if (!n.text) continue;
    let from = 0;
    for (;;) {
      const at = text.indexOf(n.text, from);
      if (at < 0) break;
      from = at + 1;
      if (n.word && at > 0 && WORD_CHAR.test(text[at - 1])) continue;
      ranges.push([map[at], map[at + n.text.length]]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return { src, ranges: merged };
}

function render(src, ranges, start, end) {
  let out = '';
  let pos = start;
  for (const [a, b] of ranges) {
    if (b <= start || a >= end) continue;
    const s = Math.max(a, start);
    const e = Math.min(b, end);
    out += escapeHTML(src.slice(pos, s)) + '<mark>' + escapeHTML(src.slice(s, e)) + '</mark>';
    pos = e;
  }
  return out + escapeHTML(src.slice(pos, end));
}

/**
 * HTML-escaped text with <mark> around matches. With maxLength, picks the
 * window that contains the most matches.
 * @param {string} source
 * @param {{ text: string, word?: boolean }[]} needles
 * @param {number} [maxLength]
 */
export function highlight(source, needles, maxLength) {
  const { src, ranges } = findRanges(source, needles);
  if (!maxLength || src.length <= maxLength) return render(src, ranges, 0, src.length);

  let best = 0;
  let bestCount = -1;
  const lead = Math.floor(maxLength * 0.2);
  for (const [a] of ranges) {
    const s = Math.max(0, a - lead);
    const e = s + maxLength;
    let n = 0;
    for (const [x, y] of ranges) if (x >= s && y <= e) n++;
    if (n > bestCount) { bestCount = n; best = s; }
  }
  const start = Math.min(best, Math.max(0, src.length - maxLength));
  const end = Math.min(src.length, start + maxLength);
  return (start > 0 ? '…' : '') + render(src, ranges, start, end) + (end < src.length ? '…' : '');
}
