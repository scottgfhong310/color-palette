/**
 * enmy-color-lib — ENMY 色號對照的純核心
 *
 * IIFE → window.EnmyColorLib。零依賴、不碰 DOM、不用 fetch（資料是靜態 registry）。
 * 控制器（enmy-color.js）才碰 DOM。
 *
 * 本 app 與家族另外四支色彩 registry 的關鍵差異＝**沒有色名**。
 * ENMY 官方只以色碼識別，80 色中僅 4 個膚色在隨盒色卡上另印中文標示。
 * 所以：
 *   · 搜尋述詞不比英文名（沒有那個欄位），只比色碼、中文標示與 hex；
 *   · 比對結果與明細卡的主識別一律是**色碼**，不會退回任何譯名
 *     （DESIGN_GUIDELINES §6.2 的「官方名恆為主名」在這裡的樣子就是「只有色碼」）。
 *
 * 色號的結構：`R1` = 字首 `R` ＋ 號碼 `1`。**字首沒有官方名稱**——品牌從未公布
 * R／VR／RY／BR／DE／GY 各代表什麼，所以本 lib 只切出字首、不替它命名。
 * 有官方名稱的是另一個軸：官方店的 8 個行銷色系（`family`）。
 *
 * 色彩科學核心（rgbToLab / deltaE / deltaEBand / contrastRatio / pickTextColor）
 * 與 FC、CDA、COPIC 三支 lib **逐字相同**——家族的比對器必須用同一把尺，否則
 * 「最接近的筆」在不同 app 會給出不同答案。
 *
 * API：
 *   FOLDER · SORT_MODES
 *   filter(colors, q) → 依色號／中文標示／hex 過濾
 *   sortColors(colors, mode, families) → 'code'|'hue'|'lightness'|'hex'|'family'
 *   codeParts(code) → { prefix, num }        純由色號推導
 *   prefixRows(colors, familyCode) → [{ prefix, colors[] }]  一列一個字首（本 app 的版面）
 *   displayName(color, lang) → 名字那一格要放什麼（恆非空；ENMY 無色名，見該函式）
 *   hexToRgb · rgbToHsl · rgbToLab · deltaE(ΔE00) · deltaEBand
 *   nearestENMY({r,g,b}, { n, set, colors, sets }) → [{ code, hex, cssVar, deltaE, band }]
 *   relLuminance · contrastRatio · pickTextColor
 *   setIndex · colorsInSet · setsOfColor · knownSets
 *   formatRgb · copyValue · buildCss · cssFilename
 */
(function (global) {
  'use strict';

  var FOLDER = 'enmy-color';
  var SORT_MODES = ['code', 'hue', 'lightness', 'hex', 'family'];

  // ---- 檢索 / 排序 -------------------------------------------------------

  /**
   * ⚠️ 這裡**沒有** name／nameJa 那兩格——不是漏寫。ENMY 官方不發佈色名，
   * 資料裡就沒有那兩個欄位；比對不存在的欄位只會讓下一個讀的人以為資料缺了。
   * nameZh 是隨盒色卡上的中文標示，只有 4 色有。
   */
  function filter(colors, q) {
    var s = String(q || '').trim().toLowerCase();
    if (!s) return colors.slice();
    return colors.filter(function (c) {
      return c.code.toLowerCase().indexOf(s) >= 0
          || String(c.nameZh || '').toLowerCase().indexOf(s) >= 0
          || c.hex.toLowerCase().indexOf(s) >= 0;
    });
  }

  /**
   * 色號拆成字首與號碼：'BG12' → { prefix:'BG', num:12 }、'0' → { prefix:'', num:0 }。
   * 黑白兩色（0／1）沒有字首，那是資料的事實，回空字串而不是硬塞一個分類。
   */
  function codeParts(code) {
    var m = /^([A-Za-z]*)(\d+)$/.exec(String(code == null ? '' : code));
    if (!m) return { prefix: String(code || ''), num: 0 };
    return { prefix: m[1].toUpperCase(), num: parseInt(m[2], 10) };
  }

  function cmpCode(a, b) {
    var x = codeParts(a.code), y = codeParts(b.code);
    if (x.prefix !== y.prefix) return x.prefix < y.prefix ? -1 : 1;
    return x.num - y.num;
  }

  function sortColors(colors, mode, families) {
    var list = colors.slice();
    var famSort = {};
    (families || []).forEach(function (f, i) { famSort[f.code] = i; });
    if (mode === 'hue') {
      return list.sort(function (a, b) {
        var ha = rgbToHsl(a.r, a.g, a.b), hb = rgbToHsl(b.r, b.g, b.b);
        return (ha.h - hb.h) || (ha.l - hb.l) || cmpCode(a, b);
      });
    }
    if (mode === 'lightness') {
      return list.sort(function (a, b) {
        return rgbToHsl(b.r, b.g, b.b).l - rgbToHsl(a.r, a.g, a.b).l || cmpCode(a, b);
      });
    }
    if (mode === 'hex') return list.sort(function (a, b) { return a.hex < b.hex ? -1 : a.hex > b.hex ? 1 : 0; });
    if (mode === 'family') {
      return list.sort(function (a, b) {
        var d = (famSort[a.family] === undefined ? 99 : famSort[a.family])
              - (famSort[b.family] === undefined ? 99 : famSort[b.family]);
        return d || cmpCode(a, b);
      });
    }
    return list.sort(cmpCode);
  }

  /**
   * 一列一個字首：ENMY 的色號本身就是「字首＋號碼」，所以這是把它的編碼畫出來，
   * 不是我們發明的版面（同 copic-color 用矩陣畫 Copic Color System）。
   * familyCode 為空＝全部色。列序照該字首第一支色在資料裡的順序，
   * **不另外替字首排序**——我們沒有官方的字首順序可依據。
   */
  function prefixRows(colors, familyCode) {
    var mine = familyCode
      ? colors.filter(function (c) { return c.family === familyCode; })
      : colors.slice();
    var order = [], byPrefix = {};
    sortColors(mine, 'code').forEach(function (c) {
      var p = codeParts(c.code).prefix;
      if (!byPrefix[p]) { byPrefix[p] = []; order.push(p); }
      byPrefix[p].push(c);
    });
    return order.map(function (p) { return { prefix: p, colors: byPrefix[p] }; });
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

  // ---- 最接近 ENMY 色比對 -------------------------------------------------

  var _labCache = null, _labSrc = null;
  function labsOf(colors) {
    if (_labSrc === colors && _labCache) return _labCache;
    _labSrc = colors;
    _labCache = colors.map(function (c) { return { c: c, lab: rgbToLab(c.r, c.g, c.b) }; });
    return _labCache;
  }

  /**
   * 找出最接近給定 RGB 的 ENMY 色。
   *
   * `opts.set` 可限定套組（'direct-liquid-60' 只比那 60 支）——**手上沒有的筆別推薦**，
   * 與 `nearestCOPIC(opts.line)`／`nearestFC(series)` 是同一條原則。
   * ENMY 只有一條產品線，所以這裡的「有沒有」是套組層級的問題而不是產品線層級的。
   *
   * ⚠️ **收錄清單不明的套組不可拿來過濾**（24／36／48 三組的 colors[] 是空的，
   * 見資料檔的 known 欄）。用空清單去篩會得到零結果，而使用者會讀成「沒有接近的色」——
   * 那是錯的答案，不是空的答案。故遇到 known:false 一律**忽略該過濾條件並回報**。
   *
   * 沒有無色調和筆要排除（ENMY 沒有那種筆），也沒有色名可回——回傳只有色碼。
   */
  function nearestENMY(rgb, opts) {
    opts = opts || {};
    var pool = opts.colors || global.ENMY_COLORS || [];
    var ignoredSet = null;
    if (opts.set) {
      var s = (opts.sets || global.ENMY_SETS || []).filter(function (x) { return x.code === opts.set; })[0];
      if (s && s.known && s.colors.length) {
        pool = pool.filter(function (c) { return s.colors.indexOf(c.code) >= 0; });
      } else if (s) {
        ignoredSet = s.code;   // 收錄不明：不篩，並讓呼叫端有機會說明
      }
    }
    var n = opts.n || 1;
    var target = rgbToLab(rgb.r, rgb.g, rgb.b);
    var out = labsOf(pool)
      .map(function (x) {
        var d = deltaE(target, x.lab);
        return { code: x.c.code, hex: x.c.hex, cssVar: x.c.cssVar, nameZh: x.c.nameZh || null,
                 family: x.c.family, verify: x.c.verify, deltaE: d, band: deltaEBand(d) };
      })
      .sort(function (a, b) { return a.deltaE - b.deltaE; })
      .slice(0, n);
    out.ignoredSet = ignoredSet;
    return out;
  }

  /**
   * 「名字那一格要放什麼」——ENMY 沒有色名，但**留白會被讀成資料掉了**，
   * 而事實是原廠不發佈色名。所以這支恆回一個非空字串：
   *   · zh-Hant 且該色有隨盒色卡的中文標示（僅 4 個膚色）→ 用那個標示
   *   · 其餘 → 官方色系名（`Red & Pink`…，這是品牌自己發佈的分類）
   *
   * **這不是色名，是替代標示**——所以呼叫端不可拿它當可驗證的識別憑據
   * （§6.2：主識別一律是色碼）。
   *
   * 放在 lib 而不是各控制器，是因為本檔會被複製進 color-palette／thangka-trace：
   * 邏輯只寫一次，三份複製件才不會各自漂（家族踩過那個坑）。
   */
  function displayName(c, lang) {
    if (!c) return '';
    if (c.nameZh && String(lang || 'zh-Hant').indexOf('zh') === 0) return c.nameZh;
    var fam = (global.ENMY_FAMILIES || []).filter(function (f) { return f.code === c.family; })[0];
    return fam ? fam.name : (c.family || c.code);
  }

  // ---- 套組 ↔ 顏色 --------------------------------------------------------

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
    return (sets || []).filter(function (s) { return (s.colors || []).indexOf(colorCode) >= 0; });
  }
  /**
   * 收錄清單「已知」的套組。
   * **`known:false` 與「這組不含這個色」是兩件不同的事**，全 app 都不可把它們混在一起：
   * 前者是我們不知道，後者是我們知道它沒有。UI 必須分開呈現，比對器則直接不用它。
   */
  function knownSets(sets) {
    return (sets || []).filter(function (s) { return s.known && (s.colors || []).length; });
  }
  function unknownSets(sets) {
    return (sets || []).filter(function (s) { return !s.known || !(s.colors || []).length; });
  }

  // ---- 輸出 --------------------------------------------------------------

  function formatRgb(c) { return 'rgb(' + c.r + ', ' + c.g + ', ' + c.b + ')'; }
  function copyValue(color, kind) {
    if (kind === 'hex') return color.hex;
    if (kind === 'var') return 'var(' + color.cssVar + ')';
    if (kind === 'rgb') return formatRgb(color);
    if (kind === 'class') return 'enmy-bg-' + color.code.toLowerCase();
    return color.hex;
  }
  function cssFilename() { return 'enmy_colors.css'; }

  function buildCss(colors, meta) {
    var m = meta || global.ENMY_META || {};
    var L = [];
    L.push('/* ENMY colours — generated by ' + FOLDER + ' (EnmyColorLib.buildCss).');
    L.push(' * Source: the two official colour charts published on ' + (m.brand || 'ENMY') + '’s own store.');
    L.push(' * ' + colors.length + ' colours. The swatches are flat digital fills, so these are the');
    L.push(' * brand’s own values rather than sampled print — but they are marketing assets:');
    L.push(' * the brand makes no claim that they match the ink. Not an official specification.');
    L.push(' * The brand publishes no colour names; colours are identified by code alone.');
    L.push(' */');
    L.push(':root {');
    colors.forEach(function (c) { L.push('  ' + c.cssVar + ': ' + c.hex + ';'); });
    L.push('}');
    L.push('');
    colors.forEach(function (c) {
      var s = c.code.toLowerCase();
      L.push('.enmy-color-' + s + ' { color: var(' + c.cssVar + '); }');
      L.push('.enmy-bg-' + s + ' { background-color: var(' + c.cssVar + '); }');
    });
    return L.join('\n') + '\n';
  }

  global.EnmyColorLib = {
    FOLDER: FOLDER,
    SORT_MODES: SORT_MODES,
    filter: filter,
    sortColors: sortColors,
    codeParts: codeParts,
    prefixRows: prefixRows,
    displayName: displayName,
    hexToRgb: hexToRgb,
    rgbToHsl: rgbToHsl,
    rgbToLab: rgbToLab,
    deltaE: deltaE,
    deltaEBand: deltaEBand,
    nearestENMY: nearestENMY,
    relLuminance: relLuminance,
    contrastRatio: contrastRatio,
    pickTextColor: pickTextColor,
    setIndex: setIndex,
    colorsInSet: colorsInSet,
    setsOfColor: setsOfColor,
    knownSets: knownSets,
    unknownSets: unknownSets,
    formatRgb: formatRgb,
    copyValue: copyValue,
    buildCss: buildCss,
    cssFilename: cssFilename
  };
})(window);
