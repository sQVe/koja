import { afterAll, beforeEach, describe, expect, test } from 'bun:test';

import type { PaneInfo, Status } from 'herdr';

import {
  click,
  clickablesWithText,
  drawnTexts,
  elementsWithId,
  elementsWithSizeHandler,
} from '../../../tests/drawn.ts';
import type { DrawnElement } from '../../../tests/drawn.ts';
import type { FakeView } from '../../../tests/kojaSpacesView.ts';
import {
  loadView,
  resetKojaSpaces,
  restoreKojaSpaces,
  selected,
  send,
  setupKojaSpaces,
  space,
  state,
} from '../../../tests/kojaSpacesView.ts';
import { placeOf } from '../../data/gitIdentity.ts';

await setupKojaSpaces();

beforeEach(() => {
  resetKojaSpaces();
});

afterAll(() => {
  restoreKojaSpaces();
});

const tab = (id: string) => ({
  id: `tab-${id}`,
  index: 1,
  name: '1',
  named: false,
  active: true,
  status: null,
  panes: 1,
  zoomed: false,
  settled: false,
  settled_at: null,
  changed_at: null,
  working_since: null,
});

const pane = (id: string, status: Status | null): PaneInfo => ({
  pane: `pane-${id}`,
  terminal: `terminal-${id}`,
  tab: `tab-${id}`,
  title: id,
  name: null,
  cwd: '/code/notes',
  branch: null,
  status,
  app: null,
  program: {
    key: 'agent',
    name: 'Agent',
    icon: null,
    tint: false,
    tile: null,
    color: null,
    shell: false,
    agent: true,
  },
  focused: false,
  zoomed: false,
  movable: false,
});

const showSpaces = (statuses: Record<string, Status | null>, active: string): void => {
  state.spaceList = Object.entries(statuses).map(([id]) => {
    const shown = space(id, id === active);

    shown.tabs = [tab(id)];

    return shown;
  });

  state.paneList = Object.entries(statuses).map(([id, status]) => pane(id, status));
};

const clickContext = {
  stop_propagation: () => undefined,
  notify: () => {
    state.notifyCalls += 1;
  },
};

const listChildren = (view: FakeView): DrawnElement[] =>
  elementsWithSizeHandler(view.render())[0]?.kids ?? [];

const clickInbox = (view: FakeView): void => {
  click(clickablesWithText(view.render(), 'Inbox')[0] as DrawnElement, clickContext);
};

describe('koja-spaces Inbox view', () => {
  test('the Inbox switch regroups the spaces', async () => {
    showSpaces({ a: 'blocked', b: null }, 'b');

    const view = await loadView();

    clickInbox(view);

    const texts = listChildren(view).flatMap(drawnTexts);

    expect(texts.indexOf('Agent asks')).toBeLessThan(texts.indexOf('name-a'));
    expect(texts.indexOf('name-a')).toBeLessThan(texts.indexOf('Quiet'));
    expect(texts.indexOf('Quiet')).toBeLessThan(texts.indexOf('name-b'));
    expect(state.store.get('sidebar.view')).toBe('inbox');
  });

  test('a stored Inbox view opens in Inbox', async () => {
    state.store.set('sidebar.view', 'inbox');

    const view = await loadView();
    const children = listChildren(view);

    expect(drawnTexts(children[0] as DrawnElement)).toContain('Quiet');

    expect(elementsWithId(view.render(), `project-${placeOf(null, '/code/notes').key}`)).toEqual(
      [],
    );
  });

  test('a click on an Inbox row selects its space', async () => {
    state.store.set('sidebar.view', 'inbox');

    const view = await loadView();

    click(clickablesWithText(view.render(), 'name-c')[0] as DrawnElement, clickContext);

    expect(selected()).toEqual(['c']);
  });

  test('the cursor moves in Inbox order', async () => {
    showSpaces({ a: null, b: 'blocked', c: null }, 'b');
    state.store.set('sidebar.view', 'inbox');

    await loadView();

    await send('list-down');
    await send('list-open');

    expect(selected()).toEqual(['a']);
  });
});
