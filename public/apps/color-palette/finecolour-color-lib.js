/**
 * finecolour-color-lib — Finecolour 色號對照的純核心
 *
 * IIFE → window.FinecolourColorLib。零依賴、不碰 DOM、不用 fetch（資料是靜態 registry）。
 * 控制器（finecolour-color.js / sets.js）才碰 DOM。
 *
 * 本 app 的關鍵事實是**一個品牌、兩個色號空間**：
 *   marker    480 色，色碼＝色系字首＋**全域唯一號碼**（`BV321` ＝ BV 群、第 321 號）。
 *             號碼在品牌內唯一，所以套裝表可以只印裸號碼；也因此**不可再分解成兩個軸**
 *             （與 COPIC 的 `BV02` 不同），排序只能「色系 → 號碼」。
 *   fineliner  48 色，EF300 專屬，兩位數色碼（`02`、`03`）。與 marker 不共用編號。
 *
 * **哪個語言是官方色名，兩個空間不一樣**（見 data 檔頭的 `official` 欄）：
 * marker 的色譜是英文的、fineliner 的是中文的。呼叫端一律用 `officialName()`，
 * 別直接讀 `.name`——那會讓 fineliner 顯示成譯名，變得無法對著賣家查證。
 *
 * 色彩科學核心（rgbToLab / deltaE / deltaEBand / contrastRatio / pickTextColor）
 * 與 FC、CDA 兩支 lib **逐字相同**——家族三支比對器必須用同一把尺，否則
 * 「最接近的筆」在不同 app 會給出不同答案。
 *
 * API：
 *   FOLDER · SORT_MODES · ACHROMATIC
 *   filter(colors, q) → 依色號/色名/hex 過濾
 *   sortColors(colors, mode) → 'code'|'hue'|'lightness'|'hex'|'family'
 *   officialName(color) → 官方色名（依 color.official 取 en 或 zh）
 *   localName(color, lang) → 該語言的譯名；語言即官方語言時回 '' （不重複顯示）
 *   hexToRgb · rgbToHsl · rgbToLab · deltaE(ΔE00) · deltaEBand
 *   nearestFinecolour({r,g,b}, { n, line, space, colors }) → [{ code,name,hex,cssVar,deltaE,band }]
 *   relLuminance · contrastRatio · pickTextColor
 *   setIndex(sets) · colorsInSet · setsOfColor · assortmentMatrix · columnGaps · setKey · findSet
 *   FAMILY_ORDER · colorFamily（規則來自家族共用件 `color-family.js`）
 *   formatRgb · copyValue · buildCss · cssFilename
 */
(function (global) {
  'use strict';

  var FOLDER = 'finecolour-color';
  var SORT_MODES = ['code', 'hue', 'lightness', 'hex', 'family'];

  // 0 號是無色調和筆（Colorless Blender），沒有顏料——比對器預設把它排除，見 nearestFinecolour。
  var BLENDER_CODE = '0';

  // 灰階與無彩的色系代碼（品牌自己的分群）。**不用飽和度猜**——Finecolour 自己講了。
  var ACHROMATIC = ['CG', 'NG', 'TG', 'YG-gray', 'WG', 'PG', 'SG', 'BG-gray', 'GG', 'BCDSG', 'A'];

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
   * 排序鍵：色系（官方序）→ 全域號碼。
   * 號碼是數字欄（`num`），不是從色碼字串剖出來的——`BV321` 與 `CG271` 的數字位數不同，
   * 純字串序會把 `Y9` 排在 `Y10` 之後。
   * fineliner 與 acrylic 都沒有色系，依序殿後、只比號碼。
   */
  var SPACE_RANK = { fineliner: 900, acrylic: 901 };
  function codeKey(c, famSort) {
    var f = SPACE_RANK[c.space] || (famSort[c.family] || 99);
    return [f, typeof c.num === 'number' ? c.num : 0, String(c.code)];
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
    } else {
      out.sort(function (a, b) { return cmp(codeKey(a, famSort), codeKey(b, famSort)); });
    }
    return out;
  }

  function isAchromatic(c) { return ACHROMATIC.indexOf(c.family) >= 0; }

  // ---- 色名（官方名 vs 譯名） --------------------------------------------

  /**
   * 官方色名恆為主名（DESIGN_GUIDELINES §6.2）——它是能對著賣家查證的識別憑據。
   * 哪個語言是官方的由資料的 `official` 決定：marker 的色譜是英文的、fineliner 的是中文的。
   */
  function officialName(c) {
    if (!c) return '';
    // official === 'none' ＝ **原廠不發佈色名**（EF600 壓克力 120 色）。
    // 回空字串，由呼叫端顯示色號並明講「原廠不發佈色名」——不是留白（同 ENMY §11.1）。
    if (c.official === 'none') return '';
    return c.official === 'zh' ? (c.nameZh || '') : (c.name || '');
  }
  /** 這支色到底有沒有官方色名。沒有名字與「名字還沒抽到」在畫面上要能分開講。 */
  function hasOfficialName(c) { return !!c && c.official !== 'none'; }
  /** 該語言的譯名；語言就是官方語言時回 ''（主名已另處顯示，不重複）。 */
  function localName(c, lang) {
    if (!c || c.official === 'none') return '';
    var want = lang === 'ja' ? 'ja' : (lang === 'en' ? 'en' : 'zh');
    if (want === (c.official || 'en')) return '';
    return want === 'ja' ? (c.nameJa || '') : want === 'en' ? (c.name || '') : (c.nameZh || '');
  }

  /**
   * 色系分群——**規則來自家族共用件 `color-family.js`**（`window.ColorFamily`），
   * 本檔只在這裡寫下 Finecolour 自己的門檻，不再重寫規則。
   *
   * ⚠️ 這裡曾經自己抄過一份，而且抄出兩個問題：
   *   ① 與 FC／CDA 的同一條規則有 10/120 不一致（門檻與額外的明度規則都是自己加的）；
   *   ② 新增的 `function isAchromatic(color)` 與下方既有的 `isAchromatic(c)`（看官方灰系）
   *      **同名同作用域**，後宣告者覆蓋前者——`sortColors('hue')` 的「無彩度殿後」
   *      與對外匯出的 `isAchromatic` 語意都被靜默換掉（`CG267` 由 true 變成 false）。
   * **同一條規則不要有第二份實作；同一個作用域不要有第二個同名函式。**
   *
   * ⚠️ 這是**算出來的**分群，不是原廠分類。EF600 壓克力筆原廠不發佈色系，
   * DB 的 `fd_color_family_idx` 對它恆為 NULL、刻意不填（治理 §9-Q14）。
   */
  var FAMILY_ORDER = (global.ColorFamily && global.ColorFamily.FAMILY_ORDER) ||
    ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'magenta', 'neutral'];
  var FAMILY_SAT_MIN = 0.17;          // 本 app 的無彩度門檻（color-palette 用 0.12）
  function colorFamily(color) {
    return global.ColorFamily.familyOf(color.r, color.g, color.b, { satMin: FAMILY_SAT_MIN });
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

  // ---- 最接近 Finecolour 色比對 ------------------------------------------------

  var _labCache = null, _labSrc = null;
  function labsOf(colors) {
    if (_labSrc === colors && _labCache) return _labCache;
    _labSrc = colors;
    _labCache = colors.map(function (c) { return { c: c, lab: rgbToLab(c.r, c.g, c.b) }; });
    return _labCache;
  }
  /**
   * 找出最接近給定 RGB 的 Finecolour 色。
   * **預設只比 marker 那 480 色**。另外兩個色號空間都是**不同的筆**：
   *   `'fineliner'`（EF300，水性針管尖）
   *   `'acrylic'` （EF600，水性壓克力、**不透明**，能蓋在深色上）
   * 拿它們回答「該用哪支麥克筆」是答非所問——尤其壓克力是**不透明**媒材，
   * 與酒精麥克筆的疊色行為完全不同，混進同一份推薦會誤導。要比就顯式傳 `space`。
   * opts.line 可再限定產品線（`'EF101'` 只比 2 代有出的 188 色）——**手上沒有的筆別推薦**。
   *
   * **預設排除 0 號無色調和筆**（`#ffffff`，沒有顏料，用途是暈染／推色）。
   * 不排除的話白色與近白色的第一名永遠是它——ΔE 完美，但「用調和筆畫白」是錯的答案。
   * 同一條原則的另一種樣子：比對器不該推薦一支畫不出那個顏色的筆。
   * 真要把它算進來（例如做完整色域統計）傳 `blender:true`。
   */
  function nearestFinecolour(rgb, opts) {
    opts = opts || {};
    var pool = opts.colors || global.FINECOLOUR_COLORS || [];
    var space = opts.space === undefined ? 'marker' : opts.space;
    if (space) pool = pool.filter(function (c) { return c.space === space; });
    if (!opts.blender) pool = pool.filter(function (c) { return c.code !== BLENDER_CODE; });
    if (opts.line) {
      pool = pool.filter(function (c) { return (c.lines || []).indexOf(opts.line) >= 0; });
    }
    var n = opts.n || 1;
    var t = rgbToLab(rgb.r, rgb.g, rgb.b);
    return labsOf(pool)
      .map(function (x) {
        var d = deltaE(t, x.lab);
        return { code: x.c.code, name: officialName(x.c), hex: x.c.hex, cssVar: x.c.cssVar,
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
    var s = findSet(sets, setCode);
    return s ? s.colors.slice() : [];
  }
  /**
   * 套組的**全域唯一鍵**。`code` 只在產品線內唯一——四條產品線各有一組 `standard-120`，
   * 拿 `code` 當識別會把它們當成同一組。舊資料沒有 `key` 時退回 `code`。
   */
  function setKey(s) { return (s && (s.key || s.code)) || ''; }
  /**
   * 依 key 找套組；找不到才退而以 code 找，且**只在全域唯一時才認**
   * （舊的 `?set=` 深連結給的是 code；撞號時寧可當沒選，也不要選錯一組）。
   */
  function findSet(sets, id) {
    var list = sets || [];
    var byKey = list.filter(function (x) { return setKey(x) === id; });
    if (byKey.length) return byKey[0];
    var byCode = list.filter(function (x) { return x.code === id; });
    return byCode.length === 1 ? byCode[0] : null;
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
      out[setKey(s)] = base.filter(function (c) { return !have[c]; }).length;
    });
    return out;
  }
  /**
   * 套組矩陣：列＝色、`cells[套組 key]` ＝ 該組有沒有收錄（key 見 setKey）。
   * `opts.codes` 可指定列（未選基準組時要列出「所有被收錄過的色」，那不是任何單一組的色單）；
   * 未給就用基準組的色單、照它自己的收錄順序。
   */
  function assortmentMatrix(sets, baseCode, opts) {
    var base = (opts && opts.codes) ? opts.codes.slice() : colorsInSet(sets, baseCode);
    return base.map(function (code) {
      var row = { code: code, cells: {} };
      (sets || []).forEach(function (s) { row.cells[setKey(s)] = s.colors.indexOf(code) >= 0; });
      return row;
    });
  }

  // ---- 輸出 --------------------------------------------------------------

  function formatRgb(c) { return 'rgb(' + c.r + ', ' + c.g + ', ' + c.b + ')'; }
  function copyValue(color, kind) {
    if (kind === 'hex') return color.hex;
    if (kind === 'var') return 'var(' + color.cssVar + ')';
    if (kind === 'rgb') return formatRgb(color);
    if (kind === 'class') return 'finecolour-bg-' + color.code.toLowerCase();
    return color.hex;
  }
  function cssFilename() { return 'finecolour_colors.css'; }

  function buildCss(colors, meta) {
    var m = meta || global.FINECOLOUR_META || {};
    var L = [];
    L.push('/* Finecolour colours — generated by ' + FOLDER + ' (FinecolourColorLib.buildCss).');
    L.push(' * Source: ' + (m.source || 'finecolour catalogue') + (m.version ? ' (' + m.version + ')' : '') + '.');
    L.push(' * ' + (colors.length) + ' colours. Hex is a screen approximation sampled from the');
    L.push(' * official leaflet, which states that the printed chart is for reference only');
    L.push(' * and that the actual ink should be checked by drawing. Not an official spec.');
    L.push(' */');
    L.push(':root {');
    colors.forEach(function (c) { L.push('  ' + c.cssVar + ': ' + c.hex + ';'); });
    L.push('}');
    L.push('');
    colors.forEach(function (c) {
      var s = c.code.toLowerCase();
      L.push('.finecolour-color-' + s + ' { color: var(' + c.cssVar + '); }');
      L.push('.finecolour-bg-' + s + ' { background-color: var(' + c.cssVar + '); }');
    });
    return L.join('\n') + '\n';
  }

  global.FinecolourColorLib = {
    FOLDER: FOLDER,
    SORT_MODES: SORT_MODES,
    ACHROMATIC: ACHROMATIC,
    BLENDER_CODE: BLENDER_CODE,
    filter: filter,
    sortColors: sortColors,
    isAchromatic: isAchromatic,
    officialName: officialName,
    hasOfficialName: hasOfficialName,
    FAMILY_ORDER: FAMILY_ORDER,
    colorFamily: colorFamily,
    localName: localName,
    hexToRgb: hexToRgb,
    rgbToHsl: rgbToHsl,
    rgbToLab: rgbToLab,
    deltaE: deltaE,
    deltaEBand: deltaEBand,
    nearestFinecolour: nearestFinecolour,
    relLuminance: relLuminance,
    contrastRatio: contrastRatio,
    pickTextColor: pickTextColor,
    setIndex: setIndex,
    colorsInSet: colorsInSet,
    setsOfColor: setsOfColor,
    setKey: setKey,
    findSet: findSet,
    columnGaps: columnGaps,
    assortmentMatrix: assortmentMatrix,
    formatRgb: formatRgb,
    copyValue: copyValue,
    buildCss: buildCss,
    cssFilename: cssFilename
  };
})(window);
