import { fold, normalize } from './fold.js';
import { runs, bigrams, IS_CJK } from './tokenize.js';
import { romajiToHiragana } from './romaji.js';
import { highlight } from './snippet.js';
import { FORMAT } from './builder.js';

const K1 = 1.2;
const B = 0.75;
const W_PREFIX = 0.7;
const W_FUZZY = 0.55;
const W_ROMAJI = 0.9;
const MAX_EXPANSIONS = 40;

/** Optimal string alignment distance, bails out once it exceeds `max`. */
export function editDistance(a, b, max = Infinity) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

function lowerBound(arr, x) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const maxInto = (target, src) => {
  for (const [d, s] of src) if (!(target.get(d) >= s)) target.set(d, s);
};

/**
 * @typedef {{
 *   limit?: number, offset?: number, prefix?: boolean, fuzzy?: boolean,
 *   romaji?: boolean, snippetLength?: number, filter?: (meta: any, url: string) => boolean
 * }} SearchOptions
 * @typedef {{ id: number, url: string, title: string, score: number,
 *   titleHTML: string, snippet: string, meta?: any }} Hit
 */

export class SagasuIndex {
  constructor(data) {
    if (!data || data.v !== FORMAT) throw new Error(`sagasu: unsupported index format (expected v${FORMAT})`);
    this.docs = data.docs;
    this.lens = data.lens;
    this.terms = data.terms;
    this.N = this.docs.length;
    this.avgdl = this.lens.reduce((a, b) => a + b, 0) / (this.N || 1);
    this._scores = new Map();
    this._vocab = null;
    this._words = null;
  }

  /** @param {object | string} data parsed index or its JSON text */
  static from(data) {
    return new SagasuIndex(typeof data === 'string' ? JSON.parse(data) : data);
  }

  /** @param {string} url */
  static async load(url, init) {
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(`sagasu: ${url} → HTTP ${res.status}`);
    return new SagasuIndex(await res.json());
  }

  get vocab() {
    return (this._vocab ??= Object.keys(this.terms).sort());
  }

  get words() {
    return (this._words ??= this.vocab.filter((t) => !IS_CJK.test(t)));
  }

  /** BM25 score per doc for one term (cached). */
  scores(term) {
    if (this._scores.has(term)) return this._scores.get(term);
    let out = null;
    if (Object.hasOwn(this.terms, term)) {
      const enc = this.terms[term];
      const df = enc.length / 2;
      const idf = Math.log(1 + (this.N - df + 0.5) / (df + 0.5));
      out = new Map();
      let d = 0;
      for (let i = 0; i < enc.length; i += 2) {
        d += enc[i];
        const tf = enc[i + 1];
        out.set(d, (idf * tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * this.lens[d]) / this.avgdl)));
      }
    }
    if (this._scores.size > 5000) this._scores.clear();
    this._scores.set(term, out);
    return out;
  }

  _weighted(term, w, into) {
    const s = this.scores(term);
    if (!s) return false;
    for (const [d, v] of s) if (!(into.get(d) >= v * w)) into.set(d, v * w);
    return true;
  }

  /** Japanese run: every bigram must be present (AND), scores add up. */
  _cjk(text, weight, needles) {
    const out = new Map();
    const chars = [...text];
    if (chars.length === 1) {
      // one character: union of every bigram that contains it
      let n = 0;
      for (const t of this.vocab) {
        if (!t.includes(text) || !IS_CJK.test(t)) continue;
        this._weighted(t, weight * 0.8, out);
        if (++n >= 400) break;
      }
      needles.push({ text });
      return out;
    }
    const grams = [...new Set(bigrams(text))];
    const maps = grams.map((g) => this.scores(g));
    if (maps.some((m) => !m)) return out;
    maps.sort((a, b) => a.size - b.size);
    outer: for (const [d, s0] of maps[0]) {
      let sum = s0;
      for (let i = 1; i < maps.length; i++) {
        const s = maps[i].get(d);
        if (s === undefined) continue outer;
        sum += s;
      }
      out.set(d, (sum * weight) / Math.sqrt(grams.length));
    }
    needles.push({ text });
    return out;
  }

  /** Latin word: exact, then prefix (while typing), then typo-tolerant. */
  _word(term, { isLast, prefix, fuzzy }, needles) {
    const out = new Map();
    if (this._weighted(term, 1, out)) needles.push({ text: term, word: true });
    if (!(prefix && isLast) && term.length >= 3) {
      // not typing this word any more: still treat simple plurals as the same word
      for (const t of [term + 's', term + 'es']) if (this._weighted(t, 0.9, out)) needles.push({ text: t, word: true });
    }
    let found = out.size > 0;
    if (prefix && isLast && term.length >= 2) {
      const v = this.words;
      let n = 0;
      for (let i = lowerBound(v, term); i < v.length && v[i].startsWith(term) && n < MAX_EXPANSIONS; i++) {
        if (v[i] === term) continue;
        this._weighted(v[i], W_PREFIX, out);
        needles.push({ text: v[i], word: true });
        n++;
        found = true;
      }
    }
    if (fuzzy && !found && term.length >= 4) {
      const max = term.length >= 8 ? 2 : 1;
      const cands = [];
      for (const t of this.words) {
        if (Math.abs(t.length - term.length) > max) continue;
        const d = editDistance(term, t, max);
        if (d <= max) cands.push([d, t]);
      }
      cands.sort((a, b) => a[0] - b[0]);
      for (const [d, t] of cands.slice(0, MAX_EXPANSIONS)) {
        this._weighted(t, W_FUZZY / d, out);
        needles.push({ text: t, word: true });
      }
    }
    return out;
  }

  _parse(query, opts) {
    const groups = normalize(query).split(/\s+/).filter(Boolean);
    const units = [];
    const excluded = [];
    groups.forEach((g, gi) => {
      const neg = g.length > 1 && g[0] === '-';
      const rs = runs(neg ? g.slice(1) : g);
      rs.forEach((r, ri) => {
        const isLast = !neg && gi === groups.length - 1 && ri === rs.length - 1;
        const alts = [];
        if (r.type === 'cjk') alts.push({ kind: 'cjk', text: r.text, weight: 1 });
        else {
          alts.push({ kind: 'word', text: r.text, isLast });
          const kana = opts.romaji ? romajiToHiragana(r.text) : null;
          if (kana && [...kana].length >= 2) alts.push({ kind: 'cjk', text: kana, weight: W_ROMAJI });
        }
        (neg ? excluded : units).push(alts);
      });
    });
    return { units, excluded };
  }

  _evalUnit(alts, opts, needles) {
    const out = new Map();
    for (const a of alts) {
      const m =
        a.kind === 'cjk'
          ? this._cjk(a.text, a.weight, needles)
          : this._word(a.text, { ...opts, isLast: opts.prefix && a.isLast }, needles);
      maxInto(out, m);
    }
    return out;
  }

  /**
   * @param {string} query  space = AND, -word = exclude
   * @param {SearchOptions} [options]
   * @returns {Hit[] & { total: number }}
   */
  search(query, options = {}) {
    const opts = { limit: 10, offset: 0, prefix: true, fuzzy: true, romaji: true, snippetLength: 120, ...options };
    const { units, excluded } = this._parse(query, opts);
    const result = Object.assign([], { total: 0 });
    if (!units.length) return result;

    const needles = [];
    const maps = units.map((alts) => this._evalUnit(alts, opts, needles));

    // AND across units; if nothing survives, fall back to "most units matched"
    let scored = new Map();
    const [first, ...rest] = [...maps].sort((a, b) => a.size - b.size);
    for (const [d, s] of first) {
      let sum = s;
      let ok = true;
      for (const m of rest) {
        const v = m.get(d);
        if (v === undefined) { ok = false; break; }
        sum += v;
      }
      if (ok) scored.set(d, sum);
    }
    if (!scored.size && maps.length > 1) {
      const hits = new Map();
      for (const m of maps) for (const [d, s] of m) {
        const h = hits.get(d) ?? { s: 0, n: 0 };
        h.s += s;
        h.n++;
        hits.set(d, h);
      }
      for (const [d, h] of hits) scored.set(d, h.s * (h.n / maps.length) ** 2);
    }

    for (const alts of excluded) {
      // -email also drops pages that only say "emails"
      const plural = alts.filter((a) => a.kind === 'word').flatMap((a) => [a.text + 's', a.text + 'es']);
      for (const t of plural) for (const d of this.scores(t)?.keys() ?? []) scored.delete(d);
      const m = this._evalUnit(alts, { ...opts, prefix: false, fuzzy: false }, []);
      for (const d of m.keys()) scored.delete(d);
    }

    if (opts.filter) {
      for (const d of [...scored.keys()]) {
        const doc = this.docs[d];
        if (!opts.filter(doc.m, doc.u)) scored.delete(d);
      }
    }

    let ranked = [...scored].sort((a, b) => b[1] - a[1]);

    // Re-rank the head: reward exact contiguous phrases and title matches.
    const phrases = units.flatMap((alts) => alts.filter((a) => a.kind === 'cjk' && [...a.text].length > 2).map((a) => a.text));
    const head = Math.max(opts.offset + opts.limit, 50);
    if (phrases.length || needles.length) {
      ranked = ranked.slice(0, head * 2).map(([d, s]) => {
        const doc = this.docs[d];
        const title = fold(doc.t).text;
        const body = fold(doc.x ?? '').text;
        for (const p of phrases) {
          if (title.includes(p)) s *= 1.5;
          else if (body.includes(p)) s *= 1.25;
        }
        return [d, s];
      }).concat(ranked.slice(head * 2));
      ranked.sort((a, b) => b[1] - a[1]);
    }

    result.total = ranked.length;
    for (const [d, score] of ranked.slice(opts.offset, opts.offset + opts.limit)) {
      const doc = this.docs[d];
      const hit = {
        id: d,
        url: doc.u,
        title: doc.t,
        score: Math.round(score * 1000) / 1000,
        titleHTML: highlight(doc.t, needles),
        snippet: opts.snippetLength > 0 && doc.x ? highlight(doc.x, needles, opts.snippetLength) : '',
      };
      if (doc.m !== undefined) hit.meta = doc.m;
      result.push(hit);
    }
    return result;
  }
}
