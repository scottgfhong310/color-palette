/* 繁體中文（zh-Hant） */
I18n.register('zh-Hant', {
  'title.page': 'Color Palette — 圖片顏色組成',
  'empty.title': '拖拉圖片到頁面任意位置',
  'empty.hint': '圖片會上傳到 <code>/upload/color-palette</code>（同名覆寫），並自動分析主要顏色組成；<br />或 <u>點此選擇圖片</u>。支援 <code>.png</code> / <code>.jpg</code> / <code>.webp</code> / <code>.gif</code> / <code>.bmp</code>。',
  'drop.text': '放開以上傳到 /upload/color-palette',
  'loading': '處理中…',

  'tool.upload': '上傳圖片',
  'tool.method': '萃取法',
  'tool.reanalyze': '以目前萃取法重新分析全部',
  'tool.density': '瀏覽密度',
  'tool.mode': '切換 light / dark',
  'tool.lang': '語言',
  'tool.clear': '清空 /upload/color-palette',

  'method.median': '色族代表',
  'method.frequency': '頻率主色',

  'density.comfortable': '縮圖',
  'density.compact': '色票牆',

  'family.red': '紅',
  'family.orange': '橙',
  'family.yellow': '黃',
  'family.green': '綠',
  'family.cyan': '青',
  'family.blue': '藍',
  'family.purple': '紫',
  'family.magenta': '洋紅',
  'family.neutral': '中性 / 灰階',
  'family.pending': '未分析',

  'card.pending': '點擊分析顏色',

  'detail.reanalyze': '重新分析',
  'detail.close': '關閉',
  'detail.sub': '{method} · {n} 色 · {size}',

  'lightbox.hint': '滾輪縮放 · 拖曳平移 · 滑過取色 · 點色票定位 · Esc 關閉',
  'lightbox.close': '關閉',
  'lightbox.picker': '取色器',
  'lightbox.pickIdle': '滑過圖片取色',

  'toast.notImage': '略過 {n} 個非圖片檔',
  'toast.uploaded': '已上傳並分析 {n} 張',
  'toast.uploadFail': '{n} 張上傳／分析失敗',
  'toast.analyzed': '已分析：{n}',
  'toast.analyzeFail': '分析失敗：{n}（{m}）',
  'toast.lang': '已切換為 {name}',
  'toast.method': '萃取法：{m}',
  'toast.reanalyzed': '已重新分析 {n} 張',
  'toast.noFiles': '尚無圖片可分析',
  'toast.cleared': '已清空 {n} 個檔案',
  'toast.clearFail': '清空失敗：{m}',
  'toast.listFail': '讀取清單失敗：{m}',

  'confirm.clear': '確定要清空 /upload/color-palette 下的所有圖片與色票嗎？此動作無法復原。'
}, '繁體中文');
