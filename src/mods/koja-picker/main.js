// Go to a space. Opened by key (mod.open), this copy starts the preview terminal and
// opens the picker dialog: the list (this mod, props { part: "list" }) beside a
// live, watch-only view of the selected space (preview.sh). Then it closes itself.
//
// List: one row per space, most recent first, with its tabs under it when it has
// more than one, and the panes of any tab that has more than one. Type to
// fuzzy-search names, branches, folders, tabs, pane titles and agents. The chips
// in the footer (Tab and shift+Tab cycle them, bound in keys.json) keep only what
// is in one state.
// ↑/↓ or ctrl+n/p move, Enter goes, Esc closes. Holding ctrl+shift, k again moves
// to the next space; releasing ctrl then goes, like alt-tab.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, v_virtual_list, VirtualListScrollHandle } from "gpui-base";
import { spaces, panes, focused, run, hc, exec, home, appHome, theme, props, closeOverlay, openOverlay, shared, setShared, nextCommand } from "herdr";

const PREVIEW_NAME = "my-picker-preview";
const LIST_WIDTH = 420;
// The dialog frame's corner radius. Blocks inside don't clip to it: the list rounds
// its own corners, and the preview terminal, which can't, sits inside them.
const DIALOG_RADIUS = 8;
const PREVIEW_INSET = 3;
// Measurements from Zed's pickers: rows inset 4 px from the edge with 4 px corners,
// 6 px padding and 28 px tall, a muted 16 px icon 6 px from the name, children 20 px
// in; names at 13 px and details at 12 px; a plain search row over a divider, with
// its text where the names start, and the filters in a footer bar.
const ROW_HEIGHT = 28;
const ROW_INSET = 4;
const ROW_PADDING = 6;
const ROW_RADIUS = 4;
const ICON_SIZE = 16;
const ICON_GAP = 6;
const LEVEL_INDENT = 20;
const TEXT_SIZE = 13;
const DETAIL_TEXT_SIZE = 12;
const STATUS_WIDTH = 12;
const SEARCH_HEIGHT = 40;
const FOLDER_ICON = "mods/my-spaces/folder.svg";
// Folders are drawn smaller than the 16 px icon slot, as in the sidebar.
const FOLDER_ICON_SIZE = 14;
const TERMINAL_ICON = "mods/workspace-chrome/terminal.svg";
const RECENT_KEY = "my-picker.recent";
const FOCUS_KEY = "my-picker.focus";
const FOCUS_RETRY_MILLISECONDS = 50;
const FOCUS_ATTEMPTS = 40;
const STATUS_RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
const STATUS_WORDS = { blocked: "needs you", done: "finished", working: "working", idle: "idle" };
const STATUS_FILTERS = [
  { label: "All", statuses: null, mark: "", color: "dim", empty: "No space matches." },
  { label: "Needs you", statuses: ["blocked", "done"], mark: "●", color: "blocked", empty: "Nothing needs you." },
  { label: "Blocked", statuses: ["blocked"], mark: "×", color: "blocked", empty: "Nothing is blocked." },
  { label: "Done", statuses: ["done"], mark: "✓", color: "done", empty: "Nothing is done." },
  { label: "Working", statuses: ["working"], mark: "◐", color: "working", empty: "Nothing is working." },
  { label: "Idle", statuses: ["idle"], mark: "○", color: "idle", empty: "Nothing is idle." },
];

function previewFifo() {
  return `${home()}/.cache/herdr-my-picker.fifo`;
}

function previewScript() {
  return `${appHome()}/mods/my-picker/preview.sh`;
}

function isWordStart(text, index) {
  return index === 0 || /[\s/_.\-~]/.test(text[index - 1]);
}

// Letters spread far apart match almost any long text, so a match must stay close
// together unless every letter after the first starts a word or follows the last.
function isCompact(text, positions) {
  const span = positions[positions.length - 1] - positions[0] + 1;
  if (span <= positions.length * 2 + 4) return true;

  return positions.slice(1).every((position, index) => position === positions[index] + 1 || isWordStart(text, position));
}

// Each query letter in order, case-insensitive. Runs of letters and letters at
// word starts score higher, gaps lower. Null when the letters aren't all there.
function fuzzyMatch(query, text) {
  const lowerText = text.toLowerCase();
  const positions = [];
  let score = 0;
  let from = 0;

  for (const letter of query.toLowerCase()) {
    const index = lowerText.indexOf(letter, from);
    if (index < 0) return null;

    const follows = positions.length > 0 && positions[positions.length - 1] === index - 1;
    score += follows ? 8 : 1;
    if (isWordStart(text, index)) score += 6;
    score -= Math.min(index - from, 5) * 0.2;
    positions.push(index);
    from = index + 1;
  }

  if (positions.length > 0 && !isCompact(text, positions)) return null;
  return { score, positions };
}

// The best match in any one field; letters never match across fields.
function bestFieldMatch(query, fields) {
  let best = null;
  for (const field of fields) {
    const match = field ? fuzzyMatch(query, field) : null;
    if (match && (!best || match.score > best.score)) best = match;
  }
  return best;
}

function statusRank(status) {
  return STATUS_RANK[status] ?? 0;
}

function folderName(path) {
  return (path ?? "").split("/").filter(Boolean).pop() ?? "";
}

// The pane last focused in each tab, kept by tab id in shared "my-picker.focus".
// Herdr gives no history of pane focus, so the picker records the pane it was
// opened from and every pane it goes to.
function rememberPane(tabIdentifier, paneIdentifier) {
  const tabIdentifiers = new Set(spaces().flatMap((space) => space.tabs.map((tab) => tab.id)));
  const saved = Object.entries(shared(FOCUS_KEY) ?? {}).filter(([identifier]) => tabIdentifiers.has(identifier));
  setShared(FOCUS_KEY, { ...Object.fromEntries(saved), [tabIdentifier]: paneIdentifier });
}

function rememberedPane(tab) {
  const identifier = (shared(FOCUS_KEY) ?? {})[tab.id];
  return panes().find((pane) => pane.tab === tab.id && pane.pane === identifier && pane.terminal) ?? null;
}

// The tab's pane to preview and focus: the focused pane in the shown tab, else the
// one last focused there, else its most urgent agent, else its first terminal.
function tabPane(tab) {
  const tabPanes = panes().filter((pane) => pane.tab === tab.id && pane.terminal);
  const focusedPane = tabPanes.find((pane) => pane.focused);
  if (focusedPane) return focusedPane;

  const remembered = rememberedPane(tab);
  if (remembered) return remembered;

  const ranked = [...tabPanes].sort((first, second) => statusRank(second.status) - statusRank(first.status));
  return ranked[0] ?? null;
}

function terminalPanes(tab) {
  return panes().filter((pane) => pane.tab === tab.id && pane.terminal);
}

function tabName(tab) {
  return tab.named ? tab.name : `Tab ${tab.index}`;
}

function tabLabel(tab) {
  const title = terminalPanes(tab)[0]?.title ?? "";
  return title ? `${tabName(tab)} · ${title}` : tabName(tab);
}

function paneSearchFields(pane) {
  return [pane.title, pane.program?.name, folderName(pane.cwd), pane.branch];
}

function tabSearchFields(tab) {
  const paneFields = panes().filter((pane) => pane.tab === tab.id).flatMap(paneSearchFields);
  return [tab.named ? tab.name : null, STATUS_WORDS[tab.status], ...paneFields];
}

function spaceSearchFields(space) {
  const tabFields = space.tabs.flatMap(tabSearchFields);
  return [space.name, space.branch, folderName(space.folder), space.machine, STATUS_WORDS[space.status], ...tabFields];
}

function recentOrder(spaceList) {
  const recent = shared(RECENT_KEY) ?? [];
  const position = (space) => {
    const index = recent.indexOf(space.id);
    return index < 0 ? recent.length + space.index : index;
  };
  return [...spaceList].sort((first, second) => position(first) - position(second));
}

function rememberSpace(identifier) {
  const recent = (shared(RECENT_KEY) ?? []).filter((saved) => saved !== identifier);
  setShared(RECENT_KEY, [identifier, ...recent].slice(0, 50));
}

function inStatus(pane, statuses) {
  return statuses === null || statuses.includes(pane.status);
}

// A tab gets a row when its space has other tabs, and its panes get rows when the
// tab has more than one. With a status filter, only tabs and panes in it count.
function tabChildRows(space, tab, statuses) {
  const tabPanes = terminalPanes(tab);
  const shownPanes = tabPanes.filter((pane) => inStatus(pane, statuses));
  if (shownPanes.length === 0) return [];

  const rows = [];
  if (space.tabs.length > 1) rows.push({ kind: "tab", key: `tab:${tab.id}`, space, tab, pane: statuses ? shownPanes[0] : null });
  if (tabPanes.length > 1) rows.push(...shownPanes.map((pane) => ({ kind: "pane", key: `pane:${pane.pane}`, space, tab, pane })));
  return rows;
}

// Under a status filter, a space row stands for its first pane in that state, so
// the preview and Enter show that pane rather than the one last focused.
function spaceRows(space, query, statuses) {
  const shownPanes = space.tabs.flatMap((tab) => terminalPanes(tab)).filter((pane) => inStatus(pane, statuses));
  if (statuses && shownPanes.length === 0) return null;

  const filteredPane = statuses ? shownPanes[0] : null;
  const shownTab = filteredPane ? space.tabs.find((tab) => tab.id === filteredPane.tab) : (space.tabs.find((tab) => tab.active) ?? space.tabs[0]);
  const spaceRow = { kind: "space", key: `space:${space.id}`, space, tab: shownTab, pane: filteredPane };
  const childRows = space.tabs.flatMap((tab) => tabChildRows(space, tab, statuses));
  if (!query) return { score: 0, rows: [spaceRow, ...childRows] };

  const spaceMatch = bestFieldMatch(query, spaceSearchFields(space));
  if (!spaceMatch) return null;

  const nameMatch = fuzzyMatch(query, space.name);
  return { score: spaceMatch.score + (nameMatch?.score ?? 0), rows: [spaceRow, ...childRows] };
}

function buildRows(query, statuses) {
  const groups = recentOrder(spaces()).map((space) => spaceRows(space, query, statuses)).filter(Boolean);

  if (query) groups.sort((first, second) => second.score - first.score);
  return groups.flatMap((group) => group.rows);
}

function rowPane(row) {
  if (row?.pane) return row.pane;
  return row?.tab ? tabPane(row.tab) : null;
}

function statusCount(statuses) {
  return panes().filter((pane) => pane.terminal && statuses.includes(pane.status)).length;
}

async function livePreviewAddress() {
  const found = await hc(["get", "--json", PREVIEW_NAME]).catch(() => null);
  if (found?.code === 0) {
    const terminal = JSON.parse(found.stdout);
    if (terminal.state === "live") return terminal.address;

    await hc(["rm", PREVIEW_NAME]).catch(() => null);
  }

  const started = await hc(["run", "--bg", "--json", "--no-parent", "--name", PREVIEW_NAME, "--", previewScript(), "serve", previewFifo()]);
  if (started.code !== 0) return null;
  return JSON.parse(started.stdout).address;
}

async function showInPreview(address) {
  await exec(previewScript(), ["show", previewFifo(), address ?? "-"]).catch(() => null);
}

// Opens like the command palette and Zed's pickers: a popup near the top of the
// window that leaves the window undimmed. The at and offset fields are what the
// app's own picker uses, though herdr.d.ts doesn't list them.
function openPicker(previewAddress) {
  openOverlay({
    kind: "popup",
    at: "top",
    offset: 40,
    width: 0.6,
    height: 0.7,
    layout: {
      type: "row",
      divider: { width: 1, color: "border" },
      children: [
        { type: "block", size: { px: LIST_WIDTH }, content: { mod: "my-picker", props: { part: "list" } } },
        { type: "block", padding: PREVIEW_INSET, content: { terminal: previewAddress } },
      ],
    },
  });
}

// Without a preview terminal, the shipped picker still gets you somewhere.
function launch(cx) {
  const overlay = props().overlay;
  const here = focused();
  if (here?.tab && here?.pane) rememberPane(here.tab, here.pane);

  cx.spawn(async () => {
    const previewAddress = await livePreviewAddress().catch(() => null);
    closeOverlay(overlay);
    if (previewAddress) openPicker(previewAddress);
    else run("mod.open", { name: "picker" });
  });
}

export default class MyPicker extends View {
  init(_props, cx) {
    if (props()?.part !== "list") {
      if (props()?.overlay) launch(cx);
      return;
    }

    const current = focused()?.space;
    if (current) rememberSpace(current);

    this.query = "";
    this.filterIndex = 0;
    this.cycled = false;
    this.wantedPreview = null;
    this.shownPreview = undefined;
    this.writingPreview = false;
    this.scroll = VirtualListScrollHandle.new();
    this.handle = cx.focus_handle();
    this.input = InputState.new({ placeholder: "Go to a space, tab or pane…" });
    this.input.on("change", (_event, cx) => this.changeQuery(cx));
    this.input.on("submit", () => this.go(this.selectedRow()));
    this.keepSearchFocused(cx);

    const rows = this.rows();
    const previous = rows.find((row) => row.kind === "space" && row.space.id !== current) ?? rows[0];
    this.selectedKey = previous?.key ?? null;
    this.updatePreview(cx);
    this.listenForCommands(cx);
  }

  rows() {
    return buildRows(this.query, STATUS_FILTERS[this.filterIndex].statuses);
  }

  async close() {
    if (props()?.part === "list") await showInPreview(null);
  }

  // The input can't take the keyboard until the dialog has drawn it, and a click
  // on the preview terminal takes the keyboard away; both need another try.
  keepSearchFocused(cx) {
    this.searchFocused = false;
    this.leaving = false;
    this.input.on("focus", () => {
      this.searchFocused = true;
    });
    this.input.on("blur", (_event, cx) => {
      this.searchFocused = false;
      this.focusSearch(cx, FOCUS_ATTEMPTS);
    });
    this.focusSearch(cx, FOCUS_ATTEMPTS);
  }

  focusSearch(cx, attemptsLeft) {
    if (this.searchFocused || this.leaving || attemptsLeft === 0) return;

    this.input.focus();
    cx.timer.after(FOCUS_RETRY_MILLISECONDS, (cx) => this.focusSearch(cx, attemptsLeft - 1));
  }

  listenForCommands(cx) {
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command.endsWith("filter-next")) this.changeStatusFilter(this.filterIndex + 1, cx);
        else if (command.endsWith("filter-previous")) this.changeStatusFilter(this.filterIndex - 1, cx);
        else if (command.endsWith("next")) this.cycleToNextSpace(cx);
      }
    });
  }

  cycleToNextSpace(cx) {
    this.cycled = true;
    this.moveToNextSpace(cx);
  }

  changeQuery(cx) {
    this.query = this.input.value().trim();
    this.selectFirst(cx);
  }

  changeStatusFilter(index, cx) {
    this.filterIndex = (index + STATUS_FILTERS.length) % STATUS_FILTERS.length;
    this.selectFirst(cx);
  }

  selectFirst(cx) {
    this.selectedKey = this.rows()[0]?.key ?? null;
    this.scroll.scroll_to_item(0);
    this.updatePreview(cx);
    cx.notify();
  }

  selectedRow() {
    const rows = this.rows();
    return rows.find((row) => row.key === this.selectedKey) ?? rows[0];
  }

  move(step, cx) {
    const rows = this.rows();
    if (!rows.length) return;

    const index = Math.max(0, rows.findIndex((row) => row.key === this.selectedKey));
    const next = (index + step + rows.length) % rows.length;
    this.select(rows, next, cx);
  }

  // Like alt-tab, cycling goes from space to space, past their tab and pane rows.
  moveToNextSpace(cx) {
    const rows = this.rows();
    const index = Math.max(0, rows.findIndex((row) => row.key === this.selectedKey));
    const ordered = [...rows.slice(index + 1), ...rows.slice(0, index + 1)];
    const nextSpace = ordered.find((row) => row.kind === "space");
    if (nextSpace) this.select(rows, rows.indexOf(nextSpace), cx);
  }

  select(rows, index, cx) {
    this.selectedKey = rows[index].key;
    this.scroll.scroll_to_item(index);
    this.updatePreview(cx);
    cx.notify();
  }

  // One write at a time, always of the latest selection, so fast moves can't
  // reach the preview out of order.
  updatePreview(cx) {
    const row = this.selectedRow();
    this.wantedPreview = rowPane(row)?.terminal ?? null;
    if (this.writingPreview) return;

    this.writingPreview = true;
    cx.spawn(async () => {
      while (this.shownPreview !== this.wantedPreview) {
        const address = this.wantedPreview;
        await showInPreview(address);
        this.shownPreview = address;
      }
      this.writingPreview = false;
    });
  }

  closePicker() {
    this.leaving = true;
    closeOverlay(props().overlay);
  }

  go(row) {
    if (!row) return;

    const pane = rowPane(row);
    this.closePicker();
    rememberSpace(row.space.id);
    if (row.kind === "space") run("space.select", { id: row.space.id });
    else run("tab.select", { id: row.tab.id });
    if (!pane) return;

    rememberPane(row.tab.id, pane.pane);
    run("pane.focus", { pane: pane.pane });
  }

  onKeyDown(event, cx) {
    const key = event.key;
    const control = event.modifiers.control;

    if (key === "escape") this.closePicker();
    else if (key === "down" || (control && key === "n")) this.move(1, cx);
    else if (key === "up" || (control && key === "p")) this.move(-1, cx);
    else return;

    cx.stop_propagation();
  }

  onModifiersChanged(event) {
    const released = !event.modifiers.control;
    if (this.cycled && released) this.go(this.selectedRow());
  }

  highlighted(text, positions, colors) {
    if (!positions?.length) return [text];

    const marked = new Set(positions);
    return [...text].map((letter, index) => (marked.has(index) ? div().text_color(colors.accent).child(letter) : letter));
  }

  // Plain text truncates with an ellipsis; highlighted letters are separate
  // elements, so that name is clipped instead.
  spaceName(space, nameMatch, colors) {
    const name = nameMatch
      ? h_flex().overflow_hidden().children(this.highlighted(space.name, nameMatch.positions, colors))
      : div().truncate().child(space.name);

    return name.flex_shrink(1).min_w(0).text_color(colors.foreground);
  }

  statusGlyph(colors, status) {
    if (status === "working") return svg("mods/workspace-chrome/spinner.svg").size(10).mx(1).flex_none().text_color(colors.working).spin(900);

    const glyph = status === "idle" ? "○" : status ? "●" : "";
    return div().w(STATUS_WIDTH).flex_none().text_size(DETAIL_TEXT_SIZE).text_color(colors[status] ?? colors.dim).child(glyph);
  }

  rowFrame(depth, selected, colors) {
    return h_flex()
      .mx(ROW_INSET)
      .pl(ROW_PADDING + depth * LEVEL_INDENT)
      .pr(ROW_PADDING)
      .h(ROW_HEIGHT)
      .gap(ICON_GAP)
      .items_center()
      .rounded(ROW_RADIUS)
      .cursor_pointer()
      .when(selected, (element) => element.bg(colors.selected))
      .when(!selected, (element) => element.hover((style) => style.bg(colors.hover)));
  }

  icon(file, colors) {
    return svg(file).size(ICON_SIZE).flex_none().text_color(colors.dim);
  }

  programIcon(program, colors) {
    if (!program?.icon) return this.icon(TERMINAL_ICON, colors);
    if (program.tint) return this.icon(program.icon, colors);
    return image(program.icon).size(ICON_SIZE).flex_none();
  }

  label(text, colors, emphasized) {
    return div().flex_shrink(1).min_w(0).truncate().text_color(emphasized ? colors.foreground : colors.muted).child(text);
  }

  detail(text, colors) {
    return div().flex_shrink(8).min_w(24).truncate().text_size(DETAIL_TEXT_SIZE).text_color(colors.dim).child(text);
  }

  spaceRow(row, selected, colors) {
    const space = row.space;
    const nameMatch = this.query ? fuzzyMatch(this.query, space.name) : null;

    return this.rowFrame(0, selected, colors)
      .child(h_flex().size(ICON_SIZE).flex_none().items_center().justify_center().child(svg(FOLDER_ICON).size(FOLDER_ICON_SIZE).text_color(colors.dim)))
      .child(
        h_flex().flex_1().min_w(0).gap(ICON_GAP).items_center()
          .child(this.spaceName(space, nameMatch, colors))
          .when(Boolean(space.branch), (element) => element.child(this.detail(space.branch, colors))),
      )
      .child(this.statusGlyph(colors, space.status));
  }

  tabRow(row, selected, colors) {
    return this.rowFrame(1, selected, colors)
      .child(this.programIcon(tabPane(row.tab)?.program, colors))
      .child(h_flex().flex_1().min_w(0).items_center().child(this.label(tabLabel(row.tab), colors, row.tab.active)))
      .child(this.statusGlyph(colors, row.tab.status));
  }

  paneRow(row, selected, colors) {
    const pane = row.pane;
    const label = `${pane.program?.name ?? "terminal"} · ${pane.title}`;
    const depth = row.space.tabs.length > 1 ? 2 : 1;
    const place = [folderName(pane.cwd), pane.branch].filter(Boolean).join(" · ");

    return this.rowFrame(depth, selected, colors)
      .child(this.programIcon(pane.program, colors))
      .child(
        h_flex().flex_1().min_w(0).gap(ICON_GAP).items_center()
          .child(this.label(label, colors, pane.focused))
          .when(place !== "", (element) => element.child(this.detail(place, colors))),
      )
      .child(this.statusGlyph(colors, pane.status));
  }

  renderRow(row, colors) {
    const selected = row.key === this.selectedKey;
    if (row.kind === "space") return this.spaceRow(row, selected, colors);
    if (row.kind === "tab") return this.tabRow(row, selected, colors);
    return this.paneRow(row, selected, colors);
  }

  renderRows(rows, colors) {
    return v_virtual_list(
      "my-picker-rows",
      rows.length,
      ROW_HEIGHT,
      (index) => rows[index].key,
      (range) => rows.slice(range.start, range.end).map((row) => this.renderRow(row, colors)),
    )
      .track_scroll(this.scroll)
      .flex_1()
      .py(4)
      .on_item_click((key) => this.go(rows.find((row) => row.key === key)));
  }

  filterChip(statusFilter, index, colors) {
    const active = index === this.filterIndex;
    const count = statusFilter.statuses ? statusCount(statusFilter.statuses) : null;
    const quiet = count === 0 && !active;
    let textColor = colors.muted;
    if (active) textColor = colors.foreground;
    else if (quiet) textColor = colors.dim;

    return h_flex()
      .id(`my-picker-filter-${index}`)
      .h(22)
      .px(ROW_PADDING)
      .gap(4)
      .flex_none()
      .items_center()
      .rounded(ROW_RADIUS)
      .text_size(DETAIL_TEXT_SIZE)
      .cursor_pointer()
      .text_color(textColor)
      .when(active, (element) => element.bg(colors.selected))
      .when(!active, (element) => element.hover((style) => style.bg(colors.hover)))
      .on_click((_event, cx) => this.changeStatusFilter(index, cx))
      .when(statusFilter.mark !== "", (element) => element.child(div().text_color(quiet ? colors.dim : colors[statusFilter.color]).child(statusFilter.mark)))
      .child(statusFilter.label)
      .when(count !== null && count > 0, (element) => element.child(div().text_color(colors.dim).child(String(count))));
  }

  footer(colors) {
    return h_flex()
      .flex_none()
      .px(ROW_INSET)
      .py(5)
      .gap(2)
      .overflow_hidden()
      .border_t(1)
      .border_color(colors.border)
      .children(STATUS_FILTERS.map((statusFilter, index) => this.filterChip(statusFilter, index, colors)));
  }

  searchRow(colors) {
    return h_flex()
      .h(SEARCH_HEIGHT)
      .flex_none()
      .px(ROW_INSET + ROW_PADDING)
      .gap(ICON_GAP)
      .items_center()
      .border_b(1)
      .border_color(colors.border)
      .child(this.icon("mods/workspace-chrome/search.svg", colors))
      .child(Input.new(this.input).flex_1().h_full().text_size(TEXT_SIZE).text_color(colors.foreground));
  }

  render() {
    if (props()?.part !== "list") return div();

    const colors = theme();
    const rows = this.rows();
    const statusFilter = STATUS_FILTERS[this.filterIndex];
    const emptyText = this.query ? "No space matches." : statusFilter.empty;

    return v_flex()
      .id("my-picker")
      .track_focus(this.handle)
      .size_full()
      .text_size(TEXT_SIZE)
      .bg(colors.popover)
      .rounded_tl(DIALOG_RADIUS)
      .rounded_bl(DIALOG_RADIUS)
      .on_key_down((event, cx) => this.onKeyDown(event, cx))
      .on_modifiers_changed((event) => this.onModifiersChanged(event))
      .child(this.searchRow(colors))
      .when(rows.length > 0, (element) => element.child(this.renderRows(rows, colors)))
      .when(rows.length === 0, (element) => element.child(div().flex_1().px(ROW_INSET + ROW_PADDING).py(8).text_size(DETAIL_TEXT_SIZE).text_color(colors.dim).child(emptyText)))
      .child(this.footer(colors));
  }
}
