/**
 * ColorPortraitLib — 由「五構面色資料」推出一張圖的結構化色彩描述（純邏輯，不碰 DOM）
 * =================================================================================
 * IIFE → window.ColorPortraitLib。零外部相依（不依賴 color-palette-lib / i18n）。
 *
 *   describe(facets) → Description   語言中立：數字 + 語意標籤（enum）+ 家族 key
 *   phrase(desc, t)  → string        一句「色彩肖像」；t＝i18n 翻譯函式，措辭全在各 app 的 locale
 *
 * facets = { distribution, accent, dominant?, families?, all? }，各為 Color[]：
 *   Color = { r,g,b, hex, ratio:0-1, hue:0-360 }
 *   - 溫度／家族／明度／彩度／和諧 依「distribution」（真實面積）算
 *   - 主色的「感覺」依「dominant」（頻率主色）；焦點色依「accent」（彩度加權顯著性）
 *
 * 邊界：只描述「顏色」，不描述「內容」——它知道「一抹小而鮮的紅」，不知道那是不是嘴唇。
 * 決定論、可單元測試、不需 LLM（要更漂亮的文筆再把 Description 丟給潤稿層）。
 */
(function (window) {
  'use strict';

  var WARM = { red: 1, orange: 1, yellow: 1, magenta: 1 };
  var COOL = { green: 1, cyan: 1, blue: 1, purple: 1 };

  // 色相 → 家族 key（與 color-palette-lib 的 hueFamily 同界，內建以維持零相依）
  function familyOfHue(h) {
    if (h == null || h < 0) return 'neutral';
    h = ((h % 360) + 360) % 360;
    if (h >= 345 || h < 15) return 'red';
    if (h < 45) return 'orange';
    if (h < 70) return 'yellow';
    if (h < 165) return 'green';
    if (h < 195) return 'cyan';
    if (h < 255) return 'blue';
    if (h < 290) return 'purple';
    return 'magenta';
  }
  function hsl(c) {
    var r = c.r / 255, g = c.g / 255, b = c.b / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    var l = (mx + mn) / 2, s = 0;
    if (d) s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    return { s: s, l: l };
  }
  function isNeutral(c) { return hsl(c).s < 0.15; }
  function familyOf(c) { return isNeutral(c) ? 'neutral' : familyOfHue(c.hue != null ? c.hue : 0); }
  function tempOf(c) {
    if (isNeutral(c)) return 'neutral';
    var f = familyOf(c);
    return WARM[f] ? 'warm' : (COOL[f] ? 'cool' : 'neutral');
  }
  function wsum(arr, f) { var s = 0; for (var i = 0; i < arr.length; i++) s += f(arr[i]); return s; }
  function rgbDist2(a, b) { var dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b; return dr * dr + dg * dg + db * db; }

  // 面積加權的暖度（[-1,1]＝warm−cool）與彩度（[0,1]）——供「相對圖庫」比較（對任何 Color[] 皆可）
  function metrics(colors) {
    var tot = wsum(colors || [], function (c) { return c.ratio || 0; }) || 1, warm = 0, cool = 0, chr = 0;
    (colors || []).forEach(function (c) {
      var w = (c.ratio || 0) / tot, tp = tempOf(c);
      if (tp === 'warm') warm += w; else if (tp === 'cool') cool += w;
      chr += hsl(c).s * w;
    });
    return { warmth: warm - cool, chroma: chr };
  }
  // v 在陣列中的分位（低於 v 的比例，0–1）
  function pctile(arr, v) { if (!arr.length) return 0.5; var n = 0; for (var i = 0; i < arr.length; i++) if (arr[i] < v) n++; return n / arr.length; }

  // ---- 和諧配色（色彩理論）：把彩色色相聚成「極」，再依幾何分類 ----
  var DEG = Math.PI / 180;
  function hueDist(a, b) { var d = Math.abs(((a - b) % 360 + 360) % 360); return d > 180 ? 360 - d : d; }
  function sortedGaps(hues) {  // 排序後的相鄰圓形間距（和＝360）
    var h = hues.slice().sort(function (a, b) { return a - b; }), g = [];
    for (var i = 0; i < h.length; i++) g.push(((h[(i + 1) % h.length] - h[i]) + 360) % 360);
    return g;
  }
  function hueSpan(hues) { return hues.length < 2 ? 0 : 360 - Math.max.apply(null, sortedGaps(hues)); }  // 涵蓋所有極的最小弧
  function isTetradic(h) {  // 四極能否配成兩組互補對（各≈180）
    function comp(a, b) { return Math.abs(hueDist(a, b) - 180) <= 32; }
    return [[0, 1, 2, 3], [0, 2, 1, 3], [0, 3, 1, 2]].some(function (p) { return comp(h[p[0]], h[p[1]]) && comp(h[p[2]], h[p[3]]); });
  }
  // 由分布把「有色相、有面積」的色聚成極（circular leader clustering，種子＝最大面積），
  // 取面積 ≥7% 的顯著極，依其數量與角度關係判配色方案。
  function harmonyOf(dist, total) {
    var pts = [];
    dist.forEach(function (c) {
      if (isNeutral(c)) return;
      pts.push({ hue: c.hue != null ? ((c.hue % 360) + 360) % 360 : 0, w: (c.ratio || 0) / total });
    });
    pts.sort(function (a, b) { return b.w - a.w; });
    var poles = [], MERGE = 35;
    pts.forEach(function (c) {
      var best = -1, bd = MERGE;
      for (var i = 0; i < poles.length; i++) { var d = hueDist(c.hue, poles[i].hue); if (d < bd) { bd = d; best = i; } }
      if (best >= 0) {  // 加權合併（向量和維持圓形平均）
        var p = poles[best];
        p.x += Math.cos(c.hue * DEG) * c.w; p.y += Math.sin(c.hue * DEG) * c.w; p.w += c.w;
        p.hue = (Math.atan2(p.y, p.x) / DEG + 360) % 360;
      } else {
        poles.push({ hue: c.hue, w: c.w, x: Math.cos(c.hue * DEG) * c.w, y: Math.sin(c.hue * DEG) * c.w });
      }
    });
    var hues = poles.filter(function (p) { return p.w >= 0.07; }).sort(function (a, b) { return b.w - a.w; })
                    .map(function (p) { return p.hue; });
    var n = hues.length;
    if (n === 0) return 'neutral';
    if (n === 1) return 'monochrome';
    if (n === 2) { var g = hueDist(hues[0], hues[1]); return g <= 40 ? 'analogous' : (g >= 145 ? 'complementary' : 'varied'); }
    if (n === 3) {
      if (hueSpan(hues) <= 90) return 'analogous';
      var gaps = sortedGaps(hues);
      if (gaps.every(function (x) { return Math.abs(x - 120) <= 35; })) return 'triadic';
      var gs = gaps.slice().sort(function (a, b) { return a - b; });
      if (gs[0] <= 60 && gs[1] >= 120 && Math.abs(gs[1] - gs[2]) <= 40) return 'split-complementary';
      return 'varied';
    }
    if (n === 4) return isTetradic(hues) ? 'tetradic' : (hueSpan(hues) <= 90 ? 'analogous' : 'varied');
    return 'varied';
  }

  /**
   * 從五構面推出結構化描述。核心是「跨構面比較」——找出各層彼此矛盾/意外之處（tensions）。
   */
  function describe(facets, opts) {
    facets = facets || {}; opts = opts || {};
    var dist = facets.distribution || [];
    var dom = facets.dominant || [];
    var acc = facets.accent || [];
    if (!dist.length) return null;
    var total = wsum(dist, function (c) { return c.ratio || 0; }) || 1;

    // 溫度（依分布真實面積）
    var temp = { warm: 0, cool: 0, neutral: 0 };
    dist.forEach(function (c) { temp[tempOf(c)] += (c.ratio || 0) / total; });
    var lead = temp.warm >= temp.cool && temp.warm >= temp.neutral ? 'warm'
             : temp.cool >= temp.neutral ? 'cool' : 'neutral';
    var bothWC = temp.warm >= 0.25 && temp.cool >= 0.25;
    var tempVerdict = temp[lead] >= 0.5 ? lead + '-strong' : lead + '-leaning';

    // 家族（依面積，由大到小）
    var famMap = {};
    dist.forEach(function (c) { var f = familyOf(c); famMap[f] = (famMap[f] || 0) + (c.ratio || 0) / total; });
    var families = Object.keys(famMap).map(function (k) { return { key: k, share: famMap[k] }; })
      .sort(function (a, b) { return b.share - a.share; });
    var topChromatic = families.filter(function (f) { return f.key !== 'neutral'; })[0] || null;

    // 明度 / 彩度（面積加權）
    var keyL = wsum(dist, function (c) { return hsl(c).l * (c.ratio || 0); }) / total;
    var chr = wsum(dist, function (c) { return hsl(c).s * (c.ratio || 0); }) / total;
    var key = keyL >= 0.6 ? 'high' : (keyL <= 0.4 ? 'low' : 'mid');
    var chroma = chr >= 0.42 ? 'vivid' : (chr <= 0.25 ? 'muted' : 'balanced');

    // 主色的「感覺」（頻率主色最大者）
    var dominant = dom[0]
      ? { hex: dom[0].hex, family: familyOf(dom[0]), muted: hsl(dom[0]).s < 0.3, neutral: isNeutral(dom[0]) }
      : null;

    // 焦點色（focal）＝重點色榜上「家族面積小卻上榜」者——「顯著性 ≠ 面積」的驚喜。
    //   不能用 accent[0]：最搶眼者常是「又大又鮮」的色（如整片天藍），那不是驚喜；
    //   也不能用單一最近分布簇估面積（同色被拆成多簇會低估）→ 改用「家族總面積」判斷。
    var famArea = {};
    families.forEach(function (f) { famArea[f.key] = f.share; });
    var accent = acc[0] ? { hex: acc[0].hex, family: familyOf(acc[0]) } : null;
    var focal = null;
    for (var ai = 0; ai < acc.length; ai++) {
      var ac = acc[ai];
      if (isNeutral(ac)) continue;
      var fk = familyOf(ac), fa = famArea[fk] || 0;
      if (fa < 0.15 && hsl(ac).s >= 0.4) { focal = { hex: ac.hex, family: fk, familyArea: fa, rank: ai + 1 }; break; }
    }

    // 和諧配色（色彩理論）：色相聚極 → 單色/類比/互補/分裂互補/三角/四角/varied
    var harmony = harmonyOf(dist, total);

    // 張力（跨構面矛盾 = 最有訊息量的描述）
    var tensions = [];
    if (dominant && (dominant.muted || dominant.neutral) && topChromatic && topChromatic.share >= 0.3)
      tensions.push({ type: 'hidden-dominant', family: topChromatic.key, share: topChromatic.share });
    if (focal)
      tensions.push({ type: 'small-vivid-accent', family: focal.family, familyArea: focal.familyArea });

    // 相對圖庫：把本圖的暖度/彩度放進「其他圖」的分布，落在極端（前/後 25%）才發話；
    //   語料 ≥4 張才比較；opts.self（本圖 alias 色）與 opts.corpus（其他圖色）用同源以求公平。
    var relative = null, corpus = opts.corpus;
    if (corpus && corpus.length >= 4) {
      var self = metrics(opts.self && opts.self.length ? opts.self : dist);
      var cm = corpus.map(metrics);
      var wP = pctile(cm.map(function (m) { return m.warmth; }), self.warmth);
      var cP = pctile(cm.map(function (m) { return m.chroma; }), self.chroma);
      // 取「最極端」的單一指標；只在離中位 ≥ REL_MIN（約前/後 8%＝真的少見）才發話，
      // 免得暖度或彩度任一落榜就發話（聯集會涵蓋大多數圖，太吵）。
      var REL_MIN = 0.42;
      var cand = [
        { tag: wP >= 0.5 ? 'warmer' : 'cooler', d: Math.abs(wP - 0.5) },
        { tag: cP >= 0.5 ? 'more-vivid' : 'more-muted', d: Math.abs(cP - 0.5) }
      ].sort(function (a, b) { return b.d - a.d; });
      if (cand[0].d >= REL_MIN) relative = { tag: cand[0].tag };
    }

    return {
      temperature: { shares: temp, verdict: tempVerdict, bothWarmCool: bothWC },
      families: families, dominant: dominant, key: key, chroma: chroma,
      accent: accent, focal: focal, harmony: harmony, tensions: tensions, relative: relative
    };
  }

  /**
   * 把 Description 拼成一句色彩肖像。t＝i18n 翻譯函式（t(key, params)）；措辭全在 locale 的 portrait.* key：
   *   portrait.family.<key> · portrait.temp.<verdict> · portrait.chroma.<x> · portrait.key.<x>
   *   portrait.c.{warmCool,temp,leads,tone,focal,hidden} · portrait.sep · portrait.end
   * 找不到 key 時（未提供 locale）t 回退英文或 key 本身，仍不會壞。
   */
  function phrase(desc, t, opts) {
    if (!desc || typeof t !== 'function') return '';
    opts = opts || {};
    function fam(k) { return t('portrait.family.' + k); }
    function pct(x) { return Math.round(x * 100) + '%'; }
    var parts = [];

    // 「跨色環」的和諧方案（互補/分裂互補/三角/四角）本身即含暖冷對比 → 略去重複的暖冷 clause
    var spanning = ['complementary', 'split-complementary', 'triadic', 'tetradic'].indexOf(desc.harmony) >= 0;
    // 1) 溫度：暖冷對比僅在「非跨色環方案」時說；偏暖/偏冷的傾向照常說
    if (desc.temperature.bothWarmCool) { if (!spanning) parts.push(t('portrait.c.warmCool')); }
    else parts.push(t('portrait.c.temp', { v: t('portrait.temp.' + desc.temperature.verdict) }));

    // 1.3) 和諧配色（只在明確方案時發話，varied/neutral 略）
    if (desc.harmony && desc.harmony !== 'varied' && desc.harmony !== 'neutral')
      parts.push(t('portrait.c.harmony', { h: t('portrait.harmony.' + desc.harmony) }));

    // 1.5) 相對圖庫（前/後 25% 才有）
    if (desc.relative) parts.push(t('portrait.c.relative', { rel: t('portrait.rel.' + desc.relative.tag) }));

    // 2) 隱藏主導（有張力就用它，較有訊息量）；否則講面積主導家族
    var hd = desc.tensions.filter(function (x) { return x.type === 'hidden-dominant'; })[0];
    var leadFam = desc.families.filter(function (f) { return f.key !== 'neutral'; })[0];
    if (hd) parts.push(t('portrait.c.hidden', { family: fam(hd.family), pct: pct(hd.share) }));
    else if (leadFam && leadFam.share >= 0.2) parts.push(t('portrait.c.leads', { family: fam(leadFam.key), pct: pct(leadFam.share) }));

    // 3) 色調（彩度 + 明度）
    parts.push(t('portrait.c.tone', { chroma: t('portrait.chroma.' + desc.chroma), key: t('portrait.key.' + desc.key) }));

    // 4) 焦點色（小而鮮）；有 FC 名（opts.fcName(hex) → {code,name}）就用 named 版
    if (desc.focal) {
      var fc = typeof opts.fcName === 'function' ? opts.fcName(desc.focal.hex) : null;
      if (fc && fc.name) parts.push(t('portrait.c.focalNamed', { name: fc.name, code: fc.code }));
      else parts.push(t('portrait.c.focal', { family: fam(desc.focal.family) }));
    }

    var s = parts.join(t('portrait.sep')) + t('portrait.end');
    return s.charAt(0).toUpperCase() + s.slice(1);   // 英文首字大寫；CJK 為 no-op
  }

  window.ColorPortraitLib = { describe: describe, phrase: phrase, familyOfHue: familyOfHue };
})(window);
