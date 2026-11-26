import { afterAll, beforeEach, describe, expect, test } from 'bun:test';

import {
  loadView,
  resetKojaSpaces,
  restoreKojaSpaces,
  runTimers,
  selected,
  setupKojaSpaces,
  showFacts,
  space,
  state,
  storedFacts,
} from '../../../tests/kojaSpacesView.ts';
import { runSpaceCommand } from '../../kit/space/spaceSelection.ts';

await setupKojaSpaces();

beforeEach(() => {
  resetKojaSpaces();
});

afterAll(() => {
  restoreKojaSpaces();
});

const draw = (ids: string[], active: string | null): void => {
  state.spaceList = ids.map((id) => space(id, id === active));
};

const recordSelection = (id: string): void => {
  const command = { name: 'space.select', args: { id } };

  runSpaceCommand(
    {
      run: () => undefined,
      get: (key) => state.sharedValues[key],
      set: (key, value) => {
        state.sharedValues[key] = value;
      },
      shown: () => state.spaceList.find((candidate) => candidate.active)?.id ?? null,
    },
    command,
  );
};

describe('koja-spaces close follow', () => {
  test('closing the focused space selects the space above it', async () => {
    draw(['a', 'b', 'c', 'd'], 'c');

    const view = await loadView();

    draw(['a', 'b', 'd'], 'a');
    view.render();

    expect(selected()).toEqual(['b']);
  });

  test('the close is followed once, not on every later draw', async () => {
    draw(['a', 'b', 'c'], 'c');

    const view = await loadView();

    draw(['a', 'b'], 'a');
    view.render();
    view.render();

    expect(selected()).toEqual(['b']);
  });

  test('closing the focused space at the top selects the space below it', async () => {
    draw(['a', 'b', 'c'], 'a');

    const view = await loadView();

    draw(['b', 'c'], 'c');
    view.render();

    expect(selected()).toEqual(['b']);
  });

  test('closing the first space of a project selects the last space of the project above', async () => {
    showFacts(
      storedFacts([
        { folder: '/code/alpha', commonDirectory: '/code/alpha/.git', linked: false },
        { folder: '/code/alpha-work', commonDirectory: '/code/alpha/.git', linked: true },
        { folder: '/code/beta', commonDirectory: '/code/beta/.git', linked: false },
      ]),
    );

    state.spaceList = [
      space('alpha', false, '/code/alpha'),
      space('alpha-work', false, '/code/alpha-work'),
      space('beta', true, '/code/beta'),
    ];

    const view = await loadView();

    state.spaceList = [
      space('alpha', true, '/code/alpha'),
      space('alpha-work', false, '/code/alpha-work'),
    ];

    view.render();

    expect(selected()).toEqual(['alpha-work']);
  });

  test('closing a space without focus leaves focus where it is', async () => {
    draw(['a', 'b', 'c', 'd'], 'b');

    const view = await loadView();

    draw(['a', 'b', 'c'], 'b');
    view.render();

    expect(selected()).toEqual([]);
  });

  test('the check timer follows a close that no draw has seen', async () => {
    draw(['a', 'b', 'c'], 'b');

    const view = await loadView();

    draw(['a', 'c'], 'c');
    runTimers(250);

    expect(selected()).toEqual(['a']);

    view.render();

    expect(selected()).toEqual(['a']);
  });

  test('a click on the shown space followed by a close of it selects the space above', async () => {
    draw(['a', 'b', 'c', 'd'], 'c');

    const view = await loadView();

    recordSelection('c');
    expect(state.sharedValues['spaces.selection']).toBeUndefined();
    draw(['a', 'b', 'd'], 'a');
    view.render();

    expect(selected()).toEqual(['b']);
  });

  test('a selection of the space that then closes still follows the close', async () => {
    draw(['a', 'b', 'c', 'd'], 'a');

    const view = await loadView();

    recordSelection('b');
    draw(['b', 'c', 'd'], 'b');
    recordSelection('a');
    view.render();

    expect(selected()).toEqual(['b']);
  });

  test('a user selection in the same look as a close keeps the focus the user set', async () => {
    draw(['a', 'b', 'c', 'd'], 'c');

    const view = await loadView();

    recordSelection('a');
    draw(['a', 'b', 'd'], 'a');
    view.render();

    expect(selected()).toEqual([]);
  });

  test('a selection seen in an earlier look does not block a later close follow', async () => {
    draw(['a', 'b', 'c', 'd'], 'c');

    const view = await loadView();

    recordSelection('b');
    draw(['a', 'b', 'c', 'd'], 'b');
    view.render();

    draw(['a', 'c', 'd'], 'a');
    view.render();

    expect(selected()).toEqual(['a']);
  });
});
