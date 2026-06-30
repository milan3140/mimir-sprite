#!/usr/bin/env bash
# VERIFICATION BATCH for the autonomous 8h quality run.
# The autonomous loop could NOT run Bash (VSCode extension prompts on every command, user away), so all
# code was edited but NOT typechecked/tested. Run THIS when you're back, from Mimir-Sprite/, in the CLI
# (`claude` in a terminal) or with bypassPermissions mode — where Bash runs without prompting.
#
# Fix chunks append their own checks below as the run proceeds.
set -uo pipefail
cd "$(dirname "$0")"
fail=0

echo "===== 1. Typecheck (catches every audit-fix edit across main + renderer) ====="
npx tsc --noEmit -p tsconfig.json && echo "  TSC OK" || { echo "  TSC FAILED"; fail=1; }

echo "===== 2. Bubble timing unit test (pure logic) ====="
node scripts/test_bubble_timing.mjs || fail=1

echo "===== 3. Real-app probes (need bypass mode / CLI; they launch Electron) ====="
# kill stragglers first
taskkill //F //IM electron.exe //T 2>/dev/null || true
taskkill //F //IM node.exe //T 2>/dev/null || true
PYTHONIOENCODING=utf-8 GUI_PROBE_GHOST=0 py scripts/probe_suite.py            || fail=1   # geometry invariants (no regression)
PYTHONIOENCODING=utf-8 GUI_PROBE_GHOST=0 py scripts/probe_panel_clamp_ch.py   || fail=1   # work-area clamp
PYTHONIOENCODING=utf-8 MIMIR_FAKE_CLAUDE=1 GUI_PROBE_GHOST=0 py scripts/probe_think_ch.py || fail=1  # thinking pipeline ([任務] first bubble) + NOW persistence

# (fix chunks append more checks here)

echo "===== 3b. Thinking web-grounding (REAL claude call, ~\$0.9 — OPT-IN, costs money) ====="
echo "  # VERIFIED interactively already (0->5 real searches, full 0-9 output, real citations)."
echo "  # To re-verify after any stage1Prompt edit, run from the configured vault cwd:"
echo "  #   cat <stage1-prompt-with-a-volatile-todo> | claude -p --output-format stream-json --verbose \\"
echo "  #     --model claude-sonnet-4-6 --max-turns 16 --allowedTools 'Read,Grep,Glob,WebSearch,WebFetch' > _ws.jsonl"
echo "  # Then assert (the CORRECT oracle — NOT usage.server_tool_use.web_search_requests, which is the API"
echo "  # server tool and stays 0 for the CLI's client-side WebSearch — see reference_claude_cli_websearch):"
echo "  #   - 1..6 assistant tool_use blocks with name=='WebSearch'  (searched, within cap)"
echo "  #   - concatenated assistant text contains section markers 0..9  (finished, not truncated)"
echo "  #   - total_cost_usd < ~0.90 and num_turns < 16  (stopped on its own, cost bounded)"

echo "===== 3c. Knowledge-base ingest dry-run (no app; safe on the TEST vault only) ====="
echo "  # Tiered+incremental index generator. Run against the COPY vault first, inspect output, never the real vault blind:"
echo "  #   py 2_Toolkit/Harness/knowledge_base_design/ingest_index.py D:/AI_Agents_Projects/0_Project-Mimir_ObsidianTest"
echo "  #   -> expect: index.md (thin root) + per-area _INDEX.md; re-run should report most files 'cached' (incremental works)."

echo "===== 4. VISUAL review (no automated oracle) — launch the app + look ====="
echo "  npm run dev   # then eyeball:"
echo "  - row: number ordinal (1. 2. 3.) at the left; drag ANY blank space to reorder (4px threshold so clicks/double-click-rename still work);"
echo "    icons are ~24px hit boxes; delete needs 2 clicks (Trash->Check confirm); chevron ROTATES (no icon swap); Brain is brand-colored when a transcript exists."
echo "  - detail accordion: open a todo that was 🧠-thought → 'ThinkingTranscript' shows the full stage-1 plan."
echo "  - speech bubbles (Ctrl+Alt+B mock): first bubble is [任務]; 9 distinct tag colors; ≤~4 visible; CLICK any bubble → full-text overlay (close ✕); ears nub still flush + both ears."
echo "  - empty list shows the 還沒有待辦 + hint; hidden nub bobs + brightens on hover; add-textarea shows a focus ring."

echo ""
if [ "$fail" = 0 ]; then
  echo "ALL GREEN. Review the diff, then commit:"
  echo "  git add -A && git commit -m 'Mimir-Sprite: industry-standard quality pass (audit-driven fixes)'"
else
  echo "SOME CHECKS FAILED — read the output above; fixes are in the diff, unverified until green."
fi
