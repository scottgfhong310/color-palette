# color-palette — Session context

上傳圖片、萃取主要顏色組成（≤ 12 色），把色票列當作該圖 **alias** 的單頁 WebApp（canvas 分析 + 輕量 Express 後端：上傳 / 落地 registry / 清空）。

本 app 屬於 **nodeapp WebApp 家族**；共同規範與流程在
<https://github.com/scottgfhong310/nodeapp-webapp-family>（`DESIGN_GUIDELINES.md` 規範、`WORKFLOW.md` 流程）。**改動前請先讀那兩份，照其中 canon 做。**

## 結構

```
app.js                              # Express 入口：port 3000；/ → 302 /apps/color-palette/
routes/upload.js                    # POST /api/upload?folder=color-palette（共用最小版）
routes/color-palette.js             # GET /files、POST /alias、POST /clear（+ registry 讀寫）
public/apps/color-palette/          # 前端（服務於 /apps/color-palette/）
├─ index.html · color-palette.css · color-palette.js · color-palette-lib.js
├─ color-portrait-lib.js             # 五構面 → 一句色彩描述（純函式、零相依；家族共用候選）
├─ materialize-dark.css · side-tool.css · i18n.js · locales/{zh-Hant,en,ja}.js
public/upload/color-palette/        # 上傳圖片 + .registry.json（內容不進版控）
```

## 執行 / 驗證

```bash
npm install && node app.js          # → http://localhost:3000/apps/color-palette/
```

驗證（preview 實跑）：`/` 302、資產 200、`/files` 回 `{ ok }`、上傳→自動分析→色塊出現、
萃取法切換重算、色相排序（同色系相鄰）、i18n 三語、主題切換、清空 `confirm()`、路徑穿越被擋。

## 本 app 的 canon 重點

- **可嵌入 lib** `color-palette-lib.js`（`window.ColorPaletteLib`）：顏色萃取（median-cut / frequency）、
  色相排序、與伺服器溝通，**純邏輯不碰 DOM**；`color-palette.js` 才是碰 DOM 的控制器。
  **「載圖 → canvas → getImageData」是 DOM 工作，留控制器**（§4.1／§4.7 邊界的實戰版）。
- **萃取核心承襲 `thangka-trace-lib` 的 `extractPalette`**（median-cut 色族代表 + frequency 頻率主色）；
  本 app 另加 `rgbToHsl` / 色相排序 / `mergeDuplicates`（合併相同 hex）/ registry 溝通。
- **薄後端**：後端不跑 canvas（零額外依賴），只存取「檔名 → 色票 alias」的 registry
  （`public/upload/color-palette/.registry.json`，隱藏檔）。萃取全在瀏覽器端。
- **落地 registry**（§3.5 精神）：`POST /alias` 以 `JSON.stringify` 重寫 registry、**覆寫前 `.bak`**、
  嚴格驗證色票（colors ≤ 12、r/g/b 0–255 整數、hex `#rrggbb`、ratio 0–1、method 白名單）。
- **色相排序**：alias 內色塊與檔案清單皆依色相（`compareByHue`）；灰階（無主色相）殿後。
- **圖多時的瀏覽**：色系分群（純函式 `hueFamily`/`FAMILY_ORDER`）+ sticky 標頭 + 左側跳轉色軌
  + 密度模式（`comfortable` 縮圖 ↔ `compact` 色票牆，存 `localStorage('color-palette-density')`）。詳見 DESIGN.md §8。
- **絕對路徑**：前端用 `/api/...`、`/upload/...`，須由本專案 Node server 提供（**不相容 GitHub Pages**）。
- **主題**：CSS 變數 light/dark，預設 dark；切換時同步 toggle `dark-mode`/`light-mode` class（§5.1 坑）。
- **i18n**：`i18n.js` 引擎 + `locales/*.js`，`data-i18n` 屬性，預設 `zh-Hant`；**色值/檔名不翻譯**。
- **最接近 Faber-Castell 色**：明細每列與燈箱取色鏡顯示「≈ FC### 名稱 ΔE」（＋2 替代色）——比對
  複製件 `FaberCastellCssLib.nearestFC`（CIEDE2000 ΔE00、排除金屬色）。純比對、無 DOM 邊界變動。
- **明細萃取視圖分頁**（對齊 `thangka-trace` 的用色清單面板）：色族（median）／主色（frequency）／全收（不濾近白黑，含紙底/線稿）／**分布**／**重點色**，
  開啟時即時重萃取（離屏 240px）——前三者走 `Lib.extractPalette`；**分布走 `Lib.distributionByDeltaE`**（ΔE≈5 感知分箱）、**重點色走 `Lib.accentColors`**（彩度加權顯著性）。
  工具列另有**複製全部色碼**、**存 `.md`**（單構面：左圖右表）與**完整報告 `summarize`**（`buildReportMd`：五構面全放，分頁版——P1 總覽頭〔圖左；右欄＝色彩肖像一句 + 五條比例色帶，帶高 15〕、P2 色族｜主色〔兩欄各 12〕、P3 全收〔單欄 12〕、分布／重點色 `maxColors: 36`、每頁三欄各 12〔P4 分布、P5 重點色〕；**特例：分布與重點色都 ≤12 色時合成一頁**〔分布｜重點色兩欄〕；分頁點各 `break-before:page`）——皆 SVG 色塊必印、交 `markdown-library` 以 `?mymd` 絕對路徑開啟。落地 alias 仍是 hue-sorted 指紋，分頁為即時檢視、不改 registry。
- **ΔE≈5 感知用色分布** `distributionByDeltaE`（純函式）：5-bit 粗量化去噪 → 每桶平均色轉 **CIELAB** → 依權重 leader 聚類（**CIEDE2000 ΔE00** < radius 併簇）→ 回加權平均色色票（依佔比排序）。
  預設「全收」（含中性色）故佔比加總得起來＝真實用色比例；自帶 `srgbToLab`/`ciede2000`、不相依 `faber-castell-color-lib`（保持純核心零外部相依）。顆粒度取捨見 [DESIGN.md](DESIGN.md)。
- **重點色 accent** `accentColors`（純函式，DESIGN §10）：**彩度加權**的顯著性萃取——每像素權重 `(Lab 彩度−chromaFloor)^gamma`（預設 `gamma=2`、`chromaFloor=14`），近中性像素權重 0。小面積但鮮豔的色（紅唇、紅點）會浮上來，`ratio`＝顯著度佔比（非面積）。與面積視圖互補：面積視圖答「用了什麼、各多少」，重點色答「哪些最搶眼」。
- **色彩肖像** `color-portrait-lib.js`（`window.ColorPortraitLib`，純函式、零相依）：吃五構面色資料 → `describe()` 回**結構化描述**（溫度暖冷／面積主導家族／明度 key／彩度／**配色原型**〔粉彩·大地·寶石·霓虹·高對比，HSV 濃度×明度×冷暖×對比，取代色調 clause〕／焦點色／**和諧配色**〔色相聚極判單色·類比·互補·分裂互補·三角·四角，`harmonyOf()`；理論與導出見 [HARMONY.md](HARMONY.md)〕／**跨構面張力** tensions——如「看似中性卻某色以面積悄悄主導」「小而鮮的焦點色」），`phrase(desc, I18n.t)` 拼成一句；措辭全在 `portrait.*` locale（lib 不含文字）。**只描述顏色、不描述內容**（知道「一抹小而鮮的紅」，不知道是嘴唇）。明細 `#detail-portrait` 與完整報告頂端各即時生成一句。**視覺肖像卡** `ColorPortraitLib.card(desc, t, {fcName})`＝把 Description 畫成 SVG「色彩指紋卡」（和諧環＋溫度條＋明度×彩度座標＋焦點色塊；純字串、實色列印必印、文字 currentColor 隨主題），明細 `#detail-card` 與報告右欄各一張；導讀（是什麼／與色型的關係／怎麼讀）見 [PORTRAIT-CARD.md](PORTRAIT-CARD.md)。
  **v2 加值（依賴注入、lib 仍純）**：`phrase(desc, t, {fcName})` 用 hook 把焦點色命名為實體 Faber-Castell 色，**依語言在地化**（zh「印度紅 ≈FC192」／ja「インディアンレッド」／en「India red」，色號不變；對照表 `data/fc-names-i18n.js`，控制器 `fcLocalName()`）；`describe(facets, {corpus, self})` 吃「圖庫其他圖的 alias 色」當語料，把本圖暖度/彩度放進分布，**只在約前/後 8%（`REL_MIN=0.42`，實測約 1/3 圖）才發相對句**「在你的圖庫裡算偏暖/冷/鮮/沉靜的一張」。控制器 `portraitOpts()` 組語料＋FC hook。想法到設計（五色型→v1→v2→未來）見 [COLOR-PORTRAIT.md](COLOR-PORTRAIT.md)。**家族共用候選**（比照 `faber-castell-color-lib`，驗證後可抽出給 `thangka-trace` 等）。
- **API 信封**：一律 `{ ok }`；jQuery 3.7.1，後端不依賴 lodash。

## 複製件登記（共用件改版時回來同步）

| 檔案 | 來源（以此為準） |
|---|---|
| `materialize-dark.css` | 家族 repo `nodeapp-webapp-family/materialize-dark.css` |
| `side-tool.css`（正統 flex 版）| `thangka-trace/side-tool.css`（同家族 §5.5 正統版） |
| `i18n.js` | 家族共用（`markdown-reader` 等同款引擎） |
| `color-palette-lib.js` 的 `extractPalette` | 移植自 `thangka-trace-lib.js`（median-cut / frequency 核心） |
| `faber-castell-color-lib.js` ＋ `data/fc-colors.js` | `faber-castell-color`（最接近 FC 色比對；改版重跑其產生器後同步複製） |
| `data/fc-names-i18n.js`（FC 色名 zh/ja 對照，code→{zh,ja}）| `faber-castell-color`（由其 `data/source/generate.js` 從 `faber_castell_color_code_css_foreground_zh_ja.csv` 一併產生；改版重跑後同步複製，同 `fc-colors.js`）|

> 為什麼長這樣（registry 決策、色相排序、canvas↔lib 邊界、mergeDuplicates）見 [DESIGN.md](DESIGN.md)。
