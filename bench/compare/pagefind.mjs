// Compare sagasu with Pagefind on the same built site.
//   npx pagefind --site <dir> && npx sagasu build <dir>
//   npm i -D playwright-core && node bench/compare/pagefind.mjs <dir> '{"ja":["アーキテクチャ","あーきてくちゃ"],"en":["architecture"]}'
//   (<dir> needs /ja/ and /en/ pages with <html lang>; prints JSON)
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { SagasuIndex } from '../../src/index.js';

const site = process.argv[2];
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm' };
const srv = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = join(site, p);
  if (!(await stat(f).catch(() => null))?.isFile()) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': T[extname(f)] ?? 'application/octet-stream' }); res.end(await readFile(f));
}).listen(4411);

const sg = SagasuIndex.from(await readFile(join(site, 'sagasu.json'), 'utf8'));
const b = await chromium.launch();
const page = await b.newPage();
let bytes = 0; page.on('response', async r => { if (r.url().includes('/pagefind/')) bytes += (await r.body().catch(() => Buffer.alloc(0))).length; });
const queries = JSON.parse(process.argv[3]);
const rows = [];
for (const [lang, list] of Object.entries(queries)) {
  await page.goto(`http://localhost:4411/${lang}/`);
  await page.evaluate(async () => { window.pf = await import('/pagefind/pagefind.js'); await window.pf.init(); });
  for (const q of list) {
    const pf = await page.evaluate(async (q) => {
      const r = await window.pf.search(q);
      const top = await Promise.all(r.results.slice(0, 3).map((x) => x.data()));
      return { n: r.results.length, top: top.map((d) => d.meta?.title ?? d.url) };
    }, q);
    const s = sg.search(q, { limit: 3, filter: (_, u) => u.startsWith(`/${lang}/`) });
    rows.push({ lang, q, pf: pf.n, sg: s.total, pfTop: pf.top[0] ?? '', sgTop: s[0]?.title ?? '' });
  }
}
console.log(JSON.stringify({ rows, pagefindBytes: bytes }));
await b.close(); srv.close();
