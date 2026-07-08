# 色彩肖像（Colour Portrait）——從想法到設計

> 這份文件記錄「色彩肖像」這個功能的**思路**：從五類 COLOR-TYPE，到 v1「一句誠實的描述」，
> 到 v2「有名字、有觀點」，再到可以想像的未來。
> 資料型別與各構面細節見 [COLOR-TYPES.md](COLOR-TYPES.md)；演算法取捨見 [DESIGN.md](DESIGN.md)；
> app 的founding概念（色票即身分）見 [CONCEPT.md](CONCEPT.md)。

---

## 0. 一句話

> 一張圖有幾種顏色，取決於你問的問題。**色彩肖像**不是把調色盤總結成一句話，
> 而是**同時戴上五副眼鏡、找出它們彼此矛盾之處**，講成人話。

---

## 1. 緣起：一張圖「有幾種顏色」？

color-palette 一開始只做一件事：萃取 ≤12 個主色，當作一張圖的「色票指紋（alias）」。
但很快發現——**同一張圖，用不同方法萃取，會得到不同的答案，而且每個答案都對**：

- 想看「用了哪些**不同**色」→ 色域均勻的代表色（median）
- 想看「**主要**是什麼色」→ 大面積優先（frequency）
- 想看「各色**實際**佔多少」→ 誠實的面積分布
- 想看「哪些色最**搶眼**」→ 顯著性，不是面積

這不是「哪個演算法比較好」的問題，是**它們在回答不同的問題**。於是有了**五類 COLOR-TYPE**。

---

## 2. 五副眼鏡（五類 COLOR-TYPE）

| 眼鏡 | 問的問題 | 原理 | `ratio` 的尺 |
|---|---|---|---|
| **色族** Families | 用了哪些**不同**色 | median-cut | 面積 |
| **主色** Dominant | **主要**是什麼色 | frequency | 面積 |
| **全收** All | 連紙底/線稿的**全部** | frequency（不濾中性） | 面積 |
| **分布** Distribution | 各色**實際佔多少** | ΔE≈5 感知分箱（CIEDE2000） | **真實**面積 |
| **重點色** Accent | 哪些色最**搶眼** | 彩度加權顯著性 | **顯著度**（非面積） |

關鍵陷阱：**這五個 `ratio` 不是同一把尺**。主色的 60% 和重點色的 60% 意義完全不同。
把它們並排會誤導——而**這個「不可直接比較」正是描述最有訊息量的來源**（見下節）。

> 完整定義、選用時機、常見疑問在 [COLOR-TYPES.md](COLOR-TYPES.md)。

---

## 3. 核心洞見：不要「總結」，要「比較」

擺出五份調色盤，任何工具都做得到。真正的洞見是：

> **五副眼鏡彼此矛盾之處，才是一張圖最值得說的事。**

- 主色說「溫柔中性」，分布卻說「其實四成是藍」——**它感覺中性，其實不是**。
- 面積上微不足道的一抹紅，在重點色卻排第一——**你的眼睛看的是它，儘管它很小**。

這些「意外」不是 bug，是**跨構面推理（cross-facet reasoning）**的產物。
色彩肖像的引擎，本質上不是「摘要器」，是**比較器**——把五層放在一起，找出張力（tension）。

---

## 4. v1：一句誠實的描述

### 設計

把「算語意」和「講成話」切開——這是讓它成為 **functional library** 的關鍵：

```
ColorPortraitLib.describe(facets) → Description   // 純結構化事實：數字 + 語意標籤（語言中立）
ColorPortraitLib.phrase(desc, t)  → 一句話         // t＝i18n 翻譯函式；措辭全在 locale
```

`Description` 是語言中立的**事實**，不是句子：

```js
{
  temperature: { verdict: 'cool-leaning', bothWarmCool: true },
  families:    [{ key:'blue', share:.40 }, …],   // 依「分布」真實面積
  dominant:    { hex, family, muted:true },        // 依「主色」的「感覺」
  key:         'high' | 'mid' | 'low',             // 明度
  chroma:      'muted' | 'balanced' | 'vivid',
  focal:       { hex, family },                    // 小而鮮的焦點色
  harmony:     'warm-cool' | 'near-mono' | …,
  tensions:    [ { type:'hidden-dominant', … }, { type:'small-vivid-accent', … } ]  // ★
}
```

`phrase()` 只負責**挑哪些子句、什麼順序、帶什麼參數**（邏輯），措辭在 `portrait.*` locale（文字）。
lib 因此**純粹、決定論、零外部相依、可單元測試**——不需要 LLM。

### 兩條張力（v1 的靈魂）

- **hidden-dominant**：主色偏中性，但分布顯示某彩色家族以面積主導 →「看似中性，實則藍以約 X% 悄悄主導」。
- **small-vivid-accent**：某色顯著性高但家族面積小 →「焦點是一抹小而鮮的紅」。

### 一個誠實的邊界

**色彩肖像只描述「顏色」，不描述「內容」。**
它知道「一抹小而鮮、hue≈350、佔 1.5% 的紅」，但**不知道那是嘴唇**。
主觀與內容（「溫柔」「柔焦」「嘴唇」）留給人或潤稿層——v1 只講**站得住腳的可測量事實**。

### 一個教訓：焦點色不是「最搶眼」那個

初版把 `accent[0]`（最搶眼者）當焦點——結果一張大面積的鮮豔天藍被說成「小而鮮的焦點」。
**焦點的本意是「顯著卻面積小」的驚喜**，該挑**家族總面積小卻上重點色榜**者，不是排第一者。
這個修正正好體現核心：焦點也是一種跨構面推理（顯著性 vs 面積）。

---

## 5. v2：有名字、有觀點

v1 確立了「**結構化 Description 才是資產，句子只是它的一種呈現**」。v2 就是拿這個資產做更多事——
而且**不破壞 lib 的純粹**：新能力全靠**依賴注入**。

### 5.1 有名字：FC 命名的焦點色

`phrase(desc, t, { fcName })` 用 hook 把焦點色接上 app 既有的 Faber-Castell 比對器，
並**依語言在地化**：

- v1：焦點是一抹小而鮮的**紅**
- v2：焦點是一抹小而鮮的 **印度紅（≈FC192）** ／ **India red** ／ **インディアンレッド**

lib 不直接相依 FC——名字由 hook 注入；在地名對照 `fc-names-i18n.js` 由 `faber-castell-color`
的產生器輸出（英文名仍是 canonical，不翻譯）。

### 5.2 有觀點：相對於你的圖庫

單張的「暖/冷/鮮/濁」是絕對值；放進**整個圖庫**才有「意外」。
`describe(facets, { corpus })` 吃「其他圖的 alias 色」當語料，把本圖的暖度/彩度放進分布：

> 「…、**在你的圖庫裡算偏暖的一張**、…」

只在**約前/後 8%（`REL_MIN=0.42`，實測約 1/3 圖）**才發相對句——調參過：一開始「暖度或彩度
任一落榜就發話」會涵蓋 72% 的圖、太吵，改成「取單一最極端指標 + 高門檻」降到 33%，
讓典型圖靜默、只有真正離群的才有觀點。這一步讓肖像從**客觀事實**升級成**有觀點的評語**。

### 架構：純核心 + 依賴注入

```
describe(facets, { corpus, self })   // 圖庫語料靠參數
phrase(desc, t, { fcName })          // FC 名靠 hook、措辭靠 i18n
```

FC、圖庫、語言——三個外部世界，全部注入，lib 依然是那個零相依的純函式。
控制器 `portraitOpts()` 負責組語料 + FC hook，明細與報告共用。

---

## 6. 可以想像的未來

v1 是「一句話」，v2 是「有名字有觀點的一句話」。再往前，方向不只是「講得更好」，
而是**改變色彩肖像「是什麼」**。

### 6.1 更深的分析（describe 講更準）
- **真正的色彩理論和諧** ✅ **已實作**：把彩色色相在色環上以 circular leader clustering 聚成「極」（面積加權），
  取面積 ≥7% 的顯著極，依其**數量與角度幾何**判 **單色／類比／互補／分裂互補／三角／四角**（`harmonyOf()`）；
  只在明確方案時發話（varied/neutral 靜默），且與「暖冷對比」clause 去重（跨色環方案本身即含暖冷）。取代了原本
  near-mono/warm-cool/varied 的粗略三分類。**理論與導出見 [HARMONY.md](HARMONY.md)。**
- **配色原型（archetype）** ✅ **已實作**：把 **色彩濃度（HSV 飽和度）× 明度 × 冷暖 × 明暗對比** 綜合成可辨識的「氣質」——
  **粉彩 / 大地色 / 寶石調 / 霓虹 / 高對比**（優先序判定，無明確者回 null）。句子裡**取代**色調 clause（「去飽和中間調」→「大地色調」），
  也標在視覺肖像卡的明度×彩度座標下方。純可量測、不臆測內容。（濃度用 HSV 而非 HSL——HSL 對淺色會虛高、把粉彩誤判成鮮豔。）**理論與導出見 [ARCHETYPE.md](ARCHETYPE.md)。**
- **更多張力**：漸層 vs 色塊、高對比、雙色調、單點爆點…

### 6.2 從「標題」到「身分」——可查詢的 metadata
如果每張圖都有結構化 `Description`，它就不只是**看圖時的一句話**，而是**檢索鍵**：

> 「找出**冷調、但有暖色焦點**的圖」、「**偏中性去飽和**的那幾張」

這正好接回這個 app 的 DNA——「**色票即身分（palette as alias）**」（[CONCEPT.md](CONCEPT.md)）。
到了這一步，**那句描述本身就是身分**，能拿來搜尋、分群、做 SaaS 的 metadata。
色彩肖像的終點，是讓「描述」變成「alias」。

### 6.3 呈現不只一句
- **可變長度/重點**：依「意外程度」排序，只講最有訊息量的兩件事，或展開成一段。
- **視覺肖像卡** ✅ **已實作**：`ColorPortraitLib.card(desc, t, {fcName})` 把 Description 畫成一張 SVG「色彩指紋卡」——
  **和諧環**（色相環＋聚極點＋配色幾何連線＋方案名）｜**溫度條**（暖/中/冷）｜**明度×彩度座標點**（點＝主色）｜**焦點色塊＋FC 名**。
  純字串、不碰 DOM；顏色用實色（列印＝前景必印）、文字用 currentColor（主題自適應）。明細 `#detail-card` 與完整報告右欄各生成一張。**怎麼讀這張卡見 [PORTRAIT-CARD.md](PORTRAIT-CARD.md)。**
- **選配 LLM 潤稿**：把結構化 `Description` 丟給模型寫得更漂亮——**這裡才讓主觀與文采進場**，
  且是 opt-in，純核心仍決定論、零相依。

### 6.4 關係與時間
- **相對某個集合**：不只「你的圖庫」，也可以「相對某個畫派/某位攝影師」。
- **趨勢**：一批圖隨時間的暖冷/彩度漂移——色彩肖像從描述「一張圖」變成描述「一批圖的變化」。

---

## 7. 一以貫之的五個原則

1. **句子是呈現，Description 才是資產。** 先算結構化事實，再談怎麼講。
2. **價值在跨構面推理，不在總結單一調色盤。** 找矛盾，別找共識。
3. **只描述顏色，不描述內容。** 站得住腳的可測量事實；主觀留給人或潤稿層。
4. **純核心 + 依賴注入。** FC 靠 hook、圖庫靠參數、措辭靠 i18n——lib 永遠純、可測、可複用。
5. **從標題到身分。** 描述的終點是成為可查詢的 alias，接回 app 的 founding 概念與 SaaS 目標。

---

## 8. 檔案地圖

| 東西 | 在哪 |
|---|---|
| 純核心 lib（describe / phrase / metrics） | `public/apps/color-palette/color-portrait-lib.js`（`window.ColorPortraitLib`） |
| 五構面萃取（餵給 describe 的 facets） | `color-palette-lib.js`：`extractPalette` / `distributionByDeltaE` / `accentColors` |
| 措辭（三語） | `locales/*.js` 的 `portrait.*` key |
| FC 名在地化對照 | `data/fc-names-i18n.js`（由 `faber-castell-color` 產生器輸出） |
| 控制器接線（語料 + FC hook） | `color-palette.js`：`portraitOpts()` / `fcLocalName()` / `renderPortrait()` |
| 呈現位置 | 明細 `#detail-portrait`、完整報告頂端 |

> **家族共用候選**：`color-portrait-lib.js` 純函式、零相依，之後可比照 `faber-castell-color-lib`
> 抽出給 `thangka-trace` 等——注入介面（`fcName` / `corpus`）一併帶走即可。

---

*MIT © 2026 Scott G.F. Hong ｜ 五類色型 [COLOR-TYPES.md](COLOR-TYPES.md)｜演算法 [DESIGN.md](DESIGN.md)｜概念 [CONCEPT.md](CONCEPT.md)*
