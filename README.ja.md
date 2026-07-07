# color-palette

> 版本 v1.0｜最後更新 2026-07-05

[English](README.md) ｜ [繁體中文](README.zh-Hant.md) ｜ **日本語**

画像をアップロードして主要な色（≤ 12 色）を抽出し、その色票の並びをその画像の **alias（別名）** として使います。解析済みの画像は色ブロックを、未解析の画像はファイル名を表示します。ギャラリー全体と各 alias は **色相（hue）** で並ぶため、近い色の画像が集まり、alias はファイル名や順序に依存しない安定した視覚的フィンガープリントになります。

本アプリは **nodeapp WebApp ファミリー** の一員です。共通規約とワークフローは
<https://github.com/scottgfhong310/nodeapp-webapp-family>（`DESIGN_GUIDELINES.md`、`WORKFLOW.md`）にあります。

> ⚠️ GitHub Pages 非対応：フロントは絶対パス `/api/...`・`/upload/...` を呼ぶため、本プロジェクトの Node サーバーが必要です。

## 特長

- 画像の **ドラッグ&ドロップ／クリックアップロード**（`.png` `.jpg` `.webp` `.gif` `.bmp`）、アップロード時に自動解析。
- **2 つの抽出方式** を切替可能：*色系統の代表色*（median-cut、色域を均等にカバー）と *頻度による主色*（面積で主色を取得）。
- **alias としての色票**：各画像の ≤ 12 の主色を色相順の色ブロック列に。
- **色相順**：alias 内の色ブロックとギャラリー全体が色相で並ぶ（無彩色の画像は末尾）。
- **大量でも快適に閲覧**：ギャラリーを色系統（赤/オレンジ/黄/緑/シアン/青/紫/マゼンタ/無彩色）でグループ化し、固定ヘッダー＋左側ジャンプレール付き。密度切替で「サムネイルカード」と高密度の**色票ウォール**を切り替え。
- **registry へ永続化**：解析結果をサーバー側に保存、再読込後も保持・再計算しない。
- **詳細 5 ビュー**：alias をクリックすると元画像と各色の hex・比率を表示し、**色族／主要色／全収／分布／アクセント**の 5 つの色タイプを切り替え可能（面積代表色・ΔE≈5 知覚分布・彩度加重の顕著性）。各タイプの意味と使い分けは [COLOR-TYPES.md](COLOR-TYPES.md) を参照。
- **ライト／ダーク** テーマ、**zh-Hant / en / ja** の 3 言語。Materialize 要素は共通 `materialize-dark.css` でダーク対応。

## インストールと実行

```bash
npm install
npm start          # → http://localhost:3000/apps/color-palette/
```

ポートは `PORT` で上書き（例：`PORT=3005 npm start`）。

## ディレクトリ構成

```
app.js                                   # Express エントリ：port 3000；/ → 302 /apps/color-palette/
routes/upload.js                         # POST /api/upload?folder=color-palette（共通最小版）
routes/color-palette.js                  # GET /files、POST /alias、POST /clear（registry 含む）
public/apps/color-palette/               # フロント（/apps/color-palette/ で配信）
├─ index.html                            # 構造のみ
├─ color-palette.css                     # テーマ token + ギャラリー / 色ブロック / モーダル
├─ color-palette.js                      # コントローラ：アップロード、canvas → getImageData、描画
├─ color-palette-lib.js                  # 純粋コア：抽出、色相ソート、サーバー通信（window.ColorPaletteLib）
├─ materialize-dark.css · side-tool.css · i18n.js · locales/{zh-Hant,en,ja}.js
public/upload/color-palette/             # アップロード画像 + .registry.json（バージョン管理外）
```

## API

すべてのエンドポイントは `{ ok: boolean, ... }` を返します。

| Method | Path | 説明 |
|---|---|---|
| POST | `/api/upload?folder=color-palette` | 画像アップロード（multipart フィールド `myFiles`、≤ 20）；同名は上書き |
| GET  | `/api/color-palette/files` | 画像一覧、各ファイルに `alias`（または `null`）|
| POST | `/api/color-palette/alias` | 1 画像の色票を永続化；body `{ name, palette }`（上書き前に `.bak`）|
| POST | `/api/color-palette/clear` | 可視ファイルを全削除し registry を空に |

色抽出は **ブラウザ側**（canvas + `color-palette-lib.js`）で実行。バックエンドは薄いまま registry の保存のみ担当します。

## コアライブラリ（`window.ColorPaletteLib`）

純粋ロジック、DOM 非依存、ネイティブ `fetch` のみ——どこにでも埋め込み可能。

```js
// canvas ピクセル：ctx.getImageData(0,0,w,h).data （RGBA Uint8ClampedArray）
const palette = ColorPaletteLib.buildPalette(pixels, { method: 'median', count: 12 });
await ColorPaletteLib.saveAlias('photo.png', palette);
const files = await ColorPaletteLib.listFiles();
files.sort((a, b) => ColorPaletteLib.compareByHue(a.alias, b.alias));
```

主なメソッド：`extractPalette(data, opts)`、`buildPalette(data, opts)`、`sortByHue(colors)`、
`representativeHue(palette)`、`compareByHue(aliasA, aliasB)`、`rgbToHsl` / `rgbToHex`、
`uploadFile` / `listFiles` / `saveAlias` / `clearFolder`、`isImage` / `fileUrl` / `formatSize` / `timestamp`。

## データ構造

```jsonc
// ColorPaletteLib.buildPalette(data, opts) →  Palette
{
  "method": "median",        // 'median' | 'frequency'
  "count": 5,                // 異なる色数（≤ 12）
  "colors": [                // 色相順；同一 hex はマージ済み
    {
      "r": 220, "g": 40, "b": 40,   // 0–255
      "hex": "#dc2828",             // '#rrggbb'
      "ratio": 0.53,                // 非中性ピクセルに占める比率（0–1）
      "hue": 0                      // HSL 色相 0–360
    }
    // …
  ],
  "hue": 0                   // 代表色相（最大比率の色）；-1 = 無彩色
}

// GET /api/color-palette/files →
{
  "ok": true,
  "files": [
    {
      "name": "photo.png",
      "size": 12345,               // bytes
      "mtime": 1783214392243,      // ms epoch
      "alias": { /* Palette + "analyzedAt": "yyyyMMddHHmmss" */ } | null
    }
  ]
}
```

## ライセンス

[MIT](LICENSE) © 2026 [Scott G.F. Hong](https://github.com/scottgfhong310)
