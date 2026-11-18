# my-layout

A flush, sharp-edged workspace layout for Herdr that pairs a 268px two-part sidebar (`workspace-spaces` with per-space agent status counts + `workspace-agents` scoped to the active workspace + a 42px `sidebar-footer` with gear popup) with a 42px icon-aware tab strip, a 0px-radius terminal/editor stage with a 41px pane header (+ 1px top border = 42px), a 368px right-side Files/Changes stack, and a 28px live agent-usage status bar.

![my-layout](preview.png)

## What you see

The window (`root`, `"type": "row"`, `"background": "canvas"`, `"terminal_padding": [14, 12]`) is split left to right into two visible columns (`sidebar` and `work`):

1. **Left Sidebar (`sidebar`, 268px fixed, `background: "chrome"`, `resizable: false`, min 44px, max 480px)**:
   - **Brand header (`brand`, 46px, `window_drag: true`)**: Shipped `workspace-chrome` mod showing the Herdr mark, search button, and sidebar toggle.
   - **Sidebar Lists (`sidebar-lists`, `type: "column"`)**:
     - **Spaces (`spaces`, `weight: 1`, min 90px)**: `workspace-spaces` mod (cloned from `spaces`) showing Spaces grouped by machine with 18px colored initial badges (`rounded(5)`), truncated space names, and git branch/ahead/behind tail. When a Space has live or dormant agents (`working`, `blocked`, `done`, `idle`), a second 16px sub-row (`pl(27)` or `pl(44)` for worktrees) appears directly beneath the name showing only statuses with `count > 0` (`spinner.svg` for `working`, solid/outline 6px dots for `blocked`/`done`/`idle`, with valid dormant sessions from `shared("workspace.dormant_sessions")` counted under `idle`). Spaces with zero agents remain single-line.
     - **Agents (`agents`, `weight: 1`, min 90px)**: `workspace-agents` mod (cloned from `agents`) strictly filtered to the active Space (`a.space === activeSpace`), with the redundant `grouped` space header (`sp-*`) hidden while preserving sub-agent trees, folding, pinning, sort menu, status dots, duration labels, and persisted dormant session rows across restarts (`agent_sessions_v2`).
   - **Sidebar footer (`sidebar-footer`, 42px)**: Custom `sidebar-footer` mod rendering a single compact row (`+ Add machine` on the left, gear icon button on the right with an update dot when ready). Clicking the gear opens a `popup` menu anchored above the gear button (left edge aligned with the gear's right edge) containing `Mods` and `Settings` (plus `Add machine` when collapsed in `narrow()` mode).

2. **Right Workspace Column (`work`, `type: "column"`, `resizable: false`)**:
   - **Tab Bar (`tabs`, 42px, `window_drag: true`)**: `pierre-tree-files-tab` mod showing active space tabs with program/file-extension icons, dirty indicators, `+` new-tab menu, `Files` / `Git` panel toggles, and window controls.
   - **Work Body (`work-body`, `type: "row"`, `"padding": 0`, `"gap": 0`)**:
     - **Main Stage (`main`)**: Active tab panes (`"tab": "active"`) wrapped with `"lone": true`, `"radius": 0`, `"gap": 0`, `"background": "background"`, `"border": { "width": 1, "color": "border" }`, `"focus": { "width": 1, "color": "accent" }`, and a top `pane` header (`"height": 41`, `"reveal": "always"`, `"position": "top"`). The 1px top border + 41px header totals 42px so its bottom divider aligns flush with the right panel's 42px header. Hosts terminal panes and `pierre-tree-files-editor` mod panes.
     - **Side Panel (`panel`, 368px, min 280px, max 900px, `"hidden": true` until toggled)**: A `stack` (`panel-body`, active `"files"`) switching between:
       - `files` (`pierre-tree-files`): Sharp-edged (`overflow_hidden`, `border_l(1)` `t.border`, no `rounded(10)`) file tree with 42px header, `ctrl-f` search bar, folder loading spinner (`spin(900)` + `Loading…`), and click-to-open in `pierre-tree-files-editor`.
       - `changes` (`git`): Sharp-edged (`K.panel` with `border_l(1)` `t.border` or `t.accent` when focused, no `rounded(10)`) commit graph and working-tree changes panel with a 42px header, collapsible `Graph` section (`git-graph.collapsed`), and no `View as list` toggle in the commit bar.
   - **Status Bar (`status`, 28px)**: `agent-usage` mod displaying live quota/usage meters (`X%(countdown)` when `pct > 0`, tooltip-free badges) across providers.

## How it behaves

- **Agent Statuses**:
  - `working`: Animated spinner (`spinner.svg`, `.spin(900)`, `t.working`) in `workspace-spaces` and `workspace-agents`.
  - `blocked`: Solid dot (`t.blocked`) in `workspace-spaces` and `workspace-agents`.
  - `done`: Solid dot (`t.done`) / attention indicator until focused.
  - `idle`: Subtle outline/dim dot (`t.dim` / `t.muted`).
- **Workspace-Scoped Agents & Dormant Persistence (`workspace-agents`)**: Switching Spaces immediately updates the lower `Agents` list to show live and dormant agents belonging to the active Space, and `setAgentOrder` keeps `agent.next` / `agent.prev` scoped to that Space. Live sessions are persisted to `localStorage` (`agent_sessions_v2`) and mirrored to `shared("workspace.dormant_sessions")` with real session IDs resolved from `~/.claude/history.jsonl`, `~/.gemini/antigravity-cli/history.jsonl`, and `~/.codex/session_index.jsonl`; explicitly exited agents during the current session (`seenLiveKeys`) are pruned, while sessions whose tabs survive an OS/core restart stay listed in dimmed style (`dormantRow`). Left-clicking a dormant row (or picking Resume/New/Dismiss from its right-click `sessionMenu`) resumes via `claude --resume` / `agy --conversation` / `codex resume` / `pi --session`.
- **Clicks, Keys, and Hover**:
  - Clicking a space in `workspace-spaces` selects it (`space.select`); dragging reorders within the same machine (`space.move`).
  - Clicking `+ Add machine` opens `machine-add`; clicking the gear icon opens the `sidebar-footer` popup menu (`Mods`, `Settings`).
  - Clicking a file in `pierre-tree-files` focuses an existing active-space `pierre-tree-files-editor` tab/pane (`shared("pierre-tree-files.open_files")`) or opens a new tab if not yet open, while highlighting the focused file in the tree; `Ctrl+Click` / `Cmd+Click` / `Alt+Click` or clicking the hover `panel-right` icon splits right inside the active tab without duplicating open split panes. Inside the editor, `ctrl-s` / `cmd-s` saves via `bind_keys` + `on_action`, and `.md`/`.markdown`/`.mdx` files default to `Preview` (`TextView.markdown`) with a `Preview | Source` toggle and clickable links.
  - File editor tabs (`isEditorTab`) in `pierre-tree-files-tab` ignore double-click `tab.rename` and show an editor-specific right-click popup (`New tab`, `Close`, omitting `Rename`).
  - Right-clicking a file, folder, or empty space in `pierre-tree-files` opens `pierre-tree-files-menu` (open, split right/down, copy path/relative path, reveal in Explorer, open terminal here, new file/folder, rename, delete).

## Built from

- **Layout (`layouts/my-layout.json`)**: Cloned from `main` (`0.1.14`), modified with `workspace-spaces` + `workspace-agents`, custom `sidebar-footer` (`42px`), `work-body` `padding: 0`, `gap: 0`, `main.content.pane` `radius: 0`, `gap: 0`, and `header.height: 41`.
- **Shipped mods**: `workspace-chrome` (header), `pane`.
- **Custom mods in `mods/`**:
  - `workspace-spaces` (cloned from `spaces`, adds per-space non-zero agent status summary row including dormant `idle` counts)
  - `workspace-agents` (cloned from `agents`, strict active-space filter, hidden `sp-*` group header, dormant session persistence & resume popup menu)
  - `sidebar-footer` (42px single-row footer + gear popup menu with `icons/layers.svg`, `icons/settings.svg`, `icons/plus.svg`)
  - `pierre-tree-files-tab`
  - `pierre-tree-files` + companion editor pane `pierre-tree-files-editor` + companion context menu/dialog `pierre-tree-files-menu`
  - `git` (`K.panel` updated to `border_l(1)` with no `rounded(10)`)
  - `agent-usage`
- **Herdr APIs & External Tools**: Uses `spaces()`, `panes()`, `terminals()`, `agents()`, `focused()`, `theme()`, `shared()`, `setShared()`, `readTextFile()`, `home()`, `run()` (`space.select`, `space.move`, `tab.new`, `tab.select`, `pane.focus`, `pane.split`, `mod.open`, `app.settings`), `openOverlay()`, `closeOverlay()`, `exec()`, and `hc` CLI (`hc send`).

## Watch out

- **Mod-level borders override layout**: `pierre-tree-files` (`mods/pierre-tree-files/main.js`) and `git` (`mods/git/kit.js`) originally draw `.rounded(10).border_1()` on their root containers. Both are adjusted here to `border_l(1)` without `rounded(10)` so they sit flush against the 0px-radius `main` pane without a double 2px seam.
- **Header alignment math**: `main.content.pane` has a 1px top border (`"border": { "width": 1 }`), so `"header": { "height": 41 }` is required to match the 42px headers of `pierre-tree-files` and `git`.
- **Platform assumptions**: Local shell/file operations in `pierre-tree-files`, `pierre-tree-files-editor`, `pierre-tree-files-menu`, and `git` target Windows (`pwsh`, `cmd`, `explorer.exe`, Git for Windows).

## Done when

1. `herdr-app check` passes with exit code 0 on all 9 mods in `mods/` (`workspace-spaces`, `workspace-agents`, `sidebar-footer`, `pierre-tree-files-tab`, `pierre-tree-files`, `pierre-tree-files-editor`, `pierre-tree-files-menu`, `git`, `agent-usage`).
2. `layouts/my-layout.json` loads in Herdr (`herdr-app do layout.switch '{"name":"my-layout"}'`) with no `layout.error`.
3. Visual verification (`herdr-app shot`) confirms:
   - `workspace-spaces` shows a second status-count row only for spaces with live or dormant `agents > 0`, and `workspace-agents` shows only the active space's live and dormant agents (with click-to-resume) without a redundant space group header.
   - `sidebar-footer` renders `[+ Add machine]` + gear button in 42px, with the gear popup anchored above the button (`at`).
   - `work-body` has zero outer padding/gap, sharp 90-degree corners, and flush 42px header alignment across `main`, `Files`, and `Changes`.
   - `agent-usage` renders `X%(countdown)` on status bar badges when `pct > 0` (omitting countdown at `0%`) with no tooltip on hover.
