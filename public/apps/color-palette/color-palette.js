/**
 * color-palette.js — 頁面控制器（碰 DOM 的膠水層）
 *
 * 職責：DOM 繫結、上傳、把圖畫進 canvas 讀像素、呼叫 ColorPaletteLib 萃取/落地/清單、
 *      依色相排序渲染 gallery、主題 / 語言 / 萃取法切換、toast 回饋。
 *
 * 純顏色演算與伺服器溝通在 color-palette-lib.js（不碰 DOM）；
 * 「載圖 → canvas → getImageData」是 DOM 工作，才留在這裡。
 */
(function () {
  'use strict';

  var Lib = window.ColorPaletteLib;
  var $ = window.jQuery;

  // ---- 狀態 --------------------------------------------------------------
  var METHOD_KEY = 'color-palette-method';
  var THEME_KEY = 'color-palette-theme';
  var DENSITY_KEY = 'color-palette-density';
  var ANALYZE_MAX = 256;                 // 分析前縮圖的最長邊（色票取樣足夠、又快）
  var files = [];                        // [{ name, size, mtime, alias|null }]
  var method = readMethod();
  var density = readDensity();           // 'comfortable' | 'compact'
  var detailName = null;                 // 目前開啟明細的檔名

  function readMethod() {
    try {
      var m = localStorage.getItem(METHOD_KEY);
      return Lib.METHODS.indexOf(m) >= 0 ? m : 'median';
    } catch (e) { return 'median'; }
  }
  function readDensity() {
    try { return localStorage.getItem(DENSITY_KEY) === 'compact' ? 'compact' : 'comfortable'; }
    catch (e) { return 'comfortable'; }
  }

  // ---- 最接近 Faber-Castell 色（複製件 FaberCastellCssLib + FC_COLORS；純比對） ----
  var FC = window.FaberCastellCssLib;
  function fcBand(band) {   // ΔE 級距著色，兩主題皆可讀
    return band === 'very' ? '#37b26b' : band === 'close' ? '#4a9de0'
         : band === 'noticeable' ? '#d9a441' : 'var(--muted)';
  }
  function fcNear(hex, n) {
    if (!FC || !FC.nearestFC) return [];
    var rgb = FC.hexToRgb(hex); if (!rgb) return [];
    return FC.nearestFC(rgb, { n: n || 1 });
  }
  // FC 色名依語言在地化（zh-Hant→zh、ja→ja；en 或缺對照→英文原名）；對照表 data/fc-names-i18n.js
  function fcLocalName(code, fallback) {
    var loc = window.FC_NAMES_I18N && FC_NAMES_I18N[code];
    if (loc) {
      if (I18n.lang === 'zh-Hant' && loc.zh) return loc.zh;
      if (I18n.lang === 'ja' && loc.ja) return loc.ja;
    }
    return fallback;
  }
  // 明細每列：主色 FC 標籤 + 2 個替代色小片（A+B 合一）
  function fcBadgeHtml(hex) {
    var ms = fcNear(hex, 3); if (!ms.length) return '';
    var p = ms[0];
    var alts = ms.slice(1).map(function (m) {
      return '<span class="fc-alt" title="FC' + m.code + ' ' + _.escape(fcLocalName(m.code, m.name)) + ' · ΔE' + m.deltaE.toFixed(1) + '" style="background:' + m.hex + '"></span>';
    }).join('');
    return '<span class="fc-near">≈'
      + '<span class="fc-near-chip" style="background:' + p.hex + '"></span>'
      + '<span class="fc-near-code">FC' + p.code + '</span>'
      + '<span class="fc-near-name">' + _.escape(fcLocalName(p.code, p.name)) + '</span>'
      + '<span class="fc-near-de" style="color:' + fcBand(p.band) + '">ΔE' + Math.round(p.deltaE) + '</span>'
      + (alts ? '<span class="fc-alts">' + alts + '</span>' : '')
      + '</span>';
  }
  // 取色鏡 / picker 單行：≈ FC### name ΔEn
  function fcLineHtml(hex) {
    var m = fcNear(hex, 1)[0]; if (!m) return '';
    return '<span class="fc-near">≈'
      + '<span class="fc-near-chip" style="background:' + m.hex + '"></span>'
      + '<span class="fc-near-code">FC' + m.code + '</span>'
      + '<span class="fc-near-name">' + _.escape(fcLocalName(m.code, m.name)) + '</span>'
      + '<span class="fc-near-de" style="color:' + fcBand(m.band) + '">ΔE' + Math.round(m.deltaE) + '</span></span>';
  }

  // ---- toast / loading ---------------------------------------------------
  function toast(key, cls, params) {
    M.toast({ html: I18n.t(key, params || {}), classes: cls || 'grey' });
  }
  var loadingTimer = null;
  function showLoading() {
    clearTimeout(loadingTimer);
    loadingTimer = setTimeout(function () { $('#loading').addClass('show'); }, 150);
  }
  function hideLoading() {
    clearTimeout(loadingTimer);
    $('#loading').removeClass('show');
  }

  // 側鍵「已執行」微回饋：icon 暫時變 check（#setting-mode 等狀態鍵不套）
  function setIconDone($tool) {
    var $i = $tool.find('i.material-icons');
    var orig = $i.text();
    $i.text('check');
    setTimeout(function () { $i.text(orig); }, 800);
  }

  // ---- 顏色分析（canvas；DOM 工作留控制器） ------------------------------
  // 載入圖片、縮圖到 ANALYZE_MAX、讀像素、交給 lib 萃取 → 回 Palette
  function analyzeImage(url, useMethod) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var nw = img.naturalWidth || img.width, nh = img.naturalHeight || img.height;
        if (!nw || !nh) { reject(new Error('圖片尺寸無效')); return; }
        var scale = Math.min(1, ANALYZE_MAX / Math.max(nw, nh));
        var w = Math.max(1, Math.round(nw * scale)), h = Math.max(1, Math.round(nh * scale));
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        var ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        var data;
        try { data = ctx.getImageData(0, 0, w, h).data; }
        catch (e) { reject(e); return; }
        var palette = Lib.buildPalette(data, { method: useMethod || method });
        if (!palette.colors.length) { reject(new Error('empty')); return; }
        // 順便由 live 像素算「準確」色彩肖像標籤（可查詢 metadata），與 palette 一起落地
        var tags = [];
        if (window.ColorPortraitLib) {
          try {
            tags = ColorPortraitLib.tags(ColorPortraitLib.describe({
              dominant: Lib.extractPalette(data, { method: 'frequency', count: 12 }),
              distribution: Lib.distributionByDeltaE(data, { radius: 5, maxColors: 24 }),
              accent: Lib.accentColors(data, { radius: 5, maxColors: 24 })
            }));
          } catch (e) { tags = []; }
        }
        resolve({ palette: palette, tags: tags });
      };
      img.onerror = function () { reject(new Error('圖片載入失敗')); };
      img.src = url;
    });
  }

  // 帶版本戳的靜態 URL（同名覆寫時以 mtime 破快取；穩定不亂閃）
  function versionedUrl(f) {
    return Lib.fileUrl(f.name) + '?t=' + Math.round(f.mtime || 0);
  }

  // 分析單一檔並落地；回 alias（失敗 throw）
  function analyzeAndSave(f) {
    return analyzeImage(versionedUrl(f), method).then(function (res) {
      return Lib.saveAlias(f.name, res.palette, res.tags).then(function (d) { return d.alias; });
    });
  }

  // ---- 渲染 --------------------------------------------------------------
  // 色系的標示色：有彩色→該色系中點色相；neutral/pending 由 class 處理
  function familyDotColor(key) {
    if (key === 'neutral' || key === 'pending') return '';
    var mid = Lib.familyMidHue(key);
    return 'hsl(' + Math.round(mid) + ', 68%, 52%)';
  }

  function buildCard(f) {
    var $card = $('<div class="pcard">').attr('data-name', f.name);
    $card.append($('<img class="pcard-thumb" loading="lazy" alt="">').attr('src', versionedUrl(f)));
    var $body = $('<div class="pcard-body">');
    if (f.alias && f.alias.colors && f.alias.colors.length) {
      // 有 alias → 顯示色塊列（色票已於落地時依色相排序）
      var $sw = $('<div class="swatches">');
      f.alias.colors.forEach(function (c) {
        // 寬度依佔比（flex-grow），呈現「顏色組成」；min-width 保底讓小色仍可見
        $('<div class="swatch">')
          .css({ background: c.hex, flexGrow: Math.max(0.0001, c.ratio || 0) })
          .attr('title', c.hex + ' · ' + Math.round((c.ratio || 0) * 100) + '%')
          .appendTo($sw);
      });
      $body.append($sw);
      $body.append(
        $('<div class="pcard-meta">')
          .append($('<span class="pcard-method">').text(f.alias.method))
          .append($('<span>').text(f.alias.colors.length + ' · ' + Lib.formatSize(f.size)))
      );
      // 色票牆密度模式下縮圖隱藏，用 title 保留檔名可查
      $card.attr('title', f.name);
    } else {
      // 沒有 alias → 顯示檔名（點擊即分析）
      $card.addClass('is-pending').attr('title', f.name);
      $body.append($('<span class="pcard-name">').text(f.name));
      $body.append($('<span class="pcard-hint">').text(I18n.t('card.pending')));
    }
    $card.append($body);
    return $card;
  }

  // ---- 依色彩肖像篩選（可查詢 metadata）----------------------------------
  var filterSet = {};   // 作用中的 'facet:value' 標籤集合（物件當 set）
  var FILTER_FACETS = [
    { facet: 'temp', values: ['warm', 'cool', 'neutral', 'warm-cool'], label: function (v) { return I18n.t('filter.temp.' + v); } },
    { facet: 'archetype', values: ['pastel', 'earthy', 'jewel', 'neon', 'high-contrast'], label: function (v) { return I18n.t('portrait.archetype.' + v); } },
    { facet: 'harmony', values: ['monochrome', 'analogous', 'complementary', 'split-complementary', 'triadic', 'tetradic'], label: function (v) { return I18n.t('portrait.harmony.' + v); } },
    { facet: 'key', values: ['high', 'mid', 'low'], label: function (v) { return I18n.t('portrait.key.' + v); } }
  ];
  // 為每張圖取色彩肖像標籤（供篩選比對）：優先用分析時落地的「準確」標籤（f.alias.tags）；
  //   舊資料尚未落地 tags 時，後備由 alias 色「近似」算（zero-後端負擔）。
  function computeTags() {
    files.forEach(function (f) {
      if (f.alias && Array.isArray(f.alias.tags) && f.alias.tags.length) { f._tags = f.alias.tags; return; }
      f._tags = (f.alias && f.alias.colors && f.alias.colors.length && window.ColorPortraitLib)
        ? ColorPortraitLib.tags(ColorPortraitLib.describe({ distribution: f.alias.colors, dominant: f.alias.colors, accent: f.alias.colors }))
        : [];
    });
  }
  // 同 facet 內 OR、跨 facet AND
  function matchesFilter(f) {
    var keys = Object.keys(filterSet);
    if (!keys.length) return true;
    var byFacet = {};
    keys.forEach(function (tag) { var fc = tag.split(':')[0]; (byFacet[fc] || (byFacet[fc] = [])).push(tag); });
    var tg = f._tags || [];
    return Object.keys(byFacet).every(function (fc) {
      return byFacet[fc].some(function (tag) { return tg.indexOf(tag) >= 0; });
    });
  }
  // 篩選列：chip 只列 gallery 裡真的有的值（像色軌）；顯示與否跟著 #setting-filter
  function buildFilterBar() {
    var $bar = $('#filter-bar');
    if (!$('#setting-filter').hasClass('active')) { $('body').removeClass('filter-open'); $bar.prop('hidden', true).empty(); return; }
    $bar.prop('hidden', false).empty();
    var present = {};
    files.forEach(function (f) { (f._tags || []).forEach(function (t) { present[t] = true; }); });
    FILTER_FACETS.forEach(function (fd) {
      var vals = fd.values.filter(function (v) { return present[fd.facet + ':' + v]; });
      if (!vals.length) return;
      var $grp = $('<div class="filter-group">').append($('<span class="filter-facet">').text(I18n.t('filter.facet.' + fd.facet)));
      vals.forEach(function (v) {
        var tag = fd.facet + ':' + v;
        $('<button type="button" class="filter-chip">').attr('data-tag', tag)
          .toggleClass('active', !!filterSet[tag]).text(fd.label(v)).appendTo($grp);
      });
      $bar.append($grp);
    });
    if (Object.keys(filterSet).length) {
      $bar.append($('<div class="filter-meta">')
        .append($('<span class="filter-count">').text(I18n.t('filter.count', { n: files.filter(matchesFilter).length })))
        .append($('<button type="button" class="filter-clear">').text(I18n.t('filter.clear'))));
    }
    // 固定在頂端：量列高，讓色系標頭 sticky 讓位（top 8 + 列高 + 小間距）
    $('body').addClass('filter-open');
    document.documentElement.style.setProperty('--filter-h', (8 + $bar[0].offsetHeight + 6) + 'px');
  }

  // 圖庫肖像（關係與時間）：描述目前可見的一批圖；≥4 張才有意義
  function renderCollectionPortrait(visible) {
    var el = document.getElementById('collection-portrait');
    if (!el) return;
    var items = (visible || []).filter(function (f) { return f.alias && f.alias.colors && f.alias.colors.length; })
      .map(function (f) { return { colors: f.alias.colors, mtime: f.mtime, tags: f._tags }; });
    if (!window.ColorPortraitLib || !ColorPortraitLib.collectionPortrait || items.length < 4) { el.textContent = ''; return; }
    try { el.textContent = ColorPortraitLib.collectionPhrase(ColorPortraitLib.collectionPortrait(items), I18n.t); }
    catch (e) { el.textContent = ''; }
  }

  function render() {
    var $g = $('#gallery').empty();
    var visible = files.filter(matchesFilter);
    renderCollectionPortrait(visible);
    // 依代表色相排序（同色系相鄰）；相同時以修改時間新→舊
    var sorted = visible.slice().sort(function (a, b) {
      var c = Lib.compareByHue(a.alias, b.alias);
      return c !== 0 ? c : (b.mtime - a.mtime);
    });
    $('body').toggleClass('is-empty', files.length === 0);
    if (files.length && !visible.length) $g.append($('<div class="filter-none">').text(I18n.t('filter.none')));

    // 分群：色系（FAMILY_ORDER）→ 末端 'pending'（未分析）
    var groups = {};
    sorted.forEach(function (f) {
      var key = (f.alias && f.alias.colors && f.alias.colors.length)
        ? Lib.hueFamily(Lib.representativeHue(f.alias))
        : 'pending';
      (groups[key] || (groups[key] = [])).push(f);
    });

    var order = Lib.FAMILY_ORDER.concat(['pending']);
    var rail = [];
    order.forEach(function (key) {
      var list = groups[key];
      if (!list || !list.length) return;
      var dotColor = familyDotColor(key);
      var $dot = $('<span class="hue-dot">');
      if (key === 'neutral') $dot.addClass('is-neutral');
      else if (key === 'pending') $dot.addClass('is-pending');
      else $dot.css('background', dotColor);
      var $head = $('<div class="hue-header">')
        .append($dot)
        .append($('<span class="hue-label">').text(I18n.t('family.' + key)))
        .append($('<span class="hue-count">').text('· ' + list.length));
      var $grid = $('<div class="hue-grid">');
      list.forEach(function (f) { $grid.append(buildCard(f)); });
      $g.append($('<section class="hue-section">').attr('id', 'fam-' + key).append($head).append($grid));
      rail.push({ key: key, color: dotColor });
    });

    renderRail(rail);
    buildFilterBar();
  }

  // 跳轉色軌：依現有色系一顆點；點擊捲到該區
  function renderRail(rail) {
    var $r = $('#jump-rail').empty();
    rail.forEach(function (item) {
      var $dot = $('<div class="jump-dot">')
        .attr('data-key', item.key)
        .attr('title', I18n.t('family.' + item.key));
      if (item.key === 'neutral') $dot.addClass('is-neutral');
      else if (item.key === 'pending') $dot.addClass('is-pending');
      else $dot.css('background', item.color);
      $r.append($dot);
    });
    updateActiveRail();
  }

  // 在色軌上標出目前色系（key）
  function setActiveRail(key) {
    $('#jump-rail .jump-dot').each(function () {
      $(this).toggleClass('active', $(this).attr('data-key') === key);
    });
  }

  // 短暫「鎖住」色軌指示（上傳/選圖 focus 時用）：期間 scroll-spy 不覆蓋；
  // 解鎖只清旗標、不重算 → 指示停在 focus 的色系，直到使用者下次捲動才由 scroll-spy 接手（不跳）。
  var railLock = false, railLockTimer = null;
  function lockRail(key, ms) {
    railLock = true;
    setActiveRail(key);
    clearTimeout(railLockTimer);
    railLockTimer = setTimeout(function () { railLock = false; }, ms || 1200);
  }

  // scroll-spy：找出目前捲到的色系區段（其頂端最靠近視窗上緣者），highlight 對應色點
  function updateActiveRail() {
    if (railLock) return;
    var secs = document.querySelectorAll('.hue-section');
    if (!secs.length) { setActiveRail(null); return; }
    // 捲到頁面底部：最後幾個矮區段的頂端永遠到不了視窗上緣 → 一律 highlight 最後一個色系
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
      setActiveRail(secs[secs.length - 1].id.replace('fam-', ''));
      return;
    }
    var threshold = 80;                 // 距視窗頂 80px 內視為「當前」
    var key = secs[0].id.replace('fam-', '');
    secs.forEach(function (sec) {
      if (sec.getBoundingClientRect().top <= threshold) key = sec.id.replace('fam-', '');
    });
    setActiveRail(key);
  }

  // 某檔的色系 key（未分析回 'pending'）
  function familyOf(f) {
    return (f && f.alias && f.alias.colors && f.alias.colors.length)
      ? Lib.hueFamily(Lib.representativeHue(f.alias))
      : 'pending';
  }
  // 以檔名找卡片 DOM（不用屬性選擇器，避開檔名含特殊字元）
  function findCardEl(name) {
    var cards = document.querySelectorAll('#gallery .pcard');
    for (var i = 0; i < cards.length; i++) if (cards[i].getAttribute('data-name') === name) return cards[i];
    return null;
  }
  // focus 某張圖：捲到它、短暫框選、並即時標出其色系（上傳完 / 分析完用）
  function focusImage(name) {
    var f = findFile(name);
    if (f) lockRail(familyOf(f), 1200);
    var el = findCardEl(name);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('focused');
    void el.offsetWidth;                // 重觸發框選動畫
    el.classList.add('focused');
    setTimeout(function () { el.classList.remove('focused'); }, 1600);
  }

  // ---- 上傳 --------------------------------------------------------------
  function handleFiles(fileList) {
    var arr = Array.prototype.slice.call(fileList || []);
    var imgs = arr.filter(function (file) { return Lib.isImage(file.name); });
    var skipped = arr.length - imgs.length;
    if (skipped > 0) toast('toast.notImage', 'orange', { n: skipped });
    if (!imgs.length) return;

    showLoading();
    var ok = 0, fail = 0, lastName = null;
    // 逐檔序列處理：上傳 → 重新讀清單取得該檔 mtime → 分析 → 落地
    var chain = Promise.resolve();
    imgs.forEach(function (file) {
      chain = chain.then(function () {
        return Lib.uploadFile(file)
          .then(function () { return Lib.listFiles(); })
          .then(function (list) {
            files = list;
            var f = findFile(file.name);
            if (!f) throw new Error('上傳後找不到檔案');
            return analyzeAndSave(f);
          })
          .then(function () { ok++; lastName = file.name; })
          .catch(function (err) { fail++; console.error('[color-palette] 上傳/分析失敗', file.name, err); });
      });
    });
    chain.then(function () {
      return refresh();
    }).then(function () {
      hideLoading();
      if (ok) toast('toast.uploaded', 'green', { n: ok });
      if (fail) toast('toast.uploadFail', 'red', { n: fail });
      // focus 到剛上傳（最後一張）的圖，並即時標出其色系
      if (lastName) focusImage(lastName);
    });
  }

  function findFile(name) {
    for (var i = 0; i < files.length; i++) if (files[i].name === name) return files[i];
    return null;
  }

  // ---- 清單重新載入 ------------------------------------------------------
  function refresh() {
    return Lib.listFiles()
      .then(function (list) { files = list; computeTags(); render(); })
      .catch(function (err) { toast('toast.listFail', 'red', { m: err.message }); });
  }

  // ---- 明細 Modal --------------------------------------------------------
  // 明細：三種萃取視圖（色族 median / 主色 frequency / 全收＝不濾近白黑）
  var detailData = null, detailView = 'family', detailColors = [];
  var llmEnabled = false;                       // 後端是否設定了 ANTHROPIC_API_KEY（GET /config）→ 決定是否顯示潤稿鈕
  var detailDesc = null, detailPortraitText = '';  // renderPortrait 存下的結構化描述與決定論句（供 LLM 潤稿重用）
  function detailOptsFor(view) {
    if (view === 'family') return { method: 'median', count: 12 };
    if (view === 'all') return { method: 'frequency', count: 12, skipNearWhite: false, skipNearBlack: false };
    return { method: 'frequency', count: 12 };   // dominant 主色
  }
  // 載入該圖像素到離屏（限 240px）供分頁即時重萃取
  function loadDetailPixels(f, cb) {
    detailData = null;
    var img = new Image();
    img.onload = function () {
      var nw = img.naturalWidth, nh = img.naturalHeight;
      if (!nw) { cb(); return; }
      var s = Math.min(1, 240 / Math.max(nw, nh));
      var w = Math.max(1, Math.round(nw * s)), h = Math.max(1, Math.round(nh * s));
      var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      var ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, w, h);
      try { detailData = ctx.getImageData(0, 0, w, h).data; } catch (e) { detailData = null; }
      cb();
    };
    img.onerror = function () { cb(); };
    img.src = versionedUrl(f);
  }
  function detailRowLi(c) {
    var pct = Math.round((c.ratio || 0) * 100);
    return $('<li>')
      .append($('<span class="detail-chip">').css('background', c.hex))
      .append($('<span class="detail-hex">').text(c.hex))
      .append($('<span class="detail-bar">').append($('<span>').css('width', Math.max(2, pct) + '%')))
      .append($('<span class="detail-ratio">').text(pct + '%'))
      .append(fcBadgeHtml(c.hex));
  }
  function renderDetailPalette() {
    $('#detail-tabs .detail-tab').each(function () {
      $(this).toggleClass('active', $(this).attr('data-view') === detailView);
    });
    var f = findFile(detailName);
    var colors;
    if (detailData) {
      // 分布＝ΔE≈5 感知分箱；重點色＝彩度加權顯著性；其餘走 median/frequency 萃取
      if (detailView === 'distribution') colors = Lib.distributionByDeltaE(detailData, { radius: 5 });
      else if (detailView === 'accent') colors = Lib.accentColors(detailData, { radius: 5 });
      else colors = Lib.extractPalette(detailData, detailOptsFor(detailView));
    } else {
      colors = (f && f.alias && f.alias.colors) || [];       // 後備：落地色票
    }
    detailColors = colors;
    var $list = $('#detail-list').empty();
    colors.forEach(function (c) { detailRowLi(c).appendTo($list); });
    $('#detail-sub').text(I18n.t('detail.sub', {
      method: I18n.t('detail.tab.' + detailView), n: colors.length, size: f ? Lib.formatSize(f.size) : ''
    }));
  }
  // 色彩肖像 v2 的注入項：圖庫語料（相對描述）＋ 本圖 alias（自身指標）＋ FC 名 hook（焦點命名）。
  //   語料與自身皆取「落地 alias 色」以求同源公平比較；describe 用 corpus/self、phrase 用 fcName。
  function portraitOpts(currentName) {
    var corpus = files.filter(function (x) {
      return x.name !== currentName && x.alias && x.alias.colors && x.alias.colors.length;
    }).map(function (x) { return x.alias.colors; });
    var cur = findFile(currentName);
    return {
      corpus: corpus,
      self: (cur && cur.alias && cur.alias.colors) || null,
      fcName: function (hex) { var m = fcNear(hex, 1)[0]; return m ? { code: m.code, name: fcLocalName(m.code, m.name) } : null; }
    };
  }
  // 色彩肖像：由五構面即時算一句描述填入 #detail-portrait（需 detailData；純邏輯在 ColorPortraitLib）
  function renderPortrait() {
    var $p = $('#detail-portrait'), $c = $('#detail-card');
    detailDesc = null; detailPortraitText = '';
    $p.removeClass('is-polished');
    if (!detailData || !window.ColorPortraitLib) { $p.text(''); $c.empty(); updatePolishBtn(); return; }
    try {
      var opts = portraitOpts(detailName);
      var desc = ColorPortraitLib.describe({
        dominant: Lib.extractPalette(detailData, { method: 'frequency', count: 12 }),
        distribution: Lib.distributionByDeltaE(detailData, { radius: 5, maxColors: 24 }),
        accent: Lib.accentColors(detailData, { radius: 5, maxColors: 24 })
      }, opts);
      var text = ColorPortraitLib.phrase(desc, I18n.t, opts);
      detailDesc = desc; detailPortraitText = text;
      $p.text(text);
      $c.html(ColorPortraitLib.card ? ColorPortraitLib.card(desc, I18n.t, opts) : '');
    } catch (e) { $p.text(''); $c.empty(); }
    updatePolishBtn();
  }
  // 潤稿鈕：僅在後端可用（llmEnabled）且已有一句肖像時顯示
  function updatePolishBtn() {
    $('#detail-polish').prop('hidden', !(llmEnabled && detailPortraitText));
  }
  // 給 LLM 的 grounding 事實（護欄，非內容來源）：語意 token + 已在地化的焦點色名
  function portraitFacts(desc, opts) {
    if (!desc) return null;
    var f = {};
    f.temperature = desc.temperature.bothWarmCool ? 'warm-cool' : String(desc.temperature.verdict || '').split('-')[0];
    if (desc.archetype) f.archetype = desc.archetype;
    if (desc.harmony && desc.harmony !== 'varied' && desc.harmony !== 'neutral') f.harmony = desc.harmony;
    if (desc.key) f.key = desc.key;
    if (Array.isArray(desc.families))
      f.families = desc.families.filter(function (x) { return x.key !== 'neutral'; }).slice(0, 4).map(function (x) { return x.key; });
    if (desc.focal) {
      var fc = opts && typeof opts.fcName === 'function' ? opts.fcName(desc.focal.hex) : null;
      f.focal = (fc && fc.name) ? (fc.name + ' (FC' + fc.code + ')') : desc.focal.family;
    }
    return f;
  }
  // 選配 LLM 潤稿：把決定論句 + 事實丟給後端改寫；成功則以潤稿版取代 UI 顯示（不落地、不進 .md/報告）
  function doPolish() {
    if (!llmEnabled || !detailDesc || !detailPortraitText) return;
    var name = detailName;                                   // 期間可能換圖 → 回來時比對
    var $p = $('#detail-portrait'), $b = $('#detail-polish');
    var facts = portraitFacts(detailDesc, portraitOpts(name));
    $b.addClass('busy').prop('disabled', true);
    Lib.polishPortrait({ sentence: detailPortraitText, locale: I18n.lang, facts: facts })
      .then(function (d) {
        $b.removeClass('busy').prop('disabled', false);
        if (detailName !== name) return;                     // 已換圖，丟棄本次結果
        if (d && d.ok && d.text) { $p.text(d.text).addClass('is-polished'); }
        else { toast(d && d.error === 'llm-not-configured' ? 'portrait.polish.unconfigured' : 'portrait.polish.fail', 'red'); }
      });
  }
  function openDetail(f) {
    detailName = f.name;
    $('#detail-image').attr('src', versionedUrl(f));
    $('#detail-name').text(f.name);
    $('#detail-portrait').text(''); $('#detail-card').empty();  // 清空，待像素載入後生成
    detailView = (f.alias && f.alias.method === 'frequency') ? 'dominant' : 'family';
    detailData = null;
    renderDetailPalette();                    // 先用落地色票即時顯示
    loadDetailPixels(f, function () { if (detailName === f.name) { renderDetailPalette(); renderPortrait(); } });  // 像素載入後即時萃取＋肖像
    M.Modal.getInstance(document.getElementById('detail-modal')).open();
  }
  // 複製目前視圖全部色碼（每行一個 hex）
  function copyAllDetail() {
    if (!detailColors.length) return;
    var text = detailColors.map(function (c) { return c.hex.toUpperCase(); }).join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(function () { toast('toast.copiedAll', 'teal', { n: detailColors.length }); })
        .catch(function () { toast('toast.copyFail', 'red'); });
    } else { toast('toast.copyFail', 'red'); }
  }
  // 產生目前視圖的色票 .md：左右兩欄——圖在左（寬約 A4 橫向 1/3），色票表在右
  //   整塊用 HTML（zero-md 把 raw HTML 區塊原樣渲染）；務必**單一連續區塊、無內部空行**（否則 marked 會提前結束 HTML 區塊）
  function mdEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  // 色塊：inline SVG <rect>（fill＝前景內容，列印/存 PDF 必印；不像 CSS 背景會被瀏覽器省略）
  function mdSwatchSvg(hex) {
    return '<svg width="15" height="15" viewBox="0 0 15 15" style="display:inline-block;vertical-align:middle">' +
           '<rect x="0.5" y="0.5" width="14" height="14" rx="3" fill="' + hex + '" stroke="#8886"/></svg>';
  }
  function mdFcCell(hex) {
    var m = fcNear(hex, 1)[0];
    return m ? ('<code>FC' + m.code + '</code> ' + mdEsc(fcLocalName(m.code, m.name)) + ' ΔE' + Math.round(m.deltaE)) : '—';
  }
  // 一段色票表（含表頭）；每列 break-inside:avoid＝跨頁時列不被切一半，thead 預設每頁重印
  function mdTableHtml(colors) {
    var rows = colors.map(function (c) {
      var pct = Math.round((c.ratio || 0) * 100) + '%';
      return '<tr style="break-inside:avoid;page-break-inside:avoid"><td>' + mdSwatchSvg(c.hex) +
             '</td><td><code>' + c.hex.toUpperCase() + '</code></td><td>' + pct + '</td><td>' + mdFcCell(c.hex) + '</td></tr>';
    }).join('');
    return '<table style="width:100%"><thead><tr><th></th><th>Hex</th><th>' + mdEsc(I18n.t('md.ratio')) +
           '</th><th>&#8776; Faber-Castell</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }
  // 總覽比例色帶：單一 SVG，寬 100%，各色寬度依 ratio（正規化到顯示總和填滿）；SVG＝前景，必印
  //   h＝顯示高度（px）；viewBox 高固定 10、preserveAspectRatio none → 垂直拉伸到 h（色塊等比變高）
  function mdBandSvg(colors, h) {
    h = h || 30;
    var total = colors.reduce(function (s, c) { return s + (c.ratio || 0); }, 0) || 1;
    var x = 0;
    var segs = colors.map(function (c) {
      var w = (c.ratio || 0) / total * 100;
      var r = '<rect x="' + x.toFixed(3) + '" y="0" width="' + w.toFixed(3) + '" height="10" fill="' + c.hex + '"/>';
      x += w; return r;
    }).join('');
    return '<svg viewBox="0 0 100 10" preserveAspectRatio="none" width="100%" height="' + h + '" ' +
           'style="display:block;border-radius:3px;overflow:hidden;border:1px solid #8883">' + segs + '</svg>';
  }
  // 圖框 style：寬 ≤ A4 橫向 1/3（297/3 ≈ 99mm）、高 ≤ 一頁可印（≈150mm）、等比縮到框內
  var MD_IMG_STYLE = 'display:block;max-width:99mm;max-height:150mm;width:auto;height:auto;border-radius:6px;border:1px solid #8883';
  function buildPaletteMd(f) {
    var stem = detailName.replace(/\.[^.]+$/, '');
    var sub = I18n.t('detail.tab.' + detailView) + ' · ' + detailColors.length + ' · ' + Lib.formatSize(f.size);
    var html =
      '<div style="display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap">' +
        '<div style="flex:0 0 auto;max-width:99mm">' +
          '<img src="' + versionedUrl(f) + '" alt="' + mdEsc(stem) + '" style="' + MD_IMG_STYLE + '">' +
          '<div style="font-size:.82em;opacity:.7;margin-top:6px">' + mdEsc(sub) + '</div>' +
        '</div>' +
        '<div style="flex:1 1 0;min-width:260px">' + mdTableHtml(detailColors) + '</div>' +
      '</div>';
    return ['## ' + stem + ' — ' + I18n.t('md.heading'), '', html, '', '<sub>' + I18n.t('md.footer') + '</sub>'].join('\n');
  }

  // 完整色彩報告（分頁版）：
  //   P1 總覽頭＝圖左 + 五條比例色帶（帶高 30＝原 12 的 2.5×）
  //   P2 色族 | 主色（兩欄，各 12）｜ P3 全收（單欄 12）
  //   P4 分布（兩欄，各 12＝24）｜ P5 重點色（兩欄，各 12＝24）
  //   分頁點：P2–P5 各自 break-before:page（強制新頁）；ratio 三種尺各段標題註明（見 COLOR-TYPES.md）。
  function buildReportMd(f) {
    var stem = detailName.replace(/\.[^.]+$/, '');
    // 取色：色族/主色/全收 12；分布/重點色 24（頁內分兩欄各 12）
    var fam = Lib.extractPalette(detailData, detailOptsFor('family')).slice(0, 12);
    var dom = Lib.extractPalette(detailData, detailOptsFor('dominant')).slice(0, 12);
    var all = Lib.extractPalette(detailData, detailOptsFor('all')).slice(0, 12);
    var dist = Lib.distributionByDeltaE(detailData, { radius: 5, maxColors: 36 });
    var acc = Lib.accentColors(detailData, { radius: 5, maxColors: 36 });
    var T = { fam: I18n.t('detail.tab.family'), dom: I18n.t('detail.tab.dominant'), all: I18n.t('detail.tab.all'),
              dist: I18n.t('detail.tab.distribution'), acc: I18n.t('detail.tab.accent') };
    var N = { area: I18n.t('md.note.area'), trueArea: I18n.t('md.note.trueArea'), sal: I18n.t('md.note.saliency') };

    function h3(name, note) {
      return '<h3 style="margin:0 0 6px">' + mdEsc(name) +
             ' <span style="font-size:.68em;font-weight:400;opacity:.6">· ' + mdEsc(note) + '</span></h3>';
    }
    function col(inner) { return '<div style="flex:1 1 0;min-width:0">' + inner + '</div>'; }
    function twoCol(left, right) { return '<div style="display:flex;gap:24px;align-items:flex-start">' + left + right + '</div>'; }
    // 多欄：每欄 12 色，最多 maxCols 欄；只為非空切片建欄（避免空表頭）
    function multiCol(colors, maxCols) {
      var cols = [];
      for (var i = 0; i < colors.length && cols.length < maxCols; i += 12) cols.push(col(mdTableHtml(colors.slice(i, i + 12))));
      return '<div style="display:flex;gap:18px;align-items:flex-start">' + cols.join('') + '</div>';
    }
    // 頁：強制換頁（block 上掛 break-before，非 flex 子項）
    function page(inner) { return '<div style="break-before:page;page-break-before:always;margin-top:6px">' + inner + '</div>'; }

    // 色彩肖像（五構面 → ColorPortraitLib，含相對圖庫＋FC 命名焦點）：一句描述 + 視覺指紋卡，放在色條區塊正上方
    var pOpts = portraitOpts(detailName);
    var pDesc = window.ColorPortraitLib ? ColorPortraitLib.describe({ dominant: dom, distribution: dist, accent: acc, families: fam }, pOpts) : null;
    var portrait = pDesc ? ColorPortraitLib.phrase(pDesc, I18n.t, pOpts) : '';
    var portraitCap = portrait
      ? '<p style="font-style:italic;opacity:.85;margin:0 0 10px;padding-left:10px;border-left:2px solid #8886">' + mdEsc(portrait) + '</p>'
      : '';
    var portraitCard = (pDesc && ColorPortraitLib.card)
      ? '<div style="margin:0 0 12px">' + ColorPortraitLib.card(pDesc, I18n.t, pOpts) + '</div>'
      : '';
    // P1 總覽頭（break-inside:avoid＝圖＋肖像＋五色帶不裂）；色帶高 15
    var bands = [
      { n: T.fam, o: N.area, c: fam }, { n: T.dom, o: N.area, c: dom }, { n: T.all, o: N.area, c: all },
      { n: T.dist, o: N.trueArea, c: dist }, { n: T.acc, o: N.sal, c: acc }
    ].map(function (b) {
      return '<div style="margin:0 0 10px"><div style="font-size:.85em;opacity:.72;margin-bottom:3px">' +
             mdEsc(b.n) + ' <span style="opacity:.6">· ' + mdEsc(b.o) + '</span></div>' + mdBandSvg(b.c, 15) + '</div>';
    }).join('');
    var overview =
      '<div style="break-inside:avoid;page-break-inside:avoid;display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap">' +
        '<div style="flex:0 0 auto;max-width:99mm">' +
          '<img src="' + versionedUrl(f) + '" alt="' + mdEsc(stem) + '" style="' + MD_IMG_STYLE + '">' +
          '<div style="font-size:.82em;opacity:.7;margin-top:6px">' + mdEsc(Lib.formatSize(f.size)) + '</div>' +
        '</div>' +
        '<div style="flex:1 1 0;min-width:260px">' + portraitCap + portraitCard + bands + '</div>' +
      '</div>';

    // P2 色族 | 主色（各含 h3）
    var p2 = page(twoCol(col(h3(T.fam, N.area) + mdTableHtml(fam)), col(h3(T.dom, N.area) + mdTableHtml(dom))));
    // P3 全收（單欄 12）
    var p3 = page('<div>' + h3(T.all, N.area) + mdTableHtml(all) + '</div>');
    // P4/P5 分布、重點色（各 ≤36 色）：
    //   特例——兩者都 ≤12 時，合成「一頁」（分布｜重點色，兩欄各一構面）；
    //   否則各自一頁、以三欄呈現（每欄 12，最多 3 欄＝36）。
    var distAcc = (dist.length <= 12 && acc.length <= 12)
      ? page(twoCol(col(h3(T.dist, N.trueArea) + mdTableHtml(dist)), col(h3(T.acc, N.sal) + mdTableHtml(acc))))
      : page(h3(T.dist, N.trueArea) + multiCol(dist, 3)) + page(h3(T.acc, N.sal) + multiCol(acc, 3));

    return ['## ' + stem + ' — ' + I18n.t('md.report.heading'), '', overview, p2, p3, distAcc, '', '<sub>' + I18n.t('md.footer') + '</sub>'].join('\n');
  }
  // 存成 .md 到 palettes/，並在 markdown-library 以 ?mymd 絕對路徑開啟
  function saveDetailMd() {
    var f = findFile(detailName); if (!f || !detailColors.length) return;
    var fname = detailName.replace(/\.[^.]+$/, '') + '-palette-' + detailView + '.md';
    showLoading();
    Lib.saveMd(fname, buildPaletteMd(f))
      .then(function (d) {
        hideLoading();
        toast('toast.mdSaved', 'green', { n: fname });
        window.open('/apps/markdown-library/?mymd=' + encodeURIComponent(d.path), '_blank', 'noopener');
      })
      .catch(function (err) { hideLoading(); toast('toast.mdFail', 'red', { m: err.message }); });
  }
  // 存「完整色彩報告」.md（五構面），並在 markdown-library 開啟。需已載入像素（五構面全要即時重算）。
  function saveReportMd() {
    var f = findFile(detailName); if (!f || !detailData) return;
    var fname = detailName.replace(/\.[^.]+$/, '') + '-palette-report.md';
    showLoading();
    Lib.saveMd(fname, buildReportMd(f))
      .then(function (d) {
        hideLoading();
        toast('toast.mdSaved', 'green', { n: fname });
        window.open('/apps/markdown-library/?mymd=' + encodeURIComponent(d.path), '_blank', 'noopener');
      })
      .catch(function (err) { hideLoading(); toast('toast.mdFail', 'red', { m: err.message }); });
  }

  // ---- 燈箱：細看原圖 ＋ 色票互動（縮放/色距的純數學在 lib，這裡碰 DOM/canvas） --
  var lbView = Lib.identityView();
  var lbDrag = null;                  // { x0, y0, tx0, ty0, moved }
  var lbColors = [];                  // 目前作用中的遮罩基準色盤 [{r,g,b,hex,...}]（隨基準切換）
  var lbAliasColors = [];             // 落地色票（'色票' 基準；開圖時即備妥）
  var lbBasis = 'alias';              // 遮罩基準：'alias'（落地色票）/ 'distribution'（分布）/ 'accent'（重點色）
  var lbSample = null;                // 離屏取樣：{ data, w, h }（getImageData）
  var lbActiveIdx = -1;               // 目前定位中的色票 index（單色 mask）
  var lbActiveFam = null;            // 目前定位中的色系 key（色系 mask）；與 lbActiveIdx 互斥
  var lbPinned = null;               // 釘住的取色點 { hex, idx }：hover 是即時預覽（放大鏡），釘住的固定在頂端且可複製

  function applyLbView() {
    document.getElementById('lightbox-frame').style.transform =
      'translate(' + lbView.tx + 'px,' + lbView.ty + 'px) scale(' + lbView.zoom + ')';
    document.getElementById('lightbox-zoom').textContent = Math.round(lbView.zoom * 100) + '%';
  }
  // 依 stage 尺寸把 frame 設成「contain 後的圖尺寸」（不放大超過原圖）。
  // img 與 mask 皆填滿 frame（CSS 100%）→ 遮罩恆等於整張圖、高圖在 identity view 就完整 fit。
  function fitLbFrame() {
    var stage = document.getElementById('lightbox-stage');
    var img = document.getElementById('lightbox-img');
    var frame = document.getElementById('lightbox-frame');
    var iw = img.naturalWidth, ih = img.naturalHeight;
    if (!iw || !ih) return;
    var s = Math.min(1, Math.min(stage.clientWidth / iw, stage.clientHeight / ih));
    frame.style.width = Math.round(iw * s) + 'px';
    frame.style.height = Math.round(ih * s) + 'px';
  }
  function openLightbox(name) {
    var f = findFile(name);
    if (!f) return;
    lbAliasColors = (f.alias && f.alias.colors) || [];
    lbBasis = 'alias'; lbColors = lbAliasColors;      // 開圖預設用落地色票；載入後可切換到 分布/重點色
    $('#lightbox-basis .lb-basis-btn').removeClass('active').filter('[data-basis="alias"]').addClass('active');
    lbView = Lib.identityView();
    clearMask();
    buildLbPalette();
    lbPinned = null; hidePick();
    var img = document.getElementById('lightbox-img');
    lbSample = null;
    var onLoad = function () { if (img.naturalWidth) { fitLbFrame(); prepLbSample(img); buildLbFamilies(); } };
    img.onload = onLoad;
    img.src = versionedUrl(f);
    if (img.complete && img.naturalWidth) onLoad();   // 快取命中時 onload 可能不觸發
    document.getElementById('lightbox-name').textContent = name;
    applyLbView();
    document.getElementById('lightbox').classList.add('show');
  }
  function closeLightbox() {
    document.getElementById('lightbox').classList.remove('show');
    document.getElementById('lightbox-img').src = '';   // 釋放
    lbPinned = null; clearMask(); hidePick(); hideLoupe(); lbSample = null;
  }
  function lbIsOpen() { return document.getElementById('lightbox').classList.contains('show'); }

  // 離屏畫圖 → 取像素（限最長邊 1400px，供滴管/放大鏡/mask 分類；同源不會 taint）
  function prepLbSample(img) {
    var nw = img.naturalWidth, nh = img.naturalHeight;
    var s = Math.min(1, 1400 / Math.max(nw, nh));
    var w = Math.max(1, Math.round(nw * s)), h = Math.max(1, Math.round(nh * s));
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    var ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    // 另備一張 240px 小樣本：供「遮罩基準」切換時即時重算 分布/重點色（比全解析度快很多）
    var small = null;
    try {
      var ss = Math.min(1, 240 / Math.max(nw, nh));
      var sw = Math.max(1, Math.round(nw * ss)), sh = Math.max(1, Math.round(nh * ss));
      var scv = document.createElement('canvas'); scv.width = sw; scv.height = sh;
      var sctx = scv.getContext('2d', { willReadFrequently: true });
      sctx.drawImage(img, 0, 0, sw, sh);
      small = sctx.getImageData(0, 0, sw, sh).data;
    } catch (e) { small = null; }
    try { lbSample = { cv: cv, data: ctx.getImageData(0, 0, w, h).data, w: w, h: h, small: small }; }
    catch (e) { lbSample = null; }
  }

  // 建色票側欄（依 alias 色票，已 hue 排序）；只清色票列，保留頂部取色器
  function buildLbPalette() {
    var $p = $('#lightbox-swatches').empty();
    lbColors.forEach(function (c, i) {
      var pct = Math.round((c.ratio || 0) * 100);
      var $info = $('<div class="lb-sw-info">')
        .append($('<div class="lb-sw-top">')
          .append($('<span class="lb-sw-hex">').text(c.hex))
          .append($('<span class="lb-sw-pct">').text(pct + '%')));
      var m = fcNear(c.hex, 1)[0];   // 最接近的實體 FC 色鉛
      if (m) {
        $('<div class="lb-sw-fc">')
          .attr('title', 'FC' + m.code + ' ' + m.name + ' · ΔE' + m.deltaE.toFixed(1))
          .append($('<span class="lb-sw-fcchip">').css('background', m.hex))
          .append($('<span class="lb-sw-fccode">').text('FC' + m.code))
          .append($('<span class="lb-sw-fcname">').text(m.name))
          .appendTo($info);
      }
      $('<div class="lb-swatch">').attr('data-idx', i).attr('title', c.hex)
        .append($('<span class="chip">').css('background', c.hex))
        .append($info)
        .appendTo($p);
    });
  }

  // 色系遮罩的 chip 列：掃 lbSample 統計各色系覆蓋（含中性），只列 ≥2% 者，依 FAMILY_ORDER。
  //   點一個 chip → 該色系像素全透出、其餘變暗（Lib.familyOf 逐像素分類，與 gallery 分群同源）。
  function buildLbFamilies() {
    var $c = $('#lightbox-families').empty();
    if (!lbSample) return;
    var d = lbSample.data, counts = {}, total = 0;
    for (var i = 0; i < d.length; i += 32) {           // 每 8 像素取樣一次（夠準、夠快）
      var f = Lib.familyOf(d[i], d[i + 1], d[i + 2]);
      counts[f] = (counts[f] || 0) + 1; total++;
    }
    if (!total) return;
    Lib.FAMILY_ORDER.forEach(function (fam) {
      var pct = counts[fam] ? counts[fam] / total : 0;
      if (pct < 0.02) return;                          // 只列覆蓋 ≥2% 的色系
      var mid = Lib.familyMidHue(fam);
      var col = mid == null ? '#8a8a8a' : 'hsl(' + Math.round(mid) + ',52%,52%)';
      $('<button type="button" class="lb-family">').attr('data-fam', fam)
        .attr('title', I18n.t('family.' + fam) + ' · ' + Math.round(pct * 100) + '%')
        .append($('<span class="lb-fam-chip">').css('background', col))
        .append($('<span class="lb-fam-label">').text(I18n.t('family.' + fam)))
        .toggleClass('active', lbActiveFam === fam)
        .appendTo($c);
    });
  }

  // 遮罩基準：切換色票列＝落地色票 / 分布(ΔE≈5) / 重點色(彩度加權)，供「對著某個 COLOR-TYPE 遮罩」。
  //   分布/重點色由 240px 小樣本即時重算（純函式）；切換後色票列、單色遮罩、滴管高亮都改對這個色盤。
  function setLbBasis(basis) {
    var cols;
    if (basis === 'distribution' || basis === 'accent') {
      if (!lbSample || !lbSample.small) return;                 // 需像素（載入後才可）
      // 與明細「分布/重點色」視圖同參數（省略 maxColors → 用 lib 預設：分布 24、重點色 12），
      // 免得燈箱分布色數少於明細的「實際分布」。
      cols = (basis === 'distribution')
        ? Lib.distributionByDeltaE(lbSample.small, { radius: 5 })
        : Lib.accentColors(lbSample.small, { radius: 5 });
    } else { basis = 'alias'; cols = lbAliasColors; }
    if (!cols || !cols.length) { toast('lightbox.basisEmpty', 'orange'); return; }   // 算不出色（如無重點色）→ 不切
    lbBasis = basis; lbColors = cols;
    lbPinned = null; hidePick(); clearMask();
    buildLbPalette();
    $('#lightbox-basis .lb-basis-btn').removeClass('active').filter('[data-basis="' + basis + '"]').addClass('active');
  }

  // 滴管讀值列（pinned＝釘住狀態：accent 環＋可點擊複製＋✕ 取消）
  function showPick(hex, pinned) {
    var $p = $('#lightbox-pick').prop('hidden', false).toggleClass('pinned', !!pinned);
    $p.attr('title', pinned ? I18n.t('lightbox.copyHint') : '');
    $p.find('.lightbox-pick-chip').css('background', hex);
    $p.find('.lightbox-pick-hex').text(hex);
    var $fc = $p.find('.lightbox-pick-fc');
    if (!$fc.length) $fc = $('<span class="lightbox-pick-fc">').appendTo($p);
    $fc.html(fcLineHtml(hex));
  }
  function hidePick() { $('#lightbox-pick').prop('hidden', true).removeClass('pinned').attr('title', ''); setHotSwatch(-1); }
  // 釘住游標所在點的顏色（hover 是即時預覽；釘住的固定在頂端供比對／複製）
  function pinAt(clientX, clientY) {
    var s = lbSampleAt(clientX, clientY);
    if (!s) return;
    lbPinned = { hex: s.hex, idx: Lib.nearestSwatchIndex(s.r, s.g, s.b, lbColors) };
    showPick(s.hex, true);
    setHotSwatch(lbPinned.idx);
  }
  function unpin() { lbPinned = null; hidePick(); }
  // 複製釘住的 hex（大寫；比照 copyAllDetail 的 clipboard 慣例）
  function copyPinnedHex() {
    if (!lbPinned) return;
    var t = lbPinned.hex.toUpperCase();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t)
        .then(function () { toast('lightbox.copied', 'teal', { hex: t }); })
        .catch(function () { toast('toast.copyFail', 'red'); });
    } else { toast('toast.copyFail', 'red'); }
  }
  function setHotSwatch(idx) {
    $('#lightbox-palette .lb-swatch').removeClass('hot');
    if (idx >= 0) $('#lightbox-palette .lb-swatch[data-idx="' + idx + '"]').addClass('hot');
  }

  // 螢幕座標 → 取樣像素（經 img rect，已含縮放/平移）；回 {px,py,r,g,b,hex} 或 null
  function lbSampleAt(clientX, clientY) {
    if (!lbSample) return null;
    var rect = document.getElementById('lightbox-img').getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    var u = (clientX - rect.left) / rect.width, v = (clientY - rect.top) / rect.height;
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    var px = Math.max(0, Math.min(lbSample.w - 1, Math.round(u * lbSample.w)));
    var py = Math.max(0, Math.min(lbSample.h - 1, Math.round(v * lbSample.h)));
    var o = (py * lbSample.w + px) * 4, d = lbSample.data;
    return { px: px, py: py, r: d[o], g: d[o + 1], b: d[o + 2], hex: Lib.rgbToHex(d[o], d[o + 1], d[o + 2]) };
  }

  // 滴管：由游標取像素色 → 讀值 + 亮最近色票 + 更新放大鏡
  function eyedrop(clientX, clientY) {
    if (!lbColors.length) { hideLoupe(); return; }
    var s = lbSampleAt(clientX, clientY);
    if (!s) { hideLoupe(); if (!lbPinned) hidePick(); return; }
    if (!lbPinned) {                              // 未釘住：頂端讀值＋側欄高亮跟即時取色走
      showPick(s.hex, false);
      setHotSwatch(Lib.nearestSwatchIndex(s.r, s.g, s.b, lbColors));
    }
    updateLoupe(s, clientX, clientY);             // 放大鏡永遠顯示游標下的即時色（釘住時＝拿來跟釘住值比對）
  }

  // 放大鏡：從取樣 canvas 放大 15px 窗、畫十字準星、hex，跟隨游標（比照 thangka-trace）
  function updateLoupe(s, cx, cy) {
    if (!lbSample || !lbSample.cv) return;
    var cv = document.getElementById('loupe-canvas'), ctx = cv.getContext('2d');
    var span = 15, half = (span - 1) / 2;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(lbSample.cv, s.px - half, s.py - half, span, span, 0, 0, cv.width, cv.height);
    var cell = cv.width / span;                       // 中央那格＝取樣像素，畫黑/白雙框準星
    ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.lineWidth = 1;
    ctx.strokeRect(half * cell + 0.5, half * cell + 0.5, cell - 1, cell - 1);
    ctx.strokeStyle = 'rgba(255,255,255,.95)';
    ctx.strokeRect(half * cell - 0.5, half * cell - 0.5, cell + 1, cell + 1);
    document.getElementById('loupe-hex').innerHTML = s.hex + '<span class="loupe-fc">' + fcLineHtml(s.hex) + '</span>';
    var lw = 150, lh = 176, left = cx + 20, top = cy + 20;   // 跟隨游標、近邊翻向
    if (left + lw > window.innerWidth) left = cx - 20 - lw;
    if (top + lh > window.innerHeight) top = cy - 20 - lh;
    var el = document.getElementById('picker-loupe');
    el.style.left = Math.max(4, left) + 'px';
    el.style.top = Math.max(4, top) + 'px';
    el.classList.add('show');
  }
  function hideLoupe() { document.getElementById('picker-loupe').classList.remove('show'); }

  // 色塊定位：依 predicate（逐像素匹配）畫遮罩——匹配的像素透出、其餘變暗（mask 疊在圖上、共用 frame transform）
  function paintMask(match) {
    if (!lbSample) return false;
    var mask = document.getElementById('lightbox-mask');
    mask.width = lbSample.w; mask.height = lbSample.h;
    var mctx = mask.getContext('2d');
    var out = mctx.createImageData(lbSample.w, lbSample.h);
    var src = lbSample.data, od = out.data;
    for (var i = 0; i < src.length; i += 4) {
      if (match(src[i], src[i + 1], src[i + 2])) { od[i + 3] = 0; }              // 匹配：透明（原圖透出）
      else { od[i] = 8; od[i + 1] = 10; od[i + 2] = 14; od[i + 3] = 194; }        // 其餘：暗遮
    }
    mctx.putImageData(out, 0, 0);
    mask.classList.add('show');
    return true;
  }
  // 單色遮罩：像素最近色票 === idx（與色系遮罩互斥）
  function showMask(idx) {
    if (!paintMask(function (r, g, b) { return Lib.nearestSwatchIndex(r, g, b, lbColors) === idx; })) return;
    lbActiveIdx = idx; lbActiveFam = null;
    $('#lightbox-families .lb-family').removeClass('active');
    $('#lightbox-palette .lb-swatch').removeClass('active').filter('[data-idx="' + idx + '"]').addClass('active');
  }
  // 色系遮罩：像素色系 === fam（把整個色群透出；與單色遮罩互斥）
  function showFamilyMask(fam) {
    if (!paintMask(function (r, g, b) { return Lib.familyOf(r, g, b) === fam; })) return;
    lbActiveFam = fam; lbActiveIdx = -1;
    $('#lightbox-palette .lb-swatch').removeClass('active');
    $('#lightbox-families .lb-family').removeClass('active').filter('[data-fam="' + fam + '"]').addClass('active');
  }
  function clearMask() {
    document.getElementById('lightbox-mask').classList.remove('show');
    lbActiveIdx = -1; lbActiveFam = null;
    $('#lightbox-palette .lb-swatch').removeClass('active');
    $('#lightbox-families .lb-family').removeClass('active');
  }
  // 游標相對舞台中心的座標（zoom-to-cursor 用）
  function lbCenterXY(e, stage) {
    var r = stage.getBoundingClientRect();
    return [e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2];
  }

  function bindLightbox() {
    var stage = document.getElementById('lightbox-stage');
    var img = document.getElementById('lightbox-img');

    // 明細縮圖 → 開燈箱
    $('#detail-image').on('click', function () { if (detailName) openLightbox(detailName); });

    // 滾輪：以游標為錨縮放
    stage.addEventListener('wheel', function (e) {
      e.preventDefault();
      var c = lbCenterXY(e, stage);
      lbView = Lib.zoomAt(lbView, Math.exp(-e.deltaY * 0.0015), c[0], c[1]);
      applyLbView();
    }, { passive: false });

    // 拖曳平移（pointer；記錄位移量以區分「點擊背景關閉」）
    stage.addEventListener('pointerdown', function (e) {
      // onStage＝按下當時就在舞台空白處（非圖片）。務必在 setPointerCapture 之前記——
      // capture 後 pointerup 的 target 會被重導成 stage，不能用它判斷點在哪。
      lbDrag = { x0: e.clientX, y0: e.clientY, tx0: lbView.tx, ty0: lbView.ty, moved: false, onStage: (e.target === stage) };
      stage.classList.add('grabbing');
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', function (e) {
      if (lbDrag) {                       // 拖曳中 → 平移（藏放大鏡）
        var dx = e.clientX - lbDrag.x0, dy = e.clientY - lbDrag.y0;
        if (Math.abs(dx) + Math.abs(dy) > 3) lbDrag.moved = true;
        lbView = { zoom: lbView.zoom, tx: lbDrag.tx0 + dx, ty: lbDrag.ty0 + dy };
        applyLbView(); hideLoupe();
      } else {                            // 未拖曳 → 滴管取色 + 放大鏡
        eyedrop(e.clientX, e.clientY);
      }
    });
    stage.addEventListener('pointerleave', function () { hideLoupe(); if (!lbPinned) hidePick(); });
    stage.addEventListener('pointerup', function (e) {
      var wasDrag = lbDrag && lbDrag.moved;
      var onStage = lbDrag && lbDrag.onStage;   // 用按下當時的位置（capture 會把 pointerup.target 重導成 stage）
      lbDrag = null;
      stage.classList.remove('grabbing');
      if (wasDrag) return;
      if (onStage) closeLightbox();               // 點在舞台空白處（非圖片）→ 關閉
      else pinAt(e.clientX, e.clientY);           // 點在圖片上 → 釘住該點顏色
    });

    // 色票側欄：點色票 → 在圖上定位該色區域（再點同一個 → 取消）
    $('#lightbox-palette').on('click', '.lb-swatch', function () {
      var idx = +$(this).attr('data-idx');
      if (lbActiveIdx === idx) clearMask(); else showMask(idx);
    });
    // 色系 chip → 定位整個色群（再點同一個 → 取消）
    $('#lightbox-families').on('click', '.lb-family', function () {
      var fam = $(this).attr('data-fam');
      if (lbActiveFam === fam) clearMask(); else showFamilyMask(fam);
    });
    // 遮罩基準：色票 / 分布 / 重點色（切換色票列所依的 COLOR-TYPE）
    $('#lightbox-basis').on('click', '.lb-basis-btn', function () {
      var b = $(this).attr('data-basis');
      if (b !== lbBasis) setLbBasis(b);
    });
    // 釘住的讀值：點 ✕ 取消釘選；點其餘處複製 hex
    $('#lightbox-pick').on('click', function (e) {
      if ($(e.target).closest('.lightbox-pick-unpin').length) { unpin(); return; }
      copyPinnedHex();
    });

    // 雙擊：fit ↔ 放大到 4× 於游標處
    img.addEventListener('dblclick', function (e) {
      var c = lbCenterXY(e, stage);
      lbView = lbView.zoom > 1.01 ? Lib.identityView() : Lib.zoomAt(Lib.identityView(), 4, c[0], c[1]);
      applyLbView();
    });

    // 縮放到符合視窗：重設為 identity view（fitLbFrame 已把 frame 設成 contain 尺寸，故 zoom 1 ＝ fit）
    document.getElementById('lightbox-fit').addEventListener('click', function () { fitLbFrame(); lbView = Lib.identityView(); applyLbView(); });
    document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
    // 視窗尺寸變動時，若燈箱開著就重新 fit（frame 依 stage 重算；遮罩/圖為 100% 隨之更新）
    window.addEventListener('resize', function () { if (lbIsOpen()) fitLbFrame(); });
    // Esc 關閉（capture：先於 Materialize modal 的 Esc，避免同時關掉底下的明細）
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && lbIsOpen()) { e.stopImmediatePropagation(); e.preventDefault(); closeLightbox(); }
    }, true);
  }

  // ---- 事件繫結 ----------------------------------------------------------
  function bind() {
    var picker = document.getElementById('file-picker');

    // 空狀態 / 上傳鍵 → 開檔案選擇器
    $('#empty-state, #setting-upload').on('click', function () {
      if (this.id === 'setting-upload') setIconDone($(this));
      picker.click();
    });
    $(picker).on('change', function () { handleFiles(this.files); this.value = ''; });

    // 卡片點擊：pending → 分析（完成後 focus）；已分析 → 選取（即時標出色系）＋開明細
    $('#gallery').on('click', '.pcard', function () {
      var name = $(this).attr('data-name');
      var f = findFile(name);
      if (!f) return;
      if (f.alias && f.alias.colors && f.alias.colors.length) {
        lockRail(familyOf(f), 1200);      // 選一張圖 → 即時標出其色系
        openDetail(f);
      } else {
        showLoading();
        analyzeAndSave(f)
          .then(function () { return refresh(); })
          .then(function () { hideLoading(); toast('toast.analyzed', 'teal', { n: name }); focusImage(name); })
          .catch(function (err) { hideLoading(); toast('toast.analyzeFail', 'red', { n: name, m: err.message }); });
      }
    });

    // 明細 → 以目前萃取法重新分析
    $('#detail-reanalyze').on('click', function () {
      var f = findFile(detailName);
      if (!f) return;
      showLoading();
      analyzeAndSave(f)
        .then(function () { return refresh(); })
        .then(function () { hideLoading(); var nf = findFile(detailName); if (nf) { lockRail(familyOf(nf), 1200); openDetail(nf); } })
        .catch(function (err) { hideLoading(); toast('toast.analyzeFail', 'red', { n: f.name, m: err.message }); });
    });

    // 明細 → 刪除這一張圖（連同 registry alias）；確認後關明細/燈箱並重整
    $('#detail-delete').on('click', function () {
      var name = detailName;
      if (!name) return;
      if (!confirm(I18n.t('confirm.deleteOne', { n: name }))) return;
      showLoading();
      Lib.deleteFile(name)
        .then(function () {
          if (lbIsOpen()) closeLightbox();
          var mi = M.Modal.getInstance(document.getElementById('detail-modal')); if (mi) mi.close();
          return refresh();
        })
        .then(function () { hideLoading(); toast('toast.deleted', 'green', { n: name }); })
        .catch(function (err) { hideLoading(); toast('toast.deleteFail', 'red', { m: err.message }); });
    });

    // 明細萃取視圖分頁（色族 / 主色 / 全收）→ 即時重萃取
    $('#detail-tabs').on('click', '.detail-tab', function () {
      detailView = $(this).attr('data-view');
      renderDetailPalette();
    });
    $('#detail-copyall').on('click', copyAllDetail);
    $('#detail-md').on('click', saveDetailMd);
    $('#detail-report').on('click', saveReportMd);
    $('#detail-polish').on('click', doPolish);   // 選配 LLM 潤稿

    // 萃取法切換（median ↔ frequency）
    $('#setting-method').on('click', function () {
      var idx = Lib.METHODS.indexOf(method);
      method = Lib.METHODS[(idx + 1) % Lib.METHODS.length];
      try { localStorage.setItem(METHOD_KEY, method); } catch (e) { }
      updateMethodTool();
      toast('toast.method', 'teal', { m: I18n.t('method.' + method) });
    });

    // 以目前萃取法重新分析全部
    $('#setting-reanalyze').on('click', function () {
      var $t = $(this);
      if (!files.length) { toast('toast.noFiles', 'grey'); return; }
      setIconDone($t);
      showLoading();
      var chain = Promise.resolve();
      var done = 0, fail = 0;
      files.forEach(function (f) {
        chain = chain.then(function () {
          return analyzeAndSave(f).then(function () { done++; })
            .catch(function (err) { fail++; console.error('[color-palette] 重新分析失敗', f.name, err); });
        });
      });
      chain.then(function () { return refresh(); }).then(function () {
        hideLoading();
        toast('toast.reanalyzed', fail ? 'orange' : 'teal', { n: done });
      });
    });

    // 瀏覽密度切換：縮圖 ↔ 色票牆
    $('#setting-density').on('click', function () {
      setDensity(density === 'compact' ? 'comfortable' : 'compact');
    });

    // 依色彩肖像篩選：開關篩選列 / 點 chip 切換 / 清除
    $('#setting-filter').on('click', function () { $(this).toggleClass('active'); buildFilterBar(); });
    $('#filter-bar').on('click', '.filter-chip', function () {
      var tag = $(this).attr('data-tag');
      if (filterSet[tag]) delete filterSet[tag]; else filterSet[tag] = true;
      render();
    });
    $('#filter-bar').on('click', '.filter-clear', function () { filterSet = {}; render(); });

    // 跳轉色軌：捲到該色系區段（點下即先標記 active，捲動後由 scroll-spy 維持正確）
    $('#jump-rail').on('click', '.jump-dot', function () {
      var key = $(this).attr('data-key');
      setActiveRail(key);
      var sec = document.getElementById('fam-' + key);
      if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // 捲動時即時更新目前色系指示（rAF 節流）
    var railTick = false;
    $(window).on('scroll', function () {
      if (railTick) return;
      railTick = true;
      requestAnimationFrame(function () { railTick = false; updateActiveRail(); });
    });

    // 主題切換
    $('#setting-mode').on('click', function () {
      var cur = document.documentElement.getAttribute('data-theme');
      setTheme(cur === 'dark' ? 'light' : 'dark');
    });

    // 語言循環（canon：引擎 I18n.cycle() 切下一個語言並回傳新 code；toast 以切換後語言顯示名稱）
    $('#setting-lang').on('click', function () {
      setIconDone($(this));
      var next = I18n.cycle();
      toast('toast.lang', 'teal', { name: I18n.name(next) });
    });

    // 清空資料夾
    $('#setting-clear').on('click', function () {
      var $t = $(this);
      if (!confirm(I18n.t('confirm.clear'))) return;
      setIconDone($t);
      showLoading();
      Lib.clearFolder()
        .then(function (d) { return refresh().then(function () { return d; }); })
        .then(function (d) { hideLoading(); toast('toast.cleared', 'green', { n: d.removed }); })
        .catch(function (err) { hideLoading(); toast('toast.clearFail', 'red', { m: err.message }); });
    });

    bindDragDrop();
    bindLightbox();
    // i18n 切換後：更新工具 title、重繪分區（色系標頭/色軌換語言）、若明細開啟則重繪
    document.addEventListener('i18n:changed', function () {
      updateMethodTool();
      updateDensityTool();
      render();
      if (detailName && $('#detail-modal').hasClass('open')) { renderDetailPalette(); renderPortrait(); }  // 重繪明細＋肖像（換語言，保留分頁）
    });
  }

  // 全頁拖拉（enter/leave 計數避免子元素閃爍）
  function bindDragDrop() {
    var depth = 0;
    var $ov = $('#drop-overlay');
    $(window).on('dragenter', function (e) { e.preventDefault(); depth++; $ov.addClass('show'); });
    $(window).on('dragover', function (e) { e.preventDefault(); });
    $(window).on('dragleave', function (e) { e.preventDefault(); if (--depth <= 0) { depth = 0; $ov.removeClass('show'); } });
    $(window).on('drop', function (e) {
      e.preventDefault(); depth = 0; $ov.removeClass('show');
      var dt = e.originalEvent.dataTransfer;
      if (dt && dt.files && dt.files.length) handleFiles(dt.files);
    });
  }

  function updateMethodTool() {
    var $t = $('#setting-method');
    $t.attr('title', I18n.t('tool.method') + '：' + I18n.t('method.' + method));
    // 頻率法時以 accent 標示啟用態（median 為預設）
    $t.toggleClass('active', method === 'frequency');
  }

  function setDensity(d) {
    density = (d === 'compact') ? 'compact' : 'comfortable';
    try { localStorage.setItem(DENSITY_KEY, density); } catch (e) { }
    updateDensityTool();
  }
  function updateDensityTool() {
    $('body').toggleClass('density-compact', density === 'compact');
    var $t = $('#setting-density');
    $t.toggleClass('active', density === 'compact');   // 色票牆模式以 accent 標示
    $t.attr('title', I18n.t('tool.density') + '：' +
      I18n.t(density === 'compact' ? 'density.compact' : 'density.comfortable'));
  }

  function setTheme(t) {
    var r = document.documentElement;
    r.setAttribute('data-theme', t);
    r.classList.toggle('dark-mode', t === 'dark');
    r.classList.toggle('light-mode', t === 'light');
    try { localStorage.setItem(THEME_KEY, t); } catch (e) { }
    $('#setting-mode i').text(t === 'dark' ? 'dark_mode' : 'light_mode');
  }

  // ---- 啟動 --------------------------------------------------------------
  $(function () {
    M.Modal.init(document.querySelectorAll('.modal'), { dismissible: true });
    I18n.apply(document);

    // 依現有主題設好 mode icon
    setTheme(document.documentElement.getAttribute('data-theme') || 'dark');
    updateMethodTool();
    updateDensityTool();

    bind();
    refresh();

    // 探詢後端是否設定了 LLM 潤稿（ANTHROPIC_API_KEY）；有才顯示明細裡的潤稿鈕
    Lib.getConfig().then(function (c) {
      llmEnabled = !!(c && c.ok && c.llm);
      if (llmEnabled) updatePolishBtn();
    });
  });
})();
