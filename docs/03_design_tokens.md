# 03 · Design Tokens(暗色極簡)

沿用 toolkit 的 **單一 `--hue` 驅動全站色彩** 方法(`2_Toolkit/Output/Interactive/UIUX/design_system/Tailwind_Design_Token_Setup.md`)。整個 UI 走暗色極簡;**唯一例外是 avatar 本身**(pixel art 用原色)。

## 原則
- 一個 `--hue`(0–360)推導 brand / 灰階 / 語義色。改一處即換主題。預設 `--hue: 265`(沉靜的藍紫,管家感)。
- 玻璃感懸浮面板:深色半透明 + backdrop-blur,貼合「懸浮在桌面上」。
- 純 icon 控制列,不寫字(符合需求 5/6/8)。
- 間距/圓角走小尺度(widget 很小)。

## CSS 變數(`index.css` 起手包)
```css
:root {
  --hue: 265;

  /* 表面:暗色玻璃 */
  --bg:            hsl(var(--hue) 18% 8%  / 0.72);  /* panel 背景(半透明) */
  --bg-solid:      hsl(var(--hue) 18% 8%);
  --surface:       hsl(var(--hue) 16% 13% / 0.9);   /* todo item */
  --surface-hover: hsl(var(--hue) 16% 18%);
  --border:        hsl(var(--hue) 14% 26% / 0.6);

  /* 文字 */
  --fg:            hsl(var(--hue) 12% 92%);
  --fg-muted:      hsl(var(--hue) 10% 62%);
  --fg-faint:      hsl(var(--hue) 10% 42%);

  /* brand / 互動 */
  --brand:         hsl(var(--hue) 70% 62%);
  --brand-hover:   hsl(var(--hue) 70% 70%);
  --ring:          hsl(var(--hue) 70% 62% / 0.5);

  /* 語義 */
  --success:       hsl(150 55% 55%);   /* 完成 */
  --warning:       hsl(40  85% 60%);   /* 暫停/休息 */
  --danger:        hsl(360 70% 62%);   /* 刪除 */
  --thinking:      hsl(var(--hue) 80% 68%);  /* bubble 邊光 */

  /* 形 */
  --radius:        10px;
  --radius-sm:     7px;
  --gap:           6px;
  --pad:           10px;

  /* 動 */
  --ease:          cubic-bezier(.2,.8,.2,1);
  --dur-fast:      120ms;
  --dur:           200ms;
  --dur-slow:      320ms;

  /* 陰影(懸浮) */
  --shadow:        0 8px 28px hsl(var(--hue) 40% 3% / 0.55);
  --glow-think:    0 0 0 1px var(--thinking), 0 0 14px hsl(var(--hue) 80% 60% / 0.35);
}
```

## Tailwind 對接
`tailwind.config` 用 `hsl(var(--…))` 包成語義色(`bg`, `surface`, `brand`, `fg`, `fgMuted`, `success`, `warning`, `danger`, `thinking`);spacing/radius 對 `--gap/--pad/--radius`。元件只用語義 token,**禁硬編碼色值**(檢查器 07 會掃)。

## 元件規格(關鍵)
| 元件 | 規格 |
|---|---|
| Panel | `bg` + `backdrop-blur-md` + `border` 1px + `--shadow` + `--radius` |
| Todo item | `surface`,hover→`surface-hover`,active 項左側 2px `brand` 條 |
| Icon 按鈕 | 24×24,`fg-muted`→hover `fg`/語義色;Lucide:`Play Pause Check Coffee Brain Trash GripVertical Plus EyeOff` |
| Bubble | `surface` + `border` + `--glow-think`(thinking 中),`--radius-sm`,小箭頭指向 avatar |
| AddTodo input | `bg-solid` + `border`,focus→`ring` |

## Icon 對照(Lucide React,純 icon 不寫字)
| 動作 | Icon | 出現條件 |
|---|---|---|
| 開始 | `Play` | status=pending/paused |
| 暫停 | `Pause` | status=active |
| 完成 | `Check` | status=active/paused |
| 休息時刻 | `Coffee` | panel 頂部全域 |
| 思考 | `Brain`(或 `Sparkles`) | 每個 item |
| 刪除 | `Trash2` | hover item |
| 拖曳把手 | `GripVertical` | item 左側 |
| 新增 | `Plus` | input 右 |
| 隱藏 | `EyeOff` | panel 頂部 |

## 60 秒自檢
改 `--hue` 一處,全站換色且對比不爆;暗色下 `fg` 對 `bg` ≥ 7:1,`fg-muted` ≥ 4.5:1;icon-only 控制有 `aria-label` + tooltip。
