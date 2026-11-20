import { ScrollHandle, v_flex } from 'gpui-base';
import type { AsyncContext, Context, Element } from 'gpui-kit';
import { div, View } from 'gpui-kit';
import type { PaneInfo, SpaceInfo } from 'herdr';
import {
  checking,
  nextCommand,
  openOverlay,
  panes,
  run,
  setShared,
  shared,
  spaces,
  terminals,
} from 'herdr';

import type { DataState } from '../../data/consumer.ts';
import { readDataState } from '../../data/consumer.ts';
import { startDataHost } from '../../data/host.ts';
import { placeOfSpace, placesOf } from '../../data/places.ts';
import type { DragState } from '../../kit/drag.ts';
import { dragLine, dropAction, noDrag, setDragOver, startDrag } from '../../kit/drag.ts';
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
import { answeredPlaces, gitInfoAt, repositoriesOf } from './gitFacts.ts';
import { projectRows } from './projectRows.ts';
import type { Project } from './projects.ts';
import { groupProjects, shownSpaces } from './projects.ts';
import { PullTracker } from './pullTracker.ts';
import type { ProjectChildren } from './spaceDrop.ts';
import { canDrop, dropMoves, projectDropMoves } from './spaceDrop.ts';
import { createOrderPublisher } from './spaceOrder.ts';
import type { HeaderState, RowState } from './spaceRows.ts';
import { headerRow, row as spaceRow } from './spaceRows.ts';
import type { GitInfo, ListedSpace } from './tree.ts';
import type { VisibilityResult, VisibilityState } from './visibility.ts';
import { advanceVisibility, initialVisibility } from './visibility.ts';
import type { WaitTimes } from './waitTimes.ts';
import { advanceWaitTimes, readWaitTimes, waitAge } from './waitTimes.ts';

type SidebarDrag = { kind: 'space'; state: DragState } | { kind: 'project'; state: DragState };

const pullsMilliseconds = 15_000;

const checkMilliseconds = 250;

const ageMilliseconds = 60_000;

const waitTimesKey = 'wait.times';

const projectsFoldedKey = 'repos.folded';

const noFolds = { has: (): boolean => false };

const isSidebarMarked = (): boolean => readSection(shared) === 'sidebar';

const liveSpaceIds = (): string[] => spaces().map((space) => space.id);

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
  private readonly pulls = new PullTracker();

  private readonly foldedProjects = foldedSet(projectsFoldedKey, storage);

  private readonly order = createOrderPublisher(setShared);

  private waitTimes: WaitTimes = readWaitTimes(storage.get(waitTimesKey));

  private visibility: VisibilityState = initialVisibility(liveSpaceIds());

  private drag: SidebarDrag = { kind: 'space', state: noDrag };

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
    this.startGitReads(cx);

    repeat(cx, ageMilliseconds, (timerCx) => {
      timerCx.notify();
    });

    this.listenForCommands(cx);

    startDataHost(cx);
  }

  override render(): Element {
    const palette = colors();
    const state = readDataState(shared, Date.now());

    this.statuses = rollupStatuses(spaces(), panes(), terminals());
    this.visibility = this.advance(state);

    this.followMark(isSidebarMarked());

    const topStrip = div().flex_none().h(topStripHeight());

    const list = v_flex()
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
      .children(this.listRows(state));

    return withTextRole(v_flex(), 'body')
      .size_full()
      .min_h(0)
      .bg(palette.chrome)
      .child(topStrip)
      .child(list);
  }

  private startGitReads(cx: AsyncContext): void {
    if (checking()) {
      return;
    }

    repeat(cx, pullsMilliseconds, (timerCx) => {
      this.pulls.refresh(repositoriesOf(readDataState(shared, Date.now())), timerCx);
    });

    repeat(cx, checkMilliseconds, (timerCx) => {
      this.checkWaits(timerCx);
    });
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

    const state = readDataState(shared, Date.now());

    const result = moveCursor({
      shown: shownIdsOf(this.projects(state)),
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

  private advance(state: DataState): VisibilityResult {
    const spaceList = spaces();
    const paneList = panes();
    const at = placesOf(spaceList, paneList);

    return advanceVisibility(this.visibility, {
      spaces: spaceList.map((space) => ({ id: space.id, key: at[space.id]?.key ?? '' })),
      answered: answeredPlaces(state),
      time: Date.now(),
    });
  }

  private trackWaits(spaceList: SpaceInfo[], paneList: PaneInfo[], now: number): boolean {
    const statuses = rollupStatuses(spaceList, paneList, terminals()).spaces;
    const result = advanceWaitTimes(this.waitTimes, { statuses, active: activeSpaceId(), now });

    this.waitTimes = result.times;

    if (result.changed) {
      storage.set(waitTimesKey, JSON.stringify(result.times));
    }

    return result.changed;
  }

  private checkWaits(cx: Context): void {
    const spaceList = spaces();
    const paneList = panes();
    const waitsChanged = this.trackWaits(spaceList, paneList, Date.now());
    const result = this.advance(readDataState(shared, Date.now()));

    this.visibility = result;

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

  private listedSpaces(state: DataState): ListedSpace[] {
    const spaceList = spaces();
    const paneList = panes();

    return spaceList
      .map((space) => {
        const place = placeOfSpace(space, paneList);

        return {
          space,
          git: gitInfoAt(state, place) ?? null,
          status: this.statuses.spaces[space.id] ?? null,
          place,
        };
      })
      .filter((row) => this.visibility.shown.has(row.space.id));
  }

  private projects(state: DataState): Project[] {
    return groupProjects(this.listedSpaces(state), this.foldedProjects);
  }

  private projectChildren(state: DataState): ProjectChildren[] {
    return groupProjects(this.listedSpaces(state), noFolds).map((project) =>
      project.spaces.map((row) => row.space.id),
    );
  }

  private projectKeys(state: DataState): string[] {
    return this.projects(state).map((project) => project.key);
  }

  private dragFor(kind: SidebarDrag['kind']): DragState {
    return this.drag.kind === kind ? this.drag.state : noDrag;
  }

  private projectMoves(state: DataState, source: string, target: Project, ids: readonly string[]) {
    const projects = groupProjects(this.listedSpaces(state), noFolds)
      .filter((project) => project.machine === (target.machine ?? null))
      .map((project) => {
        const members = project.spaces.map((row) => row.space.id);

        if (project.main !== null) {
          members.push(project.main.space.id);
        }

        return { key: project.key, members };
      });

    return projectDropMoves(ids, projects, source, target.key);
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
      drag: this.dragFor('space'),
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
    keys: readonly string[],
    cursor: string | null,
    now: number,
  ): Element {
    const waiting = { id: main.space.id, status: main.status, active: main.space.active };

    const state: HeaderState = {
      drag: this.dragFor('project'),
      refused: this.refused,
      cursor,
      age: waitAge(this.waitTimes, waiting, now),
      hovered: this.hovered,
      lookup: (git) => this.pulls.lookup(git),
      attachDrag: (element) => {
        this.addProjectDragHandlers(element, project, ids);
      },
      onHover: this.setHovered,
      toggleFold: this.toggleFold,
    };

    return headerRow(project, main, keys, state);
  }

  private readonly setHovered = (id: string, hovered: boolean, cx: Context): void => {
    this.hovered = hoveredAfter(this.hovered, id, hovered);
    cx.notify();
  };

  private readonly toggleFold = (key: string, cx: Context): void => {
    this.endDrag();
    this.foldedProjects.toggle(key);
    cx.notify();
  };

  private readonly retryPull = (git: GitInfo, cx: Context): void => {
    this.pulls.retry(git.repo, git.cwd, cx);
  };

  private listRows(state: DataState): Element[] {
    const projects = this.projects(state);
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

    const keys = this.projectKeys(state);

    const elements = projectRows({
      projects,
      loading: this.isWaiting(),
      draw: (row) => keepCursor(row, this.draw(row, ids, cursor, now)),
      drawMain: (project, main) =>
        keepCursor(main, this.drawMain(project, main, ids, keys, cursor, now)),
      foldDrag: (project) => {
        const drag = this.dragFor('project');

        const drop = this.refused === project.key ? 'refused' : dragLine(drag, project.key, keys);

        return {
          dragged: drag.source === project.key && drag.over !== project.key,
          ...(drop === undefined ? {} : { drop }),
        };
      },
      attachFoldDrag: (element, project) => {
        this.addProjectDragHandlers(element, project, ids);
      },
      pullFailed: (git) => this.pulls.failed(git),
      retryPull: this.retryPull,
      toggleFold: this.toggleFold,
      hovered: this.hovered,
      onHover: this.setHovered,
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

  private projectDragOver(project: Project, cx: Context): void {
    const { source, over } = this.drag.state;

    if (source === null || over === project.key || this.refused === project.key) {
      return;
    }

    const state = readDataState(shared, Date.now());
    const sourceProject = this.projects(state).find((candidate) => candidate.key === source);
    const sameMachine = sourceProject !== undefined && sourceProject.machine === project.machine;
    const allowed = this.drag.kind === 'project' && sameMachine;

    this.drag = { ...this.drag, state: setDragOver(this.drag.state, project.key, allowed) };
    this.refused = allowed ? null : project.key;
    cx.notify();
  }

  private dropProject(project: Project, ids: readonly string[], cx: Context): void {
    const state = readDataState(shared, Date.now());
    const action = dropAction(this.dragFor('project'), project.key, this.projectKeys(state));

    this.endDrag();

    if (action?.kind === 'move') {
      for (const move of this.projectMoves(state, action.id, project, ids)) {
        run('space.move', { id: move.id, index: move.index });
      }
    } else if (action?.kind === 'select' && project.main !== null) {
      run('space.select', { id: project.main.space.id });
    }

    cx.notify();
  }

  private addProjectDragHandlers(element: Element, project: Project, ids: readonly string[]): void {
    element
      .on_mouse_down('left', () => {
        const keys = this.projectKeys(readDataState(shared, Date.now()));

        this.drag = { kind: 'project', state: startDrag(keys, keys.indexOf(project.key)) };
      })
      .on_mouse_move((_event, cx) => {
        this.projectDragOver(project, cx);
      })
      .on_mouse_up('left', (_event, cx) => {
        this.dropProject(project, ids, cx);
      });

    const { main } = project;

    if (main !== null) {
      element.on_mouse_down('right', () => {
        this.openMenu(main.space);
      });
    }
  }

  private addDragHandlers(element: Element, space: SpaceInfo, ids: readonly string[]): void {
    element
      .on_mouse_down('left', () => {
        this.drag = { kind: 'space', state: startDrag(ids, ids.indexOf(space.id)) };
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
    this.drag = { kind: 'space', state: noDrag };
    this.refused = null;
  }

  private canDropOn(state: DataState, sourceId: string, space: SpaceInfo): boolean {
    const source = spaces().find((candidate) => candidate.id === sourceId);

    const sameMachine =
      source !== undefined && (source.machine ?? null) === (space.machine ?? null);

    if (!sameMachine) {
      return false;
    }

    return canDrop(this.projectChildren(state), sourceId, space.id);
  }

  private dragOver(space: SpaceInfo, cx: Context): void {
    const { source, over } = this.drag.state;

    if (source === null || space.id === over || space.id === this.refused) {
      return;
    }

    const state = readDataState(shared, Date.now());
    const allowed = this.drag.kind === 'space' && this.canDropOn(state, source, space);

    this.drag = { ...this.drag, state: setDragOver(this.drag.state, space.id, allowed) };
    this.refused = allowed ? null : space.id;
    cx.notify();
  }

  private drop(space: SpaceInfo, ids: readonly string[], cx: Context): void {
    const action = dropAction(this.dragFor('space'), space.id, ids);

    this.endDrag();

    if (action?.kind === 'move') {
      const state = readDataState(shared, Date.now());
      const moves = dropMoves(ids, this.projectChildren(state), action.id, space.id);

      for (const move of moves) {
        run('space.move', { id: move.id, index: move.index });
      }
    } else if (action?.kind === 'select') {
      run('space.select', { id: action.id });
    }

    cx.notify();
  }
}
