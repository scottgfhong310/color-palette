/**
 * upload
 * ------
 * 接收上傳檔案，存到 public/upload/<folder>/ 下（各 app 以 folder=<app-name> 呼叫）。
 * 指定 folder 時保留原始檔名；未指定則放到 yyyyMMdd 子資料夾並加時間前綴。
 *
 * **同名一律改名，永不覆寫**〔owner 2026-08-03 拍板〕：
 * 落點已存在時尾附 `-yyyyMMddHHmmss`（仍撞就再補 `-2`、`-3`…），沿用
 * `markdown-reader-lib.js` 的 `resolveCollision` 命名語彙。回應的 `filename`
 * 是**實際落地的名字**，另有 `renamed` 布林供 UI 提示。
 *
 * ⚠️ **不要改回 multer 的 diskStorage**：它以 `fs.createWriteStream(p)` 開檔，
 *    預設 flag `'w'` ＝ create-or-truncate，同名上傳會**靜默截斷**既有檔；
 *    而「先 `fs.access` 檢查再決定檔名」只是把競態窗口從無限縮到毫秒級，
 *    看起來修好了、其實沒有。本檔改用自訂 storage engine，以 `'wx'`
 *    （獨佔建立，已存在則 EEXIST）由**作業系統**保證同一個名字只有一個贏家。
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

// 撞名改名用的時間戳（秒級，同 markdown-reader-lib.js 的 timestamp()）
function stamp(d = new Date()) {
  return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
    pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
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

// 檔名消毒：擋目錄穿越／控制字元／空值／純點名（非瀏覽器 client 可送 ../、\、控制字元）
function sanitizeUploadName(name) {
  if (!name || typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (path.basename(trimmed) !== trimmed) return null; // 含目錄段
  if (/^\.+$/.test(trimmed)) return null;              // . / .. / ...
  if (/[\/\\\0]/.test(trimmed)) return null;           // 分隔字元 / null byte
  if (/[\x00-\x1f\x7f]/.test(trimmed)) return null;    // 控制字元
  return trimmed;
}

// 撞名時的下一個候選名：`base-yyyyMMddHHmmss[-seq]ext`
// （與 markdown-reader-lib.js 的 resolveCollision 同一套語彙，故兩端產生的名字看起來一致）
function collisionName(name, seq) {
  const i = name.lastIndexOf('.');
  const base = i > 0 ? name.slice(0, i) : name;
  const ext = i > 0 ? name.slice(i) : '';
  return base + '-' + stamp() + (seq > 1 ? '-' + seq : '') + ext;
}

const MAX_COLLISION_TRIES = 50;   // 同秒內同名連撞 50 次＝異常，寧可報錯也不無限迴圈

/**
 * 自訂 storage engine —— 取代 multer.diskStorage，唯一的差別是**開檔方式**：
 * `fs.open(p, 'wx')` 獨佔建立，已存在則丟 EEXIST，於是「檢查」與「建立」是
 * 同一個不可分割的系統呼叫，兩個併發請求不可能同時拿到同一個名字。
 */
const storage = {
  async _handleFile(req, file, cb) {
    try {
      const custom = sanitizeFolder(req.query.folder);
      const folder = custom || dateFolder();
      const destination = path.join(UPLOAD_ROOT, folder);
      await fs.mkdir(destination, { recursive: true });

      // 修正某些瀏覽器送來的檔名亂碼（latin1 → utf8）
      let originalName = file.originalname;
      try { originalName = Buffer.from(originalName, 'latin1').toString('utf8'); } catch (e) { /* keep */ }
      const safeName = sanitizeUploadName(originalName);
      if (!safeName) return cb(new Error('invalid filename'));

      const wanted = custom ? safeName : timePrefix() + safeName;

      let handle = null, filename = null;
      for (let seq = 1; seq <= MAX_COLLISION_TRIES; seq++) {
        const cand = seq === 1 ? wanted : collisionName(wanted, seq - 1);
        // 落點雙保險：候選名每一輪都要驗（撞名改出來的名字同樣不得逸出上傳夾）
        const abs = path.join(destination, cand);
        if (!abs.startsWith(destination + path.sep)) return cb(new Error('invalid filename'));
        try {
          handle = await fs.open(abs, 'wx');   // ← 原子：建立成功才回，已存在丟 EEXIST
          filename = cand;
          break;
        } catch (err) {
          if (err.code !== 'EEXIST') throw err;
        }
      }
      if (!handle) return cb(new Error('too many filename collisions'));

      const finalPath = path.join(destination, filename);
      const outStream = handle.createWriteStream();
      file.stream.pipe(outStream);
      outStream.on('error', function (err) { handle.close().catch(() => {}); cb(err); });
      outStream.on('finish', function () {
        cb(null, {
          destination,
          filename,
          path: finalPath,
          size: outStream.bytesWritten,
          renamed: filename !== wanted
        });
      });
    } catch (err) {
      cb(err);
    }
  },
  _removeFile(req, file, cb) {
    fs.unlink(file.path).then(() => cb(null), cb);
  }
};

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
        filename: f.filename,          // ← 實際落地的名字（撞名時與 originalname 不同）
        renamed: !!f.renamed,          // ← 是否因撞名而改過名（供 UI 提示）
        size: f.size,
        path: f.path.replace(/\\/g, '/').replace(/^.*public\//, '/'),
        date: uploadDate
      };
    });
    res.json({ ok: true, uploadDate, files });
  });
});

module.exports = router;
