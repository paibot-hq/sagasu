#!/usr/bin/env node
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join, relative, sep, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { IndexBuilder, SagasuIndex } from '../src/index.js';
import { extract } from '../src/html.js';

const HELP = `sagasu — 日本語に強い、依存ゼロの静的サイト検索

使い方:
  sagasu build <dir> [options]       HTML を走査して索引を作る
      -o, --out <file>               出力先 (既定: <dir>/sagasu.json)
      --base <path>                  URL の先頭 (既定: /)
      --clean-urls                   foo.html → foo
      --exclude <regexp>             一致するパスを除外 (複数可)
      --title-from <h1|title>        タイトルの取り方 (既定: h1)
      --excerpt <n>                  スニペット用に保持する本文の文字数 (既定: 3000, 0 で無し)
  sagasu search <index.json> <query> 端末で検索を試す
      -n <limit>                     件数 (既定: 10)
  sagasu --help
`;

function parseArgs(argv) {
  const pos = [];
  const flags = { exclude: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined) fail(`${a} には値が必要です`);
      return v;
    };
    switch (a) {
      case '-o': case '--out': flags.out = val(); break;
      case '--base': flags.base = val(); break;
      case '--clean-urls': flags.cleanUrls = true; break;
      case '--exclude': flags.exclude.push(new RegExp(val())); break;
      case '--title-from': flags.titleFrom = val(); break;
      case '--excerpt': flags.excerpt = Number(val()); break;
      case '-n': flags.limit = Number(val()); break;
      case '-h': case '--help': flags.help = true; break;
      default:
        if (a.startsWith('-') && a.length > 1 && !pos.length) fail(`不明なオプション: ${a}`);
        pos.push(a);
    }
  }
  return { pos, flags };
}

function fail(msg) {
  console.error(`sagasu: ${msg}`);
  process.exit(1);
}

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile() && e.name.endsWith('.html')) yield p;
  }
}

function toUrl(rel, base, cleanUrls) {
  let u = rel.split(sep).join('/');
  if (u === 'index.html') u = '';
  else if (u.endsWith('/index.html')) u = u.slice(0, -'index.html'.length);
  else if (cleanUrls) u = u.slice(0, -'.html'.length);
  const b = base.endsWith('/') ? base : base + '/';
  return b + u.split('/').map(encodeURIComponent).join('/');
}

const kb = (n) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);

async function build(dir, flags) {
  if (!dir) fail('build にはディレクトリを指定してください');
  const root = resolve(dir);
  if (!(await stat(root).catch(() => null))?.isDirectory()) fail(`${dir} はディレクトリではありません`);
  const out = resolve(flags.out ?? join(root, 'sagasu.json'));
  const t0 = performance.now();
  const b = new IndexBuilder({ excerptLength: flags.excerpt ?? 3000 });
  const skipped = { noindex: 0, excluded: 0, empty: 0 };
  const files = [];
  for await (const f of walk(root)) files.push(f);
  files.sort();
  for (const file of files) {
    const rel = relative(root, file);
    if (/(^|[\\/])404\.html$/.test(rel) || flags.exclude.some((r) => r.test(rel.split(sep).join('/')))) {
      skipped.excluded++;
      continue;
    }
    const page = extract(await readFile(file, 'utf8'), { titleFrom: flags.titleFrom });
    if (page.noindex) { skipped.noindex++; continue; }
    if (!page.text && !page.title) { skipped.empty++; continue; }
    // the <h1> usually opens <main>; don't repeat it at the start of every snippet
    const text = page.title && page.text.startsWith(page.title) ? page.text.slice(page.title.length).trim() : page.text;
    b.add({ url: toUrl(rel, flags.base ?? '/', flags.cleanUrls), title: page.title, text });
  }
  const json = JSON.stringify(b.toJSON());
  await writeFile(out, json);
  const ms = performance.now() - t0;
  console.log(
    [
      `✔ ${b.docs.length} ページ → ${relative(process.cwd(), out) || out}`,
      `  語彙 ${b.postings.size.toLocaleString()} / ${kb(Buffer.byteLength(json))} (gzip ${kb(gzipSync(json).length)}) / ${ms.toFixed(0)} ms`,
      skipped.noindex + skipped.excluded + skipped.empty
        ? `  スキップ: noindex ${skipped.noindex}, 除外 ${skipped.excluded}, 空 ${skipped.empty}`
        : null,
    ].filter(Boolean).join('\n'),
  );
}

async function search(file, query, flags) {
  if (!file || !query) fail('使い方: sagasu search <index.json> <query>');
  const idx = SagasuIndex.from(await readFile(file, 'utf8'));
  const t0 = performance.now();
  const hits = idx.search(query, { limit: flags.limit ?? 10 });
  const ms = performance.now() - t0;
  const tty = process.stdout.isTTY;
  const term = (html) =>
    html
      .replace(/<mark>/g, tty ? '\x1b[1;33m' : '[')
      .replace(/<\/mark>/g, tty ? '\x1b[0m' : ']')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  for (const h of hits) {
    console.log(`${tty ? '\x1b[1m' : ''}${term(h.titleHTML) || '(無題)'}${tty ? '\x1b[0m' : ''}  ${tty ? '\x1b[2m' : ''}${h.url}  ${h.score}${tty ? '\x1b[0m' : ''}`);
    if (h.snippet) console.log(`  ${term(h.snippet)}`);
  }
  console.log(`${hits.total} 件 (${ms.toFixed(2)} ms)`);
}

const [cmd, ...rest] = process.argv.slice(2);
const { pos, flags } = parseArgs(rest);
if (!cmd || cmd === '-h' || cmd === '--help' || flags.help) console.log(HELP);
else if (cmd === 'build') await build(pos[0], flags);
else if (cmd === 'search') await search(pos[0], pos.slice(1).join(' '), flags);
else fail(`不明なコマンド: ${cmd}\n\n${HELP}`);
