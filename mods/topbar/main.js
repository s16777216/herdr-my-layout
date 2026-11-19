// Full-width title bar: [logo] Herdr on the left, window buttons on the right.
// The block it sits in drags the window.
import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme, run, window } from "herdr";

const ICONS = "mods/topbar/icons";

export default class Topbar extends View {
  render() {
    const t = theme();
    const w = window();
    // macOS draws its traffic lights over the layout: leave them room.
    const lights = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen ? 72 : 10;

    const button = (id, label, action) =>
      div()
        .id(id)
        .size(26)
        .flex_none()
        .flex()
        .items_center()
        .justify_center()
        .rounded(6)
        .text_color(t.dim)
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click(action)
        .child(label);

    return h_flex()
      .id("topbar")
      .size_full()
      .items_center()
      .pl(lights)
      .pr(6)
      .gap(3)
      .bg(t.chrome)
      .border_b(1)
      .border_color(t.border)
      .child(
        h_flex()
          .id("topbar-brand")
          .gap(8)
          .items_center()
          .px(4)
          .pr(10)
          .flex_none()
          .cursor_pointer()
          .hover((s) => s.opacity(0.85))
          .on_click(() => run("mod.open", { name: "picker" }))
          .child(image("frame/welcome/herdr.png").size(18).rounded(4))
          .child(div().font_semibold().text_size(13).text_color(t.foreground).child("Herdr"))
      )
      .child(div().flex_1())
      .child(
        button("btn-search", svg(`${ICONS}/search.svg`).size(16), () => run("mod.open", { name: "picker" }))
          .tooltip("搜尋命令與專案 (Search)")
      )
      .when(w?.buttons, (el) =>
        el
          .child(
            button(
              "minimize",
              w.platform === "windows" ? svg(`${ICONS}/win-min.svg`).size(16) : "—",
              () => run("window.minimize")
            )
          )
          .child(
            button(
              "maximize",
              w.platform === "windows"
                ? svg(`${ICONS}/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16)
                : "▢",
              () => run("window.maximize")
            )
          )
          .child(
            button(
              "close-window",
              w.platform === "windows" ? svg(`${ICONS}/win-close.svg`).size(16) : svg("mods/pane/close.svg").size(13),
              () => run("window.close")
            )
          )
      );
  }
}
