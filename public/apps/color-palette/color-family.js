/**
 * color-family — 色系分群的**單一權威規則**（家族共用件 A：byte-identical 複製）
 *
 * 權威版：`nodeapp-webapp-family/color-family.js`
 * 複製點：見 SHARED_LIBRARY_GUIDELINES §4 的索引表。改版＝改權威版再同步全部。
 *
 * ── 為什麼要有它 ────────────────────────────────────────────────
 * 這段規則原本住在 `color-palette-lib.js`，之後被**逐字抄進** faber-castell-color、
 * caran-dache-color、finecolour-color 三支 lib。四份「應該永遠一樣」的東西各自躺著，
 * 命中 SHARED_LIBRARY_GUIDELINES §3 的第 3 階（第 3 支要用 → 抽成共用件）。
 *
 * ⚠️ **它已經咬過一次**：2026-08-03 替 EF600 加分群時，我沒有先看 FC／CDA 怎麼做，
 * 自己另寫了一份 `hueGroupOf()`——與這份規則名稱對齊後仍有 **10/120 不一致**
 * （門檻 0.12 vs 0.17，還多了兩條自訂的明度規則）。**同一條規則不要有第二份實作。**
 *
 * ── 共用的是「規則」，不是「門檻」 ──────────────────────────────
 * 色相界線、分群順序、範圍與中點**每支都必須一樣**，所以放這裡。
 * 但**無彩度門檻是各 app 自己的選擇**，實際就不一樣：
 *   · color-palette          `satMin = 0.12`（逐像素遮罩，要更敏感）
 *   · FC／CDA／finecolour     `satMin = 0.17`
 * 而 faber-castell 另有「**金屬色一律歸中性**」這條 brand-specific 規則
 * （近白金屬在 HSL 近白處飽和度會被放大而誤判有彩度）。
 * → 所以 `familyOf()` 收 `opts.satMin` 與 `opts.achromatic`，
 *   **各 app 在自己的 lib 裡包一層薄的 `colorFamily()`，把門檻寫在那一個地方。**
 *   不設「看起來安全」的預設值去掩蓋差異——那會讓 color-palette 的遮罩靜默改變。
 *
 * ── API ────────────────────────────────────────────────────────
 *   ColorFamily.FAMILY_ORDER          分群順序（沿色相環，'neutral' 殿後）
 *   ColorFamily.FAMILY_RANGES         各色系的色相範圍 [min, max)；red 跨 0 度
 *   ColorFamily.hueFamily(hue)        色相 → 色系 key；hue 為 null／負數回 'neutral'
 *   ColorFamily.familyMidHue(key)     色系的代表（中點）色相；'neutral' 回 null
 *   ColorFamily.rgbToHsl(r,g,b)       → { h, s, l }（h 0–360、s/l 0–1）
 *   ColorFamily.familyOf(r,g,b,opts)  → 色系 key
 *       opts.satMin      無彩度門檻（**必填**，不給就用 0.17 並在 console 提醒）
 *       opts.achromatic  額外的「視為無彩度」述詞 (r,g,b) => boolean（FC 的金屬色）
 *
 * 本檔**不碰 DOM、不依賴任何全域**（含各 app 自己的 rgbToHsl——那幾支的回傳形狀
 * 不一致，有的是陣列有的是物件，依賴它就等於把不一致帶進來）。
 */
(function (global) {
  'use strict';

  // 分群順序（沿色相環）；'neutral' ＝ 灰階（無主色相），殿後。
  var FAMILY_ORDER = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'magenta', 'neutral'];

  // 各色系的色相範圍 [min, max)（度）；red 跨 0 度（345 → 360 → 15）。
  var FAMILY_RANGES = {
    red: [345, 15], orange: [15, 45], yellow: [45, 70], green: [70, 165],
    cyan: [165, 195], blue: [195, 255], purple: [255, 290], magenta: [290, 345]
  };

  /** 色相 → 色系 key；hue 為 null（灰階）或負數回 'neutral'。 */
  function hueFamily(hue) {
    if (hue == null || hue < 0) return 'neutral';
    var h = ((hue % 360) + 360) % 360;
    if (h >= 345 || h < 15) return 'red';
    if (h < 45) return 'orange';
    if (h < 70) return 'yellow';
    if (h < 165) return 'green';
    if (h < 195) return 'cyan';
    if (h < 255) return 'blue';
    if (h < 290) return 'purple';
    return 'magenta';
  }

  /** 色系的代表（中點）色相；'neutral' 回 null。供 UI 產生色系標示色。 */
  function familyMidHue(key) {
    var r = FAMILY_RANGES[key];
    if (!r) return null;
    var a = r[0], b = r[1];
    if (a > b) return (((a + (b + 360)) / 2) % 360);   // 跨 0 度（red）
    return (a + b) / 2;
  }

  /** RGB → HSL。h 0–360、s/l 0–1。**本檔自己算**，不依賴宿主的同名函式。 */
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0;
    if (mx !== mn) {
      var d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? ((g - b) / d + (g < b ? 6 : 0))
        : mx === g ? ((b - r) / d + 2)
        : ((r - g) / d + 4);
      h *= 60;
    }
    return { h: h, s: s, l: l };
  }

  var DEFAULT_SAT_MIN = 0.17;
  var warned = false;

  /**
   * RGB → 色系 key。無彩度 → 'neutral'，其餘依色相分。
   * **`opts.satMin` 該由呼叫端明確給**——它是各 app 自己的選擇（見檔頭）。
   */
  function familyOf(r, g, b, opts) {
    opts = opts || {};
    var satMin = opts.satMin;
    if (typeof satMin !== 'number') {
      satMin = DEFAULT_SAT_MIN;
      if (!warned && global.console && console.warn) {
        warned = true;
        console.warn('[ColorFamily] familyOf() 未給 opts.satMin，暫用 ' + DEFAULT_SAT_MIN +
          '。門檻是各 app 自己的選擇（color-palette 用 0.12），請在呼叫端明寫。');
      }
    }
    if (opts.achromatic && opts.achromatic(r, g, b)) return 'neutral';
    var hsl = rgbToHsl(r, g, b);
    return hsl.s < satMin ? 'neutral' : hueFamily(hsl.h);
  }

  global.ColorFamily = {
    FAMILY_ORDER: FAMILY_ORDER,
    FAMILY_RANGES: FAMILY_RANGES,
    hueFamily: hueFamily,
    familyMidHue: familyMidHue,
    rgbToHsl: rgbToHsl,
    familyOf: familyOf
  };
})(typeof window !== 'undefined' ? window : this);
