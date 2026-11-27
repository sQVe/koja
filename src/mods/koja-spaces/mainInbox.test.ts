import { afterAll, beforeEach, describe, expect, test } from 'bun:test';

import { click, clickablesWithText, drawnTexts, elementsWithId } from '../../../tests/drawn.ts';
import type { DrawnElement } from '../../../tests/drawn.ts';
import type { FakeView } from '../../../tests/kojaSpacesView.ts';
import {
  listChildren,
  loadView,
  resetKojaSpaces,
  restoreKojaSpaces,
  selected,
  send,
  setupKojaSpaces,
  showFacts,
  showSpaces,
  space,
  state,
  storedFacts,
} from '../../../tests/kojaSpacesView.ts';
import { placeOf } from '../../data/gitIdentity.ts';
import { sidebarViewKey } from './sidebarView.ts';

await setupKojaSpaces();

beforeEach(() => {
  resetKojaSpaces();
});

afterAll(() => {
  restoreKojaSpaces();
});

const clickContext = {
  stop_propagation: () => undefined,
  notify: () => {
    state.notifyCalls += 1;
  },
};

const clickInbox = (view: FakeView): void => {
  click(clickablesWithText(view.render(), 'Inbox')[0] as DrawnElement, clickContext);
};

describe('koja-spaces Inbox view', () => {
  test('the Inbox switch regroups the spaces', async () => {
    showSpaces({ a: 'blocked', b: null }, 'b');

    const view = await loadView();

    clickInbox(view);

    const texts = listChildren(view).flatMap(drawnTexts);

    expect(texts).toContain('Agent asks');
    expect(texts).toContain('name-a');
    expect(texts.indexOf('Agent asks')).toBeLessThan(texts.indexOf('name-a'));
    expect(texts.indexOf('name-a')).toBeLessThan(texts.indexOf('Quiet'));
    expect(texts.indexOf('Quiet')).toBeLessThan(texts.indexOf('name-b'));
    expect(state.store.get(sidebarViewKey)).toBe('inbox');
  });

  test('a stored Inbox view opens in Inbox', async () => {
    state.store.set(sidebarViewKey, 'inbox');

    const view = await loadView();
    const children = listChildren(view);

    expect(drawnTexts(children[0] as DrawnElement)).toContain('Quiet');

    expect(elementsWithId(view.render(), `project-${placeOf(null, '/code/notes').key}`)).toEqual(
      [],
    );
  });

  test('a click on an Inbox row selects its space', async () => {
    state.store.set(sidebarViewKey, 'inbox');

    const view = await loadView();

    click(clickablesWithText(view.render(), 'name-c')[0] as DrawnElement, clickContext);

    expect(selected()).toEqual(['c']);
  });

  test('an Inbox row names the project its header names in Projects', async () => {
    showFacts(
      storedFacts([
        { folder: '/code/herdr', commonDirectory: '/repos/store/upstream.git', linked: false },
        {
          folder: '/code/herdr-feature',
          commonDirectory: '/repos/store/upstream.git',
          linked: true,
        },
      ]),
    );

    state.spaceList = [
      space('herdr', false, '/code/herdr'),
      space('feature', false, '/code/herdr-feature'),
    ];

    const projectsView = await loadView();
    const header = elementsWithId(projectsView.render(), 'space-herdr')[0] as DrawnElement;

    expect(drawnTexts(header)).toContain('herdr');

    state.store.set(sidebarViewKey, 'inbox');

    const inboxView = await loadView();
    const row = elementsWithId(inboxView.render(), 'space-feature')[0] as DrawnElement;

    expect(drawnTexts(row)).toContain('herdr');
    expect(drawnTexts(row)).not.toContain('upstream');
  });

  test('the cursor moves in Inbox order', async () => {
    showSpaces({ a: null, b: 'blocked', c: null }, 'b');
    state.store.set(sidebarViewKey, 'inbox');

    await loadView();

    await send('list-down');
    await send('list-open');

    expect(selected()).toEqual(['a']);
  });
});
