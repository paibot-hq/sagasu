# sagasu（探す）

**日本語がちゃんと引ける、依存ゼロの静的サイト検索。**

`ramen` でも `ﾗｰﾒﾝ` でも `らーめん` でも「ラーメン」が見つかる。`javascirpt` と打ち間違えても見つかる。辞書も形態素解析器もサーバーもいらない。ビルドした HTML のフォルダに CLI を一回かけて、`<sagasu-search>` を1行置けば ⌘K の検索窓ができます。

```
$ npx sagasu build dist
✔ 71 ページ → dist/sagasu.json
  語彙 10,488 / 608.2 KB (gzip 171.2 KB) / 144 ms

$ npx sagasu search dist/sagasu.json あーきてくちゃ
社内文書Q&Aを本番で動かす:権限・更新・評価・運用の設計  /ja/articles/local-llm-rag-production/
  …全体の[アーキテクチャ] 本番の構成は、「質問に答える経路」と「文書を取り込む経路」の2本に…
6 件 (5.74 ms)
```

## なにがえぐいか

| 入力 | 見つかるもの | しくみ |
| --- | --- | --- |
| `らーめん` `ﾗｰﾒﾝ` `ラーメン` | ラーメン | NFKC + カタカナ→ひらがな + 長音「ー」を畳む |
| `ramen` `maccha` `shinkansen` | ラーメン / まっちゃ / しんかんせん | ローマ字→かな（ヘボン式・訓令式、`nn` `っ` `ゃ` も） |
| `ＪａｖａＳｃｒｉｐｔ` | JavaScript | 全角英数→半角、大文字小文字無視 |
| `javascirpt` `typscript` | JavaScript / TypeScript | 編集距離（入れ替えも1文字扱い）で打ち間違いを許す |
| `javas` | JavaScript | 最後の単語は前方一致（打ちながら検索） |
| `東京都` | 「東京都」を「東京と京都」より上に | 2文字ずつの索引（バイグラム）+ 連続一致のボーナス |
| `京` | 京都・東京… | 1文字でも引ける |
| `型 javascript` | 両方を含むページ | スペースは AND、日本語と英語の混在もOK |
| `javascript -typescript` | 除外 | `-語` で除外 |
| `ラーメン 宇宙船` | ラーメンのページ | AND で0件なら「より多く一致した順」に自動で緩める |

- **依存ゼロ**。Node 20+ / モダンブラウザだけ。ソースは全部で約1,000行
- **BM25** でランキング、タイトル一致は重く、フレーズの連続一致にボーナス
- **ハイライト**は元の表記のまま（`ﾗｰﾒﾝ` で引いても本文の「ラーメン」に `<mark>`）、HTML エスケープ済み
- **スニペット**は一致が一番多く入る位置を切り出す
- **IME 変換中の Enter を検索の確定として扱わない** UI

## 使い方

### 1. 静的サイト（Astro / Hugo / 11ty / Next の export など）

```sh
npm i -D sagasu
npx sagasu build dist          # dist/**/*.html → dist/sagasu.json
```

```html
<script type="module">import 'sagasu/ui';</script>
<sagasu-search src="/sagasu.json"></sagasu-search>
```

Astro なら `package.json` の `build` を `astro build && sagasu build dist` にして、ヘッダーに上の2行を置くだけです。

本文の取り方（上から優先）:

1. `data-sagasu-body` が付いた要素
2. `<main>`
3. `<body>`（このときは `header` `footer` `aside` を除く）

`script` `style` `nav` `svg` などと、`data-sagasu-ignore` を付けた要素は常に除きます。`<meta name="robots" content="noindex">` のページと `404.html` は索引に入れません。

```
sagasu build <dir>
  -o, --out <file>          出力先 (既定: <dir>/sagasu.json)
  --base <path>             URL の先頭 (既定: /)
  --clean-urls              foo.html → foo
  --exclude <regexp>        一致するパスを除外 (複数可)
  --title-from <h1|title>   タイトルの取り方 (既定: h1)
  --excerpt <n>             スニペット用に保持する本文の文字数 (既定: 3000, 0 で無し)
```

### 2. JavaScript から

```js
import { createIndex } from 'sagasu';

const idx = createIndex([
  { url: '/ramen', title: '博多ラーメンの名店', text: 'とんこつスープが自慢…', meta: { tag: 'food' } },
  { url: '/kyoto', title: '京都で抹茶を', text: '宇治は抹茶の名産地…' },
]);

idx.search('ramen');
// [{ url: '/ramen', title: '博多ラーメンの名店', score: 4.0,
//    titleHTML: '博多<mark>ラーメン</mark>の名店', snippet: '…', meta: { tag: 'food' } }]
```

ビルド時に作って、ブラウザで読む:

```js
// build
import { IndexBuilder } from 'sagasu';
const b = new IndexBuilder({ titleWeight: 3, excerptLength: 3000 });
for (const post of posts) b.add({ url: post.url, title: post.title, text: post.body });
fs.writeFileSync('dist/sagasu.json', JSON.stringify(b.toJSON()));

// browser
import { SagasuIndex } from 'sagasu';
const idx = await SagasuIndex.load('/sagasu.json');
const hits = idx.search('東京 -京都', { limit: 20, filter: (meta) => meta.lang === 'ja' });
hits.total; // 全件数
```

| オプション | 既定 | |
| --- | --- | --- |
| `limit` / `offset` | 10 / 0 | ページング |
| `prefix` | true | 最後の英単語を前方一致 |
| `fuzzy` | true | 4文字以上の英単語の打ち間違いを許す（8文字以上は2文字まで） |
| `romaji` | true | ローマ字をかなとしても検索 |
| `snippetLength` | 120 | 0 でスニペット無し |
| `filter(meta, url)` | — | 絞り込み |

### 3. UI のカスタマイズ

`<sagasu-search src label placeholder limit>`。⌘K / Ctrl+K / `/` で開きます。色は CSS 変数で:

```css
sagasu-search {
  --sagasu-accent: #e8590c; --sagasu-bg: #fff; --sagasu-fg: #111;
  --sagasu-muted: #666; --sagasu-mark: #ffe066; --sagasu-radius: 8px;
}
```

`::part(button)` `::part(dialog)` `::part(input)` でも触れます。結果が出るたびに `sagasu:results` イベントが飛びます。

## 速さと大きさ

Apple M2 Pro / Node 26 での実測です。

| 対象 | ページ | 作成 | 索引 (gzip) | 1回の検索 |
| --- | --- | --- | --- | --- |
| 実サイト（技術記事, 日英） | 71 | 144 ms | 171 KB | 約 5 ms |
| 実サイト（商品ページ, `--excerpt 600`） | 498 | 265 ms | 95 KB | 約 4 ms |
| 合成コーパス（`npm run bench`） | 10,000 | 1.1 s | 0.26 MB | 3〜7 ms（9,000件ヒットする最悪ケース） |

索引の半分ほどはスニペット用の本文です。小さくしたいときは `--excerpt` を減らしてください。

## Pagefind との比較

同じサイト（技術記事 71 ページ、日英）を Pagefind 1.6.0 と sagasu で索引にして、同じ言葉で検索しました（2026-11-06）。Pagefind は言語ごとに索引を分けるので、日本語の言葉は `/ja/` のページから検索し、sagasu も `/ja/` に絞っています。「正解」は本文に文字列として含まれるページ数です。

| 検索語 | 正解 | Pagefind | sagasu |
| --- | --- | --- | --- |
| `アーキテクチャ` | 6 | 6 | 6 |
| `あーきてくちゃ`（ひらがな） | 6 | **0** | 6 |
| `ｱｰｷﾃｸﾁｬ`（半角） | 6 | **0** | 6 |
| `akitekucha`（ローマ字） | 6 | 21（無関係なページが上位） | 6 |
| `でーたべーす` | 10 | 32（無関係なページが上位） | 10 |
| `こみっと` / `komitto` | 14 | 4 / 4 | 14 / 14 |
| `ＪａｖａＳｃｒｉｐｔ`（全角） | 14 | **0** | 14 |
| `本番 -権限`（除外） | 3 | 12（除外されない） | 3 |
| `クラウドフレア`（本文に無い） | 0 | 1 | 0 |
| `architecture` | 9 | 9 | 9 |
| `architecure`（打ち間違い） | 9 | 1 | 9 |
| `commit -email` | 7 | 10（除外されない） | 6 |

表記が揃っている言葉（`アーキテクチャ` `データベース` `権限` など）は両方とも同じ結果で、上位も同じでした。差が出るのは**ひらがな・半角・全角・ローマ字・除外**です。

Pagefind のほうが良いところもはっきりあります。

- **大きなサイト**: 索引を細かく分けて、必要な分だけ読みます。sagasu は最初に1ファイル（このサイトで gzip 170 KB）を丸ごと読みます。数千ページを超えるなら Pagefind です。
- **多言語**: 言語ごとに索引を分け、英語などの語幹処理もします。
- **実績**: 利用者が多く、フィルタや並べ替え、UI の選択肢も豊富です。

比較に使ったスクリプトは [bench/compare/pagefind.mjs](bench/compare/pagefind.mjs) です（Playwright で Pagefind をブラウザ内で動かし、sagasu は Node で検索）。

## しくみ

```
HTML ─▶ 本文抽出 ─▶ 畳み込み ─────────────▶ 分割 ──────────────▶ 転置索引 (JSON)
                    NFKC / 小文字          日本語: 2文字ずつ       term → [doc, tf, …]
                    カナ→かな / ー除去      英数: 単語              docId は差分で圧縮

クエリ ─▶ 畳み込み ─▶ 単位に分ける ─▶ 候補を広げる ──────────▶ BM25 ─▶ AND ─▶ 再ランク ─▶ ハイライト
                     スペース / 文字種    ローマ字→かな             (0件なら     フレーズ    元の表記に
                     -語 は除外           前方一致 / 打ち間違い      OR に緩める) タイトル    位置を戻す
```

- 日本語は単語の区切りがないので、辞書を使わず**2文字ずつ（バイグラム）**索引にしています。新語・固有名詞・商品名に強く、辞書のダウンロードもいりません。かわりに「東京都」で「東京と京都」も候補に上がるので、連続して一致するページを再ランクで上に上げています。
- 畳み込み（`fold`）は1か所にまとめていて、索引・検索・ハイライトが同じ規則を使います。ハイライトでは畳み込み後の位置を元の文字列の位置に戻すので、`ﾗｰﾒﾝ` で検索しても本文の「ラーメン」がそのまま光ります。

## できないこと

- **漢字の読みは知りません。** `kyouto` は「きょうと」には当たりますが「京都」には当たりません（辞書を持たない代わりです）。
- 英語の語幹処理（`running` → `run`）はしていません。前方一致で多くは拾えます。
- 索引は丸ごと1ファイルです。数万ページを超えるなら分割読み込みの仕組みが要ります。

## 開発

```sh
npm test         # node:test, 依存なし
npm run bench    # 10,000ページの合成コーパス
npm run demo     # demo/site を作って http://localhost:4321/demo/site/ で配信
```

## License

MIT

---

## English

**sagasu** is a zero-dependency full-text search engine for static sites that actually handles Japanese: it folds full/half width and katakana/hiragana, accepts romaji (`ramen` → ラーメン), tolerates typos (`javascirpt`), ranks with BM25 over character bigrams with a phrase-contiguity re-rank, highlights matches in the original text, and ships a ⌘K web component. `npx sagasu build dist` indexes any folder of built HTML; `<sagasu-search src="/sagasu.json">` adds the UI. ~1,000 lines, no runtime dependencies.
