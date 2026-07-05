/**
 * upload
 * ------
 * 接收上傳檔案，存到 public/upload/<folder>/ 下（markdown-reader 用 folder=markdown-reader）。
 * 指定 folder 時保留原始檔名（同名覆寫）；未指定則放到 yyyyMMdd 子資料夾並加時間前綴避免衝突。
 *
 * 前端以 multipart 欄位名 `myFiles` 上傳（可多檔）。
 */

const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');

const router = express.Router();

const UPLOAD_ROOT = path.join(__dirname, '..', 'public', 'upload');

function pad2(n) { return String(n).padStart(2, '0'); }

function dateFolder(d = new Date()) {
  return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate());
}

function timePrefix(d = new Date()) {
  return pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds()) +
    String(d.getMilliseconds()).padStart(3, '0') + '_';
}

// 驗證 folder 名稱，避免路徑穿越
function sanitizeFolder(name) {
  if (!name || typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (path.basename(trimmed) !== trimmed) return null;
  if (/^\.+$/.test(trimmed)) return null;
  if (/[\/\\\0]/.test(trimmed)) return null;
  return trimmed;
}

const storage = multer.diskStorage({
  destination: async function (req, file, cb) {
    try {
      const custom = sanitizeFolder(req.query.folder);
      const folder = custom || dateFolder();
      const uploadPath = path.join(UPLOAD_ROOT, folder);
      await fs.mkdir(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (err) {
      cb(err);
    }
  },
  filename: function (req, file, cb) {
    // 修正某些瀏覽器送來的檔名亂碼（latin1 → utf8）
    let originalName = file.originalname;
    try { originalName = Buffer.from(originalName, 'latin1').toString('utf8'); } catch (e) { /* keep */ }
    const custom = sanitizeFolder(req.query.folder);
    cb(null, custom ? originalName : timePrefix() + originalName);
  }
});

const upload = multer({ storage }).array('myFiles', 20);

router.post('/', function (req, res) {
  upload(req, res, function (err) {
    if (err) {
      return res.status(500).json({ ok: false, error: 'Upload error: ' + err.message });
    }
    const uploadDate = new Date().toISOString();
    const files = (req.files || []).map(f => {
      let originalName = f.originalname;
      try { originalName = Buffer.from(originalName, 'latin1').toString('utf8'); } catch (e) { /* keep */ }
      return {
        originalname: originalName,
        filename: f.filename,
        size: f.size,
        path: f.path.replace(/\\/g, '/').replace(/^.*public\//, '/'),
        date: uploadDate
      };
    });
    res.json({ ok: true, uploadDate, files });
  });
});

module.exports = router;
