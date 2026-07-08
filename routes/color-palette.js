/**
 * color-palette
 * -------------
 * 後端 handler，搭配 public/apps/color-palette 前端使用。
 *
 * 上傳沿用既有的 /api/upload?folder=color-palette（routes/upload.js）：
 *   檔案落在 public/upload/color-palette/，指定 folder 時保留原檔名 → 同名直接覆寫。
 *
 * 顏色萃取在前端（canvas + color-palette-lib.js）完成；後端不跑 canvas，
 * 只負責存取「檔名 → 色票 alias」的 registry，並提供清單 / 清空：
 *   GET  /api/color-palette/files  → 列出 upload/color-palette/ 下的可見圖檔（併入各檔 alias）
 *   POST /api/color-palette/alias  → 落地單一檔案的色票 alias（覆寫前 .bak）
 *   POST /api/color-palette/clear  → 刪除該資料夾下所有可見檔案，並清空 registry
 *
 * 安全限制：
 *   - 操作目標固定為 public/upload/color-palette，不接受任何外部路徑參數
 *   - 檔名經消毒（basename、擋 ../ \ \0、圖片副檔名白名單）
 *   - 落地的色票經嚴格驗證（colors ≤ MAX_COLORS、r/g/b 0–255 整數、hex #rrggbb、ratio 0–1、method 白名單）
 *   - registry 以 JSON.stringify 重寫（自帶跳脫）；覆寫前 .bak
 */

const express = require('express');
const path = require('path');
const fs = require('fs').promises;

const router = express.Router();

// 固定的上傳資料夾（與前端、/api/upload?folder=color-palette 對齊）
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'upload', 'color-palette');
// 色票 registry（隱藏檔 → 不被 /files 列入；clear 時另行清空）
const REGISTRY_PATH = path.join(UPLOAD_DIR, '.registry.json');
const BAK_DIR = path.join(UPLOAD_DIR, '.bak');
// 產生的色票 .md（子夾，不被 /files 列入、/clear 只刪可見「檔」故子夾亦保留）；由 markdown-library 以 ?mymd 絕對路徑打開
const MD_DIR = path.join(UPLOAD_DIR, 'palettes');

// 圖片副檔名白名單（picker accept + 後端再驗；與 lib 的 isImage 對齊）
const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp)$/i;
const METHODS = new Set(['median', 'frequency']);
const MAX_COLORS = 12;

// 只處理可見檔案，略過 .DS_Store / .gitkeep / .registry.json 等隱藏檔
function isVisible(name) {
  return typeof name === 'string' && name.length > 0 && name[0] !== '.';
}

// 檔名消毒：非空、basename === 原值、非純 .、不含 / \ \0、圖片副檔名白名單
function sanitizeName(name) {
  if (!name || typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (path.basename(trimmed) !== trimmed) return null;
  if (/^\.+$/.test(trimmed)) return null;
  if (/[\/\\\0]/.test(trimmed)) return null;
  if (!IMAGE_RE.test(trimmed)) return null;
  return trimmed;
}

// .md 檔名消毒：basename===原值、不含 / \ \0、非純 .、無控制字元、須 .md（允許 CJK/空白）
function sanitizeMdName(name) {
  if (!name || typeof name !== 'string') return null;
  const t = name.trim();
  if (!t || path.basename(t) !== t) return null;
  if (/^\.+/.test(t) || /[\/\\\0]/.test(t) || !/\.md$/i.test(t)) return null;
  for (let i = 0; i < t.length; i++) if (t.charCodeAt(i) < 0x20) return null;
  return t;
}

function pad2(n) { return String(n).padStart(2, '0'); }
function stamp(d = new Date()) {
  return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
    pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
}

// ---- registry 讀寫 --------------------------------------------------------

// 讀 registry（缺檔 / 壞檔都回空物件，永不 throw）
async function readRegistry() {
  try {
    const text = await fs.readFile(REGISTRY_PATH, 'utf8');
    const obj = JSON.parse(text);
    return (obj && typeof obj === 'object') ? obj : {};
  } catch (e) {
    return {};
  }
}

// 覆寫前備份到 .bak/，再以 JSON.stringify 重寫 registry
async function writeRegistry(reg) {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  try {
    await fs.access(REGISTRY_PATH);
    await fs.mkdir(BAK_DIR, { recursive: true });
    await fs.copyFile(REGISTRY_PATH, path.join(BAK_DIR, '.registry-' + stamp() + '.json.bak'));
  } catch (e) { /* 尚無舊檔 → 免備份 */ }
  await fs.writeFile(REGISTRY_PATH, JSON.stringify(reg, null, 2) + '\n', 'utf8');
}

// 驗證前端送來的色票；不合法回 null。回正規化後的 alias 物件。
function validatePalette(p) {
  if (!p || typeof p !== 'object') return null;
  const method = METHODS.has(p.method) ? p.method : null;
  if (!method) return null;
  if (!Array.isArray(p.colors) || p.colors.length === 0 || p.colors.length > MAX_COLORS) return null;
  const colors = [];
  for (const c of p.colors) {
    if (!c || typeof c !== 'object') return null;
    const r = c.r, g = c.g, b = c.b;
    if (![r, g, b].every(v => Number.isInteger(v) && v >= 0 && v <= 255)) return null;
    if (typeof c.hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(c.hex)) return null;
    const ratio = c.ratio;
    if (typeof ratio !== 'number' || !isFinite(ratio) || ratio < 0 || ratio > 1) return null;
    const out = { r, g, b, hex: c.hex.toLowerCase(), ratio };
    if (typeof c.hue === 'number' && isFinite(c.hue)) out.hue = c.hue;
    colors.push(out);
  }
  const alias = { method, count: colors.length, colors, analyzedAt: stamp() };
  if (typeof p.hue === 'number' && isFinite(p.hue)) alias.hue = p.hue;
  return alias;
}

// 驗證色彩肖像標籤（可查詢 metadata）：字串陣列、每個為 `facet:value`（小寫＋連字號）、去重、有上限。
const TAG_RE = /^[a-z]+:[a-z-]+$/;
function validateTags(t) {
  if (!Array.isArray(t)) return null;
  const out = [];
  for (const s of t) {
    if (typeof s !== 'string' || s.length > 40 || !TAG_RE.test(s)) continue;
    if (out.indexOf(s) < 0) out.push(s);
    if (out.length >= 16) break;
  }
  return out.length ? out : null;
}

// ---- API ------------------------------------------------------------------

// GET /api/color-palette/files — 列出圖檔（併入各檔 alias）；依修改時間新→舊
router.get('/files', async (req, res) => {
  try {
    let entries;
    try {
      entries = await fs.readdir(UPLOAD_DIR, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') return res.json({ ok: true, files: [] });
      throw err;
    }
    const reg = await readRegistry();
    const files = [];
    for (const ent of entries) {
      if (!ent.isFile() || !isVisible(ent.name) || !IMAGE_RE.test(ent.name)) continue;
      const stat = await fs.stat(path.join(UPLOAD_DIR, ent.name));
      files.push({
        name: ent.name,
        size: stat.size,
        mtime: stat.mtimeMs,
        alias: reg[ent.name] || null
      });
    }
    files.sort((a, b) => b.mtime - a.mtime);
    return res.json({ ok: true, files });
  } catch (err) {
    console.error('[color-palette] GET /files failed:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/color-palette/alias — 落地單一檔案的色票 alias
// body: { name, palette: { method, count, colors:[{r,g,b,hex,ratio,hue?}], hue? } }
router.post('/alias', async (req, res) => {
  const name = sanitizeName(req.body && req.body.name);
  if (!name) return res.status(400).json({ ok: false, error: '不允許的檔名' });
  const alias = validatePalette(req.body && req.body.palette);
  if (!alias) return res.status(400).json({ ok: false, error: '色票格式不正確' });
  const tags = validateTags(req.body && req.body.tags);   // 色彩肖像標籤（選用；落地供跨載入檢索）
  if (tags) alias.tags = tags;
  try {
    // 檔案必須存在於資料夾內才落地（避免替不存在的檔寫 alias）
    await fs.access(path.join(UPLOAD_DIR, name));
  } catch (e) {
    return res.status(404).json({ ok: false, error: '檔案不存在' });
  }
  try {
    const reg = await readRegistry();
    reg[name] = alias;
    await writeRegistry(reg);
    return res.json({ ok: true, name, alias });
  } catch (err) {
    console.error('[color-palette] POST /alias failed:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/color-palette/save-md — 產生色票 .md 到 palettes/（供 markdown-library 以 ?mymd 絕對路徑打開）
// body: { name, content }
router.post('/save-md', async (req, res) => {
  const name = sanitizeMdName(req.body && req.body.name);
  if (!name) return res.status(400).json({ ok: false, error: '不允許的檔名' });
  const content = req.body && req.body.content;
  if (typeof content !== 'string') return res.status(400).json({ ok: false, error: 'content 需為字串' });
  if (content.length > 300000) return res.status(400).json({ ok: false, error: '內容過長' });
  try {
    await fs.mkdir(MD_DIR, { recursive: true });
    await fs.writeFile(path.join(MD_DIR, name), content, 'utf8');
    console.log('[color-palette] POST /save-md →', name);
    return res.json({ ok: true, name, path: '/upload/color-palette/palettes/' + name });   // 站台絕對路徑（原文，前端再 encode）
  } catch (err) {
    console.error('[color-palette] POST /save-md failed:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/color-palette/delete — 刪除單一檔案（連同其 registry alias）
// body: { name }
router.post('/delete', async (req, res) => {
  const name = sanitizeName(req.body && req.body.name);
  if (!name) return res.status(400).json({ ok: false, error: '不允許的檔名' });
  try {
    await fs.unlink(path.join(UPLOAD_DIR, name)).catch((e) => { if (e.code !== 'ENOENT') throw e; });
    const reg = await readRegistry();
    if (Object.prototype.hasOwnProperty.call(reg, name)) { delete reg[name]; await writeRegistry(reg); }
    console.log('[color-palette] POST /delete →', name);
    return res.json({ ok: true, name });
  } catch (err) {
    console.error('[color-palette] POST /delete failed:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/color-palette/clear — 清空資料夾下所有可見檔案，並清空 registry
router.post('/clear', async (req, res) => {
  try {
    let entries;
    try {
      entries = await fs.readdir(UPLOAD_DIR, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') return res.json({ ok: true, removed: 0, files: [] });
      throw err;
    }
    const removed = [];
    for (const ent of entries) {
      if (!ent.isFile() || !isVisible(ent.name)) continue;
      await fs.unlink(path.join(UPLOAD_DIR, ent.name));
      removed.push(ent.name);
    }
    // registry 一併清空（覆寫前 .bak）
    if (Object.keys(await readRegistry()).length) await writeRegistry({});
    console.log('[color-palette] POST /clear → removed', removed.length, 'file(s)');
    return res.json({ ok: true, removed: removed.length, files: removed });
  } catch (err) {
    console.error('[color-palette] POST /clear failed:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
