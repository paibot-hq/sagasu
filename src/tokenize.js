// Tokenizer. No dictionary, no morphological analyser:
//   - runs of 漢字/ひらがな/カタカナ become overlapping bigrams (東京都 → 東京, 京都)
//   - everything else that is a letter or digit becomes a word token
// Input must already be folded (see fold.js).

const CJK = '\\p{sc=Han}\\p{sc=Hiragana}\\p{sc=Katakana}';
const RUN = new RegExp(`([${CJK}]+)|((?:(?![${CJK}])[\\p{L}\\p{N}\\p{M}])+)`, 'gu');
export const IS_CJK = new RegExp(`^[${CJK}]`, 'u');

/** @param {string} folded */
export function runs(folded) {
  const out = [];
  for (const m of folded.matchAll(RUN)) {
    out.push({ type: m[1] ? 'cjk' : 'word', text: m[0], start: m.index });
  }
  return out;
}

/** @param {string} s */
export function bigrams(s) {
  const c = [...s];
  if (c.length < 2) return c;
  const out = [];
  for (let i = 0; i < c.length - 1; i++) out.push(c[i] + c[i + 1]);
  return out;
}

/** All index terms of an already folded string. */
export function* tokens(folded) {
  for (const r of runs(folded)) {
    if (r.type === 'cjk') yield* bigrams(r.text);
    else yield r.text;
  }
}
