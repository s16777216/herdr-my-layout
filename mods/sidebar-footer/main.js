// Compact single-row sidebar footer: [+ Add machine] [gear menu -> Mods / Settings].
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, run, layout, updates, window, props, openOverlay, closeOverlay } from "herdr";

const ICONS = "mods/sidebar-footer/icons";

function narrow() {
  const find = (n, id) => {
    if (n?.id === id) return n;
    for (const c of n?.children ?? []) {
      const hit = find(c, id);
      if (hit) return hit;
    }
    return null;
  };
  const width = find(layout(), "sidebar")?.size?.px;
  return width ? width < (window()?.platform === "macos" ? 90 : 60) : false;
}

export default class SidebarFooter extends View {
  menuRow(id, icon, label, action, t, { badge = false, dim = false } = {}) {
    return h_flex()
      .id(id)
      .h(28)
      .px(10)
      .gap(9)
      .items_center()
      .rounded(6)
      .cursor_pointer()
      .text_size(12.5)
      .text_color(dim ? t.dim : t.foreground)
      .hover(s => s.bg(t.hover))
      .on_click(() => {
        closeOverlay(props()?.overlay);
        action();
      })
      .child(svg(`${ICONS}/${icon}.svg`).size(14).flex_none().text_color(t.muted))
      .child(div().flex_1().child(label))
      .when(badge, el => el.child(div().size(6).rounded_full().bg(t.accent)));
  }

  render() {
    const t = theme();
    const p = props() ?? {};
    const hasUpdate = Boolean(updates().app.ready);

    if (p.menu) {
      return v_flex()
        .id("sidebar-footer-menu")
        .w_full()
        .p(4)
        .bg(t.surface)
        .text_color(t.foreground)
        .child(this.menuRow("sf-mods", "layers", "Mods", () => run("mod.open", { name: "mod-manager" }), t))
        .child(this.menuRow("sf-settings", "settings", "Settings", () => run("app.settings"), t, { badge: hasUpdate }))
        .when(Boolean(p.includeAddMachine), el => el.child(
          this.menuRow("sf-machine", "plus", "Add machine", () => run("mod.open", { name: "machine-add" }), t, { dim: true })
        ));
    }

    const collapsed = narrow();
    const popupW = collapsed ? 175 : 165;
    const popupH = collapsed ? 96 : 68;
    const gearBtn = (size) => h_flex()
      .id("sf-gear")
      .relative()
      .size(size)
      .flex_none()
      .items_center()
      .justify_center()
      .rounded(8)
      .cursor_pointer()
      .text_color(t.muted)
      .hover(s => s.bg(t.hover).text_color(t.foreground))
      .tooltip(collapsed ? "Mods, Settings & Add machine" : "Mods & Settings")
      .on_mouse_down("left", (e) => {
        if (e?.position && e?.local_position) {
          this.gearOrigin = {
            x: e.position.x - e.local_position.x,
            y: e.position.y - e.local_position.y,
            size
          };
        }
      })
      .on_click((e) => {
        const origin = (e?.position && e?.local_position)
          ? { x: e.position.x - e.local_position.x, y: e.position.y - e.local_position.y, size }
          : this.gearOrigin;
        const at = origin
          ? {
              x: Math.max(8, origin.x + origin.size),
              y: Math.max(8, origin.y - popupH - 6)
            }
          : "pointer";
        openOverlay({
          mod: "sidebar-footer",
          kind: "popup",
          width: popupW,
          height: popupH,
          at,
          props: { menu: true, includeAddMachine: collapsed }
        });
      })
      .child(svg(`${ICONS}/settings.svg`).size(14).flex_none())
      .when(hasUpdate, el => el.child(div().absolute().top(5).right(5).size(6).rounded_full().bg(t.accent)));

    if (collapsed) {
      return h_flex()
        .size_full()
        .bg(t.chrome)
        .border_t(1)
        .border_color(t.border)
        .items_center()
        .justify_center()
        .child(gearBtn(30));
    }

    return h_flex()
      .size_full()
      .bg(t.chrome)
      .border_t(1)
      .border_color(t.border)
      .px(8)
      .py(6)
      .gap(4)
      .items_center()
      .text_size(13)
      .child(
        h_flex()
          .id("machine")
          .flex_1()
          .min_w(0)
          .h(28)
          .px(8)
          .gap(9)
          .items_center()
          .rounded(8)
          .cursor_pointer()
          .text_color(t.dim)
          .hover(s => s.bg(t.hover).text_color(t.foreground))
          .on_click(() => run("mod.open", { name: "machine-add" }))
          .child(svg(`${ICONS}/plus.svg`).size(14).flex_none())
          .child(div().min_w(0).truncate().child("Add machine"))
      )
      .child(gearBtn(28));
  }
}
