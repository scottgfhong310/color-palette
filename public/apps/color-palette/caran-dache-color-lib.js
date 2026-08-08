/**
 * CaranDacheColorLib — caran-dache-color 前端核心 library（純邏輯，不碰 DOM）
 * =========================================================================
 * IIFE → window.CaranDacheColorLib。零依賴、不用 fetch（資料是靜態 registry）。
 *
 * 這支 app 是唯讀參考工具：資料 window.CDA_COLORS / CDA_CANONICAL / CDA_SERIES
 * （data/cda-*.js）由 Caran_dAche_Master_Color_Index_v1.0.xlsx 產生、不需上傳/編輯，
 * 故無後端 API。lib 只做「資料 → 呈現字串 / CSS」的純運算。
 *
 * 資料形狀（window.CDA_COLORS 每筆＝一個顏色「在某系列裡」）：
 *   Color = {
 *     id:'CDA-LUM-001', seriesId:'LUM', code:'001', order:1,
 *     name:'White', nameZh:'白色', nameJa:'ホワイト',
 *     hex:'#f4f4f5', r:244, g:244, b:245,
 *     lf?:'I', lfNorm?:1.67, lfMax?:3, lfStd?:'ASTM D-6901',
 *     pig?:'PW6', pigN?:1, wcag?:'PASS', contrast?:19.11,
 *     canon:'CDA-CODE-001', cssVar:'--cda-lum-001'
 *   }
 *   window.CDA_CANONICAL 每筆＝去重後的正典色碼（＋同碼跨系列 hex 對照）。
 *
 * 統一「可渲染色票」介面：series 色與 canonical 色都正規化成帶 {code,name,hex,r,g,b}
 * 的物件（見控制器 toRenderable），故 filter / sortColors / colorFamily / cellHtml 共用。
 *
 * Public API：
 *   CaranDacheColorLib.FOLDER · SORT_MODES（['code','hue','lightness','family','hex']）· FAMILY_ORDER
 *   codesInSeries · seriesGaps · seriesMatrix        系列收錄對照（sets.html）
 *   filter(colors, query) → Color[]              依色號／色名（en/zh/ja）／hex 過濾（不改輸入、不分大小寫）
 *   sortColors(colors, mode) → Color[]           依 mode 排序（不改輸入）
 *   colorFamily(color) → 'red'|…|'neutral'       某色屬哪個色系（s<0.17 → neutral）
 *   rgbToHsl(r,g,b) → {h,s,l}
 *   rgbToLab(r,g,b) → [L,a,b] · deltaE(labA,labB) → ΔE00 (CIEDE2000) · deltaEBand(dE) → 'very'|'close'|'noticeable'|'far'
 *   nearestCDA({r,g,b}, {n,series,colors}) → [{seriesId,code,name,hex,cssVar,deltaE,band}]
 *       最接近的 Caran d’Ache 系列色（依 ΔE00 升冪）。預設比對 window.CDA_COLORS 全系列、
 *       但**排除 PSTC**（與 PSTP 共用同一份官方調色盤、hex 逐碼相同，避免 top-N 重複）；
 *       opts.series（字串或陣列）明確指定要比對的系列（此時不再排除 PSTC）；opts.colors 自備參考清單。
 *   hexToRgb(hex) → {r,g,b} | null
 *   relLuminance(r,g,b) → 0..1                    sRGB 相對亮度（WCAG）
 *   pickTextColor(color) → '#000000' | '#ffffff' 色塊上文字該用黑或白（對比取勝者）
 *   contrastRatio(r,g,b, fgIsWhite) → number      與黑/白前景的 WCAG 對比
 *   slug(color) → 'lum-001'                       系列色的識別片段（seriesId 小寫 + code）
 *   formatRgb(color) → 'rgb(244, 244, 245)'
 *   copyValue(color, fmt) → string               fmt: 'hex' | 'var' | 'rgb' | 'class'
 *   buildCss(colors) → string                    產生 :root 變數 + utility classes 整份 .css
 *   cssFilename() → 'caran_dache_colors.css'
 */
(function (window) {
  'use strict';
  // ---- 色彩度量核心：家族共用件 color-metric.js（權威版在家族 repo 根）------
  //
  // 這一段（hexToRgb／relLuminance／contrastRatio／pickTextColor／rgbToHsl／
  // rgbToLab／deltaE／deltaEBand）原本在六支 lib 裡各有一份「號稱逐字相同」的複製。
  // 2026-08-08 實查發現其中四個函式已分成兩派（詳見共用件檔頭），故抽出。
  // 下面保留同名的薄包裝，**本檔的 Public API 與所有呼叫端一行都不必改**。
  //
  // ⚠️ 載入順序是硬條件：本檔在**模組載入時**就取 window.ColorMetric，
  //    <script src="color-metric.js"> 必須排在本檔之前。
  if (!window.ColorMetric) {
    throw new Error('caran-dache-color-lib.js 需要共用件 color-metric.js，' +
      '且 <script> 必須排在本檔之前（見 SHARED_LIBRARY_GUIDELINES §4）');
  }
  var CM = window.ColorMetric;


  var FOLDER = 'caran-dache-color';
  var CSS_FILENAME = 'caran_dache_colors.css';

  // ---- 過濾（純函式，不改輸入） --------------------------------------------
  function filter(colors, query) {
    var q = String(query == null ? '' : query).trim().toLowerCase();
    if (!q) return colors.slice();
    return colors.filter(function (c) {
      return (c.code && c.code.toLowerCase().indexOf(q) !== -1) ||
             (c.name && c.name.toLowerCase().indexOf(q) !== -1) ||
             (c.nameZh && c.nameZh.toLowerCase().indexOf(q) !== -1) ||
             (c.nameJa && c.nameJa.toLowerCase().indexOf(q) !== -1) ||
             (c.hex && c.hex.toLowerCase().indexOf(q) !== -1);
    });
  }

  // ---- 顏色運算 ------------------------------------------------------------
  function hexToRgb(hex) { return CM.hexToRgb(hex); }

  function relLuminance(r, g, b) { return CM.relLuminance(r, g, b); }
  // 與黑（fgIsWhite=false）或白（true）前景的 WCAG 對比比值。
  function contrastRatio(r, g, b, fgIsWhite) { return CM.contrastRatio(r, g, b, fgIsWhite); }
  // 白字與黑字誰的對比高就用誰（含 1:1 邊界，避免中間灰模糊）。
  function pickTextColor(color) { return CM.pickTextColor(color); }

  // sRGB → HSL（h:0..360, s/l:0..1）
  function rgbToHsl(r, g, b) { return CM.rgbToHsl(r, g, b); }

  // ---- CIELAB / CIEDE2000（純函式；為未來「最接近 Caran d’Ache 色」比對器 nearestCDA 預留） ----
  // sRGB → CIELAB（D65）。
  function rgbToLab(r, g, b) { return CM.rgbToLab(r, g, b); }
  // CIEDE2000（ΔE00）——感知最準的色差（kL=kC=kH=1）。
  function deltaE(labA, labB) { return CM.deltaE(labA, labB); }
  // ΔE 品質級距（供 UI 著色 / i18n）：very ≤2 / close ≤5 / noticeable ≤10 / far（與 FC nearestFC 同制）
  function deltaEBand(dE) { return CM.deltaEBand(dE); }

  // ---- 最接近 Caran d’Ache 色比對（nearestCDA，v2） -----------------------
  // 參考庫＝系列色（買得到的實體筆），非正典平均色。Lab 依 colors 陣列 identity 快取。
  var _refLab = null, _refFor = null;
  function _refs(colors) {
    if (_refLab && _refFor === colors) return _refLab;
    _refFor = colors;
    _refLab = colors.filter(function (c) { return c.hex; })
      .map(function (c) { return { c: c, lab: rgbToLab(c.r, c.g, c.b) }; });
    return _refLab;
  }
  // 找最接近的 Caran d’Ache 系列色。rgb: {r,g,b}；opts.n=幾筆（預設1）；
  // opts.series=只比對這些系列（字串或陣列；未指定時比對全系列但**排除 PSTC**——
  // 它與 PSTP 共用同一份官方調色盤、hex 逐碼相同，會讓 top-N 出現重複結果）；
  // opts.colors=自備參考清單。回傳 [{seriesId, code, name, hex, cssVar, deltaE, band}]，依 deltaE 升冪。
  function nearestCDA(rgb, opts) {
    opts = opts || {};
    var colors = opts.colors || window.CDA_COLORS || [];
    var n = opts.n || 1;
    var inc = null;
    if (opts.series) {
      inc = {};
      (Array.isArray(opts.series) ? opts.series : [opts.series]).forEach(function (s) { inc[s] = 1; });
    }
    var t = rgbToLab(rgb.r, rgb.g, rgb.b);
    return _refs(colors).filter(function (x) {
      return inc ? inc[x.c.seriesId] : x.c.seriesId !== 'PSTC';
    }).map(function (x) {
      var d = deltaE(t, x.lab);
      return { seriesId: x.c.seriesId, code: x.c.code, name: x.c.name, hex: x.c.hex,
               cssVar: x.c.cssVar, deltaE: d, band: deltaEBand(d) };
    }).sort(function (a, b) { return a.deltaE - b.deltaE; }).slice(0, n);
  }

  // 色系分群（沿色相環）；'neutral'＝黑/白/灰。
  // 色系分群——**規則來自家族共用件 `color-family.js`**（`window.ColorFamily`）。
  // 本檔只寫下 CDA 自己的無彩度門檻。
  var FAMILY_ORDER = (window.ColorFamily && window.ColorFamily.FAMILY_ORDER) ||
    ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'magenta', 'neutral'];
  var FAMILY_SAT_MIN = 0.17;          // 本 app 的無彩度門檻（color-palette 用 0.12）
  function isAchromatic(color) {
    return rgbToHsl(color.r, color.g, color.b).s < FAMILY_SAT_MIN;
  }
  // 某色屬哪個色系：無彩度 → 'neutral'，否則依色相分。
  function colorFamily(color) {
    return window.ColorFamily.familyOf(color.r, color.g, color.b, { satMin: FAMILY_SAT_MIN });
  }

  // ---- 系列收錄對照（sets.html 用；純函式、不碰 DOM） ---------------------
  //
  // ⚠️ **CDA 沒有「套組」這種資料**——`tb_assortment` 對本品牌是 0 列。
  // FC／COPIC／finecolour 的 `sets.html` 比的是「盒裝套組收錄了哪些色」；
  // CDA 能比、而且更該比的是**系列**：同一個正典色碼，哪幾條系列有出。
  //
  // 而且 CDA 的格子放得進比「有／沒有」更多的東西：**同色碼跨系列是不同顏色**
  // （治理 §3.1），`CDA_CANONICAL[i].series` 就是每條系列對該碼的實際 hex。
  // 所以 cells 存的是**顏色**不是布林——那條規則因此在畫面上看得見，不必用文字說。

  /** 某條系列收錄了哪些正典色碼。 */
  function codesInSeries(canonical, seriesId) {
    return (canonical || [])
      .filter(function (c) { return c.series && c.series[seriesId]; })
      .map(function (c) { return c.code; });
  }

  /**
   * 以某條系列為基準，算出每條系列「相對它還缺幾色」。
   * 0 ＝ 完全涵蓋基準系列。與 faber-castell-color 的 columnGaps 同義。
   */
  function seriesGaps(canonical, seriesIds, baseId) {
    var base = codesInSeries(canonical, baseId);
    var out = {};
    (seriesIds || []).forEach(function (id) {
      var have = {};
      codesInSeries(canonical, id).forEach(function (code) { have[code] = 1; });
      out[id] = base.filter(function (code) { return !have[code]; }).length;
    });
    return out;
  }

  /**
   * 系列矩陣：列＝正典色碼、`cells[系列 id]` ＝ **該系列產出的 hex**（沒出就是 null）。
   * `opts.codes` 可指定列（未選基準時要列出全部 227 個碼）；未給就用基準系列的色單。
   */
  function seriesMatrix(canonical, seriesIds, baseId, opts) {
    var byCode = {};
    (canonical || []).forEach(function (c) { byCode[c.code] = c; });
    var codes = (opts && opts.codes) ? opts.codes.slice() : codesInSeries(canonical, baseId);
    return codes.map(function (code) {
      var c = byCode[code] || {};
      var row = { code: code, canon: c, cells: {} };
      (seriesIds || []).forEach(function (id) {
        row.cells[id] = (c.series && c.series[id]) || null;
      });
      return row;
    });
  }

  var SORT_MODES = ['code', 'hue', 'lightness', 'family', 'hex'];

  // 依 mode 排序（純函式、不改輸入）：
  //   'code'      — 依色號（廠商原始順序）；同碼再依 palette_order
  //   'hue'       — 依色相排成光譜；無彩度（黑/白/灰）殿後、依明度亮→暗
  //   'lightness' — 依相對亮度亮→暗
  //   'family'    — 依 FAMILY_ORDER 分群
  //   'hex'       — 原始 RGB 值 / 字典序（詳見 DESIGN.md）
  function sortColors(colors, mode) {
    var arr = colors.slice();
    if (mode === 'lightness') {
      return arr.sort(function (a, b) { return relLuminance(b.r, b.g, b.b) - relLuminance(a.r, a.g, a.b); });
    }
    if (mode === 'hue') {
      var dec = arr.map(function (c) { var x = rgbToHsl(c.r, c.g, c.b); return { c: c, h: x.h, l: x.l, achr: isAchromatic(c) }; });
      var chroma = dec.filter(function (d) { return !d.achr; });
      var achr = dec.filter(function (d) { return d.achr; });
      chroma.sort(function (a, b) { return (a.h - b.h) || (b.l - a.l); });
      achr.sort(function (a, b) { return b.l - a.l; });
      return chroma.concat(achr).map(function (d) { return d.c; });
    }
    if (mode === 'hex') {
      return arr.sort(function (a, b) { return a.hex < b.hex ? -1 : a.hex > b.hex ? 1 : 0; });
    }
    if (mode === 'family') {
      var fi = {}; FAMILY_ORDER.forEach(function (f, i) { fi[f] = i; });
      var d2 = arr.map(function (c) { var x = rgbToHsl(c.r, c.g, c.b); return { c: c, fam: colorFamily(c), h: x.h, l: x.l }; });
      return d2.sort(function (a, b) {
        return (fi[a.fam] - fi[b.fam]) ||
               (a.fam === 'neutral' ? (b.l - a.l) : ((a.h - b.h) || (b.l - a.l)));
      }).map(function (d) { return d.c; });
    }
    return arr.sort(function (a, b) {
      return ((parseInt(a.code, 10) || 0) - (parseInt(b.code, 10) || 0)) ||
             ((a.order || 0) - (b.order || 0));
    });
  }

  function formatRgb(color) {
    return 'rgb(' + color.r + ', ' + color.g + ', ' + color.b + ')';
  }

  // 系列色識別片段：seriesId 小寫 + code（如 lum-001）。canonical 色無 seriesId → 只回 code。
  function slug(color) {
    return (color.seriesId ? color.seriesId.toLowerCase() + '-' : '') + color.code;
  }

  // ---- 可複製字串 ----------------------------------------------------------
  function copyValue(color, fmt) {
    switch (fmt) {
      case 'hex':   return color.hex;
      case 'var':   return 'var(' + (color.cssVar || ('--cda-' + slug(color))) + ')';
      case 'rgb':   return formatRgb(color);
      case 'class': return '.cda-bg-' + slug(color);
      default:      return color.hex;
    }
  }

  // ---- 產生整份 CSS（:root 變數 + utility classes） ------------------------
  // 只涵蓋 series 色（每個 seriesId+code 一個 --cda-<sid>-<code> 變數）。
  function buildCss(colors) {
    var out = [];
    out.push('/* Caran d’Ache colour code -> CSS hex');
    out.push('   Generated by caran-dache-color (CaranDacheColorLib.buildCss).');
    out.push('   Source: Caran_dAche_Master_Color_Index_v1.0.xlsx (official colour charts).');
    out.push('   Note: hex values are median RGB sampled from official PDF swatches and are');
    out.push('   approximate, not official RGB/HEX specifications. One variable per series+code.');
    out.push('*/');
    out.push('');
    out.push(':root {');
    colors.forEach(function (c) {
      var v = c.cssVar || ('--cda-' + slug(c));
      out.push('  ' + v + ': ' + c.hex + '; /* ' + c.seriesId + ' ' + c.code + ' ' + (c.name || '') + ' */');
    });
    out.push('}');
    out.push('');
    colors.forEach(function (c) {
      var v = c.cssVar || ('--cda-' + slug(c));
      out.push('.cda-color-' + slug(c) + ' { color: var(' + v + '); }');
      out.push('.cda-bg-' + slug(c) + ' { background-color: var(' + v + '); }');
    });
    out.push('');
    return out.join('\n');
  }

  function cssFilename() { return CSS_FILENAME; }

  window.CaranDacheColorLib = {
    FOLDER: FOLDER,
    SORT_MODES: SORT_MODES,
    FAMILY_ORDER: FAMILY_ORDER,
    filter: filter,
    sortColors: sortColors,
    colorFamily: colorFamily,
    codesInSeries: codesInSeries,
    seriesGaps: seriesGaps,
    seriesMatrix: seriesMatrix,
    hexToRgb: hexToRgb,
    rgbToHsl: rgbToHsl,
    rgbToLab: rgbToLab,
    deltaE: deltaE,
    deltaEBand: deltaEBand,
    nearestCDA: nearestCDA,
    relLuminance: relLuminance,
    contrastRatio: contrastRatio,
    pickTextColor: pickTextColor,
    slug: slug,
    formatRgb: formatRgb,
    copyValue: copyValue,
    buildCss: buildCss,
    cssFilename: cssFilename
  };
})(window);
