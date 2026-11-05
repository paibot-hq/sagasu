import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIndex, IndexBuilder, SagasuIndex, normalize, romajiToHiragana, editDistance } from '../src/index.js';
import { bigrams, runs } from '../src/tokenize.js';

const DOCS = [
  { url: '/ramen', title: '博多ラーメンの名店10選', text: 'とんこつスープが自慢の博多ﾗｰﾒﾝ。替え玉は必須です。', meta: { tag: 'food' } },
  { url: '/trip', title: '東京と京都の旅', text: '新幹線で東京から京都へ。抹茶パフェを食べた。', meta: { tag: 'travel' } },
  { url: '/pop', title: '東京都の人口', text: '東京都の人口は約1400万人です。', meta: { tag: 'data' } },
  { url: '/js', title: 'Getting started with JavaScript', text: 'Learn JavaScript closures and promises. Ｊａｖａｓｃｒｉｐｔ is fun.' },
  { url: '/ts', title: 'TypeScript入門', text: 'TypeScriptは型付きのJavaScriptです。コンパイルするとJSになります。' },
  { url: '/sushi', title: 'すし職人の一日', text: '朝は市場で魚を仕入れる。シャリの温度が大事。' },
  { url: '/coffee', title: 'コーヒーの淹れ方', text: 'ハンドドリップで丁寧に。お湯は90度くらい。' },
];
const idx = createIndex(DOCS);
const urls = (q, o) => idx.search(q, o).map((h) => h.url);

test('normalize: width, case, kana, long vowel', () => {
  assert.equal(normalize('ﾗｰﾒﾝ'), 'らめん');
  assert.equal(normalize('ラーメン'), 'らめん');
  assert.equal(normalize('ＡＢＣ１２３'), 'abc123');
  assert.equal(normalize('ヴァイオリン'), 'ゔぁいおりん');
});

test('tokenize: bigrams for Japanese, words for latin', () => {
  assert.deepEqual(bigrams('東京都'), ['東京', '京都']);
  assert.deepEqual(bigrams('猫'), ['猫']);
  assert.deepEqual(
    runs(normalize('iPhone15を買う')).map((r) => [r.type, r.text]),
    [['word', 'iphone15'], ['cjk', 'を買う']],
  );
});

test('romaji → hiragana', () => {
  const cases = {
    ramen: 'らめん', sushi: 'すし', konnichiha: 'こんにちは', konnnichiha: 'こんにちは', kanna: 'かんな',
    matcha: 'まっちゃ', kitte: 'きって', shinkansen: 'しんかんせん', kyouto: 'きょうと', jitensha: 'じてんしゃ',
    tsukue: 'つくえ', tukue: 'つくえ', fuji: 'ふじ', huzi: 'ふじ', "kin'en": 'きんえん', ryokou: 'りょこう',
  };
  for (const [r, k] of Object.entries(cases)) assert.equal(romajiToHiragana(r), k, r);
  for (const r of ['react', 'html', 'xyz1', '']) assert.equal(romajiToHiragana(r), null, r);
});

test('edit distance with transpositions and cutoff', () => {
  assert.equal(editDistance('javascript', 'javascirpt'), 1);
  assert.equal(editDistance('kitten', 'sitting'), 3);
  assert.equal(editDistance('abc', 'xyzxyz', 1), 2);
});

test('katakana / hiragana / half-width / romaji all find ラーメン', () => {
  for (const q of ['ラーメン', 'らーめん', 'ﾗｰﾒﾝ', 'ramen', 'RAMEN', 'らめん']) assert.deepEqual(urls(q), ['/ramen'], q);
});

test('Japanese phrase ranks contiguous match first', () => {
  assert.deepEqual(urls('東京都'), ['/pop', '/trip']);
});

test('single kanji query', () => {
  assert.deepEqual(new Set(urls('京')), new Set(['/trip', '/pop']));
});

test('prefix while typing and typo tolerance', () => {
  assert.equal(urls('javas')[0], '/js');
  assert.equal(urls('javascirpt')[0], '/js');
  assert.equal(urls('typscript')[0], '/ts');
});

test('AND, mixed scripts, exclusion', () => {
  assert.deepEqual(urls('型 javascript'), ['/ts']);
  assert.deepEqual(urls('javascript -typescript'), ['/js']);
  assert.deepEqual(urls('javascript -型'), ['/js']);
});

test('falls back to partial matches when AND finds nothing', () => {
  const r = urls('ラーメン 宇宙船');
  assert.deepEqual(r, ['/ramen']);
});

test('no results / empty query', () => {
  assert.deepEqual(urls('存在しない言葉'), []);
  assert.deepEqual(urls(''), []);
  assert.deepEqual(urls('   '), []);
  assert.equal(idx.search('').total, 0);
});

test('highlight marks matches in the original text, HTML-escaped', () => {
  const [hit] = idx.search('らーめん');
  assert.equal(hit.titleHTML, '博多<mark>ラーメン</mark>の名店10選');
  assert.match(hit.snippet, /<mark>ラーメン<\/mark>/);
  const x = createIndex([{ url: '/x', title: '<script>alert(1)</script> 安全', text: 'a & b <b>太字</b>' }]);
  const [h] = x.search('安全');
  assert.equal(h.titleHTML, '&lt;script&gt;alert(1)&lt;/script&gt; <mark>安全</mark>');
  assert.ok(!x.search('太字')[0].snippet.includes('<b>'));
});

test('highlights latin word right after kana', () => {
  const [hit] = idx.search('javascript 型');
  assert.match(hit.snippet, /の<mark>JavaScript<\/mark>/);
});

test('long snippets are windowed around the matches', () => {
  const filler = 'あいうえお'.repeat(100);
  const x = createIndex([{ url: '/l', title: 't', text: `${filler}ここに宝物がある${filler}` }]);
  const s = x.search('宝物', { snippetLength: 40 })[0].snippet;
  assert.ok(s.startsWith('…') && s.endsWith('…'));
  assert.match(s, /<mark>宝物<\/mark>/);
  assert.ok(s.replace(/<\/?mark>/g, '').length <= 42);
});

test('limit, offset, total, filter, meta', () => {
  const all = idx.search('東京');
  assert.equal(all.total, 2);
  assert.equal(idx.search('東京', { limit: 1 }).length, 1);
  assert.equal(idx.search('東京', { offset: 1 })[0].url, all[1].url);
  assert.deepEqual(urls('東京', { filter: (m) => m?.tag === 'travel' }), ['/trip']);
  assert.deepEqual(idx.search('ラーメン')[0].meta, { tag: 'food' });
});

test('title matches outrank body matches', () => {
  const x = createIndex([
    { url: '/body', title: '日記', text: '今日は猫カフェに行った。それから本屋に寄った。' },
    { url: '/title', title: '猫カフェ探訪', text: '今日行ったお店について。' },
  ]);
  assert.deepEqual(x.search('猫カフェ').map((h) => h.url), ['/title', '/body']);
});

test('serializes to JSON and back', () => {
  const b = new IndexBuilder();
  for (const d of DOCS) b.add(d);
  const json = JSON.stringify(b.toJSON());
  const re = SagasuIndex.from(json);
  assert.deepEqual(re.search('ramen'), idx.search('ramen'));
  assert.throws(() => SagasuIndex.from({ v: 999 }), /unsupported/);
});

test('prototype-ish words are plain terms', () => {
  const x = createIndex([{ url: '/p', title: 'constructor __proto__ toString', text: 'hasOwnProperty' }]);
  const re = SagasuIndex.from(JSON.stringify({ v: 1, docs: x.docs, lens: x.lens, terms: x.terms }));
  for (const q of ['constructor', '__proto__', 'tostring', 'hasownproperty']) assert.deepEqual(re.search(q).map((h) => h.url), ['/p'], q);
  assert.deepEqual(re.search('valueof').map((h) => h.url), []);
});

test('builder validates input', () => {
  assert.throws(() => new IndexBuilder().add({ title: 'no url' }), /url/);
});
