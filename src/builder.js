import { normalize } from './fold.js';
import { tokens } from './tokenize.js';

export const FORMAT = 1;

/**
 * @typedef {{ url: string, title?: string, text?: string, meta?: any }} Doc
 */

export class IndexBuilder {
  /**
   * @param {{ titleWeight?: number, excerptLength?: number }} [opts]
   *   titleWeight   a title token counts as this many body tokens
   *   excerptLength chars of body kept for snippets (0 = no snippets)
   */
  constructor({ titleWeight = 3, excerptLength = 3000 } = {}) {
    this.titleWeight = titleWeight;
    this.excerptLength = excerptLength;
    this.docs = [];
    this.lens = [];
    /** @type {Map<string, number[]>} term → [docId, tf, docId, tf, ...] */
    this.postings = new Map();
  }

  /** @param {Doc} doc */
  add(doc) {
    if (!doc || typeof doc.url !== 'string') throw new TypeError('sagasu: doc.url must be a string');
    const id = this.docs.length;
    const title = String(doc.title ?? '').trim();
    const text = String(doc.text ?? '').replace(/\s+/g, ' ').trim();
    const tf = new Map();
    let len = 0;
    const count = (s, w) => {
      for (const t of tokens(normalize(s))) {
        tf.set(t, (tf.get(t) ?? 0) + w);
        len += w;
      }
    };
    count(title, this.titleWeight);
    count(text, 1);
    for (const [t, n] of tf) {
      let p = this.postings.get(t);
      if (!p) this.postings.set(t, (p = []));
      p.push(id, n);
    }
    const stored = { u: doc.url, t: title };
    if (this.excerptLength > 0) stored.x = text.slice(0, this.excerptLength);
    if (doc.meta !== undefined) stored.m = doc.meta;
    this.docs.push(stored);
    this.lens.push(len);
    return id;
  }

  /** Serializable index. Doc ids in postings are delta-encoded to keep JSON small. */
  toJSON() {
    const terms = {};
    for (const t of [...this.postings.keys()].sort()) {
      const p = this.postings.get(t);
      const enc = new Array(p.length);
      let prev = 0;
      for (let i = 0; i < p.length; i += 2) {
        enc[i] = p[i] - prev;
        enc[i + 1] = p[i + 1];
        prev = p[i];
      }
      Object.defineProperty(terms, t, { value: enc, enumerable: true, writable: true, configurable: true });
    }
    return { v: FORMAT, docs: this.docs, lens: this.lens, terms };
  }
}
