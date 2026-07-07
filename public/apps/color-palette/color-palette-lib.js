/**
 * ColorPaletteLib — color-palette 前端核心 library（純邏輯，不碰 DOM）
 * ==================================================================
 * IIFE → window.ColorPaletteLib。零依賴、只用原生 fetch。
 *
 * 職責：
 *   1. 顏色萃取：由 RGBA 像素（canvas getImageData().data）算出 ≤12 個主色色票
 *      （median-cut 色族代表 / frequency 頻率主色，兩法可切換）——純運算。
 *      「載圖 → canvas → getImageData」是 DOM 工作，留控制器（color-palette.js）。
 *      核心演算法承襲 thangka-trace-lib 的 extractPalette。
 *   2. 色相（hue）排序：把色票排成穩定的「視覺指紋」，並提供檔案清單依代表色相排序的比較器。
 *   3. 與後端溝通：上傳、清單、落地 alias、清空、組圖檔 URL。
 *
 * 對應後端 API（routes/color-palette.js，一律 { ok }）：
 *   - 上傳： POST /api/upload?folder=color-palette         （form 欄位 myFiles，多檔）
 *   - 清單： GET  /api/color-palette/files                 → { ok, files:[{name,size,mtime,alias|null}] }
 *   - 落地： POST /api/color-palette/alias                 body { name, palette }
 *   - 清空： POST /api/color-palette/clear
 *   - 靜態讀圖： /upload/color-palette/<name>
 *
 * 資料形狀：
 *   Color  = { r:0-255, g:0-255, b:0-255, hex:'#rrggbb', ratio:0-1, hue:0-360 }
 *   Palette= { method:'median'|'frequency', count:number, colors:Color[], hue:number }
 *
 * Public API：
 *   ColorPaletteLib.FOLDER · MAX_COLORS · METHODS
 *   isImage(name) · fileUrl(name) · formatSize(bytes) · timestamp(date)
 *   rgbToHex(r,g,b) · rgbToHsl(r,g,b) · extractPalette(data, opts) → Color[]
 *   sortByHue(colors) → Color[]                       色票依色相排序（純函式、不改輸入）
 *   representativeHue(palette) → number|null          代表色相（最大佔比色；achromatic 回 null）
 *   compareByHue(aliasA, aliasB) → number             檔案清單比較器（有色相→依色相；achromatic/無 alias 殿後）
 *   buildPalette(data, opts) → Palette                萃取 + 附代表色相，組成可落地的物件
 *   uploadFile(file) · listFiles() · saveAlias(name, palette) · clearFolder()
 */
(function (window) {
  'use strict';

  var FOLDER = 'color-palette';
  var UPLOAD_API = '/api/upload?folder=' + FOLDER;
  var FILES_API = '/api/color-palette/files';
  var ALIAS_API = '/api/color-palette/alias';
  var DELETE_API = '/api/color-palette/delete';
  var SAVEMD_API = '/api/color-palette/save-md';
  var CLEAR_API = '/api/color-palette/clear';
  var STATIC_BASE = '/upload/' + FOLDER + '/';

  var MAX_COLORS = 12;
  var METHODS = ['median', 'frequency'];
  // 判定「無色相（achromatic）」的飽和度門檻：低於此的色（灰階）色相不穩定，排序時殿後
  var SAT_MIN = 0.12;

  var IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp)$/i;

  // ---- 色彩工具 ----------------------------------------------------------
  function clamp255(x) { return x < 0 ? 0 : x > 255 ? 255 : x; }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(function (x) {
      var h = clamp255(Math.round(x)).toString(16);
      return h.length < 2 ? '0' + h : h;
    }).join('');
  }

  // RGB(0-255) → HSL；h∈[0,360)、s∈[0,1]、l∈[0,1]。灰階時 h=0、s=0。
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    var l = (mx + mn) / 2, h = 0, s = 0, d = mx - mn;
    if (d !== 0) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return [h, s, l];
  }

  function channelRanges(box) {
    var rmin = 255, rmax = 0, gmin = 255, gmax = 0, bmin = 255, bmax = 0;
    for (var i = 0; i < box.length; i++) {
      var p = box[i];
      if (p[0] < rmin) rmin = p[0]; if (p[0] > rmax) rmax = p[0];
      if (p[1] < gmin) gmin = p[1]; if (p[1] > gmax) gmax = p[1];
      if (p[2] < bmin) bmin = p[2]; if (p[2] > bmax) bmax = p[2];
    }
    return { r: rmax - rmin, g: gmax - gmin, b: bmax - bmin };
  }

  // 附上 hex 與 HSL 衍生欄位（hue / 內部用 _s _l），回新物件。
  function decorate(r, g, b, ratio) {
    var hsl = rgbToHsl(r, g, b);
    return { r: r, g: g, b: b, hex: rgbToHex(r, g, b), ratio: ratio, hue: Math.round(hsl[0]), _s: hsl[1], _l: hsl[2] };
  }

  /**
   * 由 RGBA 像素（getImageData().data）萃取色票。opts.method：
   *   'median'（預設）＝色族代表：median-cut 反覆挑「最長色軸 × 像素數」最大的色盒、
   *      沿最長軸中位數切開直到 count 盒，每盒平均色為代表——色域覆蓋均勻。
   *   'frequency'＝主色 by 頻率：粗桶（2^bucketShift 寬，預設 32）量化計數，取最常出現的前 count 桶
   *      的平均色——偏向大面積的主色。
   * 兩者預設都以「亮度＋色度」略過近白（含奶油紙底）與近黑（線稿）。
   * 回 Color[]，依 ratio 由大到小（ratio＝佔非中性像素比）。純函式、不碰 DOM。
   */
  function extractPalette(data, opts) {
    opts = opts || {};
    var count = Math.max(1, Math.min(MAX_COLORS, opts.count || MAX_COLORS));
    // 用「亮度 + 色度」判中性色：奶油紙底雖非純白，仍是高亮度、低色度 → 一併略過。
    var whiteLum = opts.whiteLum == null ? 232 : opts.whiteLum; // 亮於此
    var blackLum = opts.blackLum == null ? 30 : opts.blackLum;  // 暗於此
    var neutralChroma = opts.neutralChroma == null ? 24 : opts.neutralChroma; // 且色度低於此
    var skipW = opts.skipNearWhite !== false;
    var skipB = opts.skipNearBlack !== false;

    var px = [];
    for (var i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;                     // 略過透明
      var r = data[i], g = data[i + 1], b = data[i + 2];
      var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      var chroma = mx - mn, lum = (r + g + b) / 3;
      if (skipW && lum >= whiteLum && chroma <= neutralChroma) continue; // 近白/奶油紙底
      if (skipB && lum <= blackLum && chroma <= neutralChroma) continue; // 近黑線稿/深影
      px.push([r, g, b]);
    }
    if (!px.length) return [];
    var total = px.length;

    // method: 'frequency' — 主色 by 頻率（粗桶量化計數、取最常出現的前 count 桶）
    if (opts.method === 'frequency') {
      var shift = opts.bucketShift == null ? 5 : opts.bucketShift; // 桶寬 2^shift（預設 32）
      var map = {};
      for (var q = 0; q < px.length; q++) {
        var p = px[q];
        var key = (p[0] >> shift) + '_' + (p[1] >> shift) + '_' + (p[2] >> shift);
        var e = map[key] || (map[key] = { n: 0, sr: 0, sg: 0, sb: 0 });
        e.n++; e.sr += p[0]; e.sg += p[1]; e.sb += p[2];
      }
      var freq = Object.keys(map).map(function (k) { return map[k]; });
      freq.sort(function (a, b) { return b.n - a.n; });
      return freq.slice(0, count).map(function (e) {
        return decorate(Math.round(e.sr / e.n), Math.round(e.sg / e.n), Math.round(e.sb / e.n), e.n / total);
      });
    }

    // 預設 method: 'median' — 色族代表（median-cut）
    var boxes = [px];
    while (boxes.length < count) {
      var bi = -1, best = -1;
      for (var k = 0; k < boxes.length; k++) {
        var box = boxes[k];
        if (box.length < 2) continue;
        var rng = channelRanges(box);
        var longest = Math.max(rng.r, rng.g, rng.b);
        if (longest === 0) continue;                     // 單一色的盒無從再分（免產生重複色票）
        var score = longest * box.length;               // 大且色域廣者先分
        if (score > best) { best = score; bi = k; }
      }
      if (bi < 0) break;                                 // 無可再分
      var target = boxes[bi];
      var rng2 = channelRanges(target);
      var ch = (rng2.r >= rng2.g && rng2.r >= rng2.b) ? 0 : (rng2.g >= rng2.b ? 1 : 2);
      target.sort(function (a, b2) { return a[ch] - b2[ch]; });
      var mid = target.length >> 1;
      boxes.splice(bi, 1, target.slice(0, mid), target.slice(mid));
    }

    var palette = boxes.map(function (box) {
      var sr = 0, sg = 0, sb = 0;
      for (var j = 0; j < box.length; j++) { sr += box[j][0]; sg += box[j][1]; sb += box[j][2]; }
      return decorate(Math.round(sr / box.length), Math.round(sg / box.length), Math.round(sb / box.length), box.length / total);
    });
    palette.sort(function (a, b) { return b.ratio - a.ratio; });
    return palette;
  }

  // 是否「有色相」（飽和度足夠、非灰階）
  function isChromatic(c) {
    var s = (c && typeof c._s === 'number') ? c._s : rgbToHsl(c.r, c.g, c.b)[1];
    return s >= SAT_MIN;
  }
  function lumOf(c) {
    return (c && typeof c._l === 'number') ? c._l : rgbToHsl(c.r, c.g, c.b)[2];
  }
  function hueOf(c) {
    return (c && typeof c.hue === 'number') ? c.hue : rgbToHsl(c.r, c.g, c.b)[0];
  }

  /**
   * 色票依色相排序（純函式、不改輸入）：有色相者依 hue 升冪（同 hue 以亮度），
   * 灰階（achromatic）殿後、依亮度升冪。這讓 alias 成為與檔名/上傳序無關的穩定視覺指紋。
   */
  function sortByHue(colors) {
    return (colors || []).slice().sort(function (a, b) {
      var ca = isChromatic(a), cb = isChromatic(b);
      if (ca !== cb) return ca ? -1 : 1;                 // 有色相者在前
      if (ca) {
        var ha = hueOf(a), hb = hueOf(b);
        if (ha !== hb) return ha - hb;
      }
      return lumOf(a) - lumOf(b);                        // 同色相 / 皆灰階 → 依亮度
    });
  }

  // 代表色相＝最大佔比色的 hue；該色為灰階時回 null（表示此圖「無主色相」）
  function representativeHue(palette) {
    var colors = palette && palette.colors ? palette.colors : palette;
    if (!colors || !colors.length) return null;
    var dom = colors[0];
    for (var i = 1; i < colors.length; i++) {
      if ((colors[i].ratio || 0) > (dom.ratio || 0)) dom = colors[i];
    }
    return isChromatic(dom) ? hueOf(dom) : null;
  }

  /**
   * 檔案清單比較器：依各檔代表色相排序（同色系相鄰）。
   * 有色相者在前、依 hue；無色相（灰階圖）或尚無 alias 者殿後。
   */
  function compareByHue(aliasA, aliasB) {
    var ha = aliasA ? representativeHue(aliasA) : null;
    var hb = aliasB ? representativeHue(aliasB) : null;
    var va = ha == null ? 1 : 0, vb = hb == null ? 1 : 0;
    if (va !== vb) return va - vb;                        // 有代表色相者在前
    if (ha != null && hb != null && ha !== hb) return ha - hb;
    return 0;
  }

  // ---- 色系分群（把連續色相切成可導航的區段） ---------------------------
  // 分群順序（沿色相環）；'neutral'＝灰階（無主色相）。'pending'（未分析）由控制器另置末端。
  var FAMILY_ORDER = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'magenta', 'neutral'];
  // 各色系的色相範圍 [min, max)（度）；red 跨 0 度（345→360→15）。
  var FAMILY_RANGES = {
    red: [345, 15], orange: [15, 45], yellow: [45, 70], green: [70, 165],
    cyan: [165, 195], blue: [195, 255], purple: [255, 290], magenta: [290, 345]
  };

  // 色相 → 色系 key；hue 為 null（灰階）回 'neutral'
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

  // 色系的代表（中點）色相；'neutral' 回 null。供 UI 產生色系標示色（如 hsl(mid,…)）。
  function familyMidHue(key) {
    var r = FAMILY_RANGES[key];
    if (!r) return null;
    var a = r[0], b = r[1];
    if (a > b) return (((a + (b + 360)) / 2) % 360);   // 跨 0 度（red）
    return (a + b) / 2;
  }

  // 合併完全相同 hex 的色票（累加 ratio）：median-cut 在不等大色簇上會把純色切成多個
  // 重複盒；合併後 alias 只留「相異的主要顏色」（≤ MAX_COLORS），佔比更真實。純函式。
  function mergeDuplicates(colors) {
    var byHex = {}, order = [];
    (colors || []).forEach(function (c) {
      var e = byHex[c.hex];
      if (e) { e.ratio += (c.ratio || 0); }
      else { byHex[c.hex] = { r: c.r, g: c.g, b: c.b, hex: c.hex, ratio: c.ratio || 0, hue: c.hue, _s: c._s, _l: c._l }; order.push(c.hex); }
    });
    return order.map(function (h) { return byHex[h]; });
  }

  // 萃取 + 組成可落地的 Palette 物件（附代表色相；色票已合併重複、依色相排序）
  function buildPalette(data, opts) {
    opts = opts || {};
    var method = METHODS.indexOf(opts.method) >= 0 ? opts.method : 'median';
    var colors = sortByHue(mergeDuplicates(extractPalette(data, Object.assign({}, opts, { method: method }))));
    var hue = representativeHue(colors);
    return {
      method: method,
      count: colors.length,
      colors: colors,
      hue: hue == null ? -1 : hue          // -1＝無主色相（灰階）；後端 hue 為選用 number
    };
  }

  // ---- 感知色距（CIEDE2000）＋ ΔE 感知分布 -------------------------------
  // 用途：以「人眼感知距離」把整張圖的用色分箱成分布（比 RGB 等分誠實）。
  // 尺與 faber-castell-color 的 nearestFC 同源（CIELAB D65 + CIEDE2000 ΔE00），
  // 但本 lib 自帶一份、不相依其他 global（保持純核心、零外部相依）。

  // sRGB(0-255) → CIE L*a*b*（D65）；回 [L, a, b]
  function srgbToLab(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
    g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
    b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
    var x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
    var y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.0;
    var z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
    var f = function (t) { return t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116); };
    var fx = f(x), fy = f(y), fz = f(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }

  // CIEDE2000 色差 ΔE00（lab 為 [L,a,b]）——感知均勻，≈5 為「明顯不同色」界線
  var DEG = Math.PI / 180, POW25_7 = Math.pow(25, 7);
  function ciede2000(lab1, lab2) {
    var L1 = lab1[0], a1 = lab1[1], b1 = lab1[2];
    var L2 = lab2[0], a2 = lab2[1], b2 = lab2[2];
    var C1 = Math.sqrt(a1 * a1 + b1 * b1), C2 = Math.sqrt(a2 * a2 + b2 * b2);
    var Cbar = (C1 + C2) / 2, Cbar7 = Math.pow(Cbar, 7);
    var G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + POW25_7)));
    var a1p = (1 + G) * a1, a2p = (1 + G) * a2;
    var C1p = Math.sqrt(a1p * a1p + b1 * b1), C2p = Math.sqrt(a2p * a2p + b2 * b2);
    var h1p = Math.atan2(b1, a1p); if (h1p < 0) h1p += 2 * Math.PI;
    var h2p = Math.atan2(b2, a2p); if (h2p < 0) h2p += 2 * Math.PI;
    var dLp = L2 - L1, dCp = C2p - C1p, dhp;
    if (C1p * C2p === 0) dhp = 0;
    else { dhp = h2p - h1p; if (dhp > Math.PI) dhp -= 2 * Math.PI; else if (dhp < -Math.PI) dhp += 2 * Math.PI; }
    var dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp / 2);
    var Lbarp = (L1 + L2) / 2, Cbarp = (C1p + C2p) / 2, hbarp;
    if (C1p * C2p === 0) hbarp = h1p + h2p;
    else {
      hbarp = (h1p + h2p) / 2;
      if (Math.abs(h1p - h2p) > Math.PI) { if (h1p + h2p < 2 * Math.PI) hbarp += Math.PI; else hbarp -= Math.PI; }
    }
    var T = 1 - 0.17 * Math.cos(hbarp - 30 * DEG) + 0.24 * Math.cos(2 * hbarp)
              + 0.32 * Math.cos(3 * hbarp + 6 * DEG) - 0.20 * Math.cos(4 * hbarp - 63 * DEG);
    var dtheta = 30 * Math.exp(-Math.pow((hbarp / DEG - 275) / 25, 2));
    var Cbarp7 = Math.pow(Cbarp, 7);
    var Rc = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + POW25_7));
    var Sl = 1 + (0.015 * Math.pow(Lbarp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbarp - 50, 2));
    var Sc = 1 + 0.045 * Cbarp, Sh = 1 + 0.015 * Cbarp * T;
    var Rt = -Math.sin(2 * dtheta * DEG) * Rc;
    return Math.sqrt((dLp / Sl) * (dLp / Sl) + (dCp / Sc) * (dCp / Sc) + (dHp / Sh) * (dHp / Sh)
                     + Rt * (dCp / Sc) * (dHp / Sh));
  }

  /**
   * ΔE≈5 感知分布：把整張圖的用色，按「人眼感知距離」分箱成一份誠實的分布。
   * 步驟（見 DESIGN）：
   *   1) 5-bit/通道粗量化直方圖 → 去掉 JPEG/漸層雜訊、收斂成加權色點（opts.bits）
   *   2) 每桶平均色 → CIELAB；依權重（像素數）由大到小
   *   3) leader 聚類：桶由大到小，落入與某 leader ΔE00 < radius（預設 5）者併簇，否則自成 leader
   *      （種子色即簇代表 → 穩定、O(桶數×簇數)、免反覆重算質心）
   *   4) 每簇回其「加權平均色」色票，濾掉 < minRatio 的碎簇，依佔比由大到小、取前 maxColors
   * 與 extractPalette 不同：這裡預設「全收」（含近白紙底/近黑線稿），佔比才加總得起來＝真實用色比例。
   * 回 Color[]（同 decorate 形狀：r/g/b/hex/ratio/hue…），純函式、不碰 DOM。
   */
  function distributionByDeltaE(data, opts) {
    opts = opts || {};
    var radius = opts.radius == null ? 5 : opts.radius;        // ΔE00 分箱半徑（顆粒度）
    var bits = opts.bits == null ? 5 : opts.bits;              // 預量化位元/通道（去噪；桶寬 2^(8-bits)）
    var maxColors = opts.maxColors == null ? 24 : opts.maxColors;
    var minRatio = opts.minRatio == null ? 0.005 : opts.minRatio; // 佔比低於此的碎簇捨去（預設 0.5%）
    var skipW = opts.skipNearWhite === true;                   // 分布預設「全收」（含中性色）
    var skipB = opts.skipNearBlack === true;
    var shift = 8 - Math.max(1, Math.min(8, bits));

    // 1) 粗量化直方圖（去噪 + 收斂）
    var map = Object.create(null), total = 0;
    for (var i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;                         // 略過透明
      var r = data[i], g = data[i + 1], b = data[i + 2];
      if (skipW || skipB) {
        var mx = Math.max(r, g, b), mn = Math.min(r, g, b), chroma = mx - mn, lum = (r + g + b) / 3;
        if (skipW && lum >= 232 && chroma <= 24) continue;
        if (skipB && lum <= 30 && chroma <= 24) continue;
      }
      var key = (r >> shift) + '_' + (g >> shift) + '_' + (b >> shift);
      var e = map[key] || (map[key] = { n: 0, sr: 0, sg: 0, sb: 0 });
      e.n++; e.sr += r; e.sg += g; e.sb += b;
      total++;
    }
    if (!total) return [];

    // 2) 每桶平均色 → Lab，依權重由大到小
    var buckets = Object.keys(map).map(function (k) {
      var e = map[k], br = e.sr / e.n, bg = e.sg / e.n, bb = e.sb / e.n;
      return { n: e.n, r: br, g: bg, b: bb, lab: srgbToLab(br, bg, bb) };
    });
    buckets.sort(function (a, b) { return b.n - a.n; });

    // 3) leader 聚類（種子＝該簇最大權重色，即代表色）
    var leaders = [];
    for (var q = 0; q < buckets.length; q++) {
      var bk = buckets[q], best = -1, bestD = radius;
      for (var li = 0; li < leaders.length; li++) {
        var d = ciede2000(bk.lab, leaders[li].lab);
        if (d < bestD) { bestD = d; best = li; }
      }
      if (best >= 0) {
        var L = leaders[best];
        L.n += bk.n; L.sr += bk.r * bk.n; L.sg += bk.g * bk.n; L.sb += bk.b * bk.n;
      } else {
        leaders.push({ n: bk.n, sr: bk.r * bk.n, sg: bk.g * bk.n, sb: bk.b * bk.n, lab: bk.lab });
      }
    }

    // 4) 每簇 → 加權平均色色票；濾碎簇、依佔比排序、取前 maxColors
    var out = leaders.map(function (L) {
      return decorate(Math.round(L.sr / L.n), Math.round(L.sg / L.n), Math.round(L.sb / L.n), L.n / total);
    }).filter(function (c) { return c.ratio >= minRatio; });
    out.sort(function (a, b) { return b.ratio - a.ratio; });
    return out.length > maxColors ? out.slice(0, maxColors) : out;
  }

  // ---- 小工具 ------------------------------------------------------------
  function pad2(n) { return String(n).padStart(2, '0'); }

  function timestamp(date) {
    var d = date || new Date();
    return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
           pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
  }

  function formatSize(bytes) {
    bytes = Number(bytes) || 0;
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  function isImage(name) { return IMAGE_RE.test(String(name || '')); }

  // ---- 色距 / 找最近色票（滴管、色塊定位用；移植自 thangka-trace-lib，純函式） ----
  // redmean 加權色距（平方）——比純 RGB 歐氏更接近人眼感知
  function colorDist2(r1, g1, b1, r2, g2, b2) {
    var rmean = (r1 + r2) / 2, dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
    return (2 + rmean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rmean) / 256) * db * db;
  }
  // 在色票（[{r,g,b}...]）中找最接近 (r,g,b) 的索引；找不到回 -1
  function nearestSwatchIndex(r, g, b, colors) {
    if (!colors || !colors.length) return -1;
    var best = -1, bestD = Infinity;
    for (var i = 0; i < colors.length; i++) {
      var c = colors[i], d = colorDist2(r, g, b, c.r, c.g, c.b);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // ---- 縮放 / 平移（燈箱細看原圖用；移植自 thangka-trace-lib，純函式） --------
  // View：{ zoom, tx, ty }。zoom＝相對「fit」的倍率（1＝貼合）；tx/ty＝以容器中心為原點的像素平移。
  // 套用方式（控制器）：img.style.transform = translate(tx px, ty px) scale(zoom)，transform-origin 置中。
  var ZOOM_MIN = 0.2;  // 可縮到 fit 的 20%（大圖也能看得更小）；1 = fit（貼合）
  var ZOOM_MAX = 16;   // 放大上限（像素級細看）
  function clampNum(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function identityView() { return { zoom: 1, tx: 0, ty: 0 }; }
  // 夾住 zoom 範圍；zoom 回到 1 時平移歸零（貼合、置中）
  function clampView(view, min, max) {
    min = min || ZOOM_MIN; max = max || ZOOM_MAX;
    var z = clampNum(view.zoom, min, max);
    if (z <= min) return { zoom: min, tx: 0, ty: 0 };
    return { zoom: z, tx: view.tx, ty: view.ty };
  }
  // 以游標為錨縮放（zoom-to-cursor）；cx/cy＝游標相對容器中心的座標
  function zoomAt(view, factor, cx, cy, min, max) {
    min = min || ZOOM_MIN; max = max || ZOOM_MAX;
    var z0 = view.zoom, z1 = clampNum(z0 * factor, min, max);
    if (z1 === z0) return { zoom: z0, tx: view.tx, ty: view.ty };
    var ratio = z1 / z0;                                  // c=(p-t)/z 不變 → t1 = p-(p-t0)*z1/z0
    return clampView({ zoom: z1, tx: cx - (cx - view.tx) * ratio, ty: cy - (cy - view.ty) * ratio }, min, max);
  }

  function bust(url) { return url + (url.indexOf('?') >= 0 ? '&' : '?') + '_=' + Date.now(); }

  function fileUrl(name) { return STATIC_BASE + encodeURIComponent(name); }

  // 落地前把色票裁成後端接受的欄位（去掉內部 _s / _l）
  function slimColors(colors) {
    return (colors || []).map(function (c) {
      var o = { r: c.r, g: c.g, b: c.b, hex: c.hex, ratio: c.ratio };
      if (typeof c.hue === 'number') o.hue = c.hue;
      return o;
    });
  }

  // ---- 後端溝通 ----------------------------------------------------------
  function uploadFile(file) {
    var fd = new FormData();
    fd.append('myFiles', file);
    return fetch(UPLOAD_API, { method: 'POST', body: fd })
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (resp) {
        if (!resp || !resp.ok) throw new Error((resp && resp.error) || '上傳失敗');
        return resp;
      });
  }

  function listFiles() {
    return fetch(bust(FILES_API), { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('清單載入失敗 (' + r.status + ')');
        return r.json();
      })
      .then(function (d) { return (d && d.files) || []; });
  }

  // 落地單一檔案的色票 alias（palette 由 buildPalette 產生）
  function saveAlias(name, palette) {
    var body = {
      name: name,
      palette: {
        method: palette.method,
        count: palette.count,
        colors: slimColors(palette.colors),
        hue: palette.hue
      }
    };
    return fetch(ALIAS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (d) {
        if (!d || !d.ok) throw new Error((d && d.error) || '落地失敗');
        return d;
      });
  }

  function clearFolder() {
    return fetch(CLEAR_API, { method: 'POST' })
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (d) {
        if (!d || !d.ok) throw new Error((d && d.error) || '清空失敗');
        return d;
      });
  }

  // 產生色票 .md 到 palettes/；回 { ok, name, path }（path＝站台絕對路徑原文）
  function saveMd(name, content) {
    return fetch(SAVEMD_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, content: content })
    })
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (d) {
        if (!d || !d.ok) throw new Error((d && d.error) || '存檔失敗');
        return d;
      });
  }

  // 刪除單一檔案（連同其 registry alias）
  function deleteFile(name) {
    return fetch(DELETE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name })
    })
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (d) {
        if (!d || !d.ok) throw new Error((d && d.error) || '刪除失敗');
        return d;
      });
  }

  window.ColorPaletteLib = {
    FOLDER: FOLDER,
    MAX_COLORS: MAX_COLORS,
    METHODS: METHODS,
    isImage: isImage,
    fileUrl: fileUrl,
    formatSize: formatSize,
    timestamp: timestamp,
    colorDist2: colorDist2,
    nearestSwatchIndex: nearestSwatchIndex,
    ZOOM_MIN: ZOOM_MIN,
    ZOOM_MAX: ZOOM_MAX,
    identityView: identityView,
    clampView: clampView,
    zoomAt: zoomAt,
    rgbToHex: rgbToHex,
    rgbToHsl: rgbToHsl,
    extractPalette: extractPalette,
    distributionByDeltaE: distributionByDeltaE,
    sortByHue: sortByHue,
    representativeHue: representativeHue,
    compareByHue: compareByHue,
    FAMILY_ORDER: FAMILY_ORDER,
    hueFamily: hueFamily,
    familyMidHue: familyMidHue,
    buildPalette: buildPalette,
    uploadFile: uploadFile,
    listFiles: listFiles,
    saveAlias: saveAlias,
    saveMd: saveMd,
    deleteFile: deleteFile,
    clearFolder: clearFolder
  };
})(window);
