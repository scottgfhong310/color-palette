/**
 * color-palette — 獨立執行的 Express 伺服器
 *
 * 提供：
 *   - 靜態檔（public/）→ 應用在 /apps/color-palette/
 *   - 上傳 API：/api/upload?folder=color-palette（routes/upload.js）
 *   - 清單 / 落地 / 清空 API：/api/color-palette（routes/color-palette.js）
 *
 * 顏色萃取（像素 → 色票）在前端（canvas + color-palette-lib.js）完成；
 * 後端維持薄身，只負責存取「檔名 → 色票 alias」的 registry（不跑 canvas）。
 *
 * 啟動： npm install && npm start
 *        預設 http://localhost:3000/apps/color-palette/
 */

const express = require('express');
const path = require('path');
const logger = require('morgan');

const uploadRouter = require('./routes/upload');
const colorPaletteRouter = require('./routes/color-palette');

const app = express();

app.use(logger('dev'));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/upload', uploadRouter);
app.use('/api/color-palette', colorPaletteRouter);

// 根路徑導向應用頁
app.get('/', (req, res) => res.redirect('/apps/color-palette/'));

// 404（API 回 JSON，其餘回純文字）
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ ok: false, error: 'Not found' });
  res.status(404).type('text/plain').send('Not found');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`color-palette →  http://localhost:${PORT}/apps/color-palette/`);
});
