# color-palette — 設計決議（DESIGN）

> 版本 v1.0｜最後更新 2026-07-05

「怎麼用」歸 [README](README.md)、「為什麼長這樣」歸本檔；家族共同規範只標引用不重複
（見 [DESIGN_GUIDELINES](https://github.com/scottgfhong310/nodeapp-webapp-family/blob/main/DESIGN_GUIDELINES.md)）。

## 1. 定位

解析上傳圖片的顏色組成，把 ≤ 12 個主色的色票列當作該圖的 **alias**。檔案清單中：**有 alias 的顯示色塊、沒有的顯示檔名**；alias 與清單皆依色相排序。屬 viewer／上傳類（家族 §4.7）：標準上傳骨架 + 四件式。

## 2. 職責邊界：canvas 留控制器、演算進 lib

家族 §4.1／§4.7 的界線是「呈現引擎自己碰不碰 DOM」。這裡：

- **`getImageData` 需要 canvas＝DOM 工作** → 「載圖 → 縮圖 → 讀像素」留控制器 `color-palette.js`。
- **像素陣列 → 色票＝純運算** → `extractPalette` / `buildPalette` / 色相排序進 `color-palette-lib.js`，不碰 `document`。

萃取核心直接**移植自 `thangka-trace-lib.js` 的 `extractPalette`**（median-cut 色族代表 + frequency 頻率主色，預設以亮度＋色度略過近白/近黑）——同一家族內已驗證的演算法，不重造。

## 3. 落地 registry（而非即時重算）

**決議：分析結果落地。** `POST /alias` 把色票寫進 `public/upload/color-palette/.registry.json`。

- 這讓第 4 點的「有/沒有 alias」有明確語意：**已分析→有色塊、未分析→檔名**，alias 成為該圖的穩定身分、重載不重算。
- 比照家族 §3.5 registry 回寫：`JSON.stringify` 重寫（自帶跳脫）、**覆寫前 `.bak`**、`{ ok }` 信封。
- registry 是**隱藏檔**（`.` 開頭），故不被 `/files` 列入、`clear` 只刪可見檔後另行清空 registry。
- **薄後端**：後端不跑 canvas（避免 node-canvas 這類重依賴），萃取全在瀏覽器；後端只驗證並存 JSON。
  取捨——分析算力落在客戶端，但換來零額外後端依賴、部署簡單、符合家族「薄後端、純前端核心」。

## 4. 色相（hue）排序

**決議：alias 內色塊與檔案清單都依色相排序。**

- 色票以 HSL 色相升冪（`sortByHue`）；**灰階（低飽和、色相不穩）殿後**、依亮度。這讓 alias 成為與檔名／上傳序無關的**穩定視覺指紋**。
- 檔案清單以各圖**代表色相**（最大佔比色的 hue，`representativeHue`）排序（`compareByHue`）——同色系的圖相鄰；無主色相（灰階圖）或尚無 alias 者殿後。
- 代表色相存在 `Palette.hue`（`-1` = 灰階）；後端 `hue` 為選用 number。

## 5. `mergeDuplicates`：合併相同 hex

median-cut 以「陣列中位索引」切盒，在**不等大色簇**上會把單一純色切成多個內容相同的盒 → 產生數個 byte-identical 的色票（純色／平面圖尤其明顯）。

**決議：`buildPalette` 在排序前合併完全相同 hex 的色票、累加其 ratio。** 因為 alias 要的是「相異的主要顏色（≤ 12）」，重複色塊無資訊且視覺雜訊。合併只併**完全相同**的 hex（渲染上不可分），對真實照片（幾乎無 byte 級重複）無影響，對純色/圖表圖則明顯變乾淨（實測純 2 色圖：合併前 6 個重複盒 → 合併後 2 色）。

## 6. 呈現：色塊寬度依佔比

卡片上的 alias 色塊寬度以 `flex-grow = ratio` 依**面積佔比**呈現「顏色組成」；小色以 `min-width` 保底可見。**精確的 hex 與百分比**放明細 Modal（點 alias 開啟），含各色佔比條。色相排序保證色塊左→右由暖到冷穩定排列。

## 7. 互動

- **上傳後自動分析**：上傳成功→重讀清單取得 mtime→控制器載圖入 canvas→`buildPalette`→`saveAlias`。
- **點未分析的卡**＝就地分析；**點已分析的卡**＝開明細 Modal。
- **萃取法 toggle**（`#setting-method`）只切「目前萃取法」（median↔frequency，存 localStorage）；
  既有檔以 **`#setting-reanalyze`（refresh）** 或明細內「重新分析」按目前法重算——切法不無聲改動既有 alias。
- 同名覆寫：以 `mtime` 破縮圖快取（`?t=<mtime>`），穩定不亂閃。

## 8. 圖多時的瀏覽：色系分群 + 跳轉色軌 + 密度模式

當圖成百上千，「一張張滑縮圖」不可行。因為 alias 是資料（色相可算），瀏覽的解法是**拿色票去組織與導航**：

- **色系分群**：清單先依代表色相排序，再切成色系區段（紅/橙/黃/綠/青/藍/紫/洋紅／中性，末端「未分析」）。
  分群邏輯是純函式（lib 的 `FAMILY_ORDER` / `hueFamily` / `familyMidHue`）；每區一個**黏性標頭**（sticky），
  捲動時「目前在哪個色系」不消失。
- **跳轉色軌**：左側依現有色系各一顆色點，點擊 `scrollIntoView` 捲到該區——把光譜變成可定址的目錄。
  窄螢幕（≤980px）收起色軌（分區標頭仍在，導航不失）。
- **密度模式**（`#setting-density`，存 localStorage）：`comfortable`＝縮圖＋色票；`compact`＝**色票牆**
  （拿掉縮圖與 meta、只留色票 bar、格子更密）。色票牆是概念的終點「顏色即身分、不必看圖」，
  幾百上千張時一頁掃完。切換只加 `body.density-compact` class、純 CSS 換裝，不重繪。

> 這三者都是同一個信念的延伸：**顏色成為身分後，圖庫可以「看著顏色」來組織與導航**（見 [CONCEPT.md](CONCEPT.md)）。

## 9. 安全（家族 §3.4／§8）

- 檔名消毒：`basename === 原值`、擋 `../ \ \0`、**圖片副檔名白名單** `.png/.jpg/.jpeg/.webp/.gif/.bmp`（picker accept + 後端再驗）。
- 色票驗證：colors 非空且 ≤ 12、r/g/b 為 0–255 整數、hex `#rrggbb`、ratio 0–1、method 白名單；不合法一律 `400 { ok:false }`。
- 操作目標寫死 server 端（固定 `public/upload/color-palette`），不接受任意路徑參數；覆寫 registry 前 `.bak`。
- `express.json({ limit:'5mb' })`、上傳 ≤ 20 檔、清空 `confirm()` 二次確認（文案註明無法復原）。

---

*MIT © 2026 Scott G.F. Hong*
