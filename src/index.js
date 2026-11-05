export { IndexBuilder } from './builder.js';
export { SagasuIndex, editDistance } from './search.js';
export { fold, normalize } from './fold.js';
export { romajiToHiragana } from './romaji.js';
export { highlight } from './snippet.js';

import { IndexBuilder } from './builder.js';
import { SagasuIndex } from './search.js';

/**
 * One-liner for small, in-memory collections.
 * @param {import('./builder.js').Doc[]} docs
 * @param {ConstructorParameters<typeof IndexBuilder>[0]} [opts]
 */
export function createIndex(docs, opts) {
  const b = new IndexBuilder(opts);
  for (const d of docs) b.add(d);
  return new SagasuIndex(b.toJSON());
}
