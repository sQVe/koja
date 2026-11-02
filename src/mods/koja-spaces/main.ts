// Spaces as a folder tree, like Zed's project panel: a folder icon that opens and closes (click
// it to fold a repository's worktrees), worktrees one level under their checkout with a guide
// line, and a group per machine when more than one is known. A space's row shows its pull
// request and its agents' status. Click to switch, right-click for its menu, drag to reorder.

import { v_flex } from 'gpui-base';
import type { AsyncContext, Context, Element } from 'gpui-kit';
import { View } from 'gpui-kit';
import type { PaneInfo, SpaceInfo } from 'herdr';
import { exec, hc, machines, openOverlay, panes, run, spaces, watchFolder } from 'herdr';

import type { ThemeToken } from '../../kit/index.ts';
import {
  colors,
  currentWindow,
  detailText,
  emptyState,
  findLayoutNode,
  icon,
  iconButton,
  iconSlot,
  indicator,
  listOf,
  listRow,
  numberOf,
  overlaySize,
  railWidthLimit,
  recordOf,
  repeat,
  sectionHeader,
  spaceFolder,
  spacing,
  statusMark,
  stringOf,
  textSize,
} from '../../kit/index.ts';
import type { GitInfo, ListedSpace, TreeRow } from './tree.ts';
import { needsYou, nestSpaces, parseBranchStatus, repoName } from './tree.ts';

interface Machine {
  name: string;
  state: string | null;
}

interface Pull {
  number: number;
  state: string;
  isDraft: boolean;
  title: string;
  headRefName: string;
}

interface PullCache {
  fetchedAt: number;
  list: Pull[];
}

// A place is JSON of [machine, folder]: where a space's first terminal is now.
type Place = [machine: string | null, folder: string];

// Changes made outside Herdr, such as an editor's save or a commit in another app, are looked
// for this often in repositories the list shows, while the window is in front.
const fallbackMilliseconds = 60_000;

// A repository's pull requests are fetched again after this long.
const pullsMaxAge = 180_000;

const machinesMilliseconds = 15_000;

const pullsMilliseconds = 15_000;

// `git status` walks the whole tree, so it runs only when its answer could have changed.
const checkMilliseconds = 250;

// A space made while this runs waits at most this long for its git, so a worktree appears
// under its repository instead of jumping there.
const newSpaceWait = 1500;

const pullColors: Record<string, ThemeToken> = {
  open: 'ansi2',
  draft: 'dim',
  merged: 'ansi5',
  closed: 'ansi1',
};

const pullFields = 'number,state,isDraft,title,headRefName';

const machinesFoldedKey = 'machines.folded';

const reposFoldedKey = 'repos.folded';

const pullsKey = 'pulls';

const placeKey = (space: SpaceInfo, paneList: readonly PaneInfo[]): string =>
  JSON.stringify([space.machine ?? null, spaceFolder(space, paneList)]);

const parsePlace = (key: string): Place => {
  const parsed: unknown = JSON.parse(key);
  const [machine, folder] = listOf(parsed);

  return [stringOf(machine), stringOf(folder) ?? ''];
};

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const isNarrow = (): boolean => {
  const sidebar = findLayoutNode('sidebar');
  const width = numberOf(recordOf(sidebar?.['size'])['px']);

  return width !== null && width < railWidthLimit;
};

const pullState = (pull: Pull): string =>
  pull.isDraft && pull.state === 'OPEN' ? 'draft' : pull.state.toLowerCase();

const readStrings = (key: string): Set<string> => {
  const stored: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');

  return new Set(listOf(stored).filter((item): item is string => typeof item === 'string'));
};

const readPull = (value: unknown): Pull | null => {
  const fields = recordOf(value);
  const number = numberOf(fields['number']);
  const state = stringOf(fields['state']);
  const headRefName = stringOf(fields['headRefName']);

  if (number === null || state === null || headRefName === null) {
    return null;
  }

  const title = stringOf(fields['title']) ?? '';

  return { number, state, isDraft: fields['isDraft'] === true, title, headRefName };
};

const readPullList = (value: unknown): Pull[] =>
  listOf(value)
    .map(readPull)
    .filter((pull): pull is Pull => pull !== null);

const readPullCaches = (): Record<string, PullCache> => {
  const stored: unknown = JSON.parse(localStorage.getItem(pullsKey) ?? '{}');

  const entries = Object.entries(recordOf(stored)).map(([repo, cache]) => {
    const fields = recordOf(cache);

    return [
      repo,
      { fetchedAt: numberOf(fields['fetchedAt']) ?? 0, list: readPullList(fields['list']) },
    ] as const;
  });

  return Object.fromEntries(entries);
};

const readMachines = (stdout: string): Machine[] =>
  listOf(recordOf(JSON.parse(stdout))['machines'])
    .map(recordOf)
    .filter((machine) => machine['temporary'] !== true)
    .map((machine) => ({
      name: stringOf(machine['name']) ?? '',
      state: stringOf(machine['state']),
    }));

const toggled = (set: Set<string>, item: string): void => {
  if (set.has(item)) {
    set.delete(item);
  } else {
    set.add(item);
  }
};

export default class Spaces extends View {
  // Place key to its git facts; null when it is not a repository.
  private readonly git: Record<string, GitInfo | null> = {};

  // Place key to when git last looked at it.
  private readonly checked: Record<string, number> = {};

  // Places git couldn't answer for, such as on a machine that is away.
  private readonly unsure = new Set<string>();

  private readonly pending = new Set<string>();

  private refreshing = false;

  // Pane to whether an agent works or a program runs in front of its shell there.
  private busy: Record<string, boolean> = {};

  // Machine to whether its layout was readable at the last look.
  private readonly ready: Record<string, boolean> = {};

  // Space to its place key at the last look.
  private at: Record<string, string> = {};

  // Local repositories' git folders.
  private readonly watching = new Set<string>();

  private readonly shown = new Set(spaces().map((space) => space.id));

  private readonly born: Record<string, number> = {};

  private pressed: number | null = null;

  private over: number | null = null;

  private machineList: Machine[] = [];

  private readonly foldedMachines = readStrings(machinesFoldedKey);

  private readonly foldedRepos = readStrings(reposFoldedKey);

  // The repository row under the pointer.
  private hovered: string | null = null;

  private readonly pulls = readPullCaches();

  // Repository to when a fetch of its pull requests last started.
  private readonly pullsTried: Record<string, number> = {};

  private readonly fetching = new Set<string>();

  override init(_props: unknown, cx: AsyncContext): void {
    repeat(cx, pullsMilliseconds, (timerCx) => {
      this.refreshPulls(timerCx);
    });

    this.refreshMachines(cx);

    repeat(cx, machinesMilliseconds, (timerCx) => {
      this.refreshMachines(timerCx);
    });

    repeat(cx, checkMilliseconds, (timerCx) => {
      this.checkNew(timerCx);
    });
  }

  override render(): Element {
    const palette = colors();
    const collapsed = isNarrow();

    const newSpace = iconButton('plus')
      .id('space-new')
      .on_click(() => {
        run('space.new');
      });

    return v_flex()
      .size_full()
      .min_h(0)
      .bg(palette.chrome)
      .text_size(textSize.default)
      .child(sectionHeader({ label: collapsed ? '' : 'Spaces', size: 'bar', end: [newSpace] }))
      .child(
        v_flex()
          .flex_1()
          .min_h(0)
          .pb(spacing.xlarge)
          .overflow_y_scrollbar()
          .mode('always')
          .on_mouse_up('left', (_event, cx) => {
            this.pressed = null;
            cx.notify();
          })
          .children(this.grouped(collapsed)),
      );
  }

  private checkNew(cx: Context): void {
    const now = Date.now();
    const spaceList = spaces();

    for (const space of spaceList) {
      if (!this.shown.has(space.id)) {
        this.born[space.id] ??= now;
      }
    }

    const due = this.due(now, spaceList, panes());

    if (due.size > 0) {
      this.refreshGit(due, cx);
    }

    if (spaceList.some((space) => !this.shown.has(space.id))) {
      cx.notify();
    }
  }

  // Places whose git could have changed: new ones (a new space, a cd), where a command or an
  // agent's turn just ended (a checkout, a commit, edits), those on a machine that is back, and
  // repositories in view whose fallback look is due.
  private due(now: number, spaceList: SpaceInfo[], paneList: PaneInfo[]): Set<string> {
    const at: Record<string, string> = {};

    for (const space of spaceList) {
      at[space.id] = placeKey(space, paneList);
    }

    const keys = new Set(Object.values(at).filter((key) => parsePlace(key)[1] !== ''));
    const due = new Set([...keys].filter((key) => !(key in this.git)));

    // Moved there: what it knew of that place may be old.
    for (const [id, key] of Object.entries(at)) {
      const before = this.at[id];

      if (before !== undefined && before !== key && keys.has(key)) {
        due.add(key);
      }
    }

    this.at = at;
    this.addFinishedWork(at, keys, spaceList, paneList, due);
    this.addReturnedMachines(keys, due);

    if (currentWindow()?.active === true) {
      this.addFallbacks(now, keys, due);
    }

    return due;
  }

  private addFinishedWork(
    at: Record<string, string>,
    keys: Set<string>,
    spaceList: SpaceInfo[],
    paneList: PaneInfo[],
    due: Set<string>,
  ): void {
    const spaceOfTab: Record<string, SpaceInfo> = {};

    for (const space of spaceList) {
      for (const tab of space.tabs) {
        spaceOfTab[tab.id] = space;
      }
    }

    const busy: Record<string, boolean> = {};

    for (const pane of paneList) {
      const space = spaceOfTab[pane.tab];

      if (pane.terminal === null || space === undefined) {
        continue;
      }

      const inFront = !(pane.program.shell || pane.program.agent);

      const isBusy = pane.status === 'working' || inFront;

      busy[pane.pane] = isBusy;

      if (this.busy[pane.pane] === true && !isBusy) {
        this.sameRepo(at[space.id] ?? '', keys).forEach((key) => due.add(key));
      }
    }

    this.busy = busy;
  }

  private addReturnedMachines(keys: Set<string>, due: Set<string>): void {
    for (const machine of machines()) {
      const ready = machine.layout === 'ready';
      const name = machine.name ?? '';

      if (ready && this.ready[name] === false) {
        [...keys]
          .filter((key) => parsePlace(key)[0] === machine.name)
          .forEach((key) => due.add(key));
      }

      this.ready[name] = ready;
    }
  }

  private addFallbacks(now: number, keys: Set<string>, due: Set<string>): void {
    for (const key of keys) {
      const asks = this.git[key] !== null && this.git[key] !== undefined;
      const known = asks || this.unsure.has(key);
      const machine = parsePlace(key)[0] ?? '';
      const stale = now - (this.checked[key] ?? 0) > fallbackMilliseconds;

      if (known && !this.foldedMachines.has(machine) && stale) {
        due.add(key);
      }
    }
  }

  // `key` and the other places in its repository: a commit there moves their ahead and behind.
  private sameRepo(key: string, keys: Set<string>): string[] {
    const repo = this.git[key]?.repo;

    if (repo === undefined) {
      return [key];
    }

    return [key, ...[...keys].filter((other) => this.git[other]?.repo === repo)];
  }

  private refreshMachines(cx: Context): void {
    cx.spawn(async (taskCx) => {
      try {
        const result = await hc(['machine', 'ls', '--json']);

        if (result.code === 0) {
          this.machineList = readMachines(result.stdout);
        }
      } catch {
        // The core is away: keep the machines shown.
      }

      taskCx.notify();
    });
  }

  // One look at a time, each place once however often it was asked for meanwhile.
  private refreshGit(keys: Iterable<string>, cx: Context): void {
    for (const key of keys) {
      this.pending.add(key);
    }

    if (this.refreshing) {
      return;
    }

    this.refreshing = true;

    cx.spawn(async (taskCx) => {
      while (this.pending.size > 0) {
        const batch = [...this.pending];

        this.pending.clear();

        for (const key of batch) {
          // eslint-disable-next-line no-await-in-loop -- one git process at a time
          await this.check(key, taskCx);
        }
      }

      this.forgetUnusedWatches();
      this.refreshing = false;
      taskCx.notify();
    });
  }

  private forgetUnusedWatches(): void {
    const used = new Set(
      Object.values(this.git)
        .filter((info): info is GitInfo => info !== null)
        .map((info) => listOf(JSON.parse(info.repo)))
        .filter(([machine]) => machine === null)
        .map(([, repo]) => stringOf(repo)),
    );

    for (const repo of this.watching) {
      if (!used.has(repo)) {
        this.watching.delete(repo);
      }
    }
  }

  // One place's git: branch, ahead and behind, and its repository.
  private async check(key: string, cx: Context): Promise<void> {
    const [machine, cwd] = parsePlace(key);
    const options = { cwd, on: machine };

    this.checked[key] = Date.now();
    this.unsure.delete(key);

    try {
      // No optional locks and no fsmonitor: writes under .git would wake the watch again.
      const status = await exec(
        'git',
        [
          '--no-optional-locks',
          '-c',
          'core.fsmonitor=false',
          'status',
          '--porcelain=v2',
          '--branch',
        ],
        options,
      );

      if (status.code !== 0) {
        await this.checkFailed(key, status.stderr, cwd, machine);

        return;
      }

      // The repository's own .git folder names it; a worktree's top differs from it.
      const top = await exec('git', ['rev-parse', '--show-toplevel'], options);

      const common = await exec(
        'git',
        ['rev-parse', '--path-format=absolute', '--git-common-dir'],
        options,
      );

      const repo = common.stdout.trim();
      const linked = repo !== `${top.stdout.trim()}/.git`;

      this.git[key] = {
        name: repoName(repo),
        ...parseBranchStatus(status.stdout),
        repo: JSON.stringify([machine, repo]),
        cwd,
        linked,
      };

      if (machine === null) {
        this.watch(repo, cx);
      }
    } catch {
      // Couldn't ask, such as when the machine is away: keep what it showed, look again later.
      this.git[key] ??= null;
      this.unsure.add(key);
    }
  }

  private async checkFailed(
    key: string,
    stderr: string,
    cwd: string,
    machine: string | null,
  ): Promise<void> {
    if (/must be run in a work tree/i.test(stderr)) {
      this.git[key] = await this.bareRepo(cwd, machine);

      return;
    }

    // Only git's own "no" is remembered as no repository; anything else is asked again.
    if (!/not a git repository/i.test(stderr)) {
      this.unsure.add(key);
    }

    this.git[key] = null;
  }

  // A folder holding a bare repository, with its worktrees beside it, has no checkout of its
  // own; it stands in for the main checkout so the worktrees nest under it.
  private async bareRepo(cwd: string, machine: string | null): Promise<GitInfo | null> {
    const options = { cwd, on: machine };
    const bare = await exec('git', ['rev-parse', '--is-bare-repository'], options);

    if (bare.stdout.trim() !== 'true') {
      return null;
    }

    const common = await exec(
      'git',
      ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      options,
    );

    const head = await exec('git', ['symbolic-ref', '--short', 'HEAD'], options);
    const repo = common.stdout.trim();
    const branch = head.code === 0 ? head.stdout.trim() : null;

    return {
      name: repoName(repo),
      branch,
      ahead: 0,
      behind: 0,
      repo: JSON.stringify([machine, repo]),
      cwd,
      linked: false,
    };
  }

  private watch(repo: string, cx: Context): void {
    if (this.watching.has(repo)) {
      return;
    }

    this.watching.add(repo);

    cx.spawn(async (taskCx) => {
      const mine = JSON.stringify([null, repo]);

      try {
        while (this.watching.has(repo)) {
          // eslint-disable-next-line no-await-in-loop -- waits for each batch of changes in turn
          await watchFolder(repo);

          if (this.watching.has(repo)) {
            this.refreshGit(
              Object.keys(this.git).filter((key) => this.git[key]?.repo === mine),
              taskCx,
            );
          }
        }
      } catch {
        this.watching.delete(repo);
      }
    });
  }

  private openMenu(space: SpaceInfo): void {
    // A popup is as tall as its items; the height is only the most.
    openOverlay({
      mod: 'koja-menu',
      kind: 'popup',
      width: overlaySize.menuWidth,
      height: overlaySize.menuHeight,
      props: { tab: 'space', target: { id: space.id } },
    });
  }

  private isReady(space: SpaceInfo, paneList: PaneInfo[]): boolean {
    if (this.shown.has(space.id) || placeKey(space, paneList) in this.git) {
      return true;
    }

    const born = this.born[space.id] ?? Date.now();

    this.born[space.id] = born;

    return Date.now() - born > newSpaceWait;
  }

  private ordered(): TreeRow[] {
    const spaceList = spaces();
    const paneList = panes();

    for (const space of spaceList) {
      if (this.isReady(space, paneList)) {
        this.shown.add(space.id);
      }
    }

    const list: ListedSpace[] = spaceList
      .map((space, index) => ({ space, index, git: this.git[placeKey(space, paneList)] ?? null }))
      .filter((row) => this.shown.has(row.space.id));

    return nestSpaces(list, this.foldedRepos);
  }

  private isLoading(machine: string | null): boolean {
    const layout = machines().find((candidate) => candidate.name === machine)?.layout;

    const connected = this.machineList.some(
      (known) => known.name === machine && known.state === 'connected',
    );

    const waitingForLayout = layout === undefined && connected;

    const waitingForSpace = spaces().some(
      (space) => (space.machine ?? null) === machine && !this.shown.has(space.id),
    );

    return layout === 'loading' || waitingForLayout || waitingForSpace;
  }

  private loadingRow(collapsed: boolean): Element {
    return emptyState(collapsed ? '…' : 'Loading…');
  }

  // The rows, under a header per machine once one isn't this computer.
  private grouped(collapsed: boolean): Element[] {
    const rows = this.ordered();
    const draw = (row: TreeRow): Element => (collapsed ? this.compact(row) : this.row(row));

    const remote = [
      ...new Set([
        ...rows
          .map((row) => row.space.machine)
          .filter((machine): machine is string => machine !== null),
        ...this.machineList.map((machine) => machine.name),
      ]),
    ].toSorted();

    if (remote.length === 0) {
      const loading = this.isLoading(null) && rows.length === 0;

      return loading ? [this.loadingRow(collapsed)] : rows.map(draw);
    }

    return [null, ...remote].flatMap((machine) => {
      const mine = rows.filter((row) => (row.space.machine ?? null) === machine);
      const header = this.machineHeader(machine, collapsed);

      if (this.foldedMachines.has(machine ?? '')) {
        return [header];
      }

      if (mine.length > 0) {
        return [header].concat(mine.map(draw));
      }

      return [
        header,
        this.isLoading(machine) ? this.loadingRow(collapsed) : this.newSpaceRow(machine, collapsed),
      ];
    });
  }

  // A connected machine offers a new space there; another says why it is away.
  private machineState(machine: string | null, connected: boolean): Element {
    if (!connected) {
      const known = this.machineList.find((candidate) => candidate.name === machine);

      return detailText((known?.state ?? 'asleep').replaceAll('_', ' '));
    }

    return iconButton('plus', 'small')
      .id(`machine-add-${machine ?? 'local'}`)
      .on_click((_event, cx) => {
        cx.stop_propagation();
        run('space.new', machine === null ? {} : { machine });
      });
  }

  private machineHeader(machine: string | null, collapsed: boolean): Element {
    const known = this.machineList.find((candidate) => candidate.name === machine);
    const connected = machine === null || known?.state === 'connected';
    const folded = this.foldedMachines.has(machine ?? '');
    const state = collapsed ? [] : [this.machineState(machine, connected)];
    const label = collapsed ? '' : (machine ?? 'This computer');

    return sectionHeader({
      label,
      size: 'default',
      interactive: true,
      start: icon(machine === null ? 'monitor' : 'server', 'small'),
      end: [
        ...state,
        indicator(connected ? 'ansi2' : 'dim'),
        icon(folded ? 'chevron-right' : 'chevron-down', 'small'),
      ],
    })
      .id(`machine-${machine ?? 'local'}`)
      .on_click((_event, cx) => {
        toggled(this.foldedMachines, machine ?? '');
        localStorage.setItem(machinesFoldedKey, JSON.stringify([...this.foldedMachines]));
        cx.notify();
      });
  }

  private newSpaceRow(machine: string | null, collapsed: boolean): Element {
    return listRow({
      size: 'small',
      inset: false,
      state: 'normal',
      muted: true,
      start: iconSlot(icon('plus', 'small')),
      label: collapsed ? '' : 'New space there',
    })
      .id(`machine-new-${machine ?? 'local'}`)
      .on_click(() => {
        run('space.new', machine === null ? {} : { machine });
      });
  }

  // One `gh pr list` per repository, at most every pullsMaxAge; a failure waits as long.
  private refreshPulls(cx: Context): void {
    const now = Date.now();
    const repos = new Map<string, string>();

    for (const info of Object.values(this.git)) {
      if (info !== null && !repos.has(info.repo)) {
        repos.set(info.repo, info.cwd);
      }
    }

    for (const [repo, cwd] of repos) {
      const last = Math.max(this.pulls[repo]?.fetchedAt ?? 0, this.pullsTried[repo] ?? 0);

      if (this.fetching.has(repo) || now - last < pullsMaxAge) {
        continue;
      }

      this.pullsTried[repo] = now;
      this.fetchPulls(repo, cwd, cx);
    }
  }

  // A failed call, such as without gh, a GitHub remote, or a network, keeps the last list.
  private fetchPulls(repo: string, cwd: string, cx: Context): void {
    this.fetching.add(repo);

    cx.spawn(async (taskCx) => {
      try {
        const machine = stringOf(listOf(JSON.parse(repo))[0]);
        const args = ['pr', 'list', '--state', 'all', '--limit', '100', '--json', pullFields];
        const result = await exec('gh', args, { cwd, on: machine });

        if (result.code === 0) {
          this.pulls[repo] = {
            fetchedAt: Date.now(),
            list: readPullList(JSON.parse(result.stdout)),
          };

          localStorage.setItem(pullsKey, JSON.stringify(this.pulls));
          taskCx.notify();
        }
      } catch {
        // The machine is away: keep what the rows showed.
      } finally {
        this.fetching.delete(repo);
      }
    });
  }

  // The branch's open pull request, else its newest one; gh lists the newest first.
  private pullOf(git: GitInfo | null): Pull | null {
    if (git?.branch === null || git?.branch === undefined) {
      return null;
    }

    const mine = (this.pulls[git.repo]?.list ?? []).filter(
      (pull) => pull.headRefName === git.branch,
    );

    return mine.find((pull) => pull.state === 'OPEN') ?? mine[0] ?? null;
  }

  // The folder shows whether a repository's worktrees are open, and a click on it folds or
  // unfolds them; a click anywhere else on the row goes to the space.
  private folderIcon(row: TreeRow): Element {
    const { fold, git } = row;
    const open = fold !== null && !fold.folded;
    const slot = iconSlot(icon(open ? 'folder-open' : 'folder')).text_color(colors().dim);

    if (fold === null || git === null) {
      return slot;
    }

    return slot
      .id(`fold-${row.space.id}`)
      .hover((style) => style.text_color(colors().foreground))
      .on_mouse_down('left', (_event, cx) => {
        cx.stop_propagation();
      })
      .on_mouse_up('left', (_event, cx) => {
        cx.stop_propagation();
        this.pressed = null;
        this.over = null;
        toggled(this.foldedRepos, git.repo);
        localStorage.setItem(reposFoldedKey, JSON.stringify([...this.foldedRepos]));
        cx.notify();
      });
  }

  private dropLine(index: number): 'top' | 'bottom' | undefined {
    const { pressed, over } = this;

    if (pressed === null || over !== index || pressed === index) {
      return undefined;
    }

    return pressed < index ? 'bottom' : 'top';
  }

  private pullDetail(row: TreeRow): Element[] {
    const pull = this.pullOf(row.git);

    if (pull === null) {
      return [];
    }

    const token = pullColors[pullState(pull)] ?? 'dim';

    return [detailText(`#${pull.number}`, colors()[token])];
  }

  private rowTitle(row: TreeRow): string {
    return row.space.named ? row.space.name : (this.pullOf(row.git)?.title ?? row.space.name);
  }

  private row(row: TreeRow): Element {
    const { space, index, tree, fold } = row;
    const dropLine = this.dropLine(index);
    const showsHidden = fold?.folded === true && this.hovered === space.id && fold.hidden > 0;

    const element = listRow({
      size: 'small',
      inset: false,
      state: space.active ? 'selected' : 'normal',
      depth: tree === null ? 0 : 1,
      start: this.folderIcon(row),
      label: this.rowTitle(row),
      ...(showsHidden ? { detail: String(fold.hidden) } : {}),
      ...(tree === null ? {} : { guide: tree }),
      ...(dropLine === undefined ? {} : { dropLine }),
      dragged: this.pressed === index && this.over !== index,
      end: [...this.pullDetail(row), statusMark(space.status)],
    }).id(`space-${space.id}`);

    this.addDragHandlers(element, space, index);

    if (fold !== null) {
      element.on_hover((hovered, cx) => {
        if (hovered) {
          this.hovered = space.id;
        } else if (this.hovered === space.id) {
          this.hovered = null;
        }

        cx.notify();
      });
    }

    return element;
  }

  private addDragHandlers(element: Element, space: SpaceInfo, index: number): void {
    element
      .on_mouse_down('left', () => {
        this.pressed = index;
        this.over = index;
      })
      .on_mouse_move((_event, cx) => {
        this.dragOver(space, index, cx);
      })
      .on_mouse_up('left', (_event, cx) => {
        this.drop(space, index, cx);
      })
      .on_mouse_down('right', () => {
        this.openMenu(space);
      });
  }

  // A space moves only within its machine's group.
  private dragOver(space: SpaceInfo, index: number, cx: Context): void {
    const source = this.pressed === null ? undefined : spaces()[this.pressed];

    const sameMachine =
      source !== undefined && (source.machine ?? null) === (space.machine ?? null);

    const over = sameMachine ? index : null;

    if (this.pressed !== null && this.over !== over) {
      this.over = over;
      cx.notify();
    }
  }

  private drop(space: SpaceInfo, index: number, cx: Context): void {
    const { pressed: from, over } = this;
    const moved = from === null ? undefined : spaces()[from];

    this.pressed = null;
    this.over = null;

    if (moved !== undefined && over === index && from !== index) {
      run('space.move', { id: moved.id, index: index + 1 });
    } else if (from === index) {
      run('space.select', { id: space.id });
    }

    cx.notify();
  }

  private compact(row: TreeRow): Element {
    const { space, index } = row;

    return listRow({
      size: 'medium',
      inset: false,
      state: space.active ? 'selected' : 'normal',
      centered: true,
      muted: !space.active,
      label: String(index + 1),
      end: [statusMark(needsYou(space.status) ? space.status : null)],
    })
      .id(`space-${space.id}`)
      .on_click(() => {
        run('space.select', { id: space.id });
      });
  }
}
