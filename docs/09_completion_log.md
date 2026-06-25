# 09 · Completion Log(完成項目記錄)

> 來自補充需求:點「完成」的項目要把相關紀錄 log 起來。內容暫定:session id + 位置、關鍵項目背景、完成結果。方式傾向 **Obsidian + LLM wiki**。

## 設計理念
完成 = 一次「知識沉澱」的時機。不只存事實,更用 Claude 把這次任務萃取成一則**可被未來檢索與連結的 wiki 筆記**,丟進 Obsidian vault,靠雙鏈 `[[ ]]` 自動長成知識圖。每筆同時寫一份結構化 jsonl 給程式/檢查器用。

## 觸發與流程
```
todo.complete()
  → completionLogger.log(todo)
      1. 收集事實:todo 全欄位 + 各 thinkingSession 的 rawAnswer/bubbles
                 + 各 notebook 的 thread 訊息(補充 3) + 計時
      2. 【M3 起】先寫 jsonl 事實 log(下方),不靠 LLM —— 確保任何情況都有紀錄
      3. (可選)問使用者一句「這項完成結果是?」一行輸入(可跳過)
      4. 【M7 起】LLM 萃取:claude -p 把事實 + 多本筆記 + thinking 合成 wiki 筆記
      5. 寫檔:Obsidian vault 一則 .md(YAML frontmatter + 雙鏈)
      6. 回寫 todo.completionLogPath
```
mode=`obsidian` / `jsonl` / `both`(預設 both)。vault 路徑由 `settings.log.vaultPath`;未設則只走 jsonl,並提示去設定。

## Obsidian 筆記格式(`<vault>/Mimir-Sprite/<date>-<slug>.md`)
```markdown
---
type: task-log
title: {{title}}
status: done
created: {{createdAt iso}}
completed: {{completedAt iso}}
active_time: {{totalActiveMs → 人類可讀,如 "3h 20m"}}
thinking_sessions: [{{session ids}}]
transcripts: [{{~/.claude/projects/.../<id>.jsonl 路徑}}]
tags: [mimir-sprite/task, {{llm 萃取的領域標籤}}]
cost_usd: {{thinking 總花費}}
---

# {{title}}

## 背景
{{notes;若空,LLM 從 thinking 推一句}}

## 做了什麼 / 完成結果
{{使用者一句輸入 + LLM 從 thinking/計時 推補}}

## 關鍵決策與學到的事
{{LLM 萃取:這次值得記住的 2–4 點}}

## 前置準備回顧
{{把當初 thinking 的準備清單 vs 實際,LLM 對照,標哪些有用/多餘}}

## 連結
- 領域:[[{{domain}}]]
- 相關任務:[[{{LLM 從既有 vault 筆記猜的相關標題}}]]
- 後續可做:[[{{follow-ups}}]]

> session: {{ids}} · 位置: {{transcript paths}}
```
`[[ ]]` 雙鏈讓 Obsidian 自動建反向連結 = 「LLM wiki」的圖譜效果;領域/相關任務節點不存在時 Obsidian 顯示為待建節點,日後自然長出。

## LLM 萃取 prompt(精簡版)
```
把這次完成的任務整理成一則知識庫筆記。輸入:任務標題、背景、執行時間、當初的準備規劃、使用者的完成回饋。
請輸出:1) 一句「完成結果」 2) 2–4 點關鍵決策/學到的事 3) 當初準備清單哪些真的有用、哪些多餘(各一句) 4) 3–6 個 [[雙鏈]] 候選(領域、相關任務、後續),用簡潔名詞當節點名。
務實、具體,不灌水。{{把事實 JSON 附在後面}}
```
失敗/無 vault/無 CLI → 退回只寫 jsonl 的事實版(不含 LLM 段落),不擋完成動作。

## jsonl 格式(`state/completion_log.jsonl`,程式用)
```jsonc
{ "todoId":"…", "title":"…", "createdAt":0, "completedAt":0, "totalActiveMs":0,
  "thinkingSessionIds":["…"], "notebookIds":["…"], "transcriptPaths":["…"],
  "domainTags":["…"], "result":"…", "obsidianPath":"…", "costUsd":0 }
```

## 與既有 Mimir 知識體系的關係
vault 預設可指向使用者既有 Obsidian;或在 `1_Projects/1_Software_and_Agents/Mimir-Sprite/vault/` 自帶一個。雙鏈節點命名與 Mimir GDM/方法論若重疊,日後可手動合併圖譜。**待你確認:vault 要用既有的還是新開一個?**(M6 前需定。)
```
```
