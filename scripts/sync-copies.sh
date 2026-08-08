#!/bin/bash
# sync-copies.sh — 把本 repo 的前端＋route 同步到 InProgress 鏡像，並驗證所有「借來的」共用件。
#
# 本 repo 在同步這件事上同時是兩種角色（形制對齊 thangka-trace/scripts/sync-copies.sh）：
#   ① **上游**（權威版）→ InProgress 鏡像：整包前端 + routes/color-palette.js，本腳本會覆蓋它。
#   ② **下游**（消費端）← 家族 repo / 五支色號 app：共用件與五支色號 lib＋資料。
#      **本腳本只驗、不抓**——因為「該不該更新」是那邊的決定，這裡自動拉會讓一次
#      無意的上游改動悄悄流進來。不一致時它會明講該去哪裡同步。
#
# 為什麼補這支（2026-08-04）：本 repo 是**唯一沒有同步腳本的複製點**。
# 五支色號 app 各自的 sync-copies.sh 會把 lib＋資料推進來，但「前端整包 → InProgress 鏡像」
# 一直沒有人管——那天要收 color-family.js 的佈線時，本 repo 的鏡像是**手動 cp 的**，
# 而手動的步驟遲早會漏（faber-castell-color 就因為腳本放在暫存區被清掉而漏同步過一次）。
#
# ⚠️ **routes/upload.js 刻意不同步**：本 repo 那份是家族最小版（SHARED_LIBRARY_GUIDELINES §4），
# InProgress 那份是**增強版、刻意不同**，明文不納入稽核。覆蓋它會把孵化器的上傳功能改壞。
# ⚠️ **public/upload/color-palette/ 不在同步範圍**：那是使用者上傳的圖與 .registry.json，
# 兩邊各自獨立、內容不進版控。① 只複製 public/apps/color-palette。
#
# 用法：bash scripts/sync-copies.sh
set -u
G=/Users/Shared/nodeapp/GitHub
I=/Users/Shared/nodeapp/InProgress
SRC=$G/color-palette/public/apps/color-palette
DST=$I/public/apps/color-palette
FAIL=0

echo "=== ① 整包前端 → InProgress 鏡像（只同步程式碼；上傳圖與 registry 不在此）==="
mkdir -p "$DST"
# ⚠️ `cp` 的失敗要自己接：它把錯誤印到 stderr 就算了，**不會讓腳本失敗**。
# 若接著只看 diff，遇到「複製失敗但兩邊本來就相同」會印 OK ＋ exit 0——
# 又一次「錯誤訊息與成功長得一模一樣」（同本輪 faber-castell-color 那個洞）。
if ! cp -R "$SRC/." "$DST/"; then
  echo "  ERROR  cp 失敗（見上方 cp: 訊息）——鏡像未更新"
  FAIL=1
fi

# `cp` 不會刪檔，所以這條 diff 不是廢話——它抓的是**鏡像裡的殘留檔**
# （獨立版刪掉、鏡像還留著）。fc-names-i18n.js 被移除時就是這種情形。
if diff -rq "$SRC" "$DST" > /dev/null; then
  echo "  OK  與獨立版逐檔相同（$(find "$SRC" -type f | wc -l | tr -d ' ') 個檔）"
else
  echo "  MISMATCH  以下有差異（鏡像可能有殘留檔）："
  diff -rq "$SRC" "$DST"
  FAIL=1
fi

echo "=== ② route → InProgress（本 app 有後端）==="
# 掛載點由 InProgress 的 app.js 決定（/api/color-palette），route 檔本身兩邊逐字相同。
if ! cp "$G/color-palette/routes/color-palette.js" "$I/routes/color-palette.js"; then
  echo "  ERROR  cp 失敗（見上方 cp: 訊息）——route 未更新"
  FAIL=1
fi
if diff -q "$G/color-palette/routes/color-palette.js" "$I/routes/color-palette.js" > /dev/null; then
  echo "  OK  routes/color-palette.js 相同"
else
  echo "  MISMATCH  routes/color-palette.js"
  FAIL=1
fi
echo "  註：routes/upload.js **刻意不同步**（InProgress 是增強版）；route 有變更時 **3001 常駐 server 要重啟**。"

echo "=== ③ 借來的共用件：與權威版比對（只驗不抓）==="
check() {  # $1=本地相對路徑  $2=權威版絕對路徑  $3=權威版說明
  local a b
  a=$(md5 -q "$SRC/$1" 2>/dev/null) || a=MISSING
  b=$(md5 -q "$2" 2>/dev/null) || b=MISSING
  if [ "$a" = "$b" ] && [ "$a" != "MISSING" ]; then
    printf "  OK        %-26s %s\n" "$1" "$a"
  else
    printf "  MISMATCH  %-26s local=%s auth=%s\n" "$1" "$a" "$b"
    printf "            ← 權威版：%s\n" "$3"
    FAIL=1
  fi
}

FAM=$G/nodeapp-webapp-family
FC=$G/faber-castell-color/public/apps/faber-castell-color
CDA=$G/caran-dache-color/public/apps/caran-dache-color
CPC=$G/copic-color/public/apps/copic-color
FCL=$G/finecolour-color/public/apps/finecolour-color
ENM=$G/enmy-color/public/apps/enmy-color

check materialize-dark.css        "$FAM/materialize-dark.css"        "nodeapp-webapp-family（§5.1）"
check side-tool.css               "$FAM/side-tool.css"               "nodeapp-webapp-family（§5.5）"
check side-tool.js                "$FAM/side-tool.js"                "nodeapp-webapp-family（§5.5）"
check i18n.js                     "$FAM/i18n.js"                     "nodeapp-webapp-family（locales/*.js 本 app 自維護，不比）"
check color-metric.js             "$FAM/color-metric.js"             "nodeapp-webapp-family（§4 A 類；⚠️ <script> 必須早於 color-palette-lib.js）"
check color-family.js             "$FAM/color-family.js"             "nodeapp-webapp-family（§4 A 類；⚠️ <script> 必須早於 color-palette-lib.js）"
check faber-castell-color-lib.js  "$FC/faber-castell-color-lib.js"   "faber-castell-color（nearestFC）"
check data/fc-colors.js           "$FC/data/fc-colors.js"            "faber-castell-color（由 db_artcolor 匯出）→ 跑該 repo 的 sync-copies.sh"
check caran-dache-color-lib.js    "$CDA/caran-dache-color-lib.js"    "caran-dache-color（nearestCDA）"
check data/cda-colors.js          "$CDA/data/cda-colors.js"          "caran-dache-color（由 db_artcolor 匯出）→ 跑該 repo 的 sync-copies.sh"
check copic-color-lib.js          "$CPC/copic-color-lib.js"          "copic-color（nearestCOPIC）"
check data/copic-colors.js        "$CPC/data/copic-colors.js"        "copic-color（由 db_artcolor 匯出）→ 跑該 repo 的 sync-copies.sh"
check finecolour-color-lib.js     "$FCL/finecolour-color-lib.js"     "finecolour-color（nearestFinecolour）"
check data/finecolour-colors.js   "$FCL/data/finecolour-colors.js"   "finecolour-color（由 db_artcolor 匯出）→ 跑該 repo 的 sync-copies.sh"
check enmy-color-lib.js           "$ENM/enmy-color-lib.js"           "enmy-color（nearestENMY）"
check data/enmy-colors.js         "$ENM/data/enmy-colors.js"         "enmy-color（由 db_artcolor 匯出）→ 跑該 repo 的 sync-copies.sh"

echo
if [ "$FAIL" -eq 0 ]; then
  echo "全部通過。"
else
  echo "有項目不一致（見上），③ 未自動修正——請到權威版那側同步。"
fi
exit "$FAIL"
