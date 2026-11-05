// Text folding: the single place that decides which strings are "the same".
//
//   NFKC        全角英数 → 半角, 半角カナ → 全角, ① → 1, ㈱ → (株)
//   lowercase   Ramen → ramen
//   kana        カタカナ → ひらがな (ラーメン → らーめん)
//   long vowel  ー is dropped (らーめん → らめん) so "ramen" can find ラーメン
//
// fold(text, true) also returns a map from every folded char back to its
// position in the NFKC source, so matches can be highlighted in the original.

const LONG_VOWEL = 0x30fc; // ー

function foldChar(ch) {
  const cp = ch.codePointAt(0);
  if (cp >= 0x30a1 && cp <= 0x30f6) return String.fromCharCode(cp - 0x60);
  if (cp === LONG_VOWEL) return '';
  return ch.toLowerCase();
}

/**
 * @param {string} input
 * @param {boolean} [withMap]
 * @returns {{ text: string, source: string, map: number[] | null }}
 */
export function fold(input, withMap = false) {
  const source = String(input ?? '').normalize('NFKC');
  let text = '';
  const map = withMap ? [] : null;
  let i = 0;
  for (const ch of source) {
    const f = foldChar(ch);
    if (map) for (let k = 0; k < f.length; k++) map.push(i);
    text += f;
    i += ch.length;
  }
  if (map) map.push(i);
  return { text, source, map };
}

/** @param {string} input */
export const normalize = (input) => fold(input).text;
