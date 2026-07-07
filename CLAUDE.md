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
- **明細萃取視圖分頁**（對齊 `thangka-trace` 的用色清單面板）：色族（median）／主色（frequency）／全收（不濾近白黑，含紙底/線稿）／**分布**，
  開啟時即時重萃取（離屏 240px）——前三者走 `Lib.extractPalette`；**分布走 `Lib.distributionByDeltaE`**（ΔE≈5 感知分箱）。
  工具列另有**複製全部色碼**與**存 `.md`**（左圖右表、SVG 色塊必印，交 `markdown-library` 以 `?mymd` 絕對路徑開啟）。落地 alias 仍是 hue-sorted 指紋，分頁為即時檢視、不改 registry。
- **ΔE≈5 感知用色分布** `distributionByDeltaE`（純函式）：5-bit 粗量化去噪 → 每桶平均色轉 **CIELAB** → 依權重 leader 聚類（**CIEDE2000 ΔE00** < radius 併簇）→ 回加權平均色色票（依佔比排序）。
  預設「全收」（含中性色）故佔比加總得起來＝真實用色比例；自帶 `srgbToLab`/`ciede2000`、不相依 `faber-castell-color-lib`（保持純核心零外部相依）。顆粒度取捨見 [DESIGN.md](DESIGN.md)。
- **API 信封**：一律 `{ ok }`；jQuery 3.7.1，後端不依賴 lodash。

## 複製件登記（共用件改版時回來同步）

| 檔案 | 來源（以此為準） |
|---|---|
| `materialize-dark.css` | 家族 repo `nodeapp-webapp-family/materialize-dark.css` |
| `side-tool.css`（正統 flex 版）| `thangka-trace/side-tool.css`（同家族 §5.5 正統版） |
| `i18n.js` | 家族共用（`markdown-reader` 等同款引擎） |
| `color-palette-lib.js` 的 `extractPalette` | 移植自 `thangka-trace-lib.js`（median-cut / frequency 核心） |
| `faber-castell-color-lib.js` ＋ `data/fc-colors.js` | `faber-castell-color`（最接近 FC 色比對；改版重跑其產生器後同步複製） |

> 為什麼長這樣（registry 決策、色相排序、canvas↔lib 邊界、mergeDuplicates）見 [DESIGN.md](DESIGN.md)。
