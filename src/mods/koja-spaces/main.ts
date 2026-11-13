import { ScrollHandle, v_flex } from 'gpui-base';
import type { AsyncContext, Context, Element } from 'gpui-kit';
import { div, View } from 'gpui-kit';
import type { PaneInfo, SpaceInfo } from 'herdr';
import { nextCommand, openOverlay, panes, run, setShared, shared, spaces, terminals } from 'herdr';

import type { DragState } from '../../kit/drag.ts';
import { dropAction, noDrag, setDragOver, startDrag } from '../../kit/drag.ts';
import type { StatusRollup } from '../../kit/index.ts';
import {
  colors,
  controlSize,
  hoveredAfter,
  layoutRoot,
  listActionOf,
  overlaySize,
  readSection,
  repeat,
  rollupStatuses,
  rowHeight,
  spacing,
  withTextRole,
} from '../../kit/index.ts';
import { cursorRow, halfPageOf, moveCursor } from './cursor.ts';
import { foldedSet } from './folded.ts';
import { GitTracker } from './gitTracker.ts';
import { projectRows } from './projectRows.ts';
import type { Project } from './projects.ts';
import { groupProjects, shownSpaces } from './projects.ts';
import { PullTracker } from './pullTracker.ts';
import type { ProjectChildren } from './spaceDrop.ts';
import { canDrop, dropMoves } from './spaceDrop.ts';
import { createOrderPublisher } from './spaceOrder.ts';
import type { HeaderState, RowState } from './spaceRows.ts';
import { headerRow, row as spaceRow } from './spaceRows.ts';
import type { GitInfo, ListedSpace } from './tree.ts';
import { placeOfSpace, placesOf } from './tree.ts';
import type { VisibilityResult, VisibilityState } from './visibility.ts';
import { advanceVisibility, initialVisibility } from './visibility.ts';
import type { WaitTimes } from './waitTimes.ts';
import { advanceWaitTimes, readWaitTimes, waitAge } from './waitTimes.ts';

const pullsMilliseconds = 15_000;

const checkMilliseconds = 250;

const ageMilliseconds = 60_000;

const waitTimesKey = 'wait.times';

const projectsFoldedKey = 'repos.folded';

const noFolds = { has: (): boolean => false };

const isSidebarMarked = (): boolean => readSection(shared) === 'sidebar';

const shownIdsOf = (projects: Project[]): string[] =>
  shownSpaces(projects).map((row) => row.space.id);

const activeSpaceId = (): string | null => spaces().find((space) => space.active)?.id ?? null;

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

  private readonly foldedProjects = foldedSet(projectsFoldedKey, storage);

  private readonly order = createOrderPublisher(setShared);

  private waitTimes: WaitTimes = readWaitTimes(storage.get(waitTimesKey));

  private waitTimesSavedAt = Number.NEGATIVE_INFINITY;

  private visibility: VisibilityState = initialVisibility(spaces().map((space) => space.id));

  private drag: DragState = noDrag;

  private refused: string | null = null;

  private hovered: string | null = null;

  private statuses: StatusRollup = { spaces: {}, tabs: {} };

  private cursor: string | null = null;

  private halfPage = 1;

  private readonly scroll = ScrollHandle.new();

  private revealCursor = false;

  private marked = false;

  override close(): void {
    this.order.clear();
  }

  override init(_props: unknown, cx: AsyncContext): void {
    repeat(cx, pullsMilliseconds, (timerCx) => {
      this.pulls.refresh(this.git.repositories(), timerCx);
    });

    repeat(cx, checkMilliseconds, (timerCx) => {
      this.checkNew(timerCx);
    });

    repeat(cx, ageMilliseconds, (timerCx) => {
      timerCx.notify();
    });

    this.listenForCommands(cx);
  }

  override render(): Element {
    const palette = colors();

    this.statuses = rollupStatuses(spaces(), panes(), terminals());
    this.visibility = this.advance();

    this.followMark(isSidebarMarked());

    return withTextRole(v_flex(), 'body')
      .size_full()
      .min_h(0)
      .bg(palette.chrome)
      .child(div().flex_none().h(topStripHeight()))
      .child(
        v_flex()
          .id('spaces-list')
          .flex_1()
          .min_h(0)
          .gap(spacing.xxsmall)
          .pb(spacing.xlarge)
          .overflow_y_scrollbar()
          .track_scroll(this.scroll)
          .mode('always')
          .on_size_change((size) => {
            this.halfPage = halfPageOf(size.height, rowHeight.small);
          })
          .on_mouse_up('left', (_event, cx) => {
            this.endDrag();
            cx.notify();
          })
          .children(this.listRows()),
      );
  }

  private followMark(marked: boolean): void {
    if (!marked) {
      this.cursor = null;
    }

    if (marked && !this.marked) {
      this.revealCursor = true;
    }

    this.marked = marked;
  }

  private listenForCommands(cx: AsyncContext): void {
    cx.spawn(async (taskCx) => {
      for (;;) {
        // eslint-disable-next-line no-await-in-loop -- each list command is awaited in turn
        const command = await nextCommand();

        this.applyCommand(command, taskCx);
      }
    });
  }

  private applyCommand(command: string, cx: Context): void {
    const action = listActionOf(command);

    if (action === null || !isSidebarMarked()) {
      return;
    }

    const result = moveCursor({
      shown: shownIdsOf(this.projects()),
      cursor: this.cursor,
      active: activeSpaceId(),
      action,
      halfPage: this.halfPage,
    });

    this.cursor = result.cursor;
    this.revealCursor = true;

    if (result.select !== null) {
      run('space.select', { id: result.select });
    }

    cx.notify();
  }

  private cursorRow(projects: Project[]): string | null {
    if (!isSidebarMarked()) {
      return null;
    }

    return cursorRow(shownIdsOf(projects), this.cursor, activeSpaceId());
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

  private trackWaits(spaceList: SpaceInfo[], paneList: PaneInfo[], now: number): boolean {
    const statuses = rollupStatuses(spaceList, paneList, terminals()).spaces;
    const result = advanceWaitTimes(this.waitTimes, { statuses, active: activeSpaceId(), now });

    this.waitTimes = result.times;

    if (result.changed || now - this.waitTimesSavedAt >= ageMilliseconds) {
      storage.set(waitTimesKey, JSON.stringify(result.times));
      this.waitTimesSavedAt = now;
    }

    return result.changed;
  }

  private checkNew(cx: Context): void {
    const spaceList = spaces();
    const paneList = panes();
    const at = placesOf(spaceList, paneList);
    const waitsChanged = this.trackWaits(spaceList, paneList, Date.now());

    this.git.prune(new Set(Object.values(at).map((place) => place.key)));

    const result = this.advance();

    this.visibility = result;

    const due = this.git.sweep(Date.now(), at, spaceList, paneList);

    if (due.size > 0) {
      this.git.refresh(
        Object.values(at).filter((place) => due.has(place.key)),
        cx,
      );
    }

    if (result.changed || result.waiting || waitsChanged) {
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

  private listedSpaces(): ListedSpace[] {
    const spaceList = spaces();
    const paneList = panes();

    return spaceList
      .map((space) => {
        const place = placeOfSpace(space, paneList);

        return {
          space,
          git: this.git.lookup(place.key) ?? null,
          status: this.statuses.spaces[space.id] ?? null,
          place,
        };
      })
      .filter((row) => this.visibility.shown.has(row.space.id));
  }

  private projects(): Project[] {
    return groupProjects(this.listedSpaces(), this.foldedProjects);
  }

  private projectChildren(): ProjectChildren[] {
    return groupProjects(this.listedSpaces(), noFolds).map((project) =>
      project.spaces.map((row) => row.space.id),
    );
  }

  private isWaiting(): boolean {
    return spaces().some((space) => !this.visibility.shown.has(space.id));
  }

  private draw(
    row: ListedSpace,
    ids: readonly string[],
    cursor: string | null,
    now: number,
  ): Element {
    const waiting = { id: row.space.id, status: row.status, active: row.space.active };
    const age = waitAge(this.waitTimes, waiting, now);

    const state: RowState = {
      drag: this.drag,
      refused: this.refused,
      cursor,
      age,
      lookup: (git) => this.pulls.lookup(git),
      attachDrag: (element, space, rowIds) => {
        this.addDragHandlers(element, space, rowIds);
      },
    };

    return spaceRow(row, ids, state);
  }

  private drawMain(
    project: Project,
    main: ListedSpace,
    ids: readonly string[],
    cursor: string | null,
    now: number,
  ): Element {
    const waiting = { id: main.space.id, status: main.status, active: main.space.active };

    const state: HeaderState = {
      drag: this.drag,
      refused: this.refused,
      cursor,
      age: waitAge(this.waitTimes, waiting, now),
      hovered: this.hovered,
      lookup: (git) => this.pulls.lookup(git),
      attachDrag: (element, space, rowIds) => {
        this.addDragHandlers(element, space, rowIds);
      },
      onHover: (spaceId, hovered, cx) => {
        this.hovered = hoveredAfter(this.hovered, spaceId, hovered);
        cx.notify();
      },
      toggleFold: this.toggleFold,
    };

    return headerRow(project, main, ids, state);
  }

  private readonly toggleFold = (key: string, cx: Context): void => {
    this.endDrag();
    this.foldedProjects.toggle(key);
    cx.notify();
  };

  private readonly retryPull = (git: GitInfo, cx: Context): void => {
    this.pulls.retry(git.repo, git.cwd, cx);
  };

  private listRows(): Element[] {
    const projects = this.projects();
    const ids = spaces().map((space) => space.id);
    const cursor = this.cursorRow(projects);
    const now = Date.now();

    let cursorElement: Element | null = null;

    const keepCursor = (row: ListedSpace, element: Element): Element => {
      if (row.space.id === cursor) {
        cursorElement = element;
      }

      return element;
    };

    this.order.publish(projects, ids);

    const elements = projectRows({
      projects,
      loading: this.isWaiting(),
      draw: (row) => keepCursor(row, this.draw(row, ids, cursor, now)),
      drawMain: (project, main) => keepCursor(main, this.drawMain(project, main, ids, cursor, now)),
      pullFailed: (git) => this.pulls.failed(git),
      retryPull: this.retryPull,
      toggleFold: this.toggleFold,
    });

    this.showCursor(elements, cursorElement);

    return elements;
  }

  // The scroll handle shows a direct child of the list by its index.
  private showCursor(elements: readonly Element[], cursorElement: Element | null): void {
    const index = cursorElement === null ? -1 : elements.indexOf(cursorElement);

    if (this.revealCursor && index >= 0) {
      this.scroll.scroll_to_item(index);
    }

    this.revealCursor = false;
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

  private endDrag(): void {
    this.drag = noDrag;
    this.refused = null;
  }

  private canDropOn(sourceId: string, space: SpaceInfo): boolean {
    const source = spaces().find((candidate) => candidate.id === sourceId);

    const sameMachine =
      source !== undefined && (source.machine ?? null) === (space.machine ?? null);

    return sameMachine && canDrop(this.projectChildren(), sourceId, space.id);
  }

  private dragOver(space: SpaceInfo, cx: Context): void {
    const { source, over } = this.drag;

    if (source === null || space.id === over || space.id === this.refused) {
      return;
    }

    const allowed = this.canDropOn(source, space);

    this.drag = setDragOver(this.drag, space.id, allowed);
    this.refused = allowed ? null : space.id;
    cx.notify();
  }

  private drop(space: SpaceInfo, ids: readonly string[], cx: Context): void {
    const action = dropAction(this.drag, space.id, ids);

    this.endDrag();

    if (action?.kind === 'move') {
      for (const move of dropMoves(ids, this.projectChildren(), action.id, space.id)) {
        run('space.move', { id: move.id, index: move.index });
      }
    } else if (action?.kind === 'select') {
      run('space.select', { id: action.id });
    }

    cx.notify();
  }
}
