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

// 極簡 .env 載入（零相依）：把專案根的 .env 讀進 process.env（僅補「尚未設定」者）。
// 供選配的 ANTHROPIC_API_KEY / ANTHROPIC_MODEL（色彩肖像的 LLM 潤稿）等使用；
// 缺檔或壞行都靜默略過，永不 throw。須在 require 各路由之前跑（路由於載入時讀取 env）。
(function loadDotEnv() {
  try {
    const text = require('fs').readFileSync(path.join(__dirname, '.env'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;                                   // 空行 / 註解 / 非 KEY=VALUE
      let v = m[2].trim();
      if (v.length >= 2 && ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'")))) v = v.slice(1, -1);
      if (!(m[1] in process.env)) process.env[m[1]] = v;
    }
  } catch (e) { /* 無 .env → 略過 */ }
})();

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
