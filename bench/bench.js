// node bench/bench.js [docs=10000]
// Synthetic Japanese + English corpus; reports build time, index size, query latency.
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { IndexBuilder, SagasuIndex } from '../src/index.js';

const N = Number(process.argv[2] ?? 10000);
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = (a) => a[Math.floor(rand() * a.length)];

const ja = ['東京', '京都', '大阪', 'ラーメン', '寿司', '天気', '電車', '旅行', '学校', '会社', '仕事', '映画', '音楽', '料理', '経済', '政治',
  '技術', '開発', 'サーバー', 'データベース', '検索', '索引', '形態素', '解析', '機械学習', '数学', '物理', '歴史', '地図', '写真', 'カメラ', '猫', '犬'];
const particles = ['は', 'が', 'を', 'に', 'で', 'と', 'の', 'から', 'まで', 'も'];
const ends = ['です。', 'ます。', 'した。', 'だ。', 'でしょう。'];
const en = ['search', 'index', 'javascript', 'typescript', 'astro', 'react', 'server', 'cloud', 'latency', 'database', 'engine', 'static', 'site'];

const sentence = () => {
  let s = '';
  const n = 2 + Math.floor(rand() * 5);
  for (let i = 0; i < n; i++) s += (rand() < 0.15 ? ` ${pick(en)} ` : pick(ja)) + pick(particles);
  return s + pick(ends);
};

const t0 = performance.now();
const b = new IndexBuilder({ excerptLength: 400 });
for (let i = 0; i < N; i++) {
  let text = '';
  const n = 10 + Math.floor(rand() * 30);
  for (let j = 0; j < n; j++) text += sentence();
  b.add({ url: `/p/${i}`, title: `${pick(ja)}と${pick(ja)}の話 #${i}`, text });
}
const json = JSON.stringify(b.toJSON());
const tBuild = performance.now() - t0;

const t1 = performance.now();
const idx = SagasuIndex.from(json);
const tLoad = performance.now() - t1;

const queries = ['東京', 'ラーメン', 'らーめん', 'ramen', '機械学習', 'データベース 検索', 'javascirpt', 'astr', '猫 -犬', '京', 'kyouto', '存在しない'];
// warm up
for (const q of queries) idx.search(q);
const rows = [];
for (const q of queries) {
  const runs = 20;
  const s = performance.now();
  let hits;
  for (let i = 0; i < runs; i++) hits = idx.search(q);
  rows.push({ query: q, hits: hits.total, 'ms/query': ((performance.now() - s) / runs).toFixed(2) });
}

console.log(`docs: ${N.toLocaleString()}   build: ${tBuild.toFixed(0)} ms   parse: ${tLoad.toFixed(0)} ms`);
console.log(`index: ${(json.length / 1024 / 1024).toFixed(1)} MB   gzip: ${(gzipSync(json).length / 1024 / 1024).toFixed(2)} MB   vocab: ${b.postings.size.toLocaleString()}`);
console.table(rows);
