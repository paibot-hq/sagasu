// Romaji → ひらがな, roughly the way a Japanese IME reads keystrokes.
// Accepts Hepburn and Kunrei spellings (shi/si, tsu/tu, fu/hu, ja/zya ...).
// Returns null when the input is not plausible romaji (e.g. "react").

const V = ['a', 'i', 'u', 'e', 'o'];
const T = Object.create(null);

const row = (c, kana) => [...kana].forEach((k, i) => { if (k !== '・') T[c + V[i]] = k; });
row('', 'あいうえお');
row('k', 'かきくけこ');
row('s', 'さしすせそ');
row('t', 'たちつてと');
row('n', 'なにぬねの');
row('h', 'はひふへほ');
row('m', 'まみむめも');
row('y', 'や・ゆ・よ');
row('r', 'らりるれろ');
row('w', 'わ・・・を');
row('g', 'がぎぐげご');
row('z', 'ざじずぜぞ');
row('d', 'だぢづでど');
row('b', 'ばびぶべぼ');
row('p', 'ぱぴぷぺぽ');
row('x', 'ぁぃぅぇぉ');
row('l', 'ぁぃぅぇぉ');

Object.assign(T, {
  shi: 'し', chi: 'ち', tsu: 'つ', fu: 'ふ', ji: 'じ',
  wi: 'うぃ', we: 'うぇ', ye: 'いぇ',
  fa: 'ふぁ', fi: 'ふぃ', fe: 'ふぇ', fo: 'ふぉ',
  va: 'ゔぁ', vi: 'ゔぃ', vu: 'ゔ', ve: 'ゔぇ', vo: 'ゔぉ',
  thi: 'てぃ', dhi: 'でぃ', twu: 'とぅ', dwu: 'どぅ',
  xtu: 'っ', ltu: 'っ', xtsu: 'っ', xya: 'ゃ', xyu: 'ゅ', xyo: 'ょ',
  lya: 'ゃ', lyu: 'ゅ', lyo: 'ょ',
});

const Y = { k: 'き', g: 'ぎ', s: 'し', z: 'じ', t: 'ち', d: 'ぢ', n: 'に', h: 'ひ', b: 'び', p: 'ぴ', m: 'み', r: 'り', j: 'じ', c: 'ち', f: 'ふ' };
for (const [c, base] of Object.entries(Y)) {
  T[c + 'ya'] = base + 'ゃ';
  T[c + 'yu'] = base + 'ゅ';
  T[c + 'yo'] = base + 'ょ';
  T[c + 'ye'] = base + 'ぇ';
}
for (const [c, base] of Object.entries({ sh: 'し', ch: 'ち', j: 'じ' })) {
  T[c + 'a'] = base + 'ゃ';
  T[c + 'u'] = base + 'ゅ';
  T[c + 'o'] = base + 'ょ';
  T[c + 'e'] = base + 'ぇ';
}

const VOWEL_OR_Y = /[aiueoy]/;
const CONSONANT = /[bcdfghjkmpqrstvwxz]/;

/** @param {string} input lowercase ascii */
export function romajiToHiragana(input) {
  const s = input.toLowerCase();
  if (!/^[a-z'-]+$/.test(s)) return null;
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    const next = s[i + 1];
    if (c === '-' || c === "'") { i++; continue; }
    if (c === 'n' && !(next && VOWEL_OR_Y.test(next))) {
      out += 'ん';
      // "nn" followed by a non-vowel is one ん (konnnichiha / honn)
      i += next === 'n' && !(s[i + 2] && VOWEL_OR_Y.test(s[i + 2])) ? 2 : 1;
      continue;
    }
    if (c === next && CONSONANT.test(c)) { out += 'っ'; i++; continue; }
    if (c === 't' && next === 'c' && s[i + 2] === 'h') { out += 'っ'; i++; continue; }
    let hit = false;
    for (let len = 4; len >= 1; len--) {
      const k = T[s.slice(i, i + len)];
      if (k) { out += k; i += len; hit = true; break; }
    }
    if (!hit) return null;
  }
  return out || null;
}
