import { afterAll, beforeEach, describe, expect, test } from 'bun:test';

import { clickablesWithText, drawnTexts } from '../../../tests/drawn.ts';
import {
  cursorChildIndex,
  cursorNames,
  loadView,
  mark,
  redrawsOf,
  reportHeight,
  reportSize,
  resetKojaSpaces,
  restoreKojaSpaces,
  rowHeightSmall,
  selected,
  send,
  setupKojaSpaces,
  space,
  spaceChildIndex,
  spaceNames,
  state,
} from '../../../tests/kojaSpacesView.ts';

await setupKojaSpaces();

beforeEach(() => {
  resetKojaSpaces();
});

afterAll(() => {
  restoreKojaSpaces();
});

describe('koja-spaces list cursor', () => {
  test('list-down followed by list-open selects the space after the active one', async () => {
    await loadView();

    await send('list-down');
    await send('list-open');

    expect(selected()).toEqual(['c']);
  });

  test('list-open records the space it selects', async () => {
    await loadView();

    await send('list-down');
    await send('list-open');

    expect(state.sharedValues['spaces.selection']).toEqual({ version: 1, count: 1, id: 'c' });
  });

  test('a marked sidebar outlines the active space before any list key', async () => {
    const view = await loadView();

    expect(cursorNames(view)).toEqual(['name-b']);
  });

  test('a sidebar that is not marked outlines no row', async () => {
    mark('panes');

    const view = await loadView();

    expect(cursorNames(view)).toEqual([]);
  });

  test('a list command moves the outline and asks for a redraw', async () => {
    const view = await loadView();

    expect(await redrawsOf('list-last')).toBe(1);
    expect(cursorNames(view)).toEqual(['name-h']);
  });

  test('a list command does nothing while the sidebar is not marked', async () => {
    mark('panes');

    await loadView();
    await send('list-open');

    expect(selected()).toEqual([]);
  });

  test('a command that is not a list command does nothing', async () => {
    await loadView();

    expect(await redrawsOf('unknown')).toBe(0);
    expect(selected()).toEqual([]);
  });

  test('the cursor starts from the active space again after the mark drops', async () => {
    const view = await loadView();

    await send('list-last');
    mark('panes');
    view.render();
    mark('sidebar');

    expect(cursorNames(view)).toEqual(['name-b']);

    await send('list-open');

    expect(selected()).toEqual(['b']);
  });

  test('a cursor whose space closed moves the outline to the active space', async () => {
    const view = await loadView();

    await send('list-last');
    state.spaceList = state.spaceList.filter((candidate) => candidate.id !== 'h');

    expect(cursorNames(view)).toEqual(['name-b']);
  });

  test('half a page is one row before the list reports its size', async () => {
    await loadView();

    await send('list-half-page-down');
    await send('list-open');

    expect(selected()).toEqual(['c']);
  });

  test('half a page is half the rows that fit in the reported height', async () => {
    const view = await loadView();

    reportHeight(view, rowHeightSmall * 6);
    await send('list-half-page-down');
    await send('list-open');

    expect(selected()).toEqual(['e']);
  });

  test('a click on a project header folds it to its active space and publishes the rest as hidden', async () => {
    const view = await loadView();

    const header = clickablesWithText(view.render(), 'notes')[0];

    header?.clickHandlers[0]?.({}, { notify: () => undefined });

    expect(spaceNames(view)).toEqual(['name-b']);
    expect(drawnTexts(view.render())).toContain('7 more');

    expect(state.sharedValues['spaces.order']).toEqual({
      shown: ['b'],
      hidden: ['a', 'c', 'd', 'e', 'f', 'g', 'h'],
      roots: ['b'],
    });
  });

  test('draws and publishes the spaces project by project', async () => {
    state.spaceList = [space('a', true), space('w', false, '/code/work'), space('c', false)];

    const view = await loadView();

    expect(spaceNames(view)).toEqual(['name-a', 'name-c', 'name-w']);

    expect(state.sharedValues['spaces.order']).toEqual({
      shown: ['a', 'c', 'w'],
      hidden: [],
      roots: ['a', 'w'],
    });
  });

  test('a list command asks the list to show the cursor row on the next draw, once', async () => {
    const view = await loadView();

    await send('list-last');
    view.render();
    view.render();

    expect(cursorNames(view)).toEqual(['name-h']);
    expect(state.scrollCalls).toEqual([cursorChildIndex(view)]);
  });

  test('the row to show counts the project headers above it', async () => {
    state.spaceList = [space('a', true), space('w', false, '/code/work')];

    const view = await loadView();

    await send('list-last');
    view.render();

    const plain = cursorChildIndex(view);

    expect(cursorNames(view)).toEqual(['name-w']);
    expect(plain).toBeGreaterThanOrEqual(3);
    expect(state.scrollCalls).toEqual([plain]);
  });

  test('the draw in which the sidebar became marked asks to show the cursor row, once', async () => {
    mark('panes');

    const view = await loadView();

    mark('sidebar');
    view.render();

    const shown = [...state.scrollCalls];

    view.render();

    expect(shown).toEqual([cursorChildIndex(view)]);
    expect(state.scrollCalls).toEqual(shown);
  });

  test('a draw in which the sidebar lost its mark asks for no scroll', async () => {
    const view = await loadView();

    mark('panes');
    view.render();

    expect(state.scrollCalls).toEqual([]);
  });

  test('a draw in which another space became active asks the list to show it', async () => {
    const view = await loadView();

    state.spaceList = state.spaceList.map((candidate) => space(candidate.id, candidate.id === 'h'));
    view.render();

    expect(state.scrollCalls).toEqual([spaceChildIndex(view, 'h')]);
  });

  test('a draw in which a project above the active space folded asks the list to show it again', async () => {
    state.spaceList = [space('a', false, '/code/app'), space('b', true), space('c', false)];

    const view = await loadView();
    const plain = spaceChildIndex(view, 'b');
    const header = clickablesWithText(view.render(), 'app')[0];

    header?.clickHandlers[0]?.({}, { notify: () => undefined });

    expect(spaceChildIndex(view, 'b')).toBeLessThan(plain);
    expect(state.scrollCalls).toEqual([spaceChildIndex(view, 'b')]);
  });

  test('a draw with no list command asks for no scroll', async () => {
    const view = await loadView();

    view.render();
    view.render();

    expect(state.scrollCalls).toEqual([]);
  });

  test('a list that reports a new size asks the list to show the active space again', async () => {
    const view = await loadView();

    reportHeight(view, rowHeightSmall * 4);

    expect(state.scrollCalls).toEqual([spaceChildIndex(view, 'b')]);
  });

  test('a list that reports only a new width keeps the offset it had', async () => {
    const view = await loadView();

    reportHeight(view, rowHeightSmall * 4);
    state.scrollCalls = [];

    reportSize(view, 260, rowHeightSmall * 4);

    expect(state.scrollCalls).toEqual([]);
  });

  test('a draw reveals the space spaces() reports active when two rows claim it', async () => {
    const view = await loadView();

    state.spaceList = [space('h', true), space('a', true)];
    view.render();

    expect(state.scrollCalls).toEqual([spaceChildIndex(view, 'h')]);
  });

  test('a list command on a sidebar that is not marked asks for no scroll', async () => {
    mark('panes');

    const view = await loadView();

    await send('list-last');
    view.render();

    expect(state.scrollCalls).toEqual([]);
  });

  test('a narrow sidebar draws full space names', async () => {
    state.sidebarWidth = 100;

    const view = await loadView();

    expect(spaceNames(view)).toEqual(state.spaceList.map((candidate) => candidate.name));
  });
});
