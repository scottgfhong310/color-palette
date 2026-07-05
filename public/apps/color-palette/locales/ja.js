/* 日本語（ja） */
I18n.register('ja', {
  'title.page': 'Color Palette — 画像の色構成',
  'empty.title': '画像をページの好きな場所にドラッグ',
  'empty.hint': '画像は <code>/upload/color-palette</code> にアップロードされ（同名は上書き）、主要な色構成を自動解析します。<br />または <u>クリックして画像を選択</u>。対応形式：<code>.png</code> / <code>.jpg</code> / <code>.webp</code> / <code>.gif</code> / <code>.bmp</code>。',
  'drop.text': '離すと /upload/color-palette にアップロード',
  'loading': '処理中…',

  'tool.upload': '画像をアップロード',
  'tool.method': '抽出方式',
  'tool.reanalyze': '現在の方式で全て再解析',
  'tool.density': '表示密度',
  'tool.mode': 'ライト / ダーク切替',
  'tool.lang': '言語',
  'tool.clear': '/upload/color-palette を空にする',

  'method.median': '色系統の代表色',
  'method.frequency': '頻度による主色',

  'density.comfortable': 'サムネイル',
  'density.compact': '色票ウォール',

  'family.red': '赤',
  'family.orange': 'オレンジ',
  'family.yellow': '黄',
  'family.green': '緑',
  'family.cyan': 'シアン',
  'family.blue': '青',
  'family.purple': '紫',
  'family.magenta': 'マゼンタ',
  'family.neutral': '無彩色 / グレー',
  'family.pending': '未解析',

  'card.pending': 'クリックして色を解析',

  'detail.reanalyze': '再解析',
  'detail.close': '閉じる',
  'detail.sub': '{method} · {n} 色 · {size}',

  'toast.notImage': '画像でない {n} 件をスキップ',
  'toast.uploaded': '{n} 枚をアップロード・解析しました',
  'toast.uploadFail': '{n} 枚のアップロード／解析に失敗',
  'toast.analyzed': '解析しました：{n}',
  'toast.analyzeFail': '解析に失敗：{n}（{m}）',
  'toast.lang': '{name} に切り替えました',
  'toast.method': '抽出方式：{m}',
  'toast.reanalyzed': '{n} 枚を再解析しました',
  'toast.noFiles': '解析できる画像がありません',
  'toast.cleared': '{n} 件を削除しました',
  'toast.clearFail': '削除に失敗：{m}',
  'toast.listFail': 'リストの読み込みに失敗：{m}',

  'confirm.clear': '/upload/color-palette 内のすべての画像とパレットを削除しますか？この操作は取り消せません。'
}, '日本語');
