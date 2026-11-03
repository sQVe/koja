import { v_flex } from 'gpui-base';
import type { AsyncContext, Context, Element } from 'gpui-kit';
import { div, View } from 'gpui-kit';
import type { SpaceInfo } from 'herdr';
import { exec, hc, machines, openOverlay, panes, run, setShared, spaces, terminals } from 'herdr';

import type { DragState } from '../../kit/drag.ts';
import { dragLine, dropAction, noDrag, setDragOver, startDrag } from '../../kit/drag.ts';
import type { StatusRollup, ThemeToken } from '../../kit/index.ts';
import {
  colors,
  controlSize,
  detailText,
  findLayoutNode,
  foldChevron,
  layoutRoot,
  listRow,
  overlaySize,
  railWidthLimit,
  repeat,
  repoLabel,
  rollupStatuses,
  spaceMark,
  spacing,
  statusMark,
  textSize,
} from '../../kit/index.ts';
import { foldedSet } from './folded.ts';
import { GitTracker } from './gitTracker.ts';
import { machineRows } from './machineRows.ts';
import type { Machine } from './machines.ts';
import { isMachineLoading, readMachines } from './machines.ts';
import { newSpaceArguments } from './newSpace.ts';
import { pullFields, pullOf, pullState, readPullCaches, readPullList } from './pulls.ts';
import { railRow } from './rail.ts';
import { labelDetail } from './rows.ts';
import { createOrderPublisher } from './spaceOrder.ts';
import type { ListedSpace, RepoRef, RepoRow, SpaceRow, TreeGroup, TreeRow } from './tree.ts';
import { nestSpaces, placesOf } from './tree.ts';
import type { VisibilityResult, VisibilityState } from './visibility.ts';
import { advanceVisibility, initialVisibility } from './visibility.ts';

const pullsMaxAge = 180_000;

const machinesMilliseconds = 15_000;

const pullsMilliseconds = 15_000;

const checkMilliseconds = 250;

const pullColors: Record<string, ThemeToken> = {
  open: 'ansi2',
  draft: 'dim',
  merged: 'ansi5',
  closed: 'ansi1',
};

const machinesFoldedKey = 'machines.folded';

const reposFoldedKey = 'repos.folded';

const pullsKey = 'pulls';

const isNarrow = (): boolean => {
  const sidebar = findLayoutNode('sidebar');
  const width = sidebar?.sizePx ?? null;

  return width !== null && width < railWidthLimit;
};

const topStripHeight = (): number =>
  layoutRoot().trafficLights === null ? spacing.small : controlSize.sidebarHeader;

const storage = {
  get: (key: string): string | null => localStorage.getItem(key),
  set: (key: string, value: string): void => {
    localStorage.setItem(key, value);
  },
};

export default class Spaces extends View {
  private readonly git = new GitTracker();

  private readonly pulls = readPullCaches(JSON.parse(localStorage.getItem(pullsKey) ?? '{}'));

  private readonly pullsTried: Record<string, number> = {};

  private readonly fetching = new Set<string>();

  private readonly foldedMachines = foldedSet(machinesFoldedKey, storage);

  private readonly foldedRepos = foldedSet(reposFoldedKey, storage);

  private readonly order = createOrderPublisher(setShared);

  private machineList: Machine[] = [];

  private visibility: VisibilityState = initialVisibility(spaces().map((space) => space.id));

  private drag: DragState = noDrag;

  private hovered: string | null = null;

  private statuses: StatusRollup = { spaces: {}, tabs: {} };

  override close(): void {
    this.order.clear();
  }

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

    this.statuses = rollupStatuses(spaces(), panes(), terminals());
    this.visibility = this.advance();

    return v_flex()
      .size_full()
      .min_h(0)
      .bg(palette.chrome)
      .text_size(textSize.default)
      .child(div().flex_none().h(topStripHeight()))
      .child(
        v_flex()
          .flex_1()
          .min_h(0)
          .pb(spacing.xlarge)
          .overflow_y_scrollbar()
          .mode('always')
          .on_mouse_up('left', (_event, cx) => {
            this.drag = noDrag;
            cx.notify();
          })
          .children(this.grouped(collapsed)),
      );
  }

  private advance(): VisibilityResult {
    const spaceList = spaces();
    const paneList = panes();
    const at = placesOf(spaceList, paneList);

    return advanceVisibility(this.visibility, {
      spaces: spaceList.map((space) => ({ id: space.id, key: at[space.id]?.key ?? '' })),
      answered: new Set(Object.keys(this.git.entries())),
      time: Date.now(),
    });
  }

  private checkNew(cx: Context): void {
    const spaceList = spaces();
    const paneList = panes();
    const at = placesOf(spaceList, paneList);

    this.git.prune(new Set(Object.values(at).map((place) => place.key)));

    const result = this.advance();

    this.visibility = result;

    const due = this.git.sweep(Date.now(), at, spaceList, paneList, (machine) =>
      this.foldedMachines.has(machine),
    );

    if (due.size > 0) {
      this.git.refresh(
        Object.values(at).filter((place) => due.has(place.key)),
        cx,
      );
    }

    if (result.changed || result.waiting) {
      cx.notify();
    }
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

  private ordered(): TreeGroup[] {
    const spaceList = spaces();
    const paneList = panes();
    const at = placesOf(spaceList, paneList);

    const list: ListedSpace[] = spaceList
      .map((space) => ({
        space,
        git: this.git.lookup(at[space.id]?.key ?? '') ?? null,
        status: this.statuses.spaces[space.id] ?? null,
      }))
      .filter((row) => this.visibility.shown.has(row.space.id));

    return nestSpaces(list, this.foldedRepos);
  }

  private isLoading(machine: string | null): boolean {
    const layout = machines().find((candidate) => candidate.name === machine)?.layout;

    const connected = this.machineList.some(
      (known) => known.name === machine && known.state === 'connected',
    );

    const waitingForSpace = spaces().some(
      (space) => (space.machine ?? null) === machine && !this.visibility.shown.has(space.id),
    );

    return isMachineLoading(layout, connected, waitingForSpace);
  }

  private draw(
    row: TreeRow,
    ids: readonly string[],
    collapsed: boolean,
    lineAbove: boolean,
  ): Element {
    if (collapsed) {
      const title = row.kind === 'repo' ? row.name : this.rowTitle(row);

      return railRow(row, title, lineAbove);
    }

    return row.kind === 'repo' ? this.labelRow(row, ids) : this.row(row, ids);
  }

  private grouped(collapsed: boolean): Element[] {
    const groups = this.ordered();
    const ids = spaces().map((space) => space.id);
    const shownRows: TreeRow[] = [];

    // machineRows draws only the shown rows, in sidebar order.
    const elements = machineRows(
      {
        machineList: this.machineList,
        groups,
        draw: (row, lineAbove) => {
          shownRows.push(row);

          return this.draw(row, ids, collapsed, lineAbove);
        },
        folded: (machine) => this.foldedMachines.has(machine ?? ''),
        loading: (machine) => this.isLoading(machine),
        addSpace: (machine) => {
          run('space.new', newSpaceArguments(machine));
        },
        toggleFold: (machine) => {
          this.foldedMachines.toggle(machine ?? '');
        },
      },
      collapsed,
    );

    this.order.publish(shownRows, ids);

    return elements;
  }

  private refreshPulls(cx: Context): void {
    const now = Date.now();

    for (const { repo, cwd } of this.git.repositories()) {
      const last = Math.max(this.pulls[repo.key]?.fetchedAt ?? 0, this.pullsTried[repo.key] ?? 0);

      if (this.fetching.has(repo.key) || now - last < pullsMaxAge) {
        continue;
      }

      this.pullsTried[repo.key] = now;
      this.fetchPulls(repo, cwd, cx);
    }
  }

  private fetchPulls(repo: RepoRef, cwd: string, cx: Context): void {
    this.fetching.add(repo.key);

    cx.spawn(async (taskCx) => {
      try {
        const args = ['pr', 'list', '--state', 'all', '--limit', '100', '--json', pullFields];
        const result = await exec('gh', args, { cwd, on: repo.machine });

        if (result.code === 0) {
          this.pulls[repo.key] = {
            fetchedAt: Date.now(),
            list: readPullList(JSON.parse(result.stdout)),
          };

          localStorage.setItem(pullsKey, JSON.stringify(this.pulls));
          taskCx.notify();
        }
      } catch {
        // The machine is away: keep what the rows showed.
      } finally {
        this.fetching.delete(repo.key);
      }
    });
  }

  private foldControls(row: RepoRow): Element[] {
    const { fold, main } = row;

    if (fold === null) {
      return [];
    }

    const controls: Element[] = [];

    if (fold.hidden > 0) {
      controls.push(detailText(String(fold.hidden)));
    }

    if (this.hovered === main.space.id) {
      controls.push(this.foldToggle(row));
    }

    return controls;
  }

  private foldToggle(row: RepoRow): Element {
    const { fold, main, repo } = row;

    return foldChevron(fold?.folded === true)
      .id(`fold-${main.space.id}`)
      .hover((style) => style.text_color(colors().foreground))
      .on_mouse_down('left', (_event, cx) => {
        cx.stop_propagation();
      })
      .on_mouse_up('left', (_event, cx) => {
        cx.stop_propagation();
        this.drag = noDrag;
        this.foldedRepos.toggle(repo.key);
        cx.notify();
      });
  }

  private pullDetail(row: ListedSpace): Element[] {
    const pull = pullOf(row.git, this.pulls);

    if (pull === null) {
      return [];
    }

    const token = pullColors[pullState(pull)] ?? 'dim';

    return [detailText(`#${pull.number}`, colors()[token])];
  }

  private rowTitle(row: ListedSpace): string {
    return row.space.named
      ? row.space.name
      : (pullOf(row.git, this.pulls)?.title ?? row.space.name);
  }

  private row(row: SpaceRow, ids: readonly string[]): Element {
    const { space } = row;
    const line = dragLine(this.drag, space.id, ids);

    const element = listRow({
      size: 'small',
      inset: true,
      state: space.active ? 'selected' : 'normal',
      start: spaceMark(row.status),
      label: this.rowTitle(row),
      ...(line === undefined ? {} : { dropLine: line }),
      dragged: this.drag.source === space.id && this.drag.over !== space.id,
      end: this.pullDetail(row),
    }).id(`space-${space.id}`);

    this.addDragHandlers(element, space, ids);

    return element;
  }

  private labelRow(row: RepoRow, ids: readonly string[]): Element {
    const { main, name, fold } = row;
    const { space } = main;
    const line = dragLine(this.drag, space.id, ids);
    const detail = labelDetail(main);

    const element = listRow({
      size: 'small',
      inset: true,
      state: space.active ? 'selected' : 'normal',
      label: repoLabel({
        name,
        ...(detail === undefined ? {} : { detail }),
        folded: fold?.folded === true,
        selected: space.active,
      }),
      ...(line === undefined ? {} : { dropLine: line }),
      dragged: this.drag.source === space.id && this.drag.over !== space.id,
      end: [...this.foldControls(row), statusMark(main.status)],
    }).id(`space-${space.id}`);

    this.addDragHandlers(element, space, ids);

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

  private addDragHandlers(element: Element, space: SpaceInfo, ids: readonly string[]): void {
    element
      .on_mouse_down('left', () => {
        this.drag = startDrag(ids, ids.indexOf(space.id));
      })
      .on_mouse_move((_event, cx) => {
        this.dragOver(space, cx);
      })
      .on_mouse_up('left', (_event, cx) => {
        this.drop(space, ids, cx);
      })
      .on_mouse_down('right', () => {
        this.openMenu(space);
      });
  }

  private dragOver(space: SpaceInfo, cx: Context): void {
    const source = spaces().find((candidate) => candidate.id === this.drag.source);

    const sameMachine =
      source !== undefined && (source.machine ?? null) === (space.machine ?? null);

    const next = setDragOver(this.drag, space.id, sameMachine);

    if (this.drag.source !== null && next.over !== this.drag.over) {
      this.drag = next;
      cx.notify();
    }
  }

  private drop(space: SpaceInfo, ids: readonly string[], cx: Context): void {
    const action = dropAction(this.drag, space.id, ids);

    this.drag = noDrag;

    if (action?.kind === 'move') {
      run('space.move', { id: action.id, index: action.index });
    } else if (action?.kind === 'select') {
      run('space.select', { id: action.id });
    }

    cx.notify();
  }
}
