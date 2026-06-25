# 08 · Cron 自我開發迴圈(Task D)

> ⚠️ **需你最終確認才啟用。** 這是一個會自動 spawn Claude agent 改本專案的迴圈,屬於高權限/難監督行為,預設**只 dry-run(出提案不動手)**,確認後才開「執行檔」。

## 角色定位
Cron 起來的我**不是埋頭迭代的工人**,而是**資深開發者 / PM / 實驗與假說設計者**:觀察開發成果、檢驗品質、想潛在風險與下一步方向,**設計工作**,再用 subprocess 派**別的 agent**(或分裂一份我自己)去執行。我負責「想與驗」,被派的 agent 負責「做」。

## 迴圈(每次 cron 觸發)
```
1. 感知   讀 check-report.json(07)、git log、docs、TODO_BACKLOG.md、上次 cron 的 handoff
2. 評估   用 07 的 rubric 對最近產出打分;找退步/卡點/風險
3. 假說   提出「下一步該做什麼 + 為什麼 + 成功長相」1–3 個候選,排序
4. 決策   選 1 個(或標記需人工決定的事項給使用者)
5. 派工   spawn 執行 agent:給任務卡 + 注入剛好夠的 context(見下)
6. 驗收   執行 agent 回來後跑 npm run check;綠燈才 commit,紅燈退回或回滾
7. 交棒   寫 handoff(做了什麼/結果/下次從哪接)+ 更新 backlog
```

## 派工方式(subprocess + session)
三種,依任務獨立性選:
- **A. 全新 agent**(預設):`claude -p "<任務卡>" --session-id <new> --output-format json --add-dir <project> --permission-mode acceptEdits --allowedTools "Read,Edit,Write,Bash(npm *),Bash(git *)" --max-turns 30`。乾淨 context,我在任務卡裡塞該做的事 + 相關檔路徑。
- **B. 注入 context 的 agent**:context 不夠時,把相關 docs/檔內容寫進一個 brief 檔,任務卡指向它(避免超 stdin 10MB)。
- **C. 分裂一份我自己**:`--session-id <new> --resume <my-session> --fork-session`,複製當前 session 帶著完整脈絡去執行(脈絡高度相依時用)。

每次派工**獨立進程**:拿得到 exit code + `total_cost_usd`,好預算控管。

## 安全護欄(必備)
- **隔離**:執行 agent 在 **git worktree** 或專屬分支跑,不直接動 main;綠燈才合併。
- **權限**:`acceptEdits` + 明列 `allowedTools`,**不用** `--dangerously-skip-permissions`。
- **預算**:每次 `--max-budget-usd` + 每日總上限;超過停手、留 handoff。
- **回滾**:每步前 `git commit` checkpoint(呼應 memory 的「改前先 commit」)。
- **人類閘**:涉及刪檔、改 schema、裝新依賴、對外網路 → 標記成「需人工確認」不自動做。
- **停損**:連續 N 次 check 紅燈 → 暫停迴圈、通知使用者。

## 觸發機制(Claude Code 排程)
用 `CronCreate` 設一個每 ~70 分鐘的排程任務,prompt 指向本 loop 的 runbook(`scripts/cron_pm_loop.md`)。也可改用 OS 排程器跑 `scripts/cron_pm_loop.py`。**M8 才接線,且預設 dry-run。**

## 產出檔
```
scripts/cron_pm_loop.(py|md)   # runbook + spawner
state/handoffs/<ts>.md         # 每輪交棒
state/TODO_BACKLOG.md          # 動態待辦池(PM 維護)
state/cron_runs.jsonl          # 每輪:決策、派了誰、cost、check 結果
```

## Dry-run vs 執行
- **dry-run(預設)**:只跑 1–4 步,產出「我會派這個任務、這樣派、預期這結果」的提案寫進 handoff,**不 spawn 改檔**。
- **執行模式(你確認後)**:跑全 7 步,真的 spawn agent 改檔 + commit。
切換用 `state/cron_mode`(`dry`/`live`)一個檔控制。
