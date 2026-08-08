/**
 * FaberCastellCssLib — faber-castell-color 前端核心 library（純邏輯，不碰 DOM）
 * =========================================================================
 * IIFE → window.FaberCastellCssLib。零依賴、不用 fetch（資料是靜態 registry）。
 *
 * 這支 app 是唯讀參考工具：資料 window.FC_COLORS（data/fc-colors.js）由 PDF 產生、
 * 不需上傳/編輯，故無後端 API。lib 只做「資料 → 呈現字串 / CSS」的純運算。
 *
 * 資料形狀（window.FC_COLORS 每筆）：
 *   Color = {
 *     code:'264', name:'dark phthalo green', hex:'#008b71',
 *     r:0, g:139, b:113, cssVar:'--fc-264', page:3, note:'…',
 *     lf?:  { polychromos:'***', adWatercolour:'**', … },   // 只有 pp.1-3 色號有
 *     sets?:{ 'Polychromos colour pencils':[12,24,36,60,72], … }
 *   }
 *
 * Public API：
 *   FaberCastellCssLib.FOLDER · SORT_MODES（['code','hue','lightness','family','hex']）· FAMILY_ORDER
 *   filter(colors, query) → Color[]              依色號／色名／hex 過濾（不改輸入、不分大小寫）
 *   sortColors(colors, mode) → Color[]           依 mode 排序（不改輸入）：色號 / 色相光譜 / 明度 / 色系分群 / hex 原始值
 *   colorFamily(color) → 'red'|…|'neutral'       某色屬哪個色系（金屬色或 s<0.17 → neutral）
 *   setIndex(colors) → [{line,series,sizes:[{size,count}]}]  套組索引（顏色→套組 的反向）
 *   colorsInSet(colors, line, size) → Color[]    某套組收錄哪些色（依色號）
 *   colorsWithoutSet(colors) → Color[]           不屬於任何套組的色（上者的補集）
 *   assortmentMatrix(colors,{series}) → {columns,rows}  套組收錄矩陣（色 × 套組，對齊色卡 PDF）
 *   columnGaps(matrix, pickIdx) → (number|null)[]  相對某欄，各欄還缺幾色（0＝完全涵蓋）
 *   rgbToHsl(r,g,b) → {h,s,l}
 *   rgbToLab(r,g,b) → [L,a,b] · deltaE(labA,labB) → ΔE00 (CIEDE2000) · deltaEBand(dE) → 'very'|'close'|'noticeable'|'far'
 *   nearestFC({r,g,b}, {n,colors,series}) → [{code,name,hex,deltaE,band}]  最接近的 FC 色
 *                                                （排除金屬、依 ΔE 升冪；series 預設 'ag'）
 *   hexToRgb(hex) → {r,g,b} | null
 *   relLuminance(r,g,b) → 0..1                    sRGB 相對亮度（WCAG）
 *   pickTextColor(color) → '#000000' | '#ffffff' 色塊上文字該用黑或白（對比取勝者）
 *   isMetallic(color) → boolean                  hex 為近似值（金屬色）
 *   formatRgb(color) → 'rgb(0, 139, 113)'
 *   copyValue(color, fmt) → string               fmt: 'hex' | 'var' | 'rgb' | 'class'
 *   buildCss(colors) → string                    產生 :root 變數 + utility classes 整份 .css
 *   cssFilename() → 'faber_castell_colors.css'
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
    throw new Error('faber-castell-color-lib.js 需要共用件 color-metric.js，' +
      '且 <script> 必須排在本檔之前（見 SHARED_LIBRARY_GUIDELINES §4）');
  }
  var CM = window.ColorMetric;


  var FOLDER = 'faber-castell-color';
  var CSS_FILENAME = 'faber_castell_colors.css';

  // ---- 過濾（純函式，不改輸入） --------------------------------------------
  function filter(colors, query) {
    var q = String(query == null ? '' : query).trim().toLowerCase();
    if (!q) return colors.slice();
    return colors.filter(function (c) {
      return c.code.toLowerCase().indexOf(q) !== -1 ||
             c.name.toLowerCase().indexOf(q) !== -1 ||
             (c.nameZh && c.nameZh.toLowerCase().indexOf(q) !== -1) ||
             (c.nameJa && c.nameJa.toLowerCase().indexOf(q) !== -1) ||
             (c.hex && c.hex.toLowerCase().indexOf(q) !== -1);
    });
  }

  // ---- 套組索引（顏色→套組 的反向：套組→顏色） -----------------------------
  // 資料裡 sets 掛在色上（c.sets = { 產品線: [尺寸…] }），要回答「這個套組收哪些色」
  // 得整份掃一次。這裡建一次索引給 UI 用；純函式、不改輸入。
  var SERIES_ORDER = ['ag', 'black-edition'];
  function setIndex(colors) {
    var lines = {};
    colors.forEach(function (c) {
      if (!c.sets) return;
      var series = c.series || DEFAULT_SERIES;
      Object.keys(c.sets).forEach(function (line) {
        var L = lines[line] || (lines[line] = { line: line, series: series, sizes: {} });
        c.sets[line].forEach(function (s) { L.sizes[s] = (L.sizes[s] || 0) + 1; });
      });
    });
    return Object.keys(lines).map(function (k) { return lines[k]; })
      .sort(function (a, b) {
        var d = SERIES_ORDER.indexOf(a.series) - SERIES_ORDER.indexOf(b.series);
        return d || (a.line < b.line ? -1 : a.line > b.line ? 1 : 0);
      })
      .map(function (L) {
        return {
          line: L.line,
          series: L.series,
          sizes: Object.keys(L.sizes).map(Number).sort(function (a, b) { return a - b; })
            .map(function (s) { return { size: s, count: L.sizes[s] }; })
        };
      });
  }

  // 某套組收錄哪些色（依色號排序，與網格預設一致）
  function colorsInSet(colors, line, size) {
    return colors.filter(function (c) {
      return c.sets && c.sets[line] && c.sets[line].indexOf(size) !== -1;
    }).sort(function (a, b) { return (parseInt(a.code, 10) || 0) - (parseInt(b.code, 10) || 0); });
  }

  // 不屬於任何套組的色——套組瀏覽的補集，讓「各套組色數」與總數對得起來
  function colorsWithoutSet(colors) {
    return colors.filter(function (c) { return !c.sets || !Object.keys(c.sets).length; });
  }

  // 套組收錄矩陣（色 × 套組），形制對齊官方色卡 PDF 的 assortment 表。
  // opts.series：只取某系列（預設 '*' 全收）。回傳 { columns, rows }，
  // rows[i].cells[j] === true 代表第 i 色收錄於第 j 個套組。
  function assortmentMatrix(colors, opts) {
    opts = opts || {};
    var series = opts.series || '*';
    var pool = colors.filter(function (c) {
      return series === '*' || seriesOf(c) === series;
    });
    var columns = [];
    setIndex(pool).forEach(function (L) {
      L.sizes.forEach(function (s) {
        columns.push({ line: L.line, size: s.size, series: L.series, count: s.count });
      });
    });
    var rows = pool.map(function (c) {
      return {
        color: c,
        cells: columns.map(function (col) {
          return !!(c.sets && c.sets[col.line] && c.sets[col.line].indexOf(col.size) !== -1);
        })
      };
    });
    return { columns: columns, rows: rows };
  }

  // 以第 pickIdx 欄的收錄為基準，算每一欄「還缺幾色」。
  // 0 ＝ 完全涵蓋該套組；pickIdx 那一欄本身回 null（沒有比較對象）。
  // 選購用：同一條產品線的尺寸是嚴格巢狀的，所以有意義的缺口幾乎都在跨產品線的欄位上。
  function columnGaps(matrix, pickIdx) {
    if (pickIdx == null || pickIdx < 0 || pickIdx >= matrix.columns.length) {
      return matrix.columns.map(function () { return null; });
    }
    return matrix.columns.map(function (col, ci) {
      if (ci === pickIdx) return null;
      var miss = 0;
      matrix.rows.forEach(function (r) { if (r.cells[pickIdx] && !r.cells[ci]) miss++; });
      return miss;
    });
  }

  // ---- 顏色運算 ------------------------------------------------------------
  function hexToRgb(hex) { return CM.hexToRgb(hex); }

  function relLuminance(r, g, b) { return CM.relLuminance(r, g, b); }

  // 白字與黑字誰的對比高就用誰（含 1:1 邊界，避免中間灰模糊）
  function pickTextColor(color) { return CM.pickTextColor(color); }

  function isMetallic(color) {
    return /metallic/i.test(color.note || '');
  }

  // sRGB → HSL（h:0..360, s/l:0..1）——移植自 color-palette-lib.rgbToHsl
  function rgbToHsl(r, g, b) { return CM.rgbToHsl(r, g, b); }

  // ---- 最接近 FC 色匹配（CIELAB ΔE76，純函式） ---------------------------
  // sRGB → CIELAB（D65）。
  function rgbToLab(r, g, b) { return CM.rgbToLab(r, g, b); }
  // CIEDE2000（ΔE00）——感知最準的色差（kL=kC=kH=1）。
  function deltaE(labA, labB) { return CM.deltaE(labA, labB); }
  // ΔE 品質級距（供 UI 著色 / i18n）：very ≤2 / close ≤5 / noticeable ≤10 / far
  function deltaEBand(dE) { return CM.deltaEBand(dE); }

  // 參考色系列：'ag'＝Art & Graphic（Polychromos／Albrecht Dürer／Pitt／Goldfaber，
  // 即本 lib 原本的 141 色）；'black-edition'＝Black Edition。'*'＝全收。
  // 無 series 欄位的色（自備清單、舊資料）一律視為 'ag'，故預設行為與加入 Black Edition 前相同。
  var DEFAULT_SERIES = 'ag';
  function seriesOf(color) { return color.series || DEFAULT_SERIES; }

  var _refLab = null, _refFor = null, _refSeries = null;
  function _refs(colors, series) {
    if (_refLab && _refFor === colors && _refSeries === series) return _refLab;
    _refFor = colors; _refSeries = series;
    _refLab = colors.filter(function (c) {
      return c.hex && !isMetallic(c) && (series === '*' || seriesOf(c) === series);
    }).map(function (c) { return { c: c, lab: rgbToLab(c.r, c.g, c.b) }; });
    return _refLab;
  }
  // 找最接近的 FC 色（預設比對 window.FC_COLORS 裡 'ag' 系列的非金屬色）。
  // rgb: {r,g,b}；opts.n=幾筆（預設1）；opts.colors=自備參考清單；
  // opts.series='ag'（預設）／'black-edition'／'*'（全系列）。
  // 回傳 [{ code, name, hex, deltaE, band }]，依 deltaE 升冪。
  function nearestFC(rgb, opts) {
    opts = opts || {};
    var colors = opts.colors || window.FC_COLORS || [];
    var n = opts.n || 1;
    var series = opts.series || DEFAULT_SERIES;
    var t = rgbToLab(rgb.r, rgb.g, rgb.b);
    return _refs(colors, series).map(function (x) {
      var d = deltaE(t, x.lab);
      return { code: x.c.code, name: x.c.name, hex: x.c.hex, deltaE: d, band: deltaEBand(d) };
    }).sort(function (a, b) { return a.deltaE - b.deltaE; }).slice(0, n);
  }

  // 色系分群——**規則來自家族共用件 `color-family.js`**（`window.ColorFamily`）。
  // 本檔只寫下 FC 自己的兩件事：無彩度門檻，以及「**金屬色一律歸中性**」這條
  // brand-specific 規則（近白金屬在 HSL 近白處飽和度會被放大而誤判有彩度）。
  var FAMILY_ORDER = (window.ColorFamily && window.ColorFamily.FAMILY_ORDER) ||
    ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'magenta', 'neutral'];
  var FAMILY_SAT_MIN = 0.17;          // 本 app 的無彩度門檻（color-palette 用 0.12）
  function isAchromatic(color) {
    return isMetallic(color) || rgbToHsl(color.r, color.g, color.b).s < FAMILY_SAT_MIN;
  }
  // 某色屬哪個色系：金屬色或無彩度 → 'neutral'，否則依色相分。
  function colorFamily(color) {
    return window.ColorFamily.familyOf(color.r, color.g, color.b, {
      satMin: FAMILY_SAT_MIN,
      achromatic: function () { return isMetallic(color); }
    });
  }

  var SORT_MODES = ['code', 'hue', 'lightness', 'family', 'hex'];

  // 依 mode 排序（純函式、不改輸入）：
  //   'code'      — 依色號（廠商原始順序）
  //   'hue'       — 依色相排成光譜；無彩度（s<0.12：黑/白/灰/近白金屬）殿後、依明度亮→暗
  //   'lightness' — 依相對亮度亮→暗
  function sortColors(colors, mode) {
    var arr = colors.slice();
    if (mode === 'lightness') {
      return arr.sort(function (a, b) { return relLuminance(b.r, b.g, b.b) - relLuminance(a.r, a.g, a.b); });
    }
    if (mode === 'hue') {
      // 無彩度（黑/白/灰、含微暖冷調 grey；金屬色一律歸此）→ 殿後、依明度亮→暗
      var dec = arr.map(function (c) { var x = rgbToHsl(c.r, c.g, c.b); return { c: c, h: x.h, l: x.l, achr: isAchromatic(c) }; });
      var chroma = dec.filter(function (d) { return !d.achr; });
      var achr = dec.filter(function (d) { return d.achr; });
      chroma.sort(function (a, b) { return (a.h - b.h) || (b.l - a.l); });
      achr.sort(function (a, b) { return b.l - a.l; });
      return chroma.concat(achr).map(function (d) { return d.c; });
    }
    if (mode === 'hex') {
      // 原始 RGB 值 / 字典序：固定 6 位小寫 #rrggbb 的字串序 == 0xRRGGBB 數值序（R 主導 → G → B）。
      // 非感知式排序、確定可重現，但視覺不連貫（詳見 DESIGN.md §7）。
      return arr.sort(function (a, b) { return a.hex < b.hex ? -1 : a.hex > b.hex ? 1 : 0; });
    }
    if (mode === 'family') {
      // 依 FAMILY_ORDER 分群排列；群內彩色依色相→明度，neutral 群依明度亮→暗。
      var fi = {}; FAMILY_ORDER.forEach(function (f, i) { fi[f] = i; });
      var d2 = arr.map(function (c) { var x = rgbToHsl(c.r, c.g, c.b); return { c: c, fam: colorFamily(c), h: x.h, l: x.l }; });
      return d2.sort(function (a, b) {
        return (fi[a.fam] - fi[b.fam]) ||
               (a.fam === 'neutral' ? (b.l - a.l) : ((a.h - b.h) || (b.l - a.l)));
      }).map(function (d) { return d.c; });
    }
    return arr.sort(function (a, b) { return (parseInt(a.code, 10) || 0) - (parseInt(b.code, 10) || 0); });
  }

  function formatRgb(color) {
    return 'rgb(' + color.r + ', ' + color.g + ', ' + color.b + ')';
  }

  // ---- 可複製字串 ----------------------------------------------------------
  function copyValue(color, fmt) {
    switch (fmt) {
      case 'hex':   return color.hex;
      case 'var':   return 'var(' + color.cssVar + ')';
      case 'rgb':   return formatRgb(color);
      case 'class': return '.fc-bg-' + color.code;
      default:      return color.hex;
    }
  }

  // ---- 產生整份 CSS（:root 變數 + utility classes） ------------------------
  // 逐字對齊家族 repo 的 Faber-Castell/faber_castell_colors.css，讓那份由此生成、單一真相。
  function buildCss(colors) {
    var out = [];
    var metallics = colors.filter(isMetallic).map(function (c) { return c.cssVar; });
    var sources = [];
    colors.forEach(function (c) {
      var s = (c.series || DEFAULT_SERIES) === 'black-edition'
        ? 'Colour-assortment-Black-Edition.pdf' : 'Farbtabelle-AG-ENG-0214.pdf';
      if (sources.indexOf(s) === -1) sources.push(s);
    });
    out.push('/* Faber-Castell colour code -> CSS hex');
    out.push('   Generated by faber-castell-color (FaberCastellCssLib.buildCss).');
    out.push('   Source: ' + sources.join(', '));
    out.push('   Note: hex values are read from the official colour charts and are approximate, not official RGB/HEX specifications.');
    out.push('   Metallics (' + metallics.join('/') + ') are gradient swatches with no single true hex — the value is a rough approximation.');
    out.push('*/');
    out.push('');
    out.push(':root {');
    colors.forEach(function (c) {
      out.push('  ' + c.cssVar + ': ' + c.hex + '; /* ' + c.name + ' */');
    });
    out.push('}');
    out.push('');
    colors.forEach(function (c) {
      out.push('.fc-color-' + c.code + ' { color: var(' + c.cssVar + '); }');
      out.push('.fc-bg-' + c.code + ' { background-color: var(' + c.cssVar + '); }');
    });
    out.push('');
    return out.join('\n');
  }

  function cssFilename() { return CSS_FILENAME; }

  window.FaberCastellCssLib = {
    FOLDER: FOLDER,
    SORT_MODES: SORT_MODES,
    FAMILY_ORDER: FAMILY_ORDER,
    filter: filter,
    sortColors: sortColors,
    colorFamily: colorFamily,
    setIndex: setIndex,
    colorsInSet: colorsInSet,
    colorsWithoutSet: colorsWithoutSet,
    assortmentMatrix: assortmentMatrix,
    columnGaps: columnGaps,
    hexToRgb: hexToRgb,
    rgbToHsl: rgbToHsl,
    rgbToLab: rgbToLab,
    deltaE: deltaE,
    deltaEBand: deltaEBand,
    nearestFC: nearestFC,
    relLuminance: relLuminance,
    pickTextColor: pickTextColor,
    isMetallic: isMetallic,
    formatRgb: formatRgb,
    copyValue: copyValue,
    buildCss: buildCss,
    cssFilename: cssFilename
  };
})(window);
