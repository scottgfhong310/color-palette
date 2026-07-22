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
 *   filter(colors, query) → Color[]              依色號或色名（en/zh/ja）過濾（不改輸入、不分大小寫）
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
             (c.nameJa && c.nameJa.toLowerCase().indexOf(q) !== -1);
    });
  }

  // ---- 顏色運算 ------------------------------------------------------------
  function hexToRgb(hex) {
    if (typeof hex !== 'string') return null;
    var m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function _chan(v) {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }
  function relLuminance(r, g, b) {
    return 0.2126 * _chan(r) + 0.7152 * _chan(g) + 0.0722 * _chan(b);
  }
  // 與黑（fgIsWhite=false）或白（true）前景的 WCAG 對比比值。
  function contrastRatio(r, g, b, fgIsWhite) {
    var L = relLuminance(r, g, b);
    return fgIsWhite ? 1.05 / (L + 0.05) : (L + 0.05) / 0.05;
  }
  // 白字與黑字誰的對比高就用誰（含 1:1 邊界，避免中間灰模糊）。
  function pickTextColor(color) {
    return contrastRatio(color.r, color.g, color.b, true) >=
           contrastRatio(color.r, color.g, color.b, false) ? '#ffffff' : '#000000';
  }

  // sRGB → HSL（h:0..360, s/l:0..1）
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

  // ---- CIELAB / CIEDE2000（純函式；為未來「最接近 Caran d’Ache 色」比對器 nearestCDA 預留） ----
  // sRGB → CIELAB（D65）。
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
  // CIEDE2000（ΔE00）——感知最準的色差（kL=kC=kH=1）。
  function deltaE(labA, labB) {
    var d2r = Math.PI / 180, r2d = 180 / Math.PI;
    var L1 = labA[0], a1 = labA[1], b1 = labA[2];
    var L2 = labB[0], a2 = labB[1], b2 = labB[2];
    var C1 = Math.sqrt(a1 * a1 + b1 * b1), C2 = Math.sqrt(a2 * a2 + b2 * b2);
    var Cbar = (C1 + C2) / 2;
    var Cbar7 = Math.pow(Cbar, 7);
    var G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + 6103515625)));   // 25^7 = 6103515625
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
    var kL = 1, kC = 1, kH = 1;
    var tL = dLp / (kL * Sl), tC = dCp / (kC * Sc), tH = dHp / (kH * Sh);
    return Math.sqrt(tL * tL + tC * tC + tH * tH + Rt * tC * tH);
  }
  // ΔE 品質級距（供 UI 著色 / i18n）：very ≤2 / close ≤5 / noticeable ≤10 / far（與 FC nearestFC 同制）
  function deltaEBand(dE) {
    return dE <= 2 ? 'very' : dE <= 5 ? 'close' : dE <= 10 ? 'noticeable' : 'far';
  }

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
  var FAMILY_ORDER = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'magenta', 'neutral'];
  function hueFamily(hue) {
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
  // 是否視為無彩度：飽和度 <0.17（黑/白/灰）。
  function isAchromatic(color) {
    return rgbToHsl(color.r, color.g, color.b).s < 0.17;
  }
  // 某色屬哪個色系：無彩度 → 'neutral'，否則依色相分。
  function colorFamily(color) {
    return isAchromatic(color) ? 'neutral' : hueFamily(rgbToHsl(color.r, color.g, color.b).h);
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
