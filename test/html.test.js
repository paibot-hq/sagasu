import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { extract, decodeEntities } from '../src/html.js';
import { SagasuIndex } from '../src/index.js';

const page = (body, head = '<title>ページ | サイト</title>') =>
  `<!doctype html><html lang="ja"><head>${head}<style>.a{color:red}</style></head><body>${body}</body></html>`;

test('prefers <main>, drops nav/script/ignored blocks', () => {
  const r = extract(
    page(`<header>ヘッダー</header><nav>メニュー</nav>
      <main><h1>記事タイトル</h1><p>本文その<b>１</b>。</p><script>var x = "<p>no</p>";</script>
      <div data-sagasu-ignore><div>広告</div><div>広告2</div></div><p>本文その2</p></main>
      <footer>フッター</footer>`),
  );
  assert.equal(r.title, '記事タイトル');
  assert.equal(r.text, '記事タイトル 本文その１。 本文その2');
  assert.equal(r.lang, 'ja');
  assert.equal(r.noindex, false);
});

test('inline tags do not split Japanese words', () => {
  assert.equal(extract(page('<main><p>東<em>京</em>都</p></main>')).text, '東京都');
});

test('[data-sagasu-body] wins over <main>', () => {
  const r = extract(page('<main><p>周辺</p><article data-sagasu-body><p>ここだけ</p></article></main>'));
  assert.equal(r.text, 'ここだけ');
});

test('falls back to body without header/footer', () => {
  const r = extract(page('<header>H</header><div>中身</div><footer>F</footer>'));
  assert.equal(r.text, '中身');
  assert.equal(r.title, 'ページ | サイト');
});

test('title-from title, noindex, entities', () => {
  const html = page('<main><h1>H1</h1>&lt;tag&gt; &amp; &#x1F35C; &copy;</main>', '<title>T</title><meta content="noindex,follow" name="robots">');
  const r = extract(html, { titleFrom: 'title' });
  assert.equal(r.title, 'T');
  assert.equal(r.noindex, true);
  assert.equal(r.text, 'H1 <tag> & 🍜 ©');
  assert.equal(decodeEntities('&unknown; &#0;'), '&unknown; &#0;');
});

test('CLI builds an index from a site directory and searches it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sagasu-'));
  try {
    await mkdir(join(dir, 'blog', 'ramen'), { recursive: true });
    await writeFile(join(dir, 'index.html'), page('<main><h1>ホーム</h1><p>ようこそ</p></main>'));
    await writeFile(join(dir, 'blog', 'ramen', 'index.html'), page('<main><h1>ラーメン日記</h1><p>味噌ラーメンを食べた</p></main>'));
    await writeFile(join(dir, 'about.html'), page('<main><h1>About</h1><p>このサイトについて</p></main>'));
    await writeFile(join(dir, 'secret.html'), page('<main>秘密</main>', '<meta name="robots" content="noindex">'));
    await writeFile(join(dir, '404.html'), page('<main>Not found</main>'));
    await writeFile(join(dir, 'drafts.html'), page('<main>下書き</main>'));

    const bin = fileURLToPath(new URL('../bin/sagasu.js', import.meta.url));
    const out = execFileSync(process.execPath, [bin, 'build', dir, '--clean-urls', '--base', '/docs', '--exclude', '^drafts'], { encoding: 'utf8' });
    assert.match(out, /3 ページ/);
    assert.match(out, /noindex 1, 除外 2/);

    const idx = SagasuIndex.from(await readFile(join(dir, 'sagasu.json'), 'utf8'));
    assert.deepEqual(idx.docs.map((d) => d.u).sort(), ['/docs/', '/docs/about', '/docs/blog/ramen/']);
    assert.equal(idx.search('misoramen').length, 0);
    assert.equal(idx.search('miso ramen')[0]?.url, '/docs/blog/ramen/');

    const res = execFileSync(process.execPath, [bin, 'search', join(dir, 'sagasu.json'), 'らーめん'], { encoding: 'utf8' });
    assert.match(res, /\[ラーメン\]日記/);
    assert.match(res, /1 件/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
