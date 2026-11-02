import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, panes, run, openOverlay, theme, window, shared, layout, settings } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// Tabs drawn like Zed's tab bar: square tabs the full height of the bar, the active
// one filled with the pane background and open at the bottom so it joins the pane,
// the others sitting on the bar's bottom border. A 12 px icon slot before the name
// and a 14 px slot after it for the close button or the tab's status.
const TAB_PADDING = 8;
const TAB_GAP = 6;
const START_SLOT = 12;
const END_SLOT = 14;
const TEXT_SIZE = 13;

export default class Tabs extends View {
  init() {
    this.pressed = null;
    this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}");
  }

  // The side panel is remembered per space: switching shows that space's choice
  // (closed if it never had one), and opening or closing it records it.
  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id; this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null, want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
          else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    // Until the restore lands (or something else won), the old state isn't a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  // Red while the modal-pill overlay holds the keyboard (normal mode), else green (insert mode).
  modeDot(t) {
    const normal = Boolean(shared("modal.pill"));
    return div().size(8).mx(6).rounded(4).flex_none().bg(normal ? t.blocked : t.ansi2);
  }

  render() {
    const t = theme();
    const space = spaces().find(p => p.active);
    const shown = space?.tabs ?? [];
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, label, action) => div().id(id).size(22).flex_none().flex().items_center().justify_center().rounded(5).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(label);
    const endSlot = (c) => {
      const slot = h_flex().size(END_SLOT).flex_none().items_center().justify_center();
      if (c.active) {
        return slot.id(`close-${c.id}`).rounded(3).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
          .on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); run("tab.close", { id: c.id }); })
          .child(svg("mods/pane/close.svg").size(12));
      }
      if (c.status === "working") return slot.child(svg("mods/workspace-chrome/spinner.svg").size(10).text_color(t.working).spin(900));
      if (c.status === "blocked" || c.status === "done") return slot.child(div().size(6).rounded(3).bg(t[c.status]));
      return slot;
    };
    const item = (c, i) => {
      const program = panes().find(p => p.tab === c.id && p.program?.agent)?.program ?? panes().find(p => p.tab === c.id)?.program;
      const name = /^tb\d+$/.test(c.name) ? program?.name ?? "Terminal" : c.name;
      const icon = program?.icon ? (program.tint ? svg(program.icon).size(START_SLOT).text_color(c.active ? t.foreground : t.dim) : image(program.icon).size(START_SLOT)) : null;
      const activeStatus = c.active && (c.status === "working" || c.status === "blocked" || c.status === "done");
      return h_flex().id(`tab-${c.id}`).h_full().px(TAB_PADDING).gap(TAB_GAP).items_center().flex_none().text_size(TEXT_SIZE)
        .border_color(t.border)
        .when(c.active, el => el.bg(t.background).border_l(1).border_r(1).text_color(t.foreground))
        .when(!c.active, el => el.bg(t.chrome).border_b(1).text_color(t.muted).hover(s => s.bg(t.hover)))
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_up("left", () => {
          const from = this.pressed; this.pressed = null;
          if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
          else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "koja-menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } }); })
        .child(h_flex().size(START_SLOT).flex_none().items_center().justify_center().when(Boolean(icon), el => el.child(icon)))
        .child(div().max_w(170).truncate().child(c.zoomed ? `${name} Z` : name))
        .when(activeStatus, el => el.child(c.status === "working"
          ? svg("mods/workspace-chrome/spinner.svg").size(10).flex_none().text_color(t.working).spin(900)
          : div().size(6).rounded(3).flex_none().bg(t[c.status])))
        .child(endSlot(c));
    };
    const root = layout(), sidebar = find(root, "sidebar"), w = window();
    // Old saved rails and a dragged-narrow sidebar can be smaller than the window buttons.
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(10, (root.traffic_lights[0] + 64) / settings().zoom - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 10;
    const panel = find(root, "panel"), body = find(root, "panel-body");
    // Only panels the layout's "panel-body" stack offers get a button, so the layout file decides.
    const offered = body?.children?.map(child => child.id) ?? [];
    const enabled = (shared("workspace.panels") ?? ["files", "changes"]).filter(id => offered.includes(id));
    this.syncPanel(space, panel, body, enabled);
    const panelButton = (id, label, icon) => {
      const on = panel && !panel.hidden && body?.active === id;
      return h_flex().id(`panel-${id}`).h(22).px(7).gap(5).flex_none().items_center().rounded(5)
        .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover)).on_mouse_down("left", stop)
        .on_click(() => {
          if (on) run("layout.hide", { id: "panel" });
          else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
        }).child(svg(icon).size(13)).child(label);
    };
    // The bottom border is drawn by each part, so the active tab can leave it open.
    const barEdge = (el) => el.h_full().border_b(1).border_color(t.border);
    return h_flex().size_full().min_w(0).items_center().bg(t.chrome)
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel(e => { if (Math.abs(e.delta.y) >= 1) run(e.delta.y > 0 ? "tab.prev" : "tab.next"); })
      .child(barEdge(div().w(lightsPadding).flex_none()))
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().overflow_x_scrollbar()
        .children(shown.map(item))
        .child(barEdge(div().flex_1().min_w(0))))
      .child(barEdge(h_flex().flex_none().gap(3).pl(6).pr(4).items_center())
        .child(button("tab-new", "+", () => openOverlay({ mod: "koja-new-menu", kind: "popup", width: 250, height: 512 })))
        .when(enabled.includes("files"), el => el.child(panelButton("files", "Files", "mods/files/file.svg")))
        .when(enabled.includes("changes"), el => el.child(panelButton("changes", "Changes", "mods/changes/changes.svg")))
        .child(this.modeDot(t)));
  }
}
