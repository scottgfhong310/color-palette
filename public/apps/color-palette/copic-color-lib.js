/**
 * copic-color-lib — COPIC 色號對照的純核心
 *
 * IIFE → window.CopicColorLib。零依賴、不碰 DOM、不用 fetch（資料是靜態 registry）。
 * 控制器（copic-color.js / sets.js）才碰 DOM。
 *
 * 本 app 與 faber-castell-color / caran-dache-color 的關鍵差異＝**色號可分解**。
 * Copic Color System：`BV02` = 色系 `BV` ＋ Blending Group `0`（飽和層級 0–9）
 * ＋ Intensity Value `2`（明度層級，000–9 共 12 級）。灰階（C/N/T/W）、無彩（A）、
 * 螢光（F）不在這套編號裡，故 bg/iv 為空——**那是資料的事實，不是缺漏**。
 *
 * 色彩科學核心（rgbToLab / deltaE / deltaEBand / contrastRatio / pickTextColor）
 * 與 FC、CDA 兩支 lib **逐字相同**——家族三支比對器必須用同一把尺，否則
 * 「最接近的筆」在不同 app 會給出不同答案。
 *
 * API：
 *   FOLDER · SORT_MODES · BG_ORDER · IV_ORDER
 *   filter(colors, q) → 依色號/色名/hex 過濾
 *   sortColors(colors, mode) → 'code'|'hue'|'lightness'|'hex'|'family'
 *   axisGrid(colors, familyCode) → { bgs, ivs, cell(bg,iv), flat } 三軸矩陣（本 app 的招牌）
 *   parseCode(code) → { family, bg, iv } | null      純由色號推導，供驗證
 *   hexToRgb · rgbToHsl · rgbToLab · deltaE(ΔE00) · deltaEBand
 *   nearestCOPIC({r,g,b}, { n, line, blender, colors }) → [{ code,name,hex,cssVar,deltaE,band }]
 *   relLuminance · contrastRatio · pickTextColor
 *   setIndex(sets) · colorsInSet · setsOfColor · assortmentMatrix · columnGaps
 *   formatRgb · copyValue · buildCss · cssFilename
 */
(function (global) {
  'use strict';

  var FOLDER = 'copic-color';
  var SORT_MODES = ['code', 'hue', 'lightness', 'hex', 'family'];

  // Copic Color System 宣稱的兩條軸（色卡圖例）：Blending Group 10 級、Intensity 12 級。
  var BG_ORDER = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  var IV_ORDER = ['000', '00', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

  // ---- 檢索 / 排序 -------------------------------------------------------

  function filter(colors, q) {
    var s = String(q || '').trim().toLowerCase();
    if (!s) return colors.slice();
    return colors.filter(function (c) {
      return c.code.toLowerCase().indexOf(s) >= 0
          || String(c.name || '').toLowerCase().indexOf(s) >= 0
          || String(c.nameZh || '').toLowerCase().indexOf(s) >= 0
          || String(c.nameJa || '').toLowerCase().indexOf(s) >= 0
          || c.hex.toLowerCase().indexOf(s) >= 0;
    });
  }

  /**
   * 把「字母前綴＋數字尾巴」的色號拆成可比大小的鍵：['C-', 10]。
   * 灰階（C-00/C-0/C-1…C-10）與無彩（0/100/110）沒有 bg/iv，只能靠色號本身排——
   * 純字串序會把 C-10 夾在 C-1 與 C-2 之間、把 C-00 排到 C-0 之後，兩者都是錯的。
   * 全 0 的尾巴（0/00/000）沿用 Intensity 的既有慣例：0 越多越淡、排越前面（記為負值）。
   * 無數字尾巴者尾數記 0，等同只比前綴。
   */
  function codeParts(code) {
    var s = String(code == null ? '' : code);
    var m = s.match(/^(.*?)(\d+)$/);
    if (!m) return [s, 0];
    var digits = m[2];
    return [m[1], /^0+$/.test(digits) ? -digits.length : parseInt(digits, 10)];
  }

  // 色號排序：先色系（官方序），再 Blending Group，再 Intensity；
  // 無 bg/iv 者（灰階／無彩／螢光）殿後，以「前綴 → 數字」排。
  function codeKey(c, famSort) {
    var f = famSort[c.family] || 99;
    if (c.bg === undefined || c.bg === null) {
      var p = codeParts(c.code);
      // 螢光（F）色號＝'F' ＋ 彩色系代碼 ＋ 明度數字（FYG2 ＝ 螢光／YG／2）。型錄是先按明度、
      // 再按色系順序排，照抄它——退成字母序（FB2 FBG2 FRV1…）會把色相打散。
      // 判定條件是「去掉 F 之後剩下的是不是一個已知色系」，故只有 F 這種複合色號會走這條。
      var hue = p[0].charAt(0) === 'F' ? famSort[p[0].slice(1)] : undefined;
      if (hue !== undefined) return [f, 99, 99, '', p[1], hue];
      return [f, 99, 99, p[0], p[1], 0];
    }
    return [f, c.bg, IV_ORDER.indexOf(c.iv === undefined ? '0' : c.iv), c.code, 0, 0];
  }
  function cmp(a, b) {
    for (var i = 0; i < a.length; i++) {
      if (a[i] < b[i]) return -1;
      if (a[i] > b[i]) return 1;
    }
    return 0;
  }
  function sortColors(colors, mode, families) {
    var famSort = {};
    (families || []).forEach(function (f) { famSort[f.code] = f.sort; });
    var out = colors.slice();
    if (mode === 'hue') {
      out.sort(function (a, b) {
        var ha = rgbToHsl(a.r, a.g, a.b), hb = rgbToHsl(b.r, b.g, b.b);
        if (isAchromatic(a) !== isAchromatic(b)) return isAchromatic(a) ? 1 : -1;   // 無彩度殿後
        if (isAchromatic(a)) return ha.l - hb.l;
        return ha.h - hb.h || ha.l - hb.l;
      });
    } else if (mode === 'lightness') {
      out.sort(function (a, b) { return rgbToHsl(b.r, b.g, b.b).l - rgbToHsl(a.r, a.g, a.b).l; });
    } else if (mode === 'hex') {
      out.sort(function (a, b) { return a.hex < b.hex ? -1 : a.hex > b.hex ? 1 : 0; });
    } else if (mode === 'family') {
      out.sort(function (a, b) { return cmp(codeKey(a, famSort), codeKey(b, famSort)); });
    } else {
      out.sort(function (a, b) { return cmp(codeKey(a, famSort), codeKey(b, famSort)); });
    }
    return out;
  }

  // 無彩＝官方把它歸在灰階/無彩色系（C/N/T/W/A）。**不用飽和度猜**——COPIC 自己講了。
  function isAchromatic(c) {
    return c.family === 'C' || c.family === 'N' || c.family === 'T'
        || c.family === 'W' || c.family === 'A';
  }

  // ---- 三軸矩陣（本 app 的招牌） -----------------------------------------

  /**
   * 把某個色系的色排成 Blending Group × Intensity 的矩陣。
   * 只有彩色系（BV…E）走這套編號；灰階/無彩/螢光沒有 bg/iv，
   * 故回傳 bgs=[] 並把該色系的色原樣放進 flat，由呼叫端改用一維排法。
   */
  function axisGrid(colors, familyCode) {
    var mine = colors.filter(function (c) { return c.family === familyCode; });
    var graded = mine.filter(function (c) { return c.bg !== undefined && c.bg !== null; });
    if (!graded.length) return { bgs: [], ivs: [], cell: function () { return null; }, flat: mine };

    var bgs = BG_ORDER.filter(function (g) {
      return graded.some(function (c) { return c.bg === g; });
    });
    var ivs = IV_ORDER.filter(function (v) {
      return graded.some(function (c) { return c.iv === v; });
    });
    var map = {};
    graded.forEach(function (c) { map[c.bg + '|' + c.iv] = c; });
    return {
      bgs: bgs, ivs: ivs, flat: mine,
      cell: function (bg, iv) { return map[bg + '|' + iv] || null; }
    };
  }

  /** 純由色號推導 {family,bg,iv}；資料已帶這三欄，本函式供交叉驗證用。 */
  var CHROMATIC = ['BV', 'RV', 'YR', 'YG', 'BG', 'V', 'R', 'Y', 'G', 'B', 'E'];
  function parseCode(code) {
    if (/^F/.test(code)) return { family: 'F', bg: null, iv: null };
    var m = /^([CNTW])-(\d+)$/.exec(code);
    if (m) return { family: m[1], bg: null, iv: null };
    if (code === '0' || code === '100' || code === '110') return { family: 'A', bg: null, iv: null };
    for (var i = 0; i < CHROMATIC.length; i++) {
      var f = CHROMATIC[i];
      if (code.indexOf(f) === 0 && /^\d+$/.test(code.slice(f.length))) {
        var suf = code.slice(f.length);
        return { family: f, bg: parseInt(suf[0], 10), iv: suf.length > 1 ? suf.slice(1) : null };
      }
    }
    return null;
  }

  // ---- 色彩換算（與 FC / CDA 兩支 lib 逐字相同） --------------------------

  function hexToRgb(hex) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }
  function _chan(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function relLuminance(r, g, b) {
    return 0.2126 * _chan(r) + 0.7152 * _chan(g) + 0.0722 * _chan(b);
  }
  function contrastRatio(r, g, b, fgIsWhite) {
    var L = relLuminance(r, g, b);
    return fgIsWhite ? 1.05 / (L + 0.05) : (L + 0.05) / 0.05;
  }
  function pickTextColor(color) {
    return contrastRatio(color.r, color.g, color.b, true) >=
           contrastRatio(color.r, color.g, color.b, false) ? '#ffffff' : '#000000';
  }
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
  function deltaEBand(dE) {
    return dE <= 2 ? 'very' : dE <= 5 ? 'close' : dE <= 10 ? 'noticeable' : 'far';
  }

  // 0 號是無色調和筆（Colorless Blender），沒有顏料——比對器預設把它排除，見 nearestCOPIC。
  var BLENDER_CODE = '0';

  // ---- 最接近 COPIC 色比對 ------------------------------------------------

  var _labCache = null, _labSrc = null;
  function labsOf(colors) {
    if (_labSrc === colors && _labCache) return _labCache;
    _labSrc = colors;
    _labCache = colors.map(function (c) { return { c: c, lab: rgbToLab(c.r, c.g, c.b) }; });
    return _labCache;
  }
  /**
   * 找出最接近給定 RGB 的 COPIC 色。
   * opts.line 可限定產品線（'ciao' 只比 Ciao 有出的 180 色）——**手上沒有的筆別推薦**。
   * 預設比全部 358（Sketch 與 Copic Ink 的完整色域）。
   *
   * **預設排除 0 號無色調和筆**（`#ffffff`，沒有顏料，用途是暈染／推色）。
   * 不排除的話白色與近白色的第一名永遠是它——ΔE 完美，但「用調和筆畫白」是錯的答案。
   * 與 `opts.line` 是同一條原則的兩種樣子：**比對器不該推薦一支畫不出那個顏色的筆。**
   * 真要把它算進來（例如做完整色域統計）傳 `blender:true`。
   */
  function nearestCOPIC(rgb, opts) {
    opts = opts || {};
    var pool = opts.colors || global.COPIC_COLORS || [];
    if (!opts.blender) pool = pool.filter(function (c) { return c.code !== BLENDER_CODE; });
    if (opts.line) {
      pool = pool.filter(function (c) { return (c.lines || []).indexOf(opts.line) >= 0; });
    }
    var n = opts.n || 1;
    var t = rgbToLab(rgb.r, rgb.g, rgb.b);
    return labsOf(pool)
      .map(function (x) {
        var d = deltaE(t, x.lab);
        return { code: x.c.code, name: x.c.name, hex: x.c.hex, cssVar: x.c.cssVar,
                 family: x.c.family, deltaE: d, band: deltaEBand(d) };
      })
      .sort(function (a, b) { return a.deltaE - b.deltaE; })
      .slice(0, n);
  }

  // ---- 套組 ↔ 顏色（雙向；sets.html 用） ---------------------------------

  function setIndex(sets) {
    var byCode = {}, byColor = {};
    (sets || []).forEach(function (s) {
      byCode[s.code] = s;
      (s.colors || []).forEach(function (code) { (byColor[code] = byColor[code] || []).push(s.code); });
    });
    return { byCode: byCode, byColor: byColor };
  }
  function colorsInSet(sets, setCode) {
    var s = (sets || []).filter(function (x) { return x.code === setCode; })[0];
    return s ? s.colors.slice() : [];
  }
  function setsOfColor(sets, colorCode) {
    return (sets || []).filter(function (s) { return s.colors.indexOf(colorCode) >= 0; });
  }
  /**
   * 以某個套組為基準，算出每個套組「相對它還缺幾色」。
   * 0 ＝ 完全涵蓋基準組。與 faber-castell-color 的 columnGaps 同義。
   */
  function columnGaps(sets, baseCode) {
    var base = colorsInSet(sets, baseCode);
    var out = {};
    (sets || []).forEach(function (s) {
      var have = {};
      s.colors.forEach(function (c) { have[c] = 1; });
      out[s.code] = base.filter(function (c) { return !have[c]; }).length;
    });
    return out;
  }
  /**
   * 套組矩陣：列＝色、`cells[套組 code]` ＝ 該組有沒有收錄。
   * `opts.codes` 可指定列（未選基準組時要列出「所有被收錄過的色」，那不是任何單一組的色單）；
   * 未給就用基準組的色單、照它自己的收錄順序。
   */
  function assortmentMatrix(sets, baseCode, opts) {
    var base = (opts && opts.codes) ? opts.codes.slice() : colorsInSet(sets, baseCode);
    return base.map(function (code) {
      var row = { code: code, cells: {} };
      (sets || []).forEach(function (s) { row.cells[s.code] = s.colors.indexOf(code) >= 0; });
      return row;
    });
  }

  // ---- 輸出 --------------------------------------------------------------

  function formatRgb(c) { return 'rgb(' + c.r + ', ' + c.g + ', ' + c.b + ')'; }
  function copyValue(color, kind) {
    if (kind === 'hex') return color.hex;
    if (kind === 'var') return 'var(' + color.cssVar + ')';
    if (kind === 'rgb') return formatRgb(color);
    if (kind === 'class') return 'copic-bg-' + color.code.toLowerCase();
    return color.hex;
  }
  function cssFilename() { return 'copic_colors.css'; }

  function buildCss(colors, meta) {
    var m = meta || global.COPIC_META || {};
    var L = [];
    L.push('/* COPIC colours — generated by ' + FOLDER + ' (CopicColorLib.buildCss).');
    L.push(' * Source: ' + (m.source || 'copic catalogue') + (m.version ? ' (' + m.version + ')' : '') + '.');
    L.push(' * ' + (colors.length) + ' colours. Hex is a screen approximation sampled from the');
    L.push(' * catalogue vector fills — the catalogue itself states that printed colours');
    L.push(' * differ from the actual marker ink. Not an official specification.');
    L.push(' */');
    L.push(':root {');
    colors.forEach(function (c) { L.push('  ' + c.cssVar + ': ' + c.hex + ';'); });
    L.push('}');
    L.push('');
    colors.forEach(function (c) {
      var s = c.code.toLowerCase();
      L.push('.copic-color-' + s + ' { color: var(' + c.cssVar + '); }');
      L.push('.copic-bg-' + s + ' { background-color: var(' + c.cssVar + '); }');
    });
    return L.join('\n') + '\n';
  }

  global.CopicColorLib = {
    FOLDER: FOLDER,
    SORT_MODES: SORT_MODES,
    BG_ORDER: BG_ORDER,
    IV_ORDER: IV_ORDER,
    filter: filter,
    sortColors: sortColors,
    isAchromatic: isAchromatic,
    axisGrid: axisGrid,
    parseCode: parseCode,
    hexToRgb: hexToRgb,
    rgbToHsl: rgbToHsl,
    rgbToLab: rgbToLab,
    deltaE: deltaE,
    deltaEBand: deltaEBand,
    BLENDER_CODE: BLENDER_CODE,
    nearestCOPIC: nearestCOPIC,
    relLuminance: relLuminance,
    contrastRatio: contrastRatio,
    pickTextColor: pickTextColor,
    setIndex: setIndex,
    colorsInSet: colorsInSet,
    setsOfColor: setsOfColor,
    columnGaps: columnGaps,
    assortmentMatrix: assortmentMatrix,
    formatRgb: formatRgb,
    copyValue: copyValue,
    buildCss: buildCss,
    cssFilename: cssFilename
  };
})(window);
