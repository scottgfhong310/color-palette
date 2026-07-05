# color-palette

> 版本 v1.0｜最後更新 2026-07-05

[English](README.md) ｜ **繁體中文** ｜ [日本語](README.ja.md)

上傳圖片、萃取主要顏色（≤ 12 色），把該色票列當作這張圖的 **alias**。已分析的圖顯示色塊、尚未分析的顯示檔名。整個 gallery 與每組 alias 都依 **色相（hue）** 排序——同色系的圖聚在一起，alias 也成為與檔名／上傳序無關的穩定視覺指紋。

本 app 屬於 **nodeapp WebApp 家族**；共同規範與流程在
<https://github.com/scottgfhong310/nodeapp-webapp-family>（`DESIGN_GUIDELINES.md`、`WORKFLOW.md`）。

> ⚠️ 不相容 GitHub Pages：前端以絕對路徑呼叫 `/api/...`、`/upload/...`，須由本專案 Node 伺服器提供。

## 功能

- **拖拉／點選上傳** 圖片（`.png` `.jpg` `.webp` `.gif` `.bmp`），上傳後自動分析。
- **兩種萃取法** 可切換：*色族代表*（median-cut，色域覆蓋均勻）與 *頻率主色*（依面積取主色）。
- **色票即 alias**：每張圖的 ≤ 12 個主色組成依色相排序的色塊列。
- **色相排序**：alias 內色塊與整個 gallery 皆依色相排序（無主色相的灰階圖殿後）。
- **圖多也好逛**：gallery 依色系分群（紅/橙/黃/綠/青/藍/紫/洋紅/中性）+ 黏性標頭 + 左側跳轉色軌；密度切換可在「縮圖卡」與極密的**色票牆**間切換。
- **落地 registry**：分析結果存在伺服器端，重載後仍在、不重算。
- **明細檢視**：點 alias 可看原圖與各色的 hex、面積佔比。
- **淺／深色** 主題、**zh-Hant / en / ja** 三語；Materialize 元件由共用 `materialize-dark.css` 處理深色。

## 安裝與執行

```bash
npm install
npm start          # → http://localhost:3000/apps/color-palette/
```

以 `PORT` 覆寫連接埠（例：`PORT=3005 npm start`）。

## 目錄結構

```
app.js                                   # Express 入口：port 3000；/ → 302 /apps/color-palette/
routes/upload.js                         # POST /api/upload?folder=color-palette（共用最小版）
routes/color-palette.js                  # GET /files、POST /alias、POST /clear（含 registry）
public/apps/color-palette/               # 前端（服務於 /apps/color-palette/）
├─ index.html                            # 純結構
├─ color-palette.css                     # 主題 token + gallery / 色塊 / modal 樣式
├─ color-palette.js                      # 控制器：上傳、canvas → getImageData、渲染
├─ color-palette-lib.js                  # 純核心：萃取、色相排序、伺服器溝通（window.ColorPaletteLib）
├─ materialize-dark.css · side-tool.css · i18n.js · locales/{zh-Hant,en,ja}.js
public/upload/color-palette/             # 上傳圖片 + .registry.json（不進版控）
```

## API

所有端點皆回 `{ ok: boolean, ... }` 信封。

| Method | Path | 說明 |
|---|---|---|
| POST | `/api/upload?folder=color-palette` | 上傳圖片（multipart 欄位 `myFiles`，≤ 20 檔）；同名覆寫 |
| GET  | `/api/color-palette/files` | 列出圖片，各檔帶其 `alias`（或 `null`）|
| POST | `/api/color-palette/alias` | 落地單一圖片的色票；body `{ name, palette }`（覆寫前 `.bak`）|
| POST | `/api/color-palette/clear` | 刪除所有可見檔並清空 registry |

顏色萃取在 **瀏覽器端**（canvas + `color-palette-lib.js`）完成；後端維持薄身，只存 registry。

## 核心 library（`window.ColorPaletteLib`）

純邏輯、不碰 DOM、只用原生 `fetch`，可嵌入任何地方。

```js
// canvas 像素：ctx.getImageData(0,0,w,h).data （RGBA Uint8ClampedArray）
const palette = ColorPaletteLib.buildPalette(pixels, { method: 'median', count: 12 });
await ColorPaletteLib.saveAlias('photo.png', palette);
const files = await ColorPaletteLib.listFiles();
files.sort((a, b) => ColorPaletteLib.compareByHue(a.alias, b.alias));
```

主要方法：`extractPalette(data, opts)`、`buildPalette(data, opts)`、`sortByHue(colors)`、
`representativeHue(palette)`、`compareByHue(aliasA, aliasB)`、`rgbToHsl` / `rgbToHex`、
`uploadFile` / `listFiles` / `saveAlias` / `clearFolder`、`isImage` / `fileUrl` / `formatSize` / `timestamp`。

## 資料結構

```jsonc
// ColorPaletteLib.buildPalette(data, opts) →  Palette
{
  "method": "median",        // 'median' | 'frequency'
  "count": 5,                // 相異色數（≤ 12）
  "colors": [                // 依色相排序；相同 hex 已合併
    {
      "r": 220, "g": 40, "b": 40,   // 0–255
      "hex": "#dc2828",             // '#rrggbb'
      "ratio": 0.53,                // 佔非中性像素比（0–1）
      "hue": 0                      // HSL 色相 0–360
    }
    // …
  ],
  "hue": 0                   // 代表色相（最大佔比色）；-1 = 灰階（無主色相）
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

## 授權

[MIT](LICENSE) © 2026 [Scott G.F. Hong](https://github.com/scottgfhong310)
