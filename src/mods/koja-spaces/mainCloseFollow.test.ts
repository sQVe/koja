import { afterAll, afterEach, beforeEach, describe, expect, setSystemTime, test } from 'bun:test';

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
import { sameItems } from '../../data/fields.ts';
import { runSpaceCommand } from '../../kit/space/spaceSelection.ts';
import type { TraceStep } from './fixtures/closeFollowTrace.ts';
import { closeTrace } from './fixtures/closeFollowTrace.ts';

await setupKojaSpaces();

const fixedNow = new Date('2026-01-01T00:00:00Z');

beforeEach(() => {
  resetKojaSpaces();
  setSystemTime(fixedNow);
});

afterEach(() => {
  setSystemTime();
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

  test('a pick seen before the close keeps the picked space', async () => {
    draw(['a', 'b', 'c'], 'b');

    const view = await loadView();

    recordSelection('c');
    draw(['a', 'b', 'c'], 'b');
    view.render();

    draw(['a', 'c'], 'c');
    view.render();

    expect(selected()).toEqual([]);
  });

  test('a pick seen before the close keeps the picked space when the check timer sees the close', async () => {
    draw(['a', 'b', 'c'], 'b');

    const view = await loadView();

    recordSelection('c');
    draw(['a', 'b', 'c'], 'b');
    view.render();

    draw(['a', 'c'], 'c');
    runTimers(250);

    expect(selected()).toEqual([]);
  });

  test('a close seen before the pick lands does not follow', async () => {
    draw(['a', 'b', 'c', 'd'], 'b');

    const view = await loadView();

    recordSelection('d');
    draw(['a', 'b', 'c', 'd'], 'b');
    view.render();

    draw(['a', 'c', 'd'], 'c');
    view.render();

    expect(selected()).toEqual([]);
  });

  test('a pick that never lands stops blocking after a second', async () => {
    draw(['a', 'b', 'c'], 'b');

    const view = await loadView();

    recordSelection('c');
    draw(['a', 'b', 'c'], 'b');
    view.render();

    setSystemTime(new Date(Date.now() + 1001));

    draw(['a', 'c'], 'a');
    view.render();

    expect(selected()).toEqual(['a']);
  });

  test('a click on the shown space and a close of it in one draw select the space above', async () => {
    draw(['a', 'b', 'c', 'd'], 'b');

    const view = await loadView();

    recordSelection('b');
    draw(['a', 'c', 'd'], 'c');
    view.render();

    expect(selected()).toEqual(['a']);
  });

  test('a pick of the closing space does not block the follow', async () => {
    draw(['a', 'b', 'c'], 'b');

    const view = await loadView();

    draw(['a', 'c'], 'c');
    recordSelection('b');
    view.render();

    expect(selected()).toEqual(['a']);
  });

  const sequenceCount = 100;
  const checkMilliseconds = 250;

  interface RunRecord extends TraceStep {
    seed: number;
    issued: string[];
    repeated: string[];
  }

  const observe = (view: FakeView, observer: TraceStep['observer']): void => {
    if (observer === 'timer') {
      runTimers(checkMilliseconds);

      return;
    }

    view.render();
  };

  const runStep = (view: FakeView, step: TraceStep): { issued: string[]; repeated: string[] } => {
    if (step.picked !== null) {
      recordSelection(step.picked);
    }

    draw(step.live, step.active);

    const before = state.runCalls.length;
    observe(view, step.observer);
    const issued = issuedFrom(before);

    const after = state.runCalls.length;
    observe(view, step.observer);
    const repeated = issuedFrom(after);

    return { issued, repeated };
  };

  const runSequence = async (seed: number): Promise<RunRecord[]> => {
    const { first, steps } = closeTrace(seed);

    draw(first.live, first.active);

    state.timers = [];

    const view = await loadView();
    const records: RunRecord[] = [];

    for (const step of steps) {
      const { issued, repeated } = runStep(view, step);

      records.push({ seed, ...step, issued, repeated });
    }

    return records;
  };

  test('generated look orders never select a dead space and never follow a close twice', async () => {
    const records: RunRecord[] = [];

    for (let seed = 1; seed <= sequenceCount; seed += 1) {
      records.push(...(await runSequence(seed)));
    }

    const wrongFollows = records.filter((record) => !sameItems(record.issued, record.expected));

    const repeatFollows = records.filter((record) => record.repeated.length > 0);

    const followed = records.filter((record) => record.issued.length > 0);

    const followedByTimer = followed.filter((record) => record.observer === 'timer');

    const keptByPick = records.filter(
      (record) => record.closedId !== null && record.picked !== null && record.issued.length === 0,
    );

    const keptByPendingPick = records.filter(
      (record) =>
        record.closedId !== null && record.pendingBefore !== null && record.issued.length === 0,
    );

    expect(followed.length).toBeGreaterThan(0);
    expect(followedByTimer.length).toBeGreaterThan(0);
    expect(keptByPick.length).toBeGreaterThan(0);
    expect(keptByPendingPick.length).toBeGreaterThan(0);
    expect(wrongFollows).toEqual([]);
    expect(repeatFollows).toEqual([]);
  });
});
