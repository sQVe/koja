import { afterAll, beforeEach, describe, expect, test } from 'bun:test';

import { drawnTexts } from '../../../tests/drawn.ts';
import {
  loadView,
  resetKojaSpaces,
  restoreKojaSpaces,
  setupKojaSpaces,
  showFacts,
  space,
  spaceNames,
  state,
  storedFacts,
} from '../../../tests/kojaSpacesView.ts';
import { readDataState } from '../../data/consumer.ts';

await setupKojaSpaces();

beforeEach(() => {
  resetKojaSpaces();
});

afterAll(() => {
  restoreKojaSpaces();
});

describe('koja-spaces data host', () => {
  test('a started sidebar publishes a live data snapshot', async () => {
    await loadView();

    const snapshot = readDataState((key) => state.sharedValues[key], Date.now());

    expect(snapshot.kind).toBe('live');
  });
});

describe('koja-spaces stored git facts', () => {
  test('groups spaces by the stored git facts', async () => {
    showFacts(
      storedFacts([
        { folder: '/code/koja', commonDirectory: '/code/koja/.git', linked: false },
        { folder: '/code/koja-fix', commonDirectory: '/code/koja/.git', linked: true },
        {
          folder: '/srv/app',
          machine: 'build-box',
          commonDirectory: '/srv/app/.git',
          linked: false,
        },
      ]),
    );

    state.spaceList = [
      space('w', true, '/code/koja-fix'),
      space('m', false, '/code/koja'),
      space('r', false, '/srv/app', 'build-box'),
    ];

    const view = await loadView();
    const texts = drawnTexts(view.render());

    expect(spaceNames(view)).toEqual(['name-w']);
    expect(texts.filter((text) => text === 'koja')).toHaveLength(1);
    expect(texts.filter((text) => text === 'app')).toHaveLength(1);
    expect(texts.filter((text) => text === 'build-box')).toHaveLength(1);
  });
});
