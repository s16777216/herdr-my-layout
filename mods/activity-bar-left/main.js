import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, run, layout, agents, shared, setShared } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export default class LeftActivityBar extends View {
  render() {
    const t = theme();
    const root = layout();
    const sb = find(root, "sidebar");
    const isSidebarOpen = !sb?.hidden && (sb?.size?.px ?? 0) > 44;

    const allAgents = agents() ?? [];
    const blockedCount = allAgents.filter((a) => a.status === "blocked").length;
    const workingCount = allAgents.filter((a) => a.status === "working").length;

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
        // Active indicator on left edge (VS Code style 2px bar)
        .when(active, (el) =>
          el.child(
            div()
              .absolute()
              .left(0)
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
        // Badge indicator
        .when(Boolean(badge), (el) => el.child(badge));
    };

    const agentBadge =
      blockedCount > 0
        ? div()
            .absolute()
            .right(7)
            .bottom(7)
            .size(7)
            .rounded(4)
            .bg(t.blocked)
        : workingCount > 0
        ? div()
            .absolute()
            .right(7)
            .bottom(7)
            .size(7)
            .rounded(4)
            .bg(t.working)
        : null;

    const toggleSidebar = () => {
      const curRoot = layout();
      const curSb = find(curRoot, "sidebar");
      if (curSb?.hidden) {
        run("layout.show", { id: "sidebar" });
        const savedW = shared("sidebar.user_width") ?? 268;
        run("layout.resize", { id: "sidebar", px: savedW });
      } else {
        const curW = curSb?.size?.px ?? 268;
        if (curW > 44) setShared("sidebar.user_width", curW);
        run("layout.hide", { id: "sidebar" });
      }
    };

    return v_flex()
      .id("activity-bar-left")
      .size_full()
      .bg(t.chrome)
      .items_center()
      .py(4)
      .child(
        item(
          "btn-act-sidebar",
          "sidebar",
          "工作區與代理人 (Spaces & Agents)",
          isSidebarOpen,
          toggleSidebar,
          agentBadge
        )
      )
      .child(div().flex_1());
  }
}
