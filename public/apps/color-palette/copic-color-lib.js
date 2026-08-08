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
 * 色彩科學核心（hexToRgb／rgbToLab／deltaE／deltaEBand／relLuminance／
 * contrastRatio／pickTextColor／rgbToHsl）**已抽成家族共用件 `color-metric.js`**
 * （2026-08-08，權威版在家族 repo 根）。六支 lib 從此共用同一把尺，而不是各自
 * 保管一份「號稱逐字相同」的複製——實查發現那句話當時已經不成立（四個函式分兩派，
 * 其中 `hexToRgb` 是真的行為差異）。詳見共用件檔頭。
 * ⚠️ `<script src="color-metric.js">` 必須排在本檔之前。
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
  // ---- 色彩度量核心：家族共用件 color-metric.js（權威版在家族 repo 根）------
  //
  // 這一段（hexToRgb／relLuminance／contrastRatio／pickTextColor／rgbToHsl／
  // rgbToLab／deltaE／deltaEBand）原本在六支 lib 裡各有一份「號稱逐字相同」的複製。
  // 2026-08-08 實查發現其中四個函式已分成兩派（詳見共用件檔頭），故抽出。
  // 下面保留同名的薄包裝，**本檔的 Public API 與所有呼叫端一行都不必改**。
  //
  // ⚠️ 載入順序是硬條件：本檔在**模組載入時**就取 window.ColorMetric，
  //    <script src="color-metric.js"> 必須排在本檔之前。
  if (!global.ColorMetric) {
    throw new Error('copic-color-lib.js 需要共用件 color-metric.js，' +
      '且 <script> 必須排在本檔之前（見 SHARED_LIBRARY_GUIDELINES §4）');
  }
  var CM = global.ColorMetric;


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

  // ---- 色彩度量：全部委派給共用件 color-metric.js（見上方守衛） ----------

  function hexToRgb(hex) { return CM.hexToRgb(hex); }
  function relLuminance(r, g, b) { return CM.relLuminance(r, g, b); }
  function contrastRatio(r, g, b, fgIsWhite) { return CM.contrastRatio(r, g, b, fgIsWhite); }
  function pickTextColor(color) { return CM.pickTextColor(color); }
  function rgbToHsl(r, g, b) { return CM.rgbToHsl(r, g, b); }
  function rgbToLab(r, g, b) { return CM.rgbToLab(r, g, b); }
  function deltaE(labA, labB) { return CM.deltaE(labA, labB); }
  function deltaEBand(dE) { return CM.deltaEBand(dE); }

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
