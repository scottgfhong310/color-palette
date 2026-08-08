/**
 * color-metric — 家族共用的色彩度量核心（A 類共用件，權威版在本 repo 根）
 *
 * IIFE → window.ColorMetric。**零依賴、不碰 DOM**，可在 Node 下直接跑。
 *
 * ── 為什麼要有這支 ──────────────────────────────────────────────────
 * 「最接近的筆」是家族五支色彩 registry（faber-castell／caran-dache／copic／
 * finecolour／enmy）＋ color-mixer 共同回答的問題，而它們**必須用同一把尺**——
 * 否則同一個顏色在不同 app 會得到不同的推薦。各 lib 的檔頭一直寫著這一段
 * 「與另外幾支逐字相同」，但那是**靠人維持的**，沒有任何東西在檢查。
 *
 * ⚠️ **2026-08-08 抽出時實查：那句話當時已經不成立。** 九個函式裡有四個分兩派
 *    （{FC, CDA} vs {COPIC, Finecolour, ENMY, color-mixer}）：
 *
 *      deltaE         版本差在註解與 `var kL = 1, kC = 1, kH = 1;` 的寫法——
 *                     k 全為 1，`dLp / (kL * Sl)` 與 `dLp / Sl` **數值完全相同**。
 *      pickTextColor  FC 內聯算對比、其餘委派給 contrastRatio——**結果相同**。
 *      contrastRatio  FC **根本沒有這支**（它把算式內聯在 pickTextColor 裡）。
 *      hexToRgb       ⚠️ **兩種不相容的合約**，見下。
 *
 *    前三項是寫法差異，統一無風險。第四項是真的行為差異，處理方式記在下面。
 *
 * ── hexToRgb：唯一有行為差異的一支〔owner 2026-08-08 拍板：統一成嚴格版〕──
 *
 *    抽出前的兩種合約（實測）：
 *
 *      輸入        FC / CDA（嚴格）   COPIC / FCL / ENMY / MIX（寬鬆）
 *      '#abc'      null               {170,187,204}
 *      '#12345'    null               {18,52,5}      ← 靜默截斷成另一個顏色
 *      'zzz'       null               {NaN,NaN,NaN}  ← 物件，truthy
 *
 *    **本檔採「嚴格 ＋ 支援 3 位簡寫」**：合法就回 {r,g,b}，其餘一律 null。
 *    對 FC／CDA 是**行為不變**（多接受 `#abc`，是放寬不是收緊）；
 *    對另四支是**把靜默錯誤變成明確的 null**。
 *
 *    ⚠️ 這修掉一個真的洞，不只是整潔：`color-palette.js` 與 `thangka-trace.js`
 *    各有五行 `var rgb = XXX.hexToRgb(hex); if (!rgb) return [];`——**十行裡只有
 *    四行真的有效**（FC／CDA 那兩支），COPIC／Finecolour／ENMY 的寬鬆版永不回 null，
 *    那六行是死碼、NaN 直接穿過去。而 ENMY 那兩行被人補成
 *    `if (!rgb || isNaN(rgb.r))`——**有人發現過這個不一致，只補了一支**。
 *    統一之後那十道守衛全部真的生效。
 *
 *    ⚠️ **`thangka-trace-lib.js` 自己也有一支 `hexToRgb`，回的是陣列 `[r,g,b]`**，
 *    形狀不同、用途不同（它的內部取樣迴圈），**不在本共用件範圍，不要一起收**。
 *
 * ── 消費端怎麼用 ────────────────────────────────────────────────────
 *   <script src="./color-metric.js"></script>     <!-- 必須早於所有品牌 lib -->
 *   <script src="./faber-castell-color-lib.js"></script>
 *
 * 各 lib 在檔案開頭以 `window.ColorMetric` 取得本件並保留同名的本地別名，
 * 所以**它們的 Public API 與呼叫端一行都不必改**——`Lib.deltaE` 等照舊存在。
 *
 * ⚠️ **載入順序是硬條件**：各 lib 在**模組載入時**就讀 `window.ColorMetric`，
 *    排在它們後面會在載入當下丟出明確錯誤（不是等到呼叫才出現 TypeError）。
 *    這是刻意的——`color-family.js` 那次（家族 CLAUDE.md v1.18）排錯順序時
 *    丟的是難懂的 TypeError，這裡改成一句講得清楚的訊息。
 *
 * ⚠️ **改本檔＝改全家族的比對結果。** 動之前先想清楚：任何一個常數或分支的改動，
 *    都會同時改變 6 支 app 的「最接近的筆」，而那是使用者拿去買筆的依據。
 */
(function (global) {
  'use strict';

  // ---- hex ↔ rgb -------------------------------------------------------

  /**
   * '#7ebb4e' / '7ebb4e' / '#abc' → { r, g, b }；**任何不合法的輸入一律回 null**。
   * 呼叫端可以直接 `if (!rgb)` 判斷，不必再自己驗一次。
   */
  function hexToRgb(hex) {
    if (typeof hex !== 'string') return null;
    var s = hex.trim();
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
    if (!m) return null;
    var h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  // ---- 亮度與對比（WCAG） ----------------------------------------------

  function _chan(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }

  function relLuminance(r, g, b) {
    return 0.2126 * _chan(r) + 0.7152 * _chan(g) + 0.0722 * _chan(b);
  }

  function contrastRatio(r, g, b, fgIsWhite) {
    var L = relLuminance(r, g, b);
    return fgIsWhite ? 1.05 / (L + 0.05) : (L + 0.05) / 0.05;
  }

  /** 色塊上的文字該用黑還是白——取對比較高的那個。 */
  function pickTextColor(color) {
    return contrastRatio(color.r, color.g, color.b, true) >=
           contrastRatio(color.r, color.g, color.b, false) ? '#ffffff' : '#000000';
  }

  // ---- 色空間 -----------------------------------------------------------

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0;
    if (mx !== mn) {
      var d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      switch (mx) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h *= 60;
    }
    return { h: h, s: s, l: l };
  }

  function rgbToLab(r, g, b) {
    function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    var R = lin(r), G = lin(g), B = lin(b);
    var X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
    var Y = (R * 0.2126 + G * 0.7152 + B * 0.0722);
    var Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    function f(t) { return t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116); }
    var fx = f(X), fy = f(Y), fz = f(Z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }

  // ---- ΔE00（CIEDE2000） -----------------------------------------------

  /**
   * 家族的唯一一把尺。⚠️ kL = kC = kH = 1（圖文業界慣用的參數化），
   * 故下面直接除以 Sl／Sc／Sh——抽出前有一派寫成 `dLp / (kL * Sl)` 並宣告 k 全為 1，
   * **數值完全相同**，這裡取較短的寫法。
   */
  function deltaE(labA, labB) {
    var d2r = Math.PI / 180, r2d = 180 / Math.PI;
    var L1 = labA[0], a1 = labA[1], b1 = labA[2];
    var L2 = labB[0], a2 = labB[1], b2 = labB[2];
    var C1 = Math.sqrt(a1 * a1 + b1 * b1), C2 = Math.sqrt(a2 * a2 + b2 * b2);
    var Cbar = (C1 + C2) / 2;
    var Cbar7 = Math.pow(Cbar, 7);
    var G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + 6103515625)));   // 25^7
    var a1p = a1 * (1 + G), a2p = a2 * (1 + G);
    var C1p = Math.sqrt(a1p * a1p + b1 * b1), C2p = Math.sqrt(a2p * a2p + b2 * b2);
    function hp(bb, ap) { if (bb === 0 && ap === 0) return 0; var h = Math.atan2(bb, ap) * r2d; return h < 0 ? h + 360 : h; }
    var h1p = hp(b1, a1p), h2p = hp(b2, a2p);
    var dLp = L2 - L1, dCp = C2p - C1p;
    var dhp;
    if (C1p * C2p === 0) dhp = 0;
    else { dhp = h2p - h1p; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
    var dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * d2r);
    var Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
    var hbp;
    if (C1p * C2p === 0) hbp = h1p + h2p;
    else if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2;
    else hbp = (h1p + h2p < 360) ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
    var T = 1 - 0.17 * Math.cos((hbp - 30) * d2r) + 0.24 * Math.cos((2 * hbp) * d2r)
          + 0.32 * Math.cos((3 * hbp + 6) * d2r) - 0.20 * Math.cos((4 * hbp - 63) * d2r);
    var dTheta = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
    var Cbp7 = Math.pow(Cbp, 7);
    var Rc = 2 * Math.sqrt(Cbp7 / (Cbp7 + 6103515625));
    var Sl = 1 + (0.015 * Math.pow(Lbp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbp - 50, 2));
    var Sc = 1 + 0.045 * Cbp;
    var Sh = 1 + 0.015 * Cbp * T;
    var Rt = -Math.sin((2 * dTheta) * d2r) * Rc;
    var tL = dLp / Sl, tC = dCp / Sc, tH = dHp / Sh;
    return Math.sqrt(tL * tL + tC * tC + tH * tH + Rt * tC * tH);
  }

  /**
   * ΔE00 → 級距代號。**文案不在這裡**——`band.*` 的三語文字住在各 app 的
   * `locales/`（DESIGN_GUIDELINES §6.1：UI 文案與資料是兩條通道）。
   * 本件只負責分級，讓六支 app 分出來的級距必然一致。
   */
  function deltaEBand(dE) {
    return dE <= 2 ? 'very' : dE <= 5 ? 'close' : dE <= 10 ? 'noticeable' : 'far';
  }

  global.ColorMetric = {
    hexToRgb: hexToRgb,
    relLuminance: relLuminance,
    contrastRatio: contrastRatio,
    pickTextColor: pickTextColor,
    rgbToHsl: rgbToHsl,
    rgbToLab: rgbToLab,
    deltaE: deltaE,
    deltaEBand: deltaEBand
  };

})(typeof window !== 'undefined' ? window : globalThis);
