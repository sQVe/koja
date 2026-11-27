import { ScrollHandle, v_flex } from 'gpui-base';
import type { AsyncContext, Context, Element } from 'gpui-kit';
import { div, View } from 'gpui-kit';
import type { PaneInfo, SpaceInfo } from 'herdr';
import { checking, nextCommand, panes, run, setShared, shared, spaces, terminals } from 'herdr';

import type { DataState } from '../../data/consumer.ts';
import { readDataState } from '../../data/consumer.ts';
import { startDataHost } from '../../data/host.ts';
import { placeOfSpace, placesOf } from '../../data/places.ts';
import { createPullRetryClient } from '../../data/pullRetry/pullRetry.ts';
import type { DragState } from '../../kit/drag.ts';
import { dragLine, dropAction, noDrag, setDragOver, startDrag } from '../../kit/drag.ts';
import type { StatusRollup } from '../../kit/index.ts';
import {
  colors,
  controlSize,
  hoveredAfter,
  layoutRoot,
  listActionOf,
  readSection,
  repeat,
  rollupStatuses,
  rowHeight,
  spacing,
  withTextRole,
} from '../../kit/index.ts';
import type { SpaceSelection, SpaceSelectionDeps } from '../../kit/space/spaceSelection.ts';
import {
  readSpaceSelection,
  runSpaceCommand,
  selectionMoved,
} from '../../kit/space/spaceSelection.ts';
import type { SpaceOrder } from '../../kit/spaceOrder.ts';
import { closedSpaceCommand } from '../../kit/spaceOrder.ts';
import { cursorRow, halfPageOf, moveCursor } from './cursor.ts';
import { foldedSet } from './folded.ts';
import type { KeptNeed } from './gitFacts.ts';
import { answeredPlaces, gitInfoAt, pullFailedAt } from './gitFacts.ts';
import { inboxRows } from './inbox/inboxRows.ts';
import type { ListModel, RowModel } from './listModel.ts';
import { listModelOf } from './listModel.ts';
import { projectRows } from './projectRows.ts';
import type { Project } from './projects.ts';
import { groupProjects, noFolds } from './projects.ts';
import { rowTitleOf } from './rows.ts';
import { sidebarViewKey, readSidebarView } from './sidebarView.ts';
import type { ProjectChildren } from './spaceDrop.ts';
import { canDrop, dropMoves, projectDropMoves } from './spaceDrop.ts';
import { createOrderPublisher } from './spaceOrder.ts';
import type { HeaderState, ReorderCallbacks, RowInteraction, RowState } from './spaceRows.ts';
import { attachReorder, headerRow, row as spaceRow } from './spaceRows.ts';
import { stackCardOf } from './stackCard.ts';
import type { GitInfo, ListedSpace } from './tree.ts';
import { viewBar } from './viewBar.ts';
import type { VisibilityResult, VisibilityState } from './visibility.ts';
import { advanceVisibility, initialVisibility } from './visibility.ts';
import type { WaitTimes } from './waitTimes.ts';
import { advanceWaitTimes, readWaitTimes, waitAge } from './waitTimes.ts';

type SidebarDrag = { kind: 'space'; state: DragState } | { kind: 'project'; state: DragState };

interface SidebarWatch {
  focused: string | null;
  order: SpaceOrder | null;
  selection: SpaceSelection | null;
}

// Herdr's runtime has the Web Crypto global, but its declarations do not name it.
declare const crypto: { randomUUID: () => string };

const checkMilliseconds = 250;

const ageMilliseconds = 60_000;

const waitTimesKey = 'wait.times';

const projectsFoldedKey = 'repos.folded';

const isSidebarMarked = (): boolean => readSection(shared) === 'sidebar';

const liveSpaceIds = (): string[] => spaces().map((space) => space.id);

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
  private readonly pullRetries = createPullRetryClient(
    { read: shared, write: setShared },
    crypto.randomUUID(),
    () => crypto.randomUUID(),
  );

  private readonly foldedProjects = foldedSet(projectsFoldedKey, storage);

  private readonly order = createOrderPublisher(setShared);

  private waitTimes: WaitTimes = readWaitTimes(storage.get(waitTimesKey));

  private readonly lastNeeds = new Map<string, KeptNeed>();

  private watched: SidebarWatch = {
    focused: null,
    order: null,
    selection: readSpaceSelection(shared),
  };

  private visibility: VisibilityState = initialVisibility(liveSpaceIds());

  private drag: SidebarDrag = { kind: 'space', state: noDrag };

  private refused: string | null = null;

  private hovered: string | null = null;

  private statuses: StatusRollup = { spaces: {}, tabs: {} };

  private cursor: string | null = null;

  private halfPage = 1;

  private lastHeight: number | null = null;

  private readonly scroll = ScrollHandle.new();

  private revealCursor = false;

  private revealedActive: string | null = null;

  private revealedIndex = -1;

  private marked = false;

  override close(): void {
    this.order.clear();
  }

  override init(_props: unknown, cx: AsyncContext): void {
    this.startChecks(cx);

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

    const listed = this.listedSpaces(state);
    const projects = groupProjects(listed, this.foldedProjects);
    const ids = liveSpaceIds();
    const order = this.order.publish(projects, ids);

    this.followClose(order);
    this.followMark(isSidebarMarked());

    const model = this.currentModel(state, listed);

    const topStrip = div().flex_none().h(topStripHeight());

    const switchLine = viewBar(storage, (cx) => {
      this.endDrag();
      this.revealedActive = null;
      cx.notify();
    });

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

        const heightChanged = this.lastHeight !== size.height;

        this.lastHeight = size.height;

        if (heightChanged && this.revealedIndex >= 0) {
          this.scroll.scroll_to_item(this.revealedIndex);
        }
      })
      .on_mouse_up('left', (_event, cx) => {
        this.endDrag();
        cx.notify();
      })
      .children(this.listRows(state, model, ids));

    return withTextRole(v_flex(), 'body')
      .size_full()
      .min_h(0)
      .bg(palette.chrome)
      .child(topStrip)
      .child(switchLine)
      .child(list);
  }

  private startChecks(cx: AsyncContext): void {
    if (checking()) {
      return;
    }

    repeat(cx, checkMilliseconds, (timerCx) => {
      this.pullRetries.settle(Date.now());
      this.checkWaits(timerCx);
    });
  }

  private followClose(order: SpaceOrder | null): void {
    const focused = activeSpaceId();
    const selection = readSpaceSelection(shared);
    const liveIds = liveSpaceIds();

    const command = closedSpaceCommand({
      closedId: this.watched.focused,
      order: this.watched.order,
      liveIds,
    });

    const moved = selectionMoved(this.watched.selection, selection, this.watched.focused, liveIds);

    this.watched = { focused, order, selection };

    if (command !== null && !moved) {
      // A record here would bump the count selectionMoved reads, and a record naming the closed
      // space is ignored because its id is not live.
      run(command.name, command.args);
    }
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

  private selectionDeps(): SpaceSelectionDeps {
    return { run, get: shared, set: setShared, shown: activeSpaceId };
  }

  private readonly selectSpace = (id: string, cx: Context): void => {
    runSpaceCommand(this.selectionDeps(), { name: 'space.select', args: { id } });

    cx.notify();
  };

  private applyCommand(command: string, cx: Context): void {
    const action = listActionOf(command);

    if (action === null || !isSidebarMarked()) {
      return;
    }

    const state = readDataState(shared, Date.now());

    const result = moveCursor({
      shown: this.shownIds(state),
      cursor: this.cursor,
      active: activeSpaceId(),
      action,
      halfPage: this.halfPage,
    });

    this.cursor = result.cursor;
    this.revealCursor = true;

    if (result.select !== null) {
      runSpaceCommand(this.selectionDeps(), {
        name: 'space.select',
        args: { id: result.select },
      });
    }

    cx.notify();
  }

  private cursorAt(ids: readonly string[]): string | null {
    if (!isSidebarMarked()) {
      return null;
    }

    return cursorRow(ids, this.cursor, activeSpaceId());
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

    this.followClose(this.order.published());

    if (result.changed || result.waiting || waitsChanged) {
      cx.notify();
    }
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

  private currentModel(state: DataState, listed: ListedSpace[]): ListModel {
    return listModelOf({
      state,
      listed,
      folds: this.foldedProjects,
      view: readSidebarView(storage.get(sidebarViewKey)),
      lastNeeds: this.lastNeeds,
    });
  }

  private shownIds(state: DataState): string[] {
    return this.currentModel(state, this.listedSpaces(state)).ids;
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

  private rowState(
    model: RowModel,
    cursor: string | null,
    now: number,
    interaction: RowInteraction,
  ): RowState {
    const waiting = {
      id: model.row.space.id,
      status: model.row.status,
      active: model.row.space.active,
    };

    const title = rowTitleOf(
      model.row.space.named,
      model.row.space.name,
      model.pull,
      model.ticketTitle,
    );

    return {
      title,
      drag: this.dragFor('space'),
      refused: this.refused,
      cursor,
      age: waitAge(this.waitTimes, waiting, now),
      need: model.need,
      card: stackCardOf(model, title),
      interaction,
    };
  }

  private draw(
    model: RowModel,
    ids: readonly string[],
    cursor: string | null,
    now: number,
  ): Element {
    const interaction: RowInteraction = {
      kind: 'select',
      select: this.selectSpace,
    };

    const state = this.rowState(model, cursor, now, interaction);

    return spaceRow(model.row, ids, state, model.pull, model.ticketTitle, model.project);
  }

  private drawProjectRow(
    model: RowModel,
    ids: readonly string[],
    cursor: string | null,
    now: number,
  ): Element {
    const interaction: RowInteraction = {
      kind: 'reorder',
      start: (space, rowIds) => {
        this.drag = { kind: 'space', state: startDrag(rowIds, rowIds.indexOf(space.id)) };
      },
      move: (space, cx) => {
        this.dragOver(space, cx);
      },
      drop: (space, rowIds, cx) => {
        this.drop(space, rowIds, cx);
      },
    };

    const state = this.rowState(model, cursor, now, interaction);

    return spaceRow(model.row, ids, state, model.pull, model.ticketTitle, null);
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
      reorder: this.projectReorder(project, ids),
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

  private readonly retryPull = (git: GitInfo, _cx: Context): void => {
    this.pullRetries.request(git.repo.key, Date.now());
  };

  private listRows(state: DataState, model: ListModel, ids: readonly string[]): Element[] {
    const cursor = this.cursorAt(model.ids);
    const active = activeSpaceId();
    const now = Date.now();

    let cursorElement: Element | null = null;

    let activeElement: Element | null = null;

    const keepRow = (row: ListedSpace, element: Element): Element => {
      if (row.space.id === cursor) {
        cursorElement = element;
      }

      if (row.space.id === active) {
        activeElement = element;
      }

      return element;
    };

    const modelOf = (row: ListedSpace): RowModel => {
      const found = model.rows.get(row.space.id);

      if (found === undefined) {
        throw new Error(`No row model for space ${row.space.id}`);
      }

      return found;
    };

    if (model.view === 'inbox') {
      const elements = inboxRows({
        groups: model.groups,
        loading: this.isWaiting(),
        draw: (row) => keepRow(row, this.draw(modelOf(row), ids, cursor, now)),
      });

      this.showRows(elements, cursorElement, activeElement, active);

      return elements;
    }

    const keys = model.projects.map((project) => project.key);

    const elements = projectRows({
      projects: model.projects,
      loading: this.isWaiting(),
      draw: (row) => keepRow(row, this.drawProjectRow(modelOf(row), ids, cursor, now)),
      drawMain: (project, main) =>
        keepRow(main, this.drawMain(project, main, ids, keys, cursor, now)),
      foldDrag: (project) => {
        const drag = this.dragFor('project');

        const drop = this.refused === project.key ? 'refused' : dragLine(drag, project.key, keys);

        return {
          dragged: drag.source === project.key && drag.over !== project.key,
          ...(drop === undefined ? {} : { drop }),
        };
      },
      attachFoldDrag: (element, project) => {
        attachReorder(element, this.projectReorder(project, ids));
      },
      pullFailed: (git) => pullFailedAt(state, git),
      retryPull: this.retryPull,
      toggleFold: this.toggleFold,
      hovered: this.hovered,
      onHover: this.setHovered,
    });

    this.showRows(elements, cursorElement, activeElement, active);

    return elements;
  }

  // The scroll handle shows a direct child of the list by its index.
  private showRows(
    elements: readonly Element[],
    cursorElement: Element | null,
    activeElement: Element | null,
    active: string | null,
  ): void {
    const cursorIndex = cursorElement === null ? -1 : elements.indexOf(cursorElement);

    if (this.revealCursor && cursorIndex >= 0) {
      this.scroll.scroll_to_item(cursorIndex);
    }

    this.revealCursor = false;

    const activeIndex = activeElement === null ? -1 : elements.indexOf(activeElement);

    if (active === this.revealedActive && activeIndex === this.revealedIndex) {
      return;
    }

    this.revealedActive = active;
    this.revealedIndex = activeIndex;

    if (activeIndex >= 0) {
      this.scroll.scroll_to_item(activeIndex);
    }
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
      runSpaceCommand(this.selectionDeps(), {
        name: 'space.select',
        args: { id: project.main.space.id },
      });
    }

    cx.notify();
  }

  private projectReorder(project: Project, ids: readonly string[]): ReorderCallbacks {
    return {
      start: () => {
        const keys = this.projectKeys(readDataState(shared, Date.now()));

        this.drag = { kind: 'project', state: startDrag(keys, keys.indexOf(project.key)) };
      },
      move: (cx) => {
        this.projectDragOver(project, cx);
      },
      drop: (cx) => {
        this.dropProject(project, ids, cx);
      },
    };
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
      runSpaceCommand(this.selectionDeps(), {
        name: 'space.select',
        args: { id: action.id },
      });
    }

    cx.notify();
  }
}
