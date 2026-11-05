import { v_flex } from 'gpui-base';
import type { AsyncContext, Context, Element } from 'gpui-kit';
import { div, View } from 'gpui-kit';
import type { SpaceInfo } from 'herdr';
import { machines, openOverlay, panes, run, setShared, spaces, terminals } from 'herdr';

import type { DragState } from '../../kit/drag.ts';
import { dropAction, noDrag, setDragOver, startDrag } from '../../kit/drag.ts';
import type { StatusRollup } from '../../kit/index.ts';
import {
  colors,
  controlSize,
  findLayoutNode,
  hoveredAfter,
  layoutRoot,
  overlaySize,
  railWidthLimit,
  repeat,
  rollupStatuses,
  spacing,
  withTextRole,
} from '../../kit/index.ts';
import { foldedSet } from './folded.ts';
import { GitTracker } from './gitTracker.ts';
import { machineRows } from './machineRows.ts';
import { isMachineLoading } from './machines.ts';
import { MachineTracker } from './machineTracker.ts';
import { newSpaceArguments } from './newSpace.ts';
import { PullTracker } from './pullTracker.ts';
import { railRow } from './rail.ts';
import { createOrderPublisher } from './spaceOrder.ts';
import type { RowState } from './spaceRows.ts';
import { labelRow, row as spaceRow, rowTitle } from './spaceRows.ts';
import type { GitInfo, ListedSpace, TreeGroup, TreeRow } from './tree.ts';
import { nestSpaces, placesOf } from './tree.ts';
import type { VisibilityResult, VisibilityState } from './visibility.ts';
import { advanceVisibility, initialVisibility } from './visibility.ts';

const machinesMilliseconds = 15_000;

const pullsMilliseconds = 15_000;

const checkMilliseconds = 250;

const machinesFoldedKey = 'machines.folded';

const reposFoldedKey = 'repos.folded';

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

  private readonly pulls = new PullTracker();

  private readonly foldedMachines = foldedSet(machinesFoldedKey, storage);

  private readonly foldedRepos = foldedSet(reposFoldedKey, storage);

  private readonly order = createOrderPublisher(setShared);

  private readonly machines = new MachineTracker();

  private visibility: VisibilityState = initialVisibility(spaces().map((space) => space.id));

  private drag: DragState = noDrag;

  private hovered: string | null = null;

  private statuses: StatusRollup = { spaces: {}, tabs: {} };

  override close(): void {
    this.order.clear();
  }

  override init(_props: unknown, cx: AsyncContext): void {
    repeat(cx, pullsMilliseconds, (timerCx) => {
      this.pulls.refresh(this.git.repositories(), timerCx);
    });

    this.machines.refresh(cx);

    repeat(cx, machinesMilliseconds, (timerCx) => {
      this.machines.refresh(timerCx);
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

    return withTextRole(v_flex(), 'body')
      .size_full()
      .min_h(0)
      .bg(palette.chrome)
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

    const connected = this.machines
      .lookup()
      .some((known) => known.name === machine && known.state === 'connected');

    const waitingForSpace = spaces().some(
      (space) => (space.machine ?? null) === machine && !this.visibility.shown.has(space.id),
    );

    return isMachineLoading(layout, connected, waitingForSpace);
  }

  private readonly retryPull = (git: GitInfo | null, cx: Context): void => {
    if (git === null) {
      return;
    }

    this.pulls.retry(git.repo, git.cwd, cx);
  };

  private draw(
    row: TreeRow,
    ids: readonly string[],
    collapsed: boolean,
    lineAbove: boolean,
  ): Element {
    if (collapsed) {
      const git = row.kind === 'repo' ? row.main.git : row.git;

      const title = row.kind === 'repo' ? row.name : rowTitle(row, this.pulls.lookup(row.git));

      return railRow(row, title, lineAbove, this.pulls.errorLine(git), (cx) => {
        this.retryPull(git, cx);
      });
    }

    const state: RowState = {
      drag: this.drag,
      hovered: this.hovered,
      lookup: (git) => this.pulls.lookup(git),
      attachDrag: (element, space, rowIds) => {
        this.addDragHandlers(element, space, rowIds);
      },
      onHover: (spaceId, hovered, cx) => {
        this.hovered = hoveredAfter(this.hovered, spaceId, hovered);
        cx.notify();
      },
      toggleFold: (repoKey, cx) => {
        this.drag = noDrag;
        this.foldedRepos.toggle(repoKey);
        cx.notify();
      },
    };

    return row.kind === 'repo' ? labelRow(row, ids, state) : spaceRow(row, ids, state);
  }

  private grouped(collapsed: boolean): Element[] {
    const groups = this.ordered();
    const ids = spaces().map((space) => space.id);
    const shownRows: TreeRow[] = [];

    // machineRows draws only the shown rows, in sidebar order.
    const elements = machineRows(
      {
        machineList: this.machines.lookup(),
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
        machineError: () => this.machines.errorLine(),
        pullError: (git) => this.pulls.errorLine(git),
        retryMachines: (cx) => {
          this.machines.retry(cx);
        },
        retryPull: this.retryPull,
      },
      collapsed,
    );

    this.order.publish(shownRows, ids);

    return elements;
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
