import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, run, layout, openOverlay } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export default class RightActivityBar extends View {
  render() {
    const t = theme();
    const root = layout();
    const panel = find(root, "panel");
    const body = find(root, "panel-body");

    const isPanelOpen = panel && !panel.hidden;
    const activeChild = body?.active ?? "files";

    const item = (id, icon, label, active, onClick, badge) => {
      return div()
        .id(id)
        .relative()
        .w_full()
        .h(42)
        .flex()
        .items_center()
        .justify_center()
        .cursor_pointer()
        .tooltip(label)
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click((_e, cx) => {
          cx.stop_propagation();
          onClick();
        })
        .hover((s) => s.bg(t.hover))
        // Active indicator on right edge (VS Code style 2px bar)
        .when(active, (el) =>
          el.child(
            div()
              .absolute()
              .right(0)
              .top(8)
              .bottom(8)
              .w(2)
              .rounded(1)
              .bg(t.foreground)
          )
        )
        // Icon
        .child(
          svg(`mods/workspace-chrome/${icon}.svg`)
            .size(20)
            .text_color(active ? t.foreground : t.dim)
        )
        .when(Boolean(badge), (el) => el.child(badge));
    };

    const togglePanel = (targetId) => {
      const curRoot = layout();
      const curPanel = find(curRoot, "panel");
      const curBody = find(curRoot, "panel-body");
      const currentlyOpen = curPanel && !curPanel.hidden;
      const currentlyActive = curBody?.active;

      if (currentlyOpen && currentlyActive === targetId) {
        run("layout.hide", { id: "panel" });
      } else {
        run("layout.select", { stack: "panel-body", child: targetId });
        run("layout.show", { id: "panel" });
      }
    };

    return v_flex()
      .id("activity-bar-right")
      .size_full()
      .bg(t.chrome)
      .items_center()
      .py(4)
      .child(
        item(
          "btn-act-files",
          "files",
          "檔案總管 (Explorer)",
          isPanelOpen && activeChild === "files",
          () => togglePanel("files")
        )
      )
      .child(
        item(
          "btn-act-git",
          "git-branch",
          "版本控制與變更 (Source Control)",
          isPanelOpen && activeChild === "changes",
          () => togglePanel("changes")
        )
      )
      .child(div().flex_1());
  }
}
