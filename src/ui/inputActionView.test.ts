import { expect, it } from 'bun:test';

import { actionCatalog } from '../actions.ts';
import type { ActionCatalog } from '../actions.ts';
import { paneId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import { ModeFlag } from '../rows/rows.ts';
import { actionViewLines } from './actionView.ts';
import type { ActionViewLine } from './actionView.ts';
import {
  createInputHarness,
  encoder,
  firstWorkspace,
  secondWorkspace,
  storeSnapshotOf,
} from './inputFixtures.ts';
import { createInputTokenizer } from './inputTokens.ts';

type Harness = ReturnType<typeof createInputHarness>;

const typeText = (press: Harness['press'], text: string): void => {
  for (const character of text) {
    press(character);
  }
};

const effectsOf = (harness: Harness) => ({
  actions: harness.actions,
  commands: harness.commands,
  tabs: harness.tabs,
  scrolls: harness.scrolls,
  detaches: harness.detaches(),
  mode: harness.mode(),
  sent: harness.sent,
  toPane: harness.toPane,
});

const noEffects: ReturnType<typeof effectsOf> = {
  actions: [],
  commands: [],
  tabs: [],
  scrolls: [],
  detaches: 0,
  mode: 'normal',
  sent: [],
  toPane: [],
};

const lineFor = (lines: ActionViewLine[], id: string): ActionViewLine | undefined =>
  lines.find((line) => line.id === id);

it('runs the zoom action found by search on Enter and leaves normal mode in place', () => {
  const { press, sent, actions, mode } = createInputHarness('insert');

  press('\x02');
  press('/');
  press('z');
  press('o');
  press('o');

  expect(actions).toEqual([]);

  press('\r');

  expect(actions).toEqual(['zoom']);
  expect(sent).toEqual([]);
  expect(mode()).toBe('normal');
});

const equalEffectCases: [string, string, string][] = [
  ['creates a workspace', 'c', 'create workspace'],
  ['creates a tab', 't', 'create tab'],
  ['detaches', 'd', 'detach'],
];

for (const [name, raw, query] of equalEffectCases) {
  it(`${name} from search with the same effects as its key ${raw}`, () => {
    const byKey = createInputHarness('insert');

    byKey.press('\x02');
    byKey.press(raw);

    const bySearch = createInputHarness('insert');

    bySearch.press('\x02');
    bySearch.press('/');
    typeText(bySearch.press, query);
    bySearch.press('\r');

    expect(effectsOf(bySearch)).toEqual(effectsOf(byKey));
    expect(effectsOf(byKey)).not.toEqual(noEffects);
  });
}

it('keeps typed and pasted search text away from the pane until Escape closes search', () => {
  const harness = createInputHarness('insert');

  harness.press('\x02');
  harness.press('/');
  typeText(harness.press, 'zo');
  harness.pastes('om');

  expect(harness.view.getState()).toEqual({ kind: 'search', query: 'zoom', selected: 0, top: 0 });

  harness.press('\x1b');

  expect(harness.view.getState()).toEqual({ kind: 'closed' });
  expect(effectsOf(harness)).toEqual(noEffects);
});

it('keeps typed and pasted help text away from the pane until Escape closes help', () => {
  const harness = createInputHarness('insert');

  harness.press('\x02');
  harness.press('?');
  typeText(harness.press, 'x');
  harness.pastes('y');

  expect(harness.view.getState()).toEqual({ kind: 'help', top: 0 });

  harness.press('\x1b');

  expect(harness.view.getState()).toEqual({ kind: 'closed' });
  expect(effectsOf(harness)).toEqual(noEffects);
});

it('shows a remapped key in both the help lines and the search lines', () => {
  const zoom = actionCatalog.find((entry) => entry.id === 'pane.zoom');
  invariant(zoom !== undefined, 'the catalog has pane.zoom');

  const catalog: ActionCatalog = [
    ...actionCatalog.filter((entry) => entry !== zoom),
    { ...zoom, keys: ['Z'] },
  ];

  const snapshot = storeSnapshotOf({
    ids: [firstWorkspace, secondWorkspace],
    focused: firstWorkspace,
  });

  const { press, view } = createInputHarness('insert', { catalog });

  press('\x02');
  press('?');

  expect(
    lineFor(actionViewLines(catalog, snapshot, view.getState(), catalog.length), 'pane.zoom')?.key,
  ).toBe('Z');

  press('\x1b');
  press('/');
  typeText(press, 'zoom');

  expect(
    lineFor(actionViewLines(catalog, snapshot, view.getState(), catalog.length), 'pane.zoom')?.key,
  ).toBe('Z');
});

it('does nothing on Enter for an unavailable search result and keeps search open', () => {
  const onePane = storeSnapshotOf({ ids: [firstWorkspace], focused: firstWorkspace }, [
    { id: 1, workspaceId: firstWorkspace, panes: [paneId(1)], focused: paneId(1) },
  ]);

  const harness = createInputHarness('insert', { snapshot: () => onePane });

  harness.press('\x02');
  harness.press('/');
  typeText(harness.press, 'next work');
  harness.press('\r');

  expect(effectsOf(harness)).toEqual(noEffects);

  expect(harness.view.getState()).toEqual({
    kind: 'search',
    query: 'next work',
    selected: 0,
    top: 0,
  });
});

// Feeds each read through the real tokenizer, 5 ms apart, so a read can continue a lone Escape.
const feedReads = (harness: Harness, reads: string[]): void => {
  const tokenizer = createInputTokenizer();

  for (const [index, read] of reads.entries()) {
    for (const token of tokenizer.push(encoder.encode(read), index * 5)) {
      if (token.kind !== 'response') {
        harness.input(token);
      }
    }
  }
};

const splitReadCases: [string, string, string[]][] = [
  ['a bracketed paste', '/', ['\x1b', '[200~echo PASTED\n\x1b[201~']],
  ['a bracketed paste', '?', ['\x1b', '[200~echo PASTED\n\x1b[201~']],
  ['a cursor key', '/', ['\x1b', '[A']],
  ['a cursor key', '?', ['\x1b', '[A']],
];

for (const [name, opener, reads] of splitReadCases) {
  it(`keeps ${name} split after Escape away from the pane when Escape closes ${opener}`, () => {
    const harness = createInputHarness('normal', {}, ModeFlag.bracketedPaste);

    harness.press(opener);
    feedReads(harness, reads);

    expect(harness.view.getState()).toEqual({ kind: 'closed' });
    expect(effectsOf(harness)).toEqual(noEffects);
  });
}

it('keeps a click in an open search away from the pane and out of the query', () => {
  const harness = createInputHarness('normal');

  harness.press('/');
  typeText(harness.press, 'zo');
  harness.mouse(0, 12, 3, 'M');
  harness.mouse(0, 12, 3, 'm');

  expect(harness.view.getState()).toEqual({ kind: 'search', query: 'zo', selected: 0, top: 0 });
  expect(harness.focused).toEqual([]);
  expect(effectsOf(harness)).toEqual(noEffects);
});

it('routes a right click to the pane after a view swallowed the left release', () => {
  const harness = createInputHarness('normal');

  harness.mouse(0, 6, 3, 'M');
  harness.press('?');
  harness.mouse(0, 6, 3, 'm');
  harness.press('\x1b');
  harness.mouse(2, 7, 4, 'M');
  harness.mouse(2, 7, 4, 'm');

  expect(harness.toPane).toEqual([
    { pane: paneId(1), text: '\x1b[<0;6;3M' },
    { pane: paneId(1), text: '\x1b[<2;7;4M' },
    { pane: paneId(1), text: '\x1b[<2;7;4m' },
  ]);
});

it('runs a search result chosen while a workspace request is pending only after its reply', () => {
  const harness = createInputHarness('normal');

  harness.press('j');
  harness.press('/');
  typeText(harness.press, 'zoom');
  harness.press('\r');

  expect(harness.actions).toEqual([]);
  expect(harness.view.getState()).toEqual({ kind: 'search', query: 'zoom', selected: 0, top: 0 });

  harness.replies[0]?.();

  expect(harness.actions).toEqual(['zoom']);
  expect(harness.view.getState()).toEqual({ kind: 'closed' });
});

it('holds text typed into an open view behind a tab request, then adds it to the query', () => {
  const harness = createInputHarness('normal');

  harness.press('/');
  harness.startTab();
  typeText(harness.press, 'zo');
  harness.pastes('om');

  expect(harness.view.getState()).toEqual({ kind: 'search', query: '', selected: 0, top: 0 });

  harness.answerTab();

  expect(harness.view.getState()).toEqual({ kind: 'search', query: 'zoom', selected: 0, top: 0 });
  expect(effectsOf(harness)).toEqual(noEffects);
});
