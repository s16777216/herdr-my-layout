# herdr-my-layout

Custom Herdr IDE layout (`my-layout.json`) featuring a flush, sharp-edged workspace design with aligned 42px headers, a two-part workspace-scoped sidebar (`workspace-spaces` + `workspace-agents`), and a compact 42px `sidebar-footer` with a gear menu.

![Preview](preview.png)

## Layout Highlights

- **Left Sidebar (`268px`)**:
  - `workspace-chrome` brand header (`46px`)
  - `workspace-spaces`: Spaces list with a compact second-row agent status summary (`working`, `blocked`, `done`, `idle` where count > 0, including dormant sessions)
  - `workspace-agents`: Active-workspace-only agents list (redundant space group header hidden) with across-restart dormant session persistence and one-click resume
  - `sidebar-footer` (`42px`): `[+ Add machine]` + gear popup (`Mods`, `Settings`) anchored above the gear button
- **Top Tab Bar (`42px`)**: `pierre-tree-files-tab` with file icons and quick actions.
- **Main Work Body (`padding: 0`, `gap: 0`)**:
  - **Main Pane (`radius: 0`, `gap: 0`)**: Sharp-edged terminal/editor panes with a `41px` header (`+ 1px` top border = `42px` total) aligned with the right panels.
  - **Right Panel (`368px`)**: `pierre-tree-files` (with `pierre-tree-files-menu` context menu) & `git` (Changes) stack.
- **Status Bar (`28px`)**: `agent-usage`.

## Installation

Copy `layouts/my-layout.json` and `mods/*` into your Herdr config directory (`%USERPROFILE%\.config\herdr-app\`), then switch to `my-layout` in Herdr (`ctrl-shift-l` or Settings).

## Included Mods

- `workspace-spaces` & `workspace-agents`
- `sidebar-footer`
- `pierre-tree-files-tab`, `pierre-tree-files`, `pierre-tree-files-editor`, `pierre-tree-files-menu`
- `git`
- `agent-usage`
