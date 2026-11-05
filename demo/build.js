// npm run demo  →  writes demo/site/*.html, indexes it, serves http://localhost:4321/demo/site/
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const site = join(root, 'demo', 'site');

const ARTICLES = [
  ['ramen', '博多ラーメンの替え玉文化', '博多のとんこつラーメンは麺が細く、すぐに伸びてしまう。だから少なめに盛って、足りなければ「替え玉」を頼む。麺の硬さは「バリカタ」「ハリガネ」「粉落とし」と細かく選べる。'],
  ['kyoto', '京都で抹茶を飲むなら', '宇治は抹茶の名産地。京都駅から電車で20分ほど。茶房では濃茶と薄茶を飲み比べられる。抹茶パフェは観光客に人気だが、地元の人は意外と食べない。'],
  ['tokyo-pop', '東京都の人口はなぜ増え続けるのか', '東京都の人口は約1400万人。出生数は少ないが、地方や海外からの転入が多い。23区と多摩地域では増え方がまったく違う。'],
  ['bm25', 'BM25 ranking, explained without math anxiety', 'BM25 scores a document by how often the query term appears, discounted for long documents and for terms that appear everywhere. It is still the baseline every search engine has to beat.'],
  ['ngram', 'なぜ日本語検索は難しいのか', '日本語には単語の区切りがない。形態素解析で区切る方法と、2文字ずつ区切るバイグラムがある。バイグラムは辞書が要らず、新語や固有名詞にも強い。sagasu はバイグラムを使う。'],
  ['typescript', 'TypeScriptで型を付けるとJavaScriptはどう変わるか', 'TypeScriptはJavaScriptに型を足した言語。コンパイルすると型は消えてJavaScriptになる。エディタの補完が効くので、大きなコードでも迷子になりにくい。'],
  ['coffee', 'ハンドドリップコーヒーの基本', 'お湯は90度前後。最初に少量注いで30秒蒸らす。コーヒー豆は中挽き。カフェラテを作るならエスプレッソが必要。'],
  ['camera', 'Ｆｕｊｉｆｉｌｍ のフィルムシミュレーション', '富士フイルムのカメラには、クラシッククローム、ベルビア、アクロスなどのフィルムシミュレーションがある。JPEG撮って出しで完成する色が魅力。'],
];

const layout = (title, body) => `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} | sagasu demo</title>
<style>
  :root { color-scheme: light dark; --fg:#1b1b1f; --bg:#fafafa; --mu:#6b6b76; }
  @media (prefers-color-scheme: dark) { :root { --fg:#ececf1; --bg:#111114; --mu:#9a9aa6; } }
  body { margin:0; font-family: system-ui, "Hiragino Sans", "Noto Sans JP", sans-serif; background:var(--bg); color:var(--fg); line-height:1.8; }
  header { display:flex; justify-content:space-between; align-items:center; gap:16px; padding:16px; max-width:760px; margin:auto; }
  main { max-width:760px; margin:auto; padding:0 16px 64px; }
  a { color:#6b5cff; } .hint { color:var(--mu); font-size:.9rem; }
  li { margin:.3em 0; }
</style>
<script type="module" src="/src/ui.js"></script>
</head><body>
<header><nav><a href="/demo/site/"><b>sagasu</b> demo</a></nav><sagasu-search src="/demo/site/sagasu.json"></sagasu-search></header>
<main>${body}</main>
</body></html>`;

await mkdir(join(site, 'articles'), { recursive: true });
for (const [slug, title, text] of ARTICLES) {
  await writeFile(join(site, 'articles', `${slug}.html`), layout(title, `<h1>${title}</h1><p>${text}</p>`));
}
await writeFile(
  join(site, 'index.html'),
  layout(
    'ホーム',
    `<h1>sagasu デモ</h1>
<p class="hint" data-sagasu-ignore>右上の検索 (⌘K / Ctrl+K / "/") で試してください:
<code>ramen</code>, <code>ﾗｰﾒﾝ</code>, <code>らーめん</code>, <code>matcha</code>→✗ (抹茶は漢字), <code>maccha</code>, <code>東京都</code>,
<code>javascirpt</code>, <code>typescript -コンパイル</code>, <code>fujifilm</code>, <code>ばりかた</code></p>
<ul>${ARTICLES.map(([s, t]) => `<li><a href="/demo/site/articles/${s}.html">${t}</a></li>`).join('')}</ul>`,
  ),
);

execFileSync(process.execPath, [join(root, 'bin', 'sagasu.js'), 'build', site, '--base', '/demo/site'], { stdio: 'inherit' });

if (process.argv.includes('--no-serve')) process.exit(0);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json' };
const port = Number(process.env.PORT ?? 4321);
createServer(async (req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (p.endsWith(sep)) p += 'index.html';
  const file = join(root, p);
  if (!file.startsWith(root) || !(await stat(file).catch(() => null))?.isFile()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(await readFile(file));
}).listen(port, () => console.log(`→ http://localhost:${port}/demo/site/`));
