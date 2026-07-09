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

// ---- 選配 LLM 潤稿（opt-in；純核心仍決定論、零相依）------------------------
// color-portrait-lib 的 phrase() 永遠是決定論、落地/報告用的來源；此端點只是「文采潤飾」——
// 把已在地化的那一句 + 精簡事實丟給模型改寫得更漂亮。零 npm 相依：以 Node 內建 fetch 直呼 API。
// 支援兩家（走 .env 的 LLM_PROVIDER 選，預設 anthropic 保持 canon）：
//   anthropic：ANTHROPIC_API_KEY / ANTHROPIC_MODEL（預設 claude-opus-4-8）
//   openai   ：OPENAI_API_KEY   / OPENAI_MODEL   （預設 gpt-4o-mini）
// 未設對應金鑰＝整個功能靜默停用（前端據 GET /config 決定是否顯示按鈕）。
const LLM_LOCALES = new Set(['zh-Hant', 'en', 'ja']);
const LLM_LANG_NAME = { 'zh-Hant': 'Traditional Chinese (繁體中文)', en: 'English', ja: 'Japanese (日本語)' };
const LLM_PROVIDER = (process.env.LLM_PROVIDER || 'anthropic').toLowerCase();

function llmKey() { return LLM_PROVIDER === 'openai' ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY; }
function llmModel() {
  return LLM_PROVIDER === 'openai'
    ? (process.env.OPENAI_MODEL || 'gpt-4o-mini')
    : (process.env.ANTHROPIC_MODEL || 'claude-opus-4-8');
}
function llmEnabled() { return Boolean(llmKey()); }

// 呼叫選定的 provider 改寫一句；回文字，或 throw { kind:'upstream'|'refusal'|'empty', msg? }。
// system/user 兩段字串兩家共用（同一份 prompt 與護欄）——只有「傳輸層」不同（端點/認證/請求形狀/取回位置）。
async function callLLM(system, user, signal) {
  const model = llmModel();
  if (LLM_PROVIDER === 'openai') {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + process.env.OPENAI_API_KEY },
      // 用 max_completion_tokens（新推理型模型如 gpt-5/o 系列強制要它、拒收 max_tokens；gpt-4o/mini 等舊模型也通用）
      body: JSON.stringify({ model, max_completion_tokens: 256, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] })
    });
    const data = await resp.json().catch(() => null);
    if (!resp.ok || !data) throw { kind: 'upstream', msg: (data && data.error && data.error.message) || ('HTTP ' + resp.status) };
    const choice = Array.isArray(data.choices) ? data.choices[0] : null;
    if (choice && choice.message && choice.message.refusal) throw { kind: 'refusal' };
    const text = choice && choice.message && typeof choice.message.content === 'string' ? choice.message.content.trim() : '';
    if (!text) throw { kind: 'empty' };
    return text;
  }
  // anthropic（預設）
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: 256, system, messages: [{ role: 'user', content: user }] })
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok || !data) throw { kind: 'upstream', msg: (data && data.error && data.error.message) || ('HTTP ' + resp.status) };
  if (data.stop_reason === 'refusal') throw { kind: 'refusal' };
  const block = Array.isArray(data.content) ? data.content.find(c => c && c.type === 'text') : null;
  const text = block && typeof block.text === 'string' ? block.text.trim() : '';
  if (!text) throw { kind: 'empty' };
  return text;
}

// 事實清單消毒：只留白名單欄位、字串裁長、陣列裁量——當作模型的 grounding 護欄（防漂移），不當內容來源。
function slimFacts(f) {
  if (!f || typeof f !== 'object') return null;
  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n || 40) : undefined);
  const out = {};
  if (str(f.temperature)) out.temperature = str(f.temperature);
  if (str(f.archetype)) out.archetype = str(f.archetype);
  if (str(f.harmony)) out.harmony = str(f.harmony);
  if (str(f.key)) out.key = str(f.key);
  if (str(f.focal, 60)) out.focal = str(f.focal, 60);
  if (Array.isArray(f.families)) out.families = f.families.filter(x => typeof x === 'string').slice(0, 5).map(x => x.slice(0, 30));
  return Object.keys(out).length ? out : null;
}

// GET /api/color-palette/config — 前端啟動時探詢能力（目前只有：LLM 潤稿是否可用）
router.get('/config', (req, res) => {
  res.json({ ok: true, llm: llmEnabled() });
});

// POST /api/color-palette/polish — 把一句色彩肖像描述用 LLM 改寫得更漂亮
// body: { sentence, locale, facts? } → { ok, text } 或 { ok:false, error }
router.post('/polish', async (req, res) => {
  const b = req.body || {};
  const sentence = typeof b.sentence === 'string' ? b.sentence.trim() : '';
  const locale = LLM_LOCALES.has(b.locale) ? b.locale : 'zh-Hant';
  if (!sentence || sentence.length > 600) return res.status(400).json({ ok: false, error: '需要一句描述' });
  if (!llmEnabled()) return res.json({ ok: false, error: 'llm-not-configured' });
  const facts = slimFacts(b.facts);

  const system =
    "You rewrite one-sentence descriptions of an image's COLOUR composition to be more evocative and fluent, " +
    'while staying strictly faithful to the given facts.\n' +
    'Rules:\n' +
    '- Describe COLOUR only. Never invent subject matter, objects, scenes, or what the image depicts ' +
    '(no "lips", "sky", "sunset", "portrait", people, places, etc.). You are told colours, not content.\n' +
    '- Add no fact not present in the draft or the facts list — no new colours, no numbers you were not given.\n' +
    '- Output exactly ONE sentence, in ' + LLM_LANG_NAME[locale] + ', and nothing else ' +
    '(no preamble, no surrounding quotes, no markdown).\n' +
    '- Keep any Faber-Castell colour name and code exactly as written in the draft.';

  let user = 'Draft (already in ' + LLM_LANG_NAME[locale] + '; this is the source of truth):\n' + sentence;
  if (facts) user += '\n\nSupporting facts (guardrails only; do not translate these labels into the sentence):\n' + JSON.stringify(facts);
  user += '\n\nRewrite the draft as one more beautiful sentence.';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const text = await callLLM(system, user, controller.signal);
    console.log('[color-palette] POST /polish →', LLM_PROVIDER, llmModel(), '(' + locale + ')');
    return res.json({ ok: true, text: text.slice(0, 800), model: llmModel(), provider: LLM_PROVIDER });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      console.error('[color-palette] POST /polish failed: timeout');
      return res.status(504).json({ ok: false, error: 'llm-timeout' });
    }
    if (err && err.kind === 'refusal') return res.json({ ok: false, error: 'llm-refusal' });
    if (err && err.kind === 'empty') return res.json({ ok: false, error: 'llm-empty' });
    if (err && err.kind === 'upstream') {
      console.error('[color-palette] POST /polish upstream error:', err.msg);
      return res.status(502).json({ ok: false, error: 'llm-upstream' });
    }
    console.error('[color-palette] POST /polish failed:', err && err.message);
    return res.status(500).json({ ok: false, error: 'llm-error' });
  } finally {
    clearTimeout(timer);
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
