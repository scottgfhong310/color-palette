# 選配 LLM 潤稿（Optional LLM Polish）

> 這份文件回答兩件事：**怎麼啟用** LLM 潤稿、以及它**在 color-palette 中如何表現**。
> 潤稿是色彩肖像的「文采層」——**嚴格 opt-in**，讓主觀與文采進場，但**純核心一行不動**。
> 相關：色彩肖像 [COLOR-PORTRAIT.md](COLOR-PORTRAIT.md)（§6.3 就是這一項）｜視覺肖像卡 [PORTRAIT-CARD.md](PORTRAIT-CARD.md)｜
> 五類色型 [COLOR-TYPES.md](COLOR-TYPES.md)。

---

## 0. 一句話

決定論的 `phrase()` 產生**站得住腳的那一句**（例：「整體偏暖、互補配色、大地色調，焦點是一抹小而鮮的印度紅 ≈FC192。」）。
**潤稿**＝把那一句丟給模型改寫得更漂亮（Anthropic 或 OpenAI，走 `.env` 選），**只換明細畫面上的顯示**——不落地、不進報告。沒設金鑰時，這個功能根本不存在。

---

## 1. 怎麼啟用

### 1.1 三步

```
1) 複製範本            cp .env.example .env
2) 填金鑰（擇一模型）   .env 內：ANTHROPIC_API_KEY=sk-ant-...
                                （選配）ANTHROPIC_MODEL=claude-haiku-4-5
3) 重啟                node app.js        # 後端在啟動時讀 .env 與掛路由，故必須重啟
```

啟動後開任何一張**已分析**的圖 → 明細裡色彩肖像那句右邊會出現 **✨ 潤稿鈕**。沒出現＝金鑰沒讀到（見 1.4）。

### 1.2 `.env` 有哪些鍵

支援兩家，用 `LLM_PROVIDER` 選（**預設 `anthropic`，保持 canon**）；只需填你選的那一家的金鑰。

| 鍵 | 必填 | 預設 | 說明 |
|---|---|---|---|
| `LLM_PROVIDER` | 否 | `anthropic` | 選哪一家：`anthropic` \| `openai`。 |
| `ANTHROPIC_API_KEY` | provider=anthropic 時要 | —（未設＝停用） | Anthropic 金鑰（`x-api-key`）。取得：<https://console.claude.com/> |
| `ANTHROPIC_MODEL` | 否 | `claude-opus-4-8` | 短句改寫想省成本可改 `claude-haiku-4-5`。 |
| `OPENAI_API_KEY` | provider=openai 時要 | —（未設＝停用） | OpenAI 金鑰（`Authorization: Bearer`）。取得：<https://platform.openai.com/api-keys> |
| `OPENAI_MODEL` | 否 | `gpt-4o-mini` | 程式用 `max_completion_tokens` 送上限，故新推理型模型（gpt-5 / o 系列，強制用它）與 gpt-4o/mini/4-turbo/3.5 都通用。 |
| `PORT` | 否 | `3000` | 覆寫 port（家族 canon）。 |

> `.env` 已列入 `.gitignore`——**金鑰永不進版控**。範本是 `.env.example`（可安全提交）。
> `GET /config` 回 `llm:true` 的條件＝**目前選定 provider 的金鑰有設**（未設就靜默停用）。

### 1.3 金鑰住哪、為什麼

- **只在後端**：金鑰由 Node 後端讀取、由後端呼叫 Anthropic。**瀏覽器永遠拿不到金鑰**（前端只打自家的 `/api/color-palette/polish`）。
- **零 npm 相依**：後端用 **Node 內建 `fetch`** 直呼**所選 provider** 的 API（Anthropic Messages API 或 OpenAI Chat Completions），**不引 SDK**——維持家族「薄後端」canon。system/user 兩段 prompt 與護欄兩家共用，只有「傳輸層」（端點/認證/請求形狀/取回位置）不同。
- **極簡 `.env` 載入器**：`app.js` 內建約十行的載入器（把 `.env` 補進 `process.env`，僅補未設定者），**不依賴 `dotenv`**。
  你也可以完全不用 `.env`、改在環境直接 export：`ANTHROPIC_API_KEY=sk-ant-... node app.js`。

### 1.4 驗證有沒有啟用

```bash
curl localhost:3000/api/color-palette/config
# 已啟用 → {"ok":true,"llm":true}
# 未啟用 → {"ok":true,"llm":false}
```

前端啟動時就是打這支 `GET /config`：回 `llm:true` 才顯示潤稿鈕。**沒設金鑰＝鈕根本不出現**，不是灰掉。

---

## 2. 在 color-palette 中如何表現

### 2.1 出現在哪、怎麼觸發

- **位置**：**明細 Modal**（點一張已分析的卡）裡，色彩肖像那一句的右側一顆 ✨（`auto_awesome`）圖示鈕。
- **顯示條件**：`llm 可用` **且** `已經有一句肖像`（像素載入、`phrase()` 算完）才顯示。
- **點下去**：鈕轉圈 → 後端請 Claude 改寫 → 成功則**用潤稿版取代畫面上那一句**，並以更亮的 accent 邊＋微加粗標示（`.is-polished`）。
- **語言**：跟著目前 UI 語言（zh-Hant / en / ja）——請模型**以該語言**寫。

```
明細 Modal
 ┌──────────────────────────────────────────────┐
 │ 「整體偏暖、互補配色、大地色調，焦點是一抹   │  ← 決定論句（phrase）
 │   小而鮮的印度紅 ≈FC192。」            [ ✨ ]│  ← 潤稿鈕
 │ ── 點 ✨ ────────────────────────────────────│
 │ 「暖意在畫面裡鋪展，與一處冷調相互應答；     │  ← 潤稿版（取代顯示，標 is-polished）
 │   大地色的沉穩之間，一抹印度紅（≈FC192）     │
 │   小而灼然，成為全圖的焦點。」               │
 └──────────────────────────────────────────────┘
```

### 2.2 最重要的邊界：潤稿只潤「顯示」

**決定論的 `phrase()` 那一句，仍是這些的唯一來源**——潤稿一概不碰：

| 用途 | 來源 | 潤稿有影響嗎 |
|---|---|---|
| 落地 alias（`.registry.json`） | 決定論 | ❌ 不碰 |
| 色票 `.md`（單構面） | 決定論 | ❌ 不碰 |
| 完整報告 `.md`（五構面／肖像卡） | 決定論 | ❌ 不碰 |
| 可查詢標籤（`facet:value`） | 決定論 | ❌ 不碰 |
| 視覺肖像卡（SVG） | 決定論 | ❌ 不碰 |
| **明細 Modal 那一句的畫面顯示** | 決定論，**可被潤稿版覆蓋** | ✅ **只有這裡** |

潤稿版是 **transient**：換圖、切語言、或重新整理頁面都會**回到決定論句**（潤稿不儲存、不隨圖庫走）。
於是「純核心仍決定論、零相依」成立——潤稿是**加值顯示**，不是資料。

### 2.3 送出去的是什麼（以及不是什麼）

`POST /api/color-palette/polish` body：

```jsonc
{
  "sentence": "整體偏暖、互補配色、大地色調，焦點是一抹小而鮮的印度紅 ≈FC192。",  // 決定論句＝改寫的真相來源
  "locale":   "zh-Hant",                                                        // 用哪種語言寫
  "facts": {                                                                    // 精簡事實：只當 grounding 護欄
    "temperature": "warm", "harmony": "complementary", "archetype": "earthy",
    "key": "mid", "families": ["red","blue"], "focal": "印度紅 (FC192)"
  }
}
```

- **不送圖、不送像素**：模型只看到「一句已在地化的描述＋幾個語意 token」。**原圖不離開伺服器。**
- **facts 是護欄不是內容**：用來防止模型漂移（別把「暖」寫成「冷」），不是拿來擴寫的素材。焦點色的 FC 名/色號原樣保留。

### 2.4 「只描述顏色、不描述內容」延伸到 prompt

色彩肖像的鐵律是**只描述顏色、不描述內容**（知道「一抹小而鮮的紅」，不知道那是嘴唇）。潤稿把這條**寫進 system prompt**：

- 明令：**只講顏色，不得臆造主體/物件/場景/人事**（no "lips"/"sky"/"sunset"/"portrait"…）。
- 明令：**不得新增草稿與事實清單以外的資訊**——不憑空多一個顏色、不編一個沒給的數字。
- 明令：**只輸出一句、就是那個語言**，不要前言、引號、markdown；**FC 色名/色號原樣保留**。

換句話說：潤稿讓「文采」進場，但**不讓「內容臆測」進場**——它只是把同一批顏色事實講得更好聽。

### 2.5 失敗與停用時怎樣（都不會壞體驗）

| 情況 | 回應 | 使用者看到 |
|---|---|---|
| 沒設金鑰 | `GET /config` → `llm:false` | **鈕不出現**（功能靜默不存在） |
| 硬打 `/polish` 但沒金鑰 | `{ok:false, error:"llm-not-configured"}` | toast 提示「見 .env」；原句保留 |
| 金鑰錯／上游錯 | `{ok:false, error:"llm-upstream"}`（502） | toast「潤稿失敗，維持原句」；原句保留 |
| 逾時（>20s） | `{ok:false, error:"llm-timeout"}`（504） | 同上，原句保留 |
| 安全拒答（`stop_reason:refusal`） | `{ok:false, error:"llm-refusal"}` | 同上，原句保留 |

**任何失敗都退回決定論那一句**——潤稿有就更漂亮，沒有也永遠有一句站得住腳的描述。

---

## 3. 端點速查

| 端點 | 用途 | 回應 |
|---|---|---|
| `GET /api/color-palette/config` | 前端啟動探詢能力 | `{ ok, llm }` |
| `POST /api/color-palette/polish` | 潤稿一句色彩肖像 | `{ ok, text, model, provider }` 或 `{ ok:false, error }` |

`/polish` 護欄：`sentence` ≤ 600 字、`locale` 白名單（zh-Hant/en/ja，否則預設 zh-Hant）、逾時 20s、輸出裁 ≤ 800 字。

---

## 4. 誠實的邊界

- **潤稿是 transient**：不落地、不進 `.md`／報告、換圖／切語言／重整都會回到決定論句。要「保存漂亮版」不是這功能的目的。
- **要金鑰、要網路、要成本**：這是唯一會對外呼叫、會產生費用的地方（其餘全在本機／瀏覽器）。預設 Opus 4.8；短句改寫想省錢用 Haiku。
- **只在單張明細**：目前只潤「一張圖」那一句；**圖庫肖像（關係與時間）那一行不走潤稿**（見 [COLLECTION.md](COLLECTION.md)）。
- **隱私**：離開伺服器的只有「**已是純顏色描述**的那一句＋幾個語意 token」；**原圖與像素永不外送**。
- **沒有速率限制**：本機／私有 repo 定位，未加 rate limiting；若對外部署要另外把關。

---

*MIT © 2026 Scott G.F. Hong ｜ 實作：`routes/color-palette.js`（`GET /config`／`POST /polish`）、`app.js`（`.env` 載入器）、前端 `color-palette-lib.js` / `color-palette.js`（✨ 潤稿鈕）*
