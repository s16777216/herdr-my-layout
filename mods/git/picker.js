// The repository picker, opened as a popover under the header's repo chip: a filter,
// the repositories in the workspace with their status (dirty, ahead/behind, branch),
// and checkmark on the currently opened one. Picking one opens its graph.
import { div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { theme, props, closeOverlay, setShared } from "herdr";
import { icon } from "./menu.js";
import * as K from "./kit.js";
import { syncOf } from "./repos.js";

export class RepoPicker {
  init(cx) {
    const p = props();
    this.repos = p?.repos ?? [];
    this.statuses = new Map(Array.isArray(p?.statuses) ? p.statuses : Object.entries(p?.statuses ?? {}));
    this.opened = p?.opened ?? null;
    this.at = Math.max(0, this.repos.findIndex((r) => r.path === this.opened));
    this.state = InputState.new({ value: "", placeholder: "Filter repositories" });
    this.state.on("change", (_e, cx) => {
      const rows = this.rows();
      this.at = Math.min(this.at, Math.max(0, rows.length - 1));
      cx.notify();
    });
    this.state.on("submit", (_e, cx) => this.choose(this.at, cx));
    this.state.focus();
    cx.timer.after(60, () => this.state.focus());
    cx.timer.after(300, () => this.state.focus());
  }

  rows() {
    const q = this.state.value().trim().toLowerCase();
    if (!q) return this.repos;
    return this.repos.filter((r) => r.name.toLowerCase().includes(q) || (r.group && r.group.toLowerCase().includes(q)));
  }

  choose(i, cx) {
    const rows = this.rows(), r = rows[i];
    if (!r) return;
    const { overlay } = props();
    closeOverlay(overlay);
    setShared("git-graph.openRepo", { path: r.path, at: Date.now() });
    cx.notify();
  }

  render() {
    const t = theme(), rows = this.rows(), opened = this.opened;
    this.at = Math.min(this.at, Math.max(rows.length - 1, 0));
    const grouped = rows.some((r) => r.group);

    return v_flex().id("git-repo-picker").w_full().min_h(0).p(8).gap(4).bg(t.popover)
      .text_size(K.SIZE.body).text_color(t.foreground)
      .on_key_down((e, cx) => {
        if (e.key === "down") this.at = (this.at + 1) % Math.max(rows.length, 1);
        else if (e.key === "up") this.at = (this.at - 1 + rows.length) % Math.max(rows.length, 1);
        else if (e.key === "escape") closeOverlay(props()?.overlay);
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(K.field(t, Input.new(this.state), true).flex_none())
      .child(v_flex().id("git-repo-picker-list").flex_none().max_h(280).overflow_y_scrollbar()
        .children(rows.flatMap((r, i) => {
          const st = this.statuses.get(r.path), sync = syncOf(st, false), here = r.path === opened;
          const counts = ["ahead", "behind", "diverged"].includes(sync.kind);
          const branch = st ? (st.detached ? "detached" : st.branch) : null;
          const heading = grouped && r.group !== rows[i - 1]?.group
            ? [K.section(t, `grp-${i}`, r.group ? `${r.group}/` : "./").flex_none()]
            : [];
          const row = h_flex().id(`rp-row-${i}`).h(30).flex_none().px(8).gap(8).items_center().rounded(6).cursor_pointer()
            .when(here || i === this.at, (el) => el.bg(t.selected))
            .hover((s) => s.bg(here || i === this.at ? t.selected : t.hover))
            .on_click((_e, cx) => this.choose(i, cx))
            .child(div().w(14).flex_none().flex().justify_center()
              .child(here ? svg(icon("check")).size(13).text_color(t.accent) : svg(icon("folder")).size(12).text_color(t.dim)))
            .child(div().min_w(0).truncate().text_size(K.SIZE.body).font_medium()
              .text_color(here ? t.accent : t.foreground).child(r.name))
            .child(h_flex().flex_none().gap(4).items_center().text_size(K.SIZE.meta)
              .when(Boolean(st?.dirty > 0), (e) => e.child(h_flex().mr(2).gap(3).items_center().text_color(t.blocked)
                .child(div().size(5).rounded(3).bg(t.blocked)).child(String(st.dirty))))
              .when(counts && st.ahead > 0, (e) => e.child(div().text_color(t.ansi2).child(`↑${st.ahead}`)))
              .when(counts && st.behind > 0, (e) => e.child(div().text_color(t.ansi1).child(`↓${st.behind}`))))
            .child(div().flex_1())
            .when(Boolean(branch), (e) => e.child(h_flex().flex_none().max_w(140).gap(4).items_center().text_color(t.muted)
              .child(svg(icon("branch")).size(11).flex_none())
              .child(div().min_w(0).truncate().text_size(11).child(branch))));

          return [...heading, row];
        })))
      .when(rows.length === 0, (el) => el.child(div().px(8).py(8).text_size(K.SIZE.meta).text_color(t.dim).child("No matching repositories")));
  }
}
