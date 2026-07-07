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

  /**
   * 從五構面推出結構化描述。核心是「跨構面比較」——找出各層彼此矛盾/意外之處（tensions）。
   */
  function describe(facets) {
    facets = facets || {};
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

    // 和諧（依面積 ≥12% 的彩色家族數）
    var big = families.filter(function (f) { return f.key !== 'neutral' && f.share >= 0.12; });
    var harmony = big.length <= 1 ? 'near-mono' : (bothWC ? 'warm-cool' : 'varied');

    // 張力（跨構面矛盾 = 最有訊息量的描述）
    var tensions = [];
    if (dominant && (dominant.muted || dominant.neutral) && topChromatic && topChromatic.share >= 0.3)
      tensions.push({ type: 'hidden-dominant', family: topChromatic.key, share: topChromatic.share });
    if (focal)
      tensions.push({ type: 'small-vivid-accent', family: focal.family, familyArea: focal.familyArea });

    return {
      temperature: { shares: temp, verdict: tempVerdict, bothWarmCool: bothWC },
      families: families, dominant: dominant, key: key, chroma: chroma,
      accent: accent, focal: focal, harmony: harmony, tensions: tensions
    };
  }

  /**
   * 把 Description 拼成一句色彩肖像。t＝i18n 翻譯函式（t(key, params)）；措辭全在 locale 的 portrait.* key：
   *   portrait.family.<key> · portrait.temp.<verdict> · portrait.chroma.<x> · portrait.key.<x>
   *   portrait.c.{warmCool,temp,leads,tone,focal,hidden} · portrait.sep · portrait.end
   * 找不到 key 時（未提供 locale）t 回退英文或 key 本身，仍不會壞。
   */
  function phrase(desc, t) {
    if (!desc || typeof t !== 'function') return '';
    function fam(k) { return t('portrait.family.' + k); }
    function pct(x) { return Math.round(x * 100) + '%'; }
    var parts = [];

    // 1) 溫度 / 暖冷對比
    if (desc.harmony === 'warm-cool' || desc.temperature.bothWarmCool) parts.push(t('portrait.c.warmCool'));
    else parts.push(t('portrait.c.temp', { v: t('portrait.temp.' + desc.temperature.verdict) }));

    // 2) 隱藏主導（有張力就用它，較有訊息量）；否則講面積主導家族
    var hd = desc.tensions.filter(function (x) { return x.type === 'hidden-dominant'; })[0];
    var leadFam = desc.families.filter(function (f) { return f.key !== 'neutral'; })[0];
    if (hd) parts.push(t('portrait.c.hidden', { family: fam(hd.family), pct: pct(hd.share) }));
    else if (leadFam && leadFam.share >= 0.2) parts.push(t('portrait.c.leads', { family: fam(leadFam.key), pct: pct(leadFam.share) }));

    // 3) 色調（彩度 + 明度）
    parts.push(t('portrait.c.tone', { chroma: t('portrait.chroma.' + desc.chroma), key: t('portrait.key.' + desc.key) }));

    // 4) 焦點色（小而鮮）
    if (desc.focal) parts.push(t('portrait.c.focal', { family: fam(desc.focal.family) }));

    var s = parts.join(t('portrait.sep')) + t('portrait.end');
    return s.charAt(0).toUpperCase() + s.slice(1);   // 英文首字大寫；CJK 為 no-op
  }

  window.ColorPortraitLib = { describe: describe, phrase: phrase, familyOfHue: familyOfHue };
})(window);
