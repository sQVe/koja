import { afterAll, beforeEach, describe, expect, test } from 'bun:test';

import { clickablesWithText, drawnTexts, elementsWithMouseHandlers } from '../../../tests/drawn.ts';
import type { DrawnElement } from '../../../tests/drawn.ts';
import {
  loadView,
  pressable,
  resetKojaSpaces,
  restoreKojaSpaces,
  selected,
  setupKojaSpaces,
  showFacts,
  space,
  spaceNames,
  state,
  storedFacts,
  themeColors,
} from '../../../tests/kojaSpacesView.ts';
import type { Checkout, FakeView, MouseHandler } from '../../../tests/kojaSpacesView.ts';
import { repositoryOf } from '../../data/gitIdentity.ts';

await setupKojaSpaces();

beforeEach(() => {
  resetKojaSpaces();
});

afterAll(() => {
  restoreKojaSpaces();
});

const handlersOf = (element: DrawnElement, name: string): MouseHandler[] =>
  element.mouseHandlers[name] ?? [];

const useSpaces = (ids: string[], remoteProjects: readonly string[] = []): void => {
  const checkouts: Checkout[] = [];

  for (const id of ids) {
    const [project = id, worktree] = id.split('-');
    const folder = `/code/${id}`;
    const machine = remoteProjects.includes(project) ? 'remote' : null;

    checkouts.push({
      folder,
      machine,
      commonDirectory: `/code/${project}/.git`,
      linked: worktree !== undefined,
    });
  }

  showFacts(storedFacts(checkouts));

  state.spaceList = ids.map((id) => {
    const [project = id] = id.split('-');
    const machine = remoteProjects.includes(project) ? 'remote' : null;

    return space(id, false, `/code/${id}`, machine);
  });
};

const context = { notify: () => undefined, stop_propagation: () => undefined };

const rowOf = (view: FakeView, id: string): DrawnElement => {
  const label = id.includes('-') ? `name-${id}` : id;

  const found = elementsWithMouseHandlers(view.render())
    .filter(pressable)
    .find((element) => drawnTexts(element).includes(label));

  if (found === undefined) {
    throw new Error(`No row for ${id}`);
  }

  return found;
};

const moveOver = (element: DrawnElement): void => {
  const handler = element.styles['on_mouse_move']?.[0] as MouseHandler | undefined;

  handler?.({}, context);
};

const dragOver = (view: FakeView, source: string, target: string): void => {
  for (const handler of handlersOf(rowOf(view, source), 'on_mouse_down:left')) {
    handler({}, context);
  }

  moveOver(rowOf(view, target));
};

const dragAndDrop = (view: FakeView, source: string, target: string): void => {
  dragOver(view, source, target);

  for (const handler of handlersOf(rowOf(view, target), 'on_mouse_up:left')) {
    handler({}, context);
  }
};

const moves = (): unknown[] =>
  state.runCalls.filter((call) => call.command === 'space.move').map((call) => call.args);

// Applies the moves as Herdr does: each index is the one-based final place in the whole order.
const orderAfterMoves = (): string[] => {
  const order = state.spaceList.map((candidate) => candidate.id);

  for (const move of moves() as { id: string; index: number }[]) {
    const rest = order.filter((id) => id !== move.id);

    rest.splice(move.index - 1, 0, move.id);
    order.splice(0, order.length, ...rest);
  }

  return order;
};

const showsDropLine = (element: DrawnElement): boolean =>
  element.kids.some((kid) => kid.backgroundColors.includes(themeColors.accent));

describe('koja-spaces drag and drop', () => {
  test('a project without a main checkout reorders drawn and published projects', async () => {
    useSpaces(['alpha-1', 'alpha-2', 'beta', 'beta-1']);

    const view = await loadView();

    dragAndDrop(view, 'alpha', 'beta');

    const order = orderAfterMoves();
    const byId = new Map(state.spaceList.map((row) => [row.id, row]));

    state.spaceList = order.flatMap((id) => {
      const row = byId.get(id);

      return row === undefined ? [] : [row];
    });

    const labels = new Set(['alpha', 'beta', 'name-beta-1', 'name-alpha-1', 'name-alpha-2']);
    const drawnOrder = drawnTexts(view.render()).filter((text) => labels.has(text));

    expect(drawnOrder).toEqual(['beta', 'name-beta-1', 'alpha', 'name-alpha-1', 'name-alpha-2']);

    expect(state.sharedValues['spaces.order']).toEqual({
      shown: ['beta', 'beta-1', 'alpha-1', 'alpha-2'],
      hidden: [],
      roots: ['beta', 'alpha-1'],
    });
  });

  test('a main header can drop on a project without a main checkout', async () => {
    useSpaces(['alpha', 'alpha-1', 'beta-1', 'beta-2']);

    const view = await loadView();

    dragOver(view, 'alpha', 'beta');

    const target = rowOf(view, 'beta');

    expect(showsDropLine(target)).toBe(true);
    expect(target.styles['cursor_not_allowed']).toBeUndefined();

    dragAndDrop(view, 'alpha', 'beta');

    expect(orderAfterMoves()).toEqual(['beta-1', 'beta-2', 'alpha', 'alpha-1']);
  });

  test('a dragged fold header is dimmed and a plain click still folds it', async () => {
    useSpaces(['alpha-1', 'alpha-2', 'beta-1']);

    const view = await loadView();

    expect(rowOf(view, 'alpha').styles['opacity']).toBeUndefined();

    dragOver(view, 'alpha', 'beta');

    expect(rowOf(view, 'alpha').styles['opacity']).toBeDefined();
    expect(showsDropLine(rowOf(view, 'beta'))).toBe(true);

    dragAndDrop(view, 'alpha', 'alpha');

    const header = clickablesWithText(view.render(), 'alpha')[0];

    header?.clickHandlers[0]?.({}, context);

    expect(spaceNames(view)).toEqual(['name-beta-1']);
    expect(moves()).toEqual([]);
  });

  test.each([
    ['alpha-1', 'beta'],
    ['alpha', 'alpha-1'],
  ])('a drop from %s to %s does not mix fold headers and rows', async (source, target) => {
    useSpaces(['alpha-1', 'alpha-2', 'beta-1']);

    const view = await loadView();

    dragOver(view, source, target);

    const row = rowOf(view, target);

    expect(showsDropLine(row)).toBe(false);
    expect(row.styles['cursor_not_allowed']).toBeDefined();

    dragAndDrop(view, source, target);

    expect(moves()).toEqual([]);
  });

  test('fold headers on different machines refuse drops', async () => {
    useSpaces(['alpha-1', 'alpha-2', 'beta-1'], ['beta']);

    const view = await loadView();

    dragOver(view, 'alpha', 'beta');

    const target = rowOf(view, 'beta');

    expect(showsDropLine(target)).toBe(false);
    expect(target.styles['cursor_not_allowed']).toBeDefined();

    dragAndDrop(view, 'alpha', 'beta');

    expect(moves()).toEqual([]);
  });

  test('dropping project A on C reorders drawn and published projects', async () => {
    useSpaces(['alpha', 'alpha-1', 'beta', 'beta-1', 'gamma', 'gamma-1']);

    const view = await loadView();

    dragOver(view, 'alpha', 'gamma');

    const target = rowOf(view, 'gamma');

    expect(showsDropLine(target)).toBe(true);
    expect(target.styles['cursor_not_allowed']).toBeUndefined();

    for (const handler of handlersOf(target, 'on_mouse_up:left')) {
      handler({}, context);
    }

    const order = orderAfterMoves();
    const byId = new Map(state.spaceList.map((row) => [row.id, row]));

    state.spaceList = order.flatMap((id) => {
      const row = byId.get(id);

      return row === undefined ? [] : [row];
    });

    const labels = new Set([
      'alpha',
      'beta',
      'gamma',
      'name-alpha-1',
      'name-beta-1',
      'name-gamma-1',
    ]);

    const drawnOrder = drawnTexts(view.render()).filter((text) => labels.has(text));

    expect(drawnOrder).toEqual([
      'beta',
      'name-beta-1',
      'gamma',
      'name-gamma-1',
      'alpha',
      'name-alpha-1',
    ]);

    expect(state.sharedValues['spaces.order']).toEqual({
      shown: ['beta', 'beta-1', 'gamma', 'gamma-1', 'alpha', 'alpha-1'],
      hidden: [],
      roots: ['beta', 'gamma', 'alpha'],
    });
  });

  test('dropping a later header before an earlier project moves all its members', async () => {
    useSpaces(['alpha-1', 'beta', 'alpha', 'beta-1']);

    const view = await loadView();

    dragOver(view, 'beta', 'alpha');

    const target = rowOf(view, 'alpha');
    const line = target.kids.find((kid) => kid.backgroundColors.includes(themeColors.accent));

    expect(line?.styles['top']).toBeDefined();
    expect(target.styles['cursor_not_allowed']).toBeUndefined();

    for (const handler of handlersOf(target, 'on_mouse_up:left')) {
      handler({}, context);
    }

    expect(orderAfterMoves()).toEqual(['beta', 'beta-1', 'alpha-1', 'alpha']);
  });

  test('moving a folded project includes its hidden spaces', async () => {
    useSpaces(['alpha', 'alpha-1', 'alpha-2', 'beta', 'beta-1']);
    state.store.set('repos.folded', JSON.stringify([repositoryOf(null, '/code/alpha/.git').key]));

    const view = await loadView();

    expect(spaceNames(view)).toEqual(['name-beta-1']);

    dragAndDrop(view, 'alpha', 'beta');

    expect(orderAfterMoves()).toEqual(['beta', 'beta-1', 'alpha', 'alpha-1', 'alpha-2']);
  });

  test('a press and release on a header selects its main space', async () => {
    useSpaces(['alpha', 'alpha-1']);

    const view = await loadView();

    dragAndDrop(view, 'alpha', 'alpha');

    expect(selected()).toEqual(['alpha']);
    expect(moves()).toEqual([]);
  });

  test('a press and release on a header records the main space it selects', async () => {
    useSpaces(['alpha', 'alpha-1']);

    const view = await loadView();

    dragAndDrop(view, 'alpha', 'alpha');

    expect(state.sharedValues['spaces.selection']).toEqual({ version: 1, count: 1, id: 'alpha' });
  });

  test('a right press on a header opens the menu of its main space', async () => {
    useSpaces(['alpha', 'alpha-1']);

    const view = await loadView();

    for (const handler of handlersOf(rowOf(view, 'alpha'), 'on_mouse_down:right')) {
      handler({}, context);
    }

    expect(state.overlayCalls).toEqual([
      expect.objectContaining({
        mod: 'koja-menu',
        props: { tab: 'space', target: { id: 'alpha' } },
      }),
    ]);
  });

  test('headers on different machines refuse drops', async () => {
    useSpaces(['alpha', 'alpha-1', 'beta', 'beta-1'], ['beta']);

    const view = await loadView();

    dragOver(view, 'alpha', 'beta');

    const target = rowOf(view, 'beta');

    expect(showsDropLine(target)).toBe(false);
    expect(target.styles['cursor_not_allowed']).toBeDefined();

    dragAndDrop(view, 'alpha', 'beta');

    expect(moves()).toEqual([]);
  });

  test('a drop of the first space on the last space of its project moves it there', async () => {
    useSpaces(['alpha', 'alpha-1', 'alpha-2', 'alpha-3', 'beta', 'beta-1']);

    const view = await loadView();

    dragAndDrop(view, 'alpha-1', 'alpha-3');

    expect(orderAfterMoves()).toEqual(['alpha', 'alpha-2', 'alpha-3', 'alpha-1', 'beta', 'beta-1']);
  });

  test('a drop inside a project whose spaces sit among another project keeps the project order', async () => {
    useSpaces(['alpha-1', 'beta-1', 'alpha-2', 'alpha-3']);

    const view = await loadView();

    dragAndDrop(view, 'alpha-1', 'alpha-3');

    expect(orderAfterMoves()).toEqual(['alpha-2', 'beta-1', 'alpha-3', 'alpha-1']);
  });

  test('a drop on a row in another project moves no space', async () => {
    useSpaces(['alpha', 'alpha-1', 'alpha-2', 'beta', 'beta-1']);

    const view = await loadView();

    dragAndDrop(view, 'alpha-2', 'beta-1');

    expect(moves()).toEqual([]);
  });

  test('a drop on the main space header moves no space', async () => {
    useSpaces(['alpha', 'alpha-1', 'alpha-2']);

    const view = await loadView();

    dragAndDrop(view, 'alpha-2', 'alpha');

    expect(moves()).toEqual([]);
  });

  test('a drop of the main space header on a row of its project moves no space', async () => {
    useSpaces(['alpha', 'alpha-1', 'alpha-2']);

    const view = await loadView();

    dragAndDrop(view, 'alpha', 'alpha-2');

    expect(moves()).toEqual([]);
  });

  test('a press and release on a row selects its space', async () => {
    useSpaces(['alpha', 'alpha-1', 'alpha-2']);

    const view = await loadView();

    dragAndDrop(view, 'alpha-1', 'alpha-1');

    expect(selected()).toEqual(['alpha-1']);
    expect(moves()).toEqual([]);
  });

  test('a press and release on a row records the space it selects', async () => {
    useSpaces(['alpha', 'alpha-1', 'alpha-2']);

    const view = await loadView();

    dragAndDrop(view, 'alpha-1', 'alpha-1');

    expect(state.sharedValues['spaces.selection']).toEqual({
      version: 1,
      count: 1,
      id: 'alpha-1',
    });
  });

  test('a drag over a row in another project shows no drop line and a not-allowed cursor', async () => {
    useSpaces(['alpha', 'alpha-1', 'beta', 'beta-1']);

    const view = await loadView();

    dragOver(view, 'alpha-1', 'beta-1');

    const target = rowOf(view, 'beta-1');

    expect(showsDropLine(target)).toBe(false);
    expect(target.styles['cursor_not_allowed']).toBeDefined();
  });

  test('a drag over the main space header shows no drop line and a not-allowed cursor', async () => {
    useSpaces(['alpha', 'alpha-1', 'alpha-2']);

    const view = await loadView();

    dragOver(view, 'alpha-2', 'alpha');

    const target = rowOf(view, 'alpha');

    expect(showsDropLine(target)).toBe(false);
    expect(target.styles['cursor_not_allowed']).toBeDefined();
  });

  test('a drag over a row in its own project shows a drop line and no not-allowed cursor', async () => {
    useSpaces(['alpha', 'alpha-1', 'alpha-2']);

    const view = await loadView();

    dragOver(view, 'alpha-1', 'alpha-2');

    const target = rowOf(view, 'alpha-2');

    expect(showsDropLine(target)).toBe(true);
    expect(target.styles['cursor_not_allowed']).toBeUndefined();
  });
});
