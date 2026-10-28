import { expect, it } from 'bun:test';

import { actionCatalog } from '../actions.ts';
import { paneId } from '../ids.ts';
import { actionViewLines, actionViewRowsOf, createActionView } from './actionView.ts';
import type { ActionView } from './actionView.ts';
import { firstWorkspace, secondWorkspace, storeSnapshotOf } from './inputFixtures.ts';
import { parseKey } from './keyEncoding.ts';

const rows = actionViewRowsOf(24);

const snapshot = storeSnapshotOf({
  ids: [firstWorkspace, secondWorkspace],
  focused: firstWorkspace,
});

const onePane = storeSnapshotOf({ ids: [firstWorkspace], focused: firstWorkspace }, [
  { id: 1, workspaceId: firstWorkspace, panes: [paneId(1)], focused: paneId(1) },
]);

const press = (view: ActionView, raw: string, times = 1): void => {
  for (let count = 0; count < times; count += 1) {
    view.interact({ kind: 'key', event: parseKey(raw) }, actionCatalog, snapshot);
  }
};

const typeQuery = (view: ActionView, text: string): void => {
  for (const character of text) {
    press(view, character);
  }
};

const openView = (kind: 'help' | 'search'): ActionView => {
  const view = createActionView(() => rows);

  view.open(kind);

  return view;
};

const drawnIds = (view: ActionView): string[] =>
  actionViewLines(actionCatalog, snapshot, view.getState(), rows).map((line) => line.id);

const selectedId = (view: ActionView): string | undefined =>
  actionViewLines(actionCatalog, snapshot, view.getState(), actionCatalog.length).find(
    (line) => line.selected,
  )?.id;

const up = '\x1b[A';
const down = '\x1b[B';

it('selects the action whose title starts with the query before other matches', () => {
  const view = openView('search');

  typeQuery(view, 'new pane');

  expect(selectedId(view)).toBe('pane.add');
});

it('moves the search selection with Down and Up and stops at both ends', () => {
  const view = openView('search');

  press(view, up);

  expect(selectedId(view)).toBe('workspace.next');

  press(view, down, 2);
  press(view, up);

  expect(selectedId(view)).toBe('workspace.previous');

  press(view, down, actionCatalog.length);

  expect(selectedId(view)).toBe(actionCatalog.at(-1)?.id);
});

it('removes the last query character on Backspace and selects the first result again', () => {
  const view = openView('search');

  typeQuery(view, 'zoomx');

  expect(drawnIds(view)).toEqual([]);

  press(view, '\x7f');

  expect(view.getState()).toEqual({ kind: 'search', query: 'zoom', selected: 0, top: 0 });
  expect(drawnIds(view)).toEqual(['pane.zoom']);
});

it('finds an action by an id that its title does not contain', () => {
  const view = openView('search');

  typeQuery(view, 'breakpane');

  expect(drawnIds(view)).toEqual(['pane.breakPane']);
});

it('finds an action by its title in any letter case', () => {
  const view = openView('search');

  typeQuery(view, 'ZoOm PaNe');

  expect(drawnIds(view)).toEqual(['pane.zoom']);
});

it('finds an action whose title holds every typed word, even with words between them', () => {
  const view = openView('search');

  typeQuery(view, 'split right');

  expect(drawnIds(view)).toEqual(['pane.splitRight']);
});

it('marks only the selected search result, and marks results the snapshot makes unavailable', () => {
  const view = openView('search');

  typeQuery(view, 'pane');
  press(view, down);

  const lines = actionViewLines(actionCatalog, onePane, view.getState(), rows);
  const marks = lines.map(({ id, selected, unavailable }) => ({ id, selected, unavailable }));

  expect(marks.filter((line) => line.selected)).toEqual([
    { id: 'pane.splitRight', selected: true, unavailable: false },
  ]);

  expect(marks.find((line) => line.id === 'pane.focusNext')?.unavailable).toBe(true);
  expect(marks.find((line) => line.id === 'pane.zoom')?.unavailable).toBe(false);
});

it('scrolls help one entry per Down and Up within the entries a 24-row terminal draws', () => {
  const view = openView('help');
  const lastId = actionCatalog.at(-1)?.id;

  expect(drawnIds(view)).toHaveLength(rows);
  expect(drawnIds(view)).not.toContain('client.detach');

  press(view, up);
  press(view, down);

  expect(drawnIds(view)[0]).toBe(actionCatalog[1]?.id);

  press(view, down, actionCatalog.length);

  expect(drawnIds(view)).toContain('client.detach');
  expect(drawnIds(view).at(-1)).toBe(lastId);

  press(view, up);

  expect(drawnIds(view).at(-1)).not.toBe(lastId);
  expect(drawnIds(view)).toHaveLength(rows);
});

it('keeps the selected search result drawn while Down and Up move past the drawn rows', () => {
  const view = openView('search');

  const drawnAfterEachPress = (raw: string): boolean[] =>
    actionCatalog.map(() => {
      press(view, raw);

      return drawnIds(view).includes(selectedId(view) ?? 'no selection');
    });

  expect(drawnAfterEachPress(down)).not.toContain(false);
  expect(drawnAfterEachPress(up)).not.toContain(false);
  expect(drawnIds(view)[0]).toBe('workspace.next');
});

const searchAtHeight = (height: { rows: number }, query: string) => {
  const view = createActionView(() => actionViewRowsOf(height.rows));

  view.open('search');
  typeQuery(view, query);

  const enter = () =>
    view.interact({ kind: 'key', event: parseKey('\r') }, actionCatalog, snapshot);

  const drawn = () =>
    actionViewLines(actionCatalog, snapshot, view.getState(), actionViewRowsOf(height.rows));

  return { view, enter, drawn };
};

it.each([1, 2])(
  'runs no search result on Enter in a %i-row terminal, which draws none',
  (height) => {
    const { enter, drawn } = searchAtHeight({ rows: height }, 'close pane');

    expect(drawn()).toEqual([]);
    expect(enter()).toBeUndefined();
  },
);

it('runs the drawn search result on Enter in a 3-row terminal', () => {
  const { enter, drawn } = searchAtHeight({ rows: 3 }, 'close pane');

  expect(drawn().map((line) => line.id)).toEqual(['pane.close']);
  expect(enter()).toEqual({ kind: 'pane', action: 'close' });
});

it('runs only a drawn search result after a resize shrinks the viewport', () => {
  const height = { rows: 24 };
  const { view, enter, drawn } = searchAtHeight(height, '');

  press(view, down, 20);
  height.rows = 3;

  expect(drawn().map((line) => line.selected)).toEqual([true]);

  height.rows = 2;

  expect(drawn()).toEqual([]);
  expect(enter()).toBeUndefined();
  expect(view.getState().kind).toBe('search');

  height.rows = 3;

  expect(enter()).toEqual(actionCatalog[20]?.intent);
});
