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
 * 色彩科學核心（hexToRgb／rgbToLab／deltaE／deltaEBand／relLuminance／
 * contrastRatio／pickTextColor／rgbToHsl）**已抽成家族共用件 `color-metric.js`**
 * （2026-08-08，權威版在家族 repo 根）。六支 lib 從此共用同一把尺，而不是各自
 * 保管一份「號稱逐字相同」的複製——實查發現那句話當時已經不成立（四個函式分兩派，
 * 其中 `hexToRgb` 是真的行為差異）。詳見共用件檔頭。
 * ⚠️ `<script src="color-metric.js">` 必須排在本檔之前。
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
    throw new Error('enmy-color-lib.js 需要共用件 color-metric.js，' +
      '且 <script> 必須排在本檔之前（見 SHARED_LIBRARY_GUIDELINES §4）');
  }
  var CM = global.ColorMetric;


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

  // ---- 色彩度量：全部委派給共用件 color-metric.js（見上方守衛） ----------

  function hexToRgb(hex) { return CM.hexToRgb(hex); }
  function relLuminance(r, g, b) { return CM.relLuminance(r, g, b); }
  function contrastRatio(r, g, b, fgIsWhite) { return CM.contrastRatio(r, g, b, fgIsWhite); }
  function pickTextColor(color) { return CM.pickTextColor(color); }
  function rgbToHsl(r, g, b) { return CM.rgbToHsl(r, g, b); }
  function rgbToLab(r, g, b) { return CM.rgbToLab(r, g, b); }
  function deltaE(labA, labB) { return CM.deltaE(labA, labB); }
  function deltaEBand(dE) { return CM.deltaEBand(dE); }

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
