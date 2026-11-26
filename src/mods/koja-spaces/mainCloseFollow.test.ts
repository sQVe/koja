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
import type { FakeView } from '../../../tests/kojaSpacesView.ts';
import { pick, seededRandom } from '../../../tests/seeded.ts';
import { sameItems } from '../../data/fields.ts';
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

const nearestLiveNeighbour = (
  order: readonly string[],
  closedId: string,
  live: readonly string[],
): string | null => {
  const index = order.indexOf(closedId);

  if (index === -1) {
    return null;
  }

  const above = order.slice(0, index).findLast((id) => live.includes(id));

  return above ?? order.slice(index + 1).find((id) => live.includes(id)) ?? null;
};

const issuedFrom = (from: number): string[] =>
  state.runCalls
    .slice(from)
    .filter((call) => call.command === 'space.select')
    .map((call) => call.args?.['id'])
    .filter((id): id is string => typeof id === 'string');

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

    // The raw list interleaves beta so the sidebar order, which groups projects, differs from it.
    state.spaceList = [
      space('alpha', false, '/code/alpha'),
      space('beta', true, '/code/beta'),
      space('alpha-work', false, '/code/alpha-work'),
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

  const lookSpaceIds = ['a', 'b', 'c', 'd', 'e'];
  const sequenceCount = 100;
  const lookCount = 10;
  const checkMilliseconds = 250;
  const closeChance = 0.25;
  const keepFocusChance = 0.5;
  const pickChance = 0.4;
  const timerChance = 0.4;

  type Observer = 'draw' | 'timer';

  interface Look {
    live: string[];
    active: string;
    pick: string | null;
    observer: Observer;
  }

  interface LookRecord {
    seed: number;
    step: number;
    observer: Observer;
    live: string[];
    order: string[];
    closedId: string | null;
    picked: string | null;
    expected: string[];
    issued: string[];
    repeated: string[];
  }

  const liveAfter = (live: readonly string[], random: () => number): string[] => {
    const kept = live.filter(() => random() > closeChance);

    if (kept.length > 0) {
      return kept;
    }

    return [pick(live, random)];
  };

  const nextLook = (previous: Look, random: () => number): Look => {
    const live = liveAfter(previous.live, random);
    const keepsFocus = live.includes(previous.active) && random() < keepFocusChance;
    const active = keepsFocus ? previous.active : pick(live, random);
    const pickId = random() < pickChance ? pick(previous.live, random) : null;
    const observer: Observer = random() < timerChance ? 'timer' : 'draw';

    return { live, active, pick: pickId, observer };
  };

  const expectationFor = (
    previous: Look,
    look: Look,
    order: readonly string[],
  ): { closedId: string | null; selection: string[] } => {
    const closedId = look.live.includes(previous.active) ? null : previous.active;

    if (closedId === null) {
      return { closedId, selection: [] };
    }

    const picked = look.pick;

    const userPickedLiveSpace =
      picked !== null && picked !== previous.active && look.live.includes(picked);

    if (userPickedLiveSpace) {
      return { closedId, selection: [] };
    }

    const target = nearestLiveNeighbour(order, closedId, look.live);

    return { closedId, selection: target === null ? [] : [target] };
  };

  const observe = (view: FakeView, observer: Observer): void => {
    if (observer === 'timer') {
      runTimers(checkMilliseconds);

      return;
    }

    view.render();
  };

  const runLook = (view: FakeView, look: Look): { issued: string[]; repeated: string[] } => {
    if (look.pick !== null) {
      recordSelection(look.pick);
    }

    draw(look.live, look.active);

    const before = state.runCalls.length;
    observe(view, look.observer);
    const issued = issuedFrom(before);

    const after = state.runCalls.length;
    observe(view, look.observer);
    const repeated = issuedFrom(after);

    return { issued, repeated };
  };

  const runSequence = async (seed: number): Promise<LookRecord[]> => {
    const random = seededRandom(seed);

    const first: Look = {
      live: [...lookSpaceIds],
      active: pick(lookSpaceIds, random),
      pick: null,
      observer: 'draw',
    };

    draw(first.live, first.active);

    state.timers = [];

    const view = await loadView();
    const records: LookRecord[] = [];
    let previous = first;
    let order = first.live;

    for (let step = 0; step < lookCount; step += 1) {
      const look = nextLook(previous, random);
      const { closedId, selection } = expectationFor(previous, look, order);
      const { issued, repeated } = runLook(view, look);

      records.push({
        seed,
        step,
        observer: look.observer,
        live: look.live,
        order,
        closedId,
        picked: look.pick,
        expected: selection,
        issued,
        repeated,
      });

      order = look.observer === 'draw' ? look.live : order;
      previous = look;
    }

    return records;
  };

  test('generated look orders never select a dead space and never follow a close twice', async () => {
    const records: LookRecord[] = [];

    for (let seed = 1; seed <= sequenceCount; seed += 1) {
      const sequence = await runSequence(seed);

      records.push(...sequence);
    }

    const wrongFollows = records
      .filter((record) => !sameItems(record.issued, record.expected))
      .map(({ seed, step, observer, live, order, closedId, picked, expected, issued }) => ({
        seed,
        step,
        observer,
        live,
        order,
        closedId,
        picked,
        expected,
        issued,
      }));

    const repeatFollows = records
      .filter((record) => record.repeated.length > 0)
      .map(({ seed, step, observer, repeated }) => ({ seed, step, observer, repeated }));

    const followed = records.filter((record) => record.issued.length > 0);

    const followedByTimer = followed.filter((record) => record.observer === 'timer');

    const keptByPick = records.filter(
      (record) => record.closedId !== null && record.picked !== null && record.issued.length === 0,
    );

    expect(followed.length).toBeGreaterThan(0);
    expect(followedByTimer.length).toBeGreaterThan(0);
    expect(keptByPick.length).toBeGreaterThan(0);
    expect(wrongFollows).toEqual([]);
    expect(repeatFollows).toEqual([]);
  });
});
