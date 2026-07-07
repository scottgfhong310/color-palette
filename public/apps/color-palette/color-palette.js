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
  // 明細每列：主色 FC 標籤 + 2 個替代色小片（A+B 合一）
  function fcBadgeHtml(hex) {
    var ms = fcNear(hex, 3); if (!ms.length) return '';
    var p = ms[0];
    var alts = ms.slice(1).map(function (m) {
      return '<span class="fc-alt" title="FC' + m.code + ' ' + _.escape(m.name) + ' · ΔE' + m.deltaE.toFixed(1) + '" style="background:' + m.hex + '"></span>';
    }).join('');
    return '<span class="fc-near">≈'
      + '<span class="fc-near-chip" style="background:' + p.hex + '"></span>'
      + '<span class="fc-near-code">FC' + p.code + '</span>'
      + '<span class="fc-near-name">' + _.escape(p.name) + '</span>'
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
      + '<span class="fc-near-name">' + _.escape(m.name) + '</span>'
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
        resolve(palette);
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
    return analyzeImage(versionedUrl(f), method).then(function (palette) {
      return Lib.saveAlias(f.name, palette).then(function (d) { return d.alias; });
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

  function render() {
    var $g = $('#gallery').empty();
    // 依代表色相排序（同色系相鄰）；相同時以修改時間新→舊
    var sorted = files.slice().sort(function (a, b) {
      var c = Lib.compareByHue(a.alias, b.alias);
      return c !== 0 ? c : (b.mtime - a.mtime);
    });
    $('body').toggleClass('is-empty', sorted.length === 0);

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
      .then(function (list) { files = list; render(); })
      .catch(function (err) { toast('toast.listFail', 'red', { m: err.message }); });
  }

  // ---- 明細 Modal --------------------------------------------------------
  function openDetail(f) {
    detailName = f.name;
    $('#detail-image').attr('src', versionedUrl(f));
    $('#detail-name').text(f.name);
    $('#detail-sub').text(
      I18n.t('detail.sub', {
        method: I18n.t('method.' + f.alias.method),
        n: f.alias.colors.length,
        size: Lib.formatSize(f.size)
      })
    );
    var $list = $('#detail-list').empty();
    f.alias.colors.forEach(function (c) {
      var pct = Math.round((c.ratio || 0) * 100);
      $('<li>')
        .append($('<span class="detail-chip">').css('background', c.hex))
        .append($('<span class="detail-hex">').text(c.hex))
        .append($('<span class="detail-bar">').append($('<span>').css('width', Math.max(2, pct) + '%')))
        .append($('<span class="detail-ratio">').text(pct + '%'))
        .append(fcBadgeHtml(c.hex))
        .appendTo($list);
    });
    M.Modal.getInstance(document.getElementById('detail-modal')).open();
  }

  // ---- 燈箱：細看原圖 ＋ 色票互動（縮放/色距的純數學在 lib，這裡碰 DOM/canvas） --
  var lbView = Lib.identityView();
  var lbDrag = null;                  // { x0, y0, tx0, ty0, moved }
  var lbColors = [];                  // 目前圖的色票 [{r,g,b,hex,...}]
  var lbSample = null;                // 離屏取樣：{ data, w, h }（getImageData）
  var lbActiveIdx = -1;               // 目前定位中的色票 index（mask）

  function applyLbView() {
    document.getElementById('lightbox-frame').style.transform =
      'translate(' + lbView.tx + 'px,' + lbView.ty + 'px) scale(' + lbView.zoom + ')';
    document.getElementById('lightbox-zoom').textContent = Math.round(lbView.zoom * 100) + '%';
  }
  function openLightbox(name) {
    var f = findFile(name);
    if (!f) return;
    lbColors = (f.alias && f.alias.colors) || [];
    lbView = Lib.identityView();
    clearMask();
    buildLbPalette();
    hidePick();
    var img = document.getElementById('lightbox-img');
    lbSample = null;
    var onLoad = function () { if (img.naturalWidth) prepLbSample(img); };
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
    clearMask(); hidePick(); hideLoupe(); lbSample = null;
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
    try { lbSample = { cv: cv, data: ctx.getImageData(0, 0, w, h).data, w: w, h: h }; }
    catch (e) { lbSample = null; }
  }

  // 建色票側欄（依 alias 色票，已 hue 排序）；只清色票列，保留頂部取色器
  function buildLbPalette() {
    var $p = $('#lightbox-swatches').empty();
    lbColors.forEach(function (c, i) {
      $('<div class="lb-swatch">').attr('data-idx', i)
        .append($('<span class="chip">').css('background', c.hex))
        .append($('<span class="hex">').text(c.hex))
        .appendTo($p);
    });
  }

  // 滴管讀值列
  function showPick(hex) {
    var $p = $('#lightbox-pick').prop('hidden', false);
    $p.find('.lightbox-pick-chip').css('background', hex);
    $p.find('.lightbox-pick-hex').text(hex);
    var $fc = $p.find('.lightbox-pick-fc');
    if (!$fc.length) $fc = $('<span class="lightbox-pick-fc">').appendTo($p);
    $fc.html(fcLineHtml(hex));
  }
  function hidePick() { $('#lightbox-pick').prop('hidden', true); setHotSwatch(-1); }
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
    if (!s) { hidePick(); hideLoupe(); return; }
    showPick(s.hex);
    setHotSwatch(Lib.nearestSwatchIndex(s.r, s.g, s.b, lbColors));
    updateLoupe(s, clientX, clientY);
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

  // 色塊定位：把「最近色票＝idx」的像素透出、其餘變暗（mask 疊在圖上、共用 frame transform）
  function showMask(idx) {
    if (!lbSample) return;
    var mask = document.getElementById('lightbox-mask');
    mask.width = lbSample.w; mask.height = lbSample.h;
    var mctx = mask.getContext('2d');
    var out = mctx.createImageData(lbSample.w, lbSample.h);
    var src = lbSample.data, od = out.data;
    for (var i = 0; i < src.length; i += 4) {
      if (Lib.nearestSwatchIndex(src[i], src[i + 1], src[i + 2], lbColors) === idx) {
        od[i + 3] = 0;                                   // 匹配：透明（原圖透出）
      } else { od[i] = 8; od[i + 1] = 10; od[i + 2] = 14; od[i + 3] = 194; }  // 其餘：暗遮
    }
    mctx.putImageData(out, 0, 0);
    mask.classList.add('show');
    lbActiveIdx = idx;
    $('#lightbox-palette .lb-swatch').removeClass('active').filter('[data-idx="' + idx + '"]').addClass('active');
  }
  function clearMask() {
    document.getElementById('lightbox-mask').classList.remove('show');
    lbActiveIdx = -1;
    $('#lightbox-palette .lb-swatch').removeClass('active');
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
      lbDrag = { x0: e.clientX, y0: e.clientY, tx0: lbView.tx, ty0: lbView.ty, moved: false };
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
    stage.addEventListener('pointerleave', function () { hidePick(); hideLoupe(); });
    stage.addEventListener('pointerup', function (e) {
      var wasDrag = lbDrag && lbDrag.moved;
      lbDrag = null;
      stage.classList.remove('grabbing');
      // 未拖曳、且點在舞台空白處（非圖片本身）→ 關閉
      if (!wasDrag && e.target === stage) closeLightbox();
    });

    // 色票側欄：點色票 → 在圖上定位該色區域（再點同一個 → 取消）
    $('#lightbox-palette').on('click', '.lb-swatch', function () {
      var idx = +$(this).attr('data-idx');
      if (lbActiveIdx === idx) clearMask(); else showMask(idx);
    });

    // 雙擊：fit ↔ 放大到 4× 於游標處
    img.addEventListener('dblclick', function (e) {
      var c = lbCenterXY(e, stage);
      lbView = lbView.zoom > 1.01 ? Lib.identityView() : Lib.zoomAt(Lib.identityView(), 4, c[0], c[1]);
      applyLbView();
    });

    document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
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
      var nf = detailName && findFile(detailName);
      if (nf && nf.alias && $('#detail-modal').hasClass('open')) openDetail(nf);
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
  });
})();
