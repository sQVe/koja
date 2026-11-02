// Workspace spaces as a folder tree, drawn like Zed's project panel: a muted folder
// icon that opens and closes (click it to fold a repo's worktrees), worktrees one
// indent level under their checkout with a guide line,
// grouped by machine when more than one is known. After a space's name, the repo
// its first terminal is in now, only where unusual: branch, ahead/behind. Agent state lives in the agents list, not here. Click to
// switch, right-click for its menu, drag to reorder.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, machines, panes, run, openOverlay, exec, hc, theme, watchFolder, window, layout } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// Where a space is now: its first terminal's live folder, else where it was made.
// `ps`: panes(), read once by the caller (each read copies every pane).
function place(s, ps) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return ps.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}
const where = (s, ps) => JSON.stringify([s.machine ?? null, place(s, ps)]);
const base = (path) => path.replace(/\/+$/, "").split("/").pop();
// A repo's git folder names it: <repo>/.git and <repo>/.bare by their folder, <repo>.git by itself.
const repoName = (repo) => /\/\.(git|bare)$/.test(repo) ? base(repo.slice(0, -5)) : base(repo).replace(/\.git$/, "");
// Changes made outside Herdr (an editor's save, a commit in another app): looked
// for this often, in repos the list shows, while the window is in front.
const FALLBACK = 60000;
// A repo's pull requests are fetched again after this long.
const PULLS_MAX_AGE = 180000;
const PULL_COLORS = { open: "ansi2", draft: "dim", merged: "ansi5", closed: "ansi1" };

const pullState = (pull) => (pull.isDraft && pull.state === "OPEN" ? "draft" : pull.state.toLowerCase());

const needsYou = (status) => status === "blocked" || status === "done";

// Measurements from Zed's project panel: 24 px rows, 6 px row padding, 16 px icons
// 6 px from their label, 20 px per level, and a guide line under the middle of the
// parent's icon that runs down its children, 4 px short at each end.
const ROW_HEIGHT = 24;
const ROW_PADDING = 6;
const FOLDER_SIZE = 16;
// The folder is drawn smaller than its slot, so names and guides keep their places.
const FOLDER_ICON_SIZE = 14;
const ICON_GAP = 6;
const LEVEL_INDENT = 20;
const GUIDE_INSET = 4;

// A space speaks up only when something in it needs you.
export function glyph(status) {
  return needsYou(status) ? "●" : "·";
}

export function tone(t, status) {
  return t[status] ?? t.unknown;
}

export default class Spaces extends View {
  init(_props, cx) {
    this.git = {}; // where() -> { name, branch, ahead, behind, repo, linked }, null: not a repo
    this.checked = {}; // where() -> when it was last looked at
    this.unsure = new Set(); // where()s git couldn't answer for (a machine away)
    this.pending = new Set(); // where()s to look at next
    this.busy = {}; // pane -> an agent working or a program in front of its shell
    this.ready = {}; // machine -> its layout was readable at the last look
    this.at = {}; // space -> its where() at the last look
    this.watching = new Set(); // local repos' git folders
    // Spaces made while this runs wait (at most a moment) for their git, so a
    // worktree appears under its repo instead of jumping there.
    this.shown = new Set(spaces().map((s) => s.id));
    this.born = {};
    this.pressed = null;
    this.over = null;
    this.machines = [];
    this.folded = new Set(JSON.parse(localStorage.getItem("machines.folded") ?? "[]"));
    this.hovered = null; // the repo row under the pointer
    this.foldedRepos = new Set(JSON.parse(localStorage.getItem("repos.folded") ?? "[]"));
    this.pulls = JSON.parse(localStorage.getItem("pulls") ?? "{}"); // repo -> { fetchedAt, list }
    this.pullsTried = {}; // repo -> when a fetch last started
    this.fetching = new Set();
    cx.timer.every(15000, (cx) => this.refreshPulls(cx));
    this.refreshMachines(cx);
    cx.timer.every(15000, cx => this.refreshMachines(cx));
    // `git status` walks the whole tree, on another machine a process there:
    // only when its answer could have changed (see `due`).
    cx.timer.every(250, (cx) => this.checkNew(cx));
  }

  checkNew(cx) {
    const now = Date.now();
    const sp = spaces();
    for (const s of sp) if (!this.shown.has(s.id)) this.born[s.id] ??= now;
    const due = this.due(now, sp, panes());
    if (due.size) this.refreshGit(due, cx);
    if (sp.some((s) => !this.shown.has(s.id))) cx.notify();
  }

  // Places whose git could have changed: new ones (a new space, a cd), where a
  // command or an agent's turn just ended (a checkout, a commit, edits), those on
  // a machine that is back, and repos in view whose fallback is due.
  due(now, sp, ps) {
    // Moved there: what it knew of that place may be old.
    const at = {};
    for (const s of sp) at[s.id] = where(s, ps);
    const keys = new Set(Object.values(at).filter((k) => JSON.parse(k)[1]));
    const due = new Set([...keys].filter((k) => !(k in this.git)));
    for (const [id, k] of Object.entries(at)) if (this.at[id] && this.at[id] !== k && keys.has(k)) due.add(k);
    this.at = at;
    const spaceOf = {};
    for (const s of sp) for (const t of s.tabs ?? []) spaceOf[t.id] = s;
    const busy = {};
    for (const p of ps) {
      if (!p.terminal || !spaceOf[p.tab]) continue;
      busy[p.pane] = p.status === "working" || !(p.program?.shell || p.program?.agent);
      if (this.busy[p.pane] && !busy[p.pane]) this.sameRepo(at[spaceOf[p.tab].id], keys).forEach((k) => due.add(k));
    }
    this.busy = busy;
    for (const m of machines()) {
      const ready = m.layout === "ready";
      if (ready && this.ready[m.name] === false) for (const k of keys) if (JSON.parse(k)[0] === m.name) due.add(k);
      this.ready[m.name] = ready;
    }
    if (window().active) {
      for (const k of keys) {
        const asks = this.git[k] || this.unsure.has(k);
        if (asks && !this.folded.has(JSON.parse(k)[0]) && now - (this.checked[k] ?? 0) > FALLBACK) due.add(k);
      }
    }
    return due;
  }

  // `key` and the other places in its repo (a commit there moves their ahead/behind).
  sameRepo(key, keys) {
    const repo = this.git[key]?.repo;
    return [key, ...(repo ? [...keys].filter((k) => this.git[k]?.repo === repo) : [])];
  }

  refreshMachines(cx) {
    cx.spawn(async cx => {
      try { const r = await hc(["machine", "ls", "--json"]); if (r.code === 0) this.machines = (JSON.parse(r.stdout).machines ?? []).filter((m) => !m.temporary); } catch {}
      cx.notify();
    });
  }

  // One look at a time, each place once however often it was asked for meanwhile.
  refreshGit(keys, cx) {
    for (const k of keys) this.pending.add(k);
    if (this.refreshing) return;
    this.refreshing = true;
    cx.spawn(async (cx) => {
      while (this.pending.size) {
        const keys = [...this.pending];
        this.pending.clear();
        for (const key of keys) await this.check(key, cx);
      }
      const used = new Set(Object.values(this.git).filter(Boolean).map((g) => JSON.parse(g.repo)).filter(([on]) => !on).map(([, repo]) => repo));
      for (const repo of this.watching) if (!used.has(repo)) this.watching.delete(repo);
      this.refreshing = false;
      cx.notify();
    });
  }

  // One place's git: branch, ahead/behind, its repo.
  async check(key, cx) {
    const [on, cwd] = JSON.parse(key);
    this.checked[key] = Date.now();
    this.unsure.delete(key);
    try {
      // No optional locks: a status that touched the index would wake the watch again.
      // Writes nothing under .git (index lock, fsmonitor cookie): watch() would wake on it.
      const r = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v2", "--branch"], { cwd, on });
      if (r.code !== 0 && /must be run in a work tree/i.test(r.stderr)) {
        this.git[key] = await this.bareRepo(cwd, on);
        return;
      }
      if (r.code !== 0) {
        // Only git's own "no" is remembered as no repo; anything else is asked again.
        if (!/not a git repository/i.test(r.stderr)) this.unsure.add(key);
        this.git[key] = null;
        return;
      }
      // The repo's own .git folder names it; a worktree's top differs from it.
      const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
      const common = await exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, on });
      const repo = common.stdout.trim();
      const name = repoName(repo);
      const info = { name, branch: null, ahead: 0, behind: 0, repo: JSON.stringify([on, repo]), cwd, linked: repo !== `${top.stdout.trim()}/.git` };
      for (const line of r.stdout.split("\n")) {
        if (line.startsWith("# branch.head ")) info.branch = line.slice(14);
        else if (line.startsWith("# branch.ab ")) {
          const [a, b] = line.slice(12).split(" ");
          info.ahead = Math.abs(parseInt(a, 10)) || 0;
          info.behind = Math.abs(parseInt(b, 10)) || 0;
        }
      }
      this.git[key] = info;
      if (!on) this.watch(repo, cx);
    } catch {
      // Couldn't ask (the machine is away): keep what it showed, look again later.
      this.git[key] ??= null;
      this.unsure.add(key);
    }
  }

  watch(repo, cx) {
    if (this.watching.has(repo)) return;
    this.watching.add(repo);
    cx.spawn(async (cx) => {
      try {
        while (this.watching.has(repo)) {
          await watchFolder(repo);
          const mine = JSON.stringify([null, repo]);
          if (this.watching.has(repo)) this.refreshGit(Object.keys(this.git).filter((k) => this.git[k]?.repo === mine), cx);
        }
      } catch { this.watching.delete(repo); }
    });
  }

  menu(w) {
    // A popup is as tall as its items; height is only the most.
    openOverlay({ mod: "my-menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: w.id } } });
  }

  // A folder holding a bare repo, with its worktrees beside it, has no checkout
  // of its own; it stands in for the main checkout so the worktrees nest under it.
  async bareRepo(cwd, on) {
    const bare = await exec("git", ["rev-parse", "--is-bare-repository"], { cwd, on });
    if (bare.stdout.trim() !== "true") return null;

    const common = await exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, on });
    const repo = common.stdout.trim();
    const head = await exec("git", ["symbolic-ref", "--short", "HEAD"], { cwd, on });
    const branch = head.code === 0 ? head.stdout.trim() : null;
    return { name: repoName(repo), branch, ahead: 0, behind: 0, repo: JSON.stringify([on, repo]), cwd, linked: false };
  }

  // Spaces in order, each worktree space moved under its main checkout's.
  ordered() {
    const sp = spaces(), ps = panes();
    const ready = (w) => this.shown.has(w.id) || where(w, ps) in this.git || Date.now() - (this.born[w.id] ??= Date.now()) > 1500;
    for (const w of sp) if (!this.shown.has(w.id) && ready(w)) this.shown.add(w.id);
    const list = sp.map((w, i) => ({ w, i, g: this.git[where(w, ps)] ?? null })).filter((r) => this.shown.has(r.w.id));
    const mains = new Set(list.filter((r) => r.g && !r.g.linked).map((r) => r.g.repo));
    const nested = (r) => r.g?.linked && mains.has(r.g.repo);
    const out = [];
    const placed = new Set(); // repos whose worktrees are listed (under the first of its spaces)
    for (const r of list) {
      if (nested(r)) continue;
      const main = r.g && !r.g.linked && !placed.has(r.g.repo);
      const kids = main ? list.filter((k) => nested(k) && k.g.repo === r.g.repo) : [];
      const folded = kids.length > 0 && this.foldedRepos.has(r.g.repo);
      // A folded repo still shows the space you are in and any that needs you.
      const shownKids = folded ? kids.filter((k) => k.w.active || needsYou(k.w.status)) : kids;
      const fold = kids.length > 0 ? { folded, hidden: kids.length - shownKids.length } : null;
      out.push({ ...r, tree: null, fold });
      if (!main) continue;

      placed.add(r.g.repo);
      shownKids.forEach((k, n) => out.push({ ...k, tree: { first: n === 0, last: n === shownKids.length - 1 } }));
    }
    return out;
  }

  // The rows, under a header per machine once one isn't this computer.
  grouped(t, collapsed) {
    const rows = this.ordered();
    const draw = (r) => (collapsed ? this.compact(r, t) : this.row(r, t));
    const remote = [...new Set([...rows.map(r => r.w.machine).filter(Boolean), ...this.machines.map(m => m.name)])].sort();
    const loading = m => {
      const layout = machines().find(k => k.name === m)?.layout;
      return layout === "loading" || (!layout && this.machines.some(k => k.name === m && k.state === "connected"))
        || spaces().some(s => (s.machine ?? null) === m && !this.shown.has(s.id));
    };
    const loadingRow = m => div().id(`machine-loading-${m ?? "local"}`).h(28).flex_none().px(8).text_size(12).text_color(t.dim).child(collapsed ? "…" : "Loading…");
    if (!remote.length) return loading(null) && !rows.length ? [loadingRow(null)] : rows.map(draw);
    const machineNames = [null, ...remote];
    return machineNames.flatMap((m) => {
      const mine = rows.filter((r) => (r.w.machine ?? null) === m);
      const machine = this.machines.find(k => k.name === m);
      const connected = !m || machine?.state === "connected";
      const folded = this.folded.has(m);
      const head = h_flex().id(`machine-${m ?? "local"}`).h(26).flex_none().px(collapsed ? 2 : 8).gap(7).items_center().text_size(11).text_color(t.dim)
        .cursor_pointer().hover(s => s.bg(t.hover))
        .on_click((_e, cx) => {
          folded ? this.folded.delete(m) : this.folded.add(m);
          localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/${m ? "server" : "monitor"}.svg`).size(13).flex_none())
        .when(!collapsed, el => el.child(div().flex_1().truncate().child(m ?? "This computer"))
          .when(!connected, el => el.child(div().flex_none().child((machine?.state ?? "asleep").replace(/_/g, " "))))
          .when(connected, el => el.child(div().id(`machine-add-${m ?? "local"}`).flex_none().px(4).rounded(4).hover(s => s.bg(t.hover).text_color(t.foreground))
            .on_click((_e, cx) => { cx.stop_propagation(); run("space.new", m ? { machine: m } : {}); }).child("+")))
          .child(div().size(6).rounded(3).flex_none().bg(connected ? t.ansi2 : t.dim))
          .child(svg(`mods/workspace-chrome/chevron-${folded ? "right" : "down"}.svg`).size(11).flex_none()));
      const empty = h_flex().id(`machine-new-${m ?? "local"}`).h(28).flex_none().px(8).gap(7).items_center().rounded(7)
        .text_size(12).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
        .on_click(() => run("space.new", m ? { machine: m } : {}))
        .child(svg("mods/workspace-chrome/plus.svg").size(12)).when(!collapsed, el => el.child("New space there"));
      return [head, ...(folded ? [] : mine.length ? mine.map(draw) : [loading(m) ? loadingRow(m) : empty])];
    });
  }

  // One `gh pr list` per repo, at most every PULLS_MAX_AGE; failures wait as long.
  refreshPulls(cx) {
    const now = Date.now();
    const repos = new Map();
    for (const info of Object.values(this.git)) if (info && !repos.has(info.repo)) repos.set(info.repo, info.cwd);
    for (const [repo, cwd] of repos) {
      const last = Math.max(this.pulls[repo]?.fetchedAt ?? 0, this.pullsTried[repo] ?? 0);
      if (this.fetching.has(repo) || now - last < PULLS_MAX_AGE) continue;

      this.pullsTried[repo] = now;
      this.fetchPulls(repo, cwd, cx);
    }

  }

  // A failed call (no gh, no GitHub remote, offline) keeps the last list.
  async fetchPulls(repo, cwd, cx) {
    this.fetching.add(repo);
    try {
      const fields = "number,state,isDraft,title,headRefName";
      const r = await exec("gh", ["pr", "list", "--state", "all", "--limit", "100", "--json", fields], { cwd, on: JSON.parse(repo)[0] });
      if (r.code !== 0) return;

      this.pulls[repo] = { fetchedAt: Date.now(), list: JSON.parse(r.stdout) };
      localStorage.setItem("pulls", JSON.stringify(this.pulls));
      cx.notify();
    } catch {
      // The machine is away: keep what the rows showed.
    } finally {
      this.fetching.delete(repo);
    }
  }

  // The branch's open PR, else its newest one (gh lists newest first).
  pullOf(g) {
    if (!g?.branch) return null;

    const mine = (this.pulls[g.repo]?.list ?? []).filter((pull) => pull.headRefName === g.branch);
    return mine.find((pull) => pull.state === "OPEN") ?? mine[0] ?? null;
  }

  // A fixed slot at the row's right edge, so the dots line up; empty without an agent.
  statusDot(w, t) {
    const slot = h_flex().w(10).flex_none().items_center().justify_center();
    if (!w.status) return slot;

    // Idle is the usual state, so its dot only hints that an agent is there.
    const idle = w.status === "idle";
    const size = idle ? 4 : 7;
    return slot.child(div().size(size).rounded(size / 2).bg(idle ? t.border : tone(t, w.status)));
  }

  // The color says whether it is open, a draft, merged or closed.
  pullToken(pull, t) {
    const state = pullState(pull);
    return div().flex_none().text_color(t[PULL_COLORS[state]] ?? t.dim).child(`#${pull.number}`);
  }

  // The folder shows whether a repo's worktrees are open, and a click on it folds
  // or unfolds them; a click anywhere else on the row goes to the space.
  folderIcon(w, g, fold, t) {
    const open = Boolean(fold) && !fold.folded;
    const file = open ? "mods/my-spaces/folder-open.svg" : "mods/my-spaces/folder.svg";
    const icon = h_flex().size(FOLDER_SIZE).flex_none().items_center().justify_center().text_color(t.dim).child(svg(file).size(FOLDER_ICON_SIZE));
    if (!fold) return icon;

    return icon
      .id(`fold-${w.id}`)
      .hover((style) => style.text_color(t.foreground))
      .on_mouse_down("left", (_event, cx) => cx.stop_propagation())
      .on_mouse_up("left", (_event, cx) => {
        cx.stop_propagation();
        this.pressed = null;
        this.over = null;
        if (fold.folded) this.foldedRepos.delete(g.repo);
        else this.foldedRepos.add(g.repo);

        localStorage.setItem("repos.folded", JSON.stringify([...this.foldedRepos]));
        cx.notify();
      });
  }

  // A worktree's piece of its parent's guide line, under the middle of the
  // parent's folder icon.
  indentGuide(tree, t) {
    return div()
      .absolute()
      .top(tree.first ? GUIDE_INSET : 0)
      .bottom(tree.last ? GUIDE_INSET : 0)
      .left(ROW_PADDING + FOLDER_SIZE / 2)
      .w(1)
      .bg(t.border);
  }

  row({ w, i, g, tree, fold }, t) {
    const on = w.active;
    const depth = tree ? 1 : 0;
    const pull = this.pullOf(g);
    const title = w.named ? w.name : (pull?.title ?? w.name);
    const folded = Boolean(fold?.folded);
    const showHidden = folded && this.hovered === w.id && fold.hidden > 0;
    return v_flex()
      .relative()
      .id(`space-${w.id}`)
      .w_full()
      .min_w(0)
      .pl(ROW_PADDING + depth * LEVEL_INDENT)
      .pr(ROW_PADDING)
      .h(ROW_HEIGHT)
      .flex_none()
      .justify_center()
      .when(on, (el) => el.bg(t.selected))
      .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
      .when(this.pressed === i && this.over !== i, (el) => el.opacity(0.5))
      .when(this.pressed !== null && this.over === i && this.pressed !== i, (el) => el.child(
        div().absolute().left(0).right(0).h(2).bg(t.accent)
          .when(this.pressed < i, line => line.bottom(0))
          .when(this.pressed > i, line => line.top(0)),
      ))
      .on_mouse_down("left", () => {
        this.pressed = i;
        this.over = i;
      })
      .on_mouse_move((_e, cx) => {
        const source = spaces()[this.pressed];
        const over = source && (source.machine ?? null) === (w.machine ?? null) ? i : null;
        if (this.pressed !== null && this.over !== over) {
          this.over = over;
          cx.notify();
        }
      })
      .on_mouse_up("left", (_e, cx) => {
        const from = this.pressed;
        const over = this.over;
        this.pressed = null;
        this.over = null;
        if (from !== null && over === i && from !== i) run("space.move", { id: spaces()[from].id, index: i + 1 });
        else if (from === i) run("space.select", { id: w.id });
        cx.notify();
      })
      .on_mouse_down("right", () => this.menu(w))
      .when(Boolean(fold), (el) => el.on_hover((hovered, cx) => {
        if (hovered) this.hovered = w.id;
        else if (this.hovered === w.id) this.hovered = null;
        cx.notify();
      }))
      .when(Boolean(tree), (el) => el.child(this.indentGuide(tree, t)))
      .child(
        h_flex()
          .w_full()
          .min_w(0)
          .gap(ICON_GAP)
          .items_center()
          .child(this.folderIcon(w, g, fold, t))
          .child(div().min_w(0).truncate().text_color(t.foreground).child(title))
          .when(showHidden, (el) => el.child(div().flex_none().text_size(12).text_color(t.dim).child(String(fold.hidden))))
          .child(div().flex_1())
          .when(Boolean(pull), (el) => el.child(div().text_size(12).child(this.pullToken(pull, t))))
          .child(this.statusDot(w, t)),
      );
  }

  compact({ w, i }, t) {
    return h_flex()
      .id(`space-${w.id}`)
      .h(26)
      .flex_none()
      .justify_center()
      .gap(4)
      .when(w.active, (el) => el.bg(t.raised))
      .hover((s) => s.bg(t.hover))
      .on_click(() => run("space.select", { id: w.id }))
      .child(div().text_color(w.active ? t.foreground : t.muted).child(String(i + 1)))
      .child(div().text_color(tone(t, w.status)).child(glyph(w.status)));
  }

  render() {
    const t = theme();
    const collapsed = narrow();
    return v_flex().size_full().min_h(0).bg(t.chrome).text_size(13)
      .child(h_flex().h(31).pl(ROW_PADDING).pr(ROW_PADDING).items_center().justify_between().text_size(11.5).text_color(t.dim)
        .when(!collapsed, el => el.child("Spaces"))
        .child(div().id("space-new").size(26).flex_none().flex().items_center().justify_center().rounded(6).hover(s => s.bg(t.hover).text_color(t.foreground))
          .on_click(() => run("space.new")).child(svg("mods/workspace-chrome/plus.svg").size(14))))
      .child(v_flex().flex_1().min_h(0).pb(14).overflow_y_scrollbar().mode("always")
        .on_mouse_up("left", (_e, cx) => { this.pressed = null; cx.notify(); })
        .children(this.grouped(t, collapsed)));
  }
}
