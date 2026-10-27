import { expect, it } from 'bun:test';

import type { ClipboardReadResult, PanePasteResult, StoreSnapshot } from '../client/client.ts';
import { paneId, tabId } from '../ids.ts';
import type { PaneId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import { ModeFlag } from '../rows/rows.ts';
import { createInputHarness, secondWorkspace } from './inputFixtures.ts';

type StoreView = StoreSnapshot['defaultView'];

const changedNotice = 'Paste canceled: the pane changed.';

const canceledNotice = 'Paste canceled.';

const promptOfTwoLines = 'y/n: paste 2 lines without bracketed paste?';

const sentTo = (pane: PaneId, generation = 1): PanePasteResult => ({
  ok: true,
  paneId: pane,
  generation,
});

const confirmation: PanePasteResult = {
  ok: false,
  reason: 'confirmationRequired',
  paneId: paneId(1),
  generation: 1,
  lines: 2,
  authorization: '1.token',
};

const withViews = (snapshot: StoreSnapshot, change: (view: StoreView) => StoreView) => ({
  ...snapshot,
  defaultView: change(snapshot.defaultView),
  clients: snapshot.clients.map((client) => ({ ...client, view: change(client.view) })),
});

const focusedSecondPane = (snapshot: StoreSnapshot): StoreSnapshot => ({
  ...snapshot,
  tabs: snapshot.tabs.map((tab) =>
    tab.id === tabId(1) ? { ...tab, focusedPaneId: paneId(2) } : tab,
  ),
});

const restartedFirstPane = (snapshot: StoreSnapshot): StoreSnapshot => ({
  ...snapshot,
  panes: snapshot.panes.map((pane) =>
    pane.id === paneId(1) ? { ...pane, generation: pane.generation + 1 } : pane,
  ),
});

const closedFirstPane = (snapshot: StoreSnapshot): StoreSnapshot => {
  const focused = focusedSecondPane(snapshot);

  return { ...focused, panes: focused.panes.filter((pane) => pane.id !== paneId(1)) };
};

const exitedFirstPane = (snapshot: StoreSnapshot): StoreSnapshot => ({
  ...snapshot,
  panes: snapshot.panes.map((pane) =>
    pane.id === paneId(1) ? { ...pane, lifecycle: 'exited' as const, exitCode: 0 } : pane,
  ),
});

const secondTabShown = (snapshot: StoreSnapshot): StoreSnapshot =>
  withViews(snapshot, (view) => ({
    ...view,
    activeTabs: view.activeTabs.map((active) =>
      active.tabId === tabId(1) ? { ...active, tabId: tabId(2) } : active,
    ),
  }));

const secondWorkspaceShown = (snapshot: StoreSnapshot): StoreSnapshot =>
  withViews(snapshot, (view) => ({ ...view, focusedWorkspaceId: secondWorkspace }));

it('pastes a one-line clipboard into the bound pane and generation on p and stays in normal mode', async () => {
  const { press, clipboardReads, pasteRequests, answerPaste, mode, sent, pasteFlow } =
    createInputHarness('normal');

  press('p');
  await clipboardReads[0]?.settle({ ok: true, text: 'echo hi' });

  expect(pasteRequests).toEqual([
    { pane: paneId(1), generation: 1, text: 'echo hi', authorization: undefined },
  ]);

  await answerPaste({ ok: true, paneId: paneId(1), generation: 1 });

  expect(sent).toEqual([]);
  expect(mode()).toBe('normal');
  expect(pasteFlow.getStatus()).toBeUndefined();
});

it('sends multiline clipboard text once when the server pastes it for a pane with bracketed paste', async () => {
  const harness = createInputHarness('normal', {}, ModeFlag.bracketedPaste);

  harness.press('p');
  await harness.clipboardReads[0]?.settle({ ok: true, text: 'one\ntwo' });
  await harness.answerPaste(sentTo(paneId(1)));

  expect(harness.pasteRequests).toEqual([
    { pane: paneId(1), generation: 1, text: 'one\ntwo', authorization: undefined },
  ]);

  expect(harness.sent).toEqual([]);
  expect(harness.mode()).toBe('normal');
  expect(harness.pasteFlow.getStatus()).toBeUndefined();
});

it('asks before multiline clipboard text reaches a pane without bracketed paste, and y sends it with the authorization', async () => {
  const harness = createInputHarness('normal');

  harness.press('p');
  await harness.clipboardReads[0]?.settle({ ok: true, text: 'one\ntwo' });
  await harness.answerPaste(confirmation);

  expect(harness.pasteFlow.getStatus()).toBe(promptOfTwoLines);

  harness.press('y');

  expect(harness.pasteRequests).toEqual([
    { pane: paneId(1), generation: 1, text: 'one\ntwo', authorization: undefined },
    { pane: paneId(1), generation: 1, text: 'one\ntwo', authorization: '1.token' },
  ]);

  await harness.answerPaste(sentTo(paneId(1)));

  expect(harness.sent).toEqual([]);
  expect(harness.toPane).toEqual([]);
  expect(harness.mode()).toBe('normal');
  expect(harness.pasteFlow.getStatus()).toBeUndefined();
});

for (const [name, raw] of [
  ['n', 'n'],
  ['Escape', '\x1b'],
  ['another key', 's'],
] as const) {
  it(`cancels a paste prompt on ${name}, sends no bytes, and changes no state or mode`, async () => {
    const harness = createInputHarness('normal');

    harness.press('p');
    await harness.clipboardReads[0]?.settle({ ok: true, text: 'one\ntwo' });
    await harness.answerPaste(confirmation);

    const before = harness.store();

    harness.press(raw);

    expect(harness.pasteRequests).toHaveLength(1);
    expect(harness.sent).toEqual([]);
    expect(harness.toPane).toEqual([]);
    expect(harness.actions).toEqual([]);
    expect(harness.store()).toEqual(before);
    expect(harness.mode()).toBe('normal');
    expect(harness.pasteFlow.getStatus()).toBe(canceledNotice);
  });
}

it('keeps the prompt open when the release of p arrives after it', async () => {
  const harness = createInputHarness('normal');

  harness.press('\x1b[112;1:3u');
  harness.press('p');
  await harness.clipboardReads[0]?.settle({ ok: true, text: 'one\ntwo' });
  await harness.answerPaste(confirmation);
  harness.press('\x1b[112;1:3u');

  expect(harness.pasteFlow.getStatus()).toBe(promptOfTwoLines);
});

const targetChanges: [string, (snapshot: StoreSnapshot) => StoreSnapshot][] = [
  ['the viewed pane changes', focusedSecondPane],
  ['the pane restarts with a new generation', restartedFirstPane],
  ['the pane closes', closedFirstPane],
  ['the pane exits', exitedFirstPane],
  ['the shown tab changes', secondTabShown],
  ['the shown workspace changes', secondWorkspaceShown],
];

for (const [name, change] of targetChanges) {
  it(`cancels a pending clipboard read with a notice when ${name}`, async () => {
    const harness = createInputHarness('normal');

    harness.press('p');
    harness.changeStore(change(harness.store()));

    expect(harness.clipboardReads[0]?.signal.aborted).toBe(true);
    expect(harness.pasteFlow.getStatus()).toBe(changedNotice);

    await harness.clipboardReads[0]?.settle({ ok: true, text: 'echo hi' });

    expect(harness.pasteRequests).toEqual([]);
    expect(harness.sent).toEqual([]);
    expect(harness.toPane).toEqual([]);
    expect(harness.pasteFlow.getStatus()).toBe(changedNotice);
  });

  it(`cancels an open paste prompt with a notice when ${name}`, async () => {
    const harness = createInputHarness('normal');

    harness.press('p');
    await harness.clipboardReads[0]?.settle({ ok: true, text: 'one\ntwo' });
    await harness.answerPaste(confirmation);
    harness.changeStore(change(harness.store()));

    expect(harness.pasteFlow.getStatus()).toBe(changedNotice);

    harness.press('y');

    expect(harness.pasteRequests).toHaveLength(1);
    expect(harness.sent).toEqual([]);
    expect(harness.toPane).toEqual([]);
  });
}

it('cancels a pending clipboard read with a notice when an action view opens', async () => {
  const harness = createInputHarness('normal');

  harness.press('p');
  harness.press('?');
  await harness.clipboardReads[0]?.settle({ ok: true, text: 'echo hi' });

  expect(harness.clipboardReads[0]?.signal.aborted).toBe(true);
  expect(harness.pasteRequests).toEqual([]);
  expect(harness.pasteFlow.getStatus()).toBe(changedNotice);
});

it('cancels at the end of the read when the target changed without a store notice', async () => {
  const harness = createInputHarness('normal');

  harness.press('p');
  harness.snapshot.focused = secondWorkspace;
  await harness.clipboardReads[0]?.settle({ ok: true, text: 'echo hi' });

  expect(harness.pasteRequests).toEqual([]);
  expect(harness.pasteFlow.getStatus()).toBe(changedNotice);
});

it('keeps routing other keys while the clipboard read is pending', async () => {
  const harness = createInputHarness('normal');

  harness.press('p');
  harness.press('i');
  harness.press('a');

  expect(harness.sent).toEqual(['a']);

  await harness.clipboardReads[0]?.settle({ ok: true, text: 'echo hi' });

  expect(harness.pasteRequests).toHaveLength(1);
});

const readFailures: [ClipboardReadResult, string][] = [
  [{ ok: false, reason: 'unsupported' }, 'Paste failed: no clipboard is available here.'],
  [{ ok: false, reason: 'failed' }, 'Paste failed: the clipboard could not be read.'],
  [{ ok: false, reason: 'empty' }, 'Nothing pasted: the clipboard is empty.'],
  [{ ok: false, reason: 'timeout' }, 'Paste failed: the clipboard read timed out.'],
];

for (const [result, notice] of readFailures) {
  it(`shows a notice and sends no paste request when the clipboard read is ${result.ok ? '' : result.reason}`, async () => {
    const harness = createInputHarness('normal');

    harness.press('p');
    await harness.clipboardReads[0]?.settle(result);

    expect(harness.pasteRequests).toEqual([]);
    expect(harness.sent).toEqual([]);
    expect(harness.pasteFlow.getStatus()).toBe(notice);
    expect(harness.mode()).toBe('normal');
  });
}

const pasteFailures: [PanePasteResult, string][] = [
  [{ ok: false, reason: 'paneMissing', paneId: paneId(1) }, 'Paste failed: the pane is gone.'],
  [
    { ok: false, reason: 'paneReplaced', paneId: paneId(1), generation: 2 },
    'Paste failed: the pane restarted.',
  ],
  [
    { ok: false, reason: 'authorizationMismatch' },
    'Paste failed: the confirmation no longer matches.',
  ],
  [{ ok: false, reason: 'connectionFailed' }, 'Paste failed: the server did not answer.'],
];

it('shows the too-large notice and sends no bytes when the server layer refuses the paste as too large', async () => {
  const harness = createInputHarness('normal');

  harness.press('p');
  await harness.clipboardReads[0]?.settle({ ok: true, text: 'echo hi' });
  await harness.answerPaste({ ok: false, reason: 'tooLarge' });

  expect(harness.pasteFlow.getStatus()).toBe('Nothing pasted: the text is too large.');
  expect(harness.sent).toEqual([]);
  expect(harness.toPane).toEqual([]);
});

for (const [result, notice] of pasteFailures) {
  it(`shows a notice when the server answers the paste with ${result.ok ? '' : result.reason}`, async () => {
    const harness = createInputHarness('normal');

    harness.press('p');
    await harness.clipboardReads[0]?.settle({ ok: true, text: 'echo hi' });
    await harness.answerPaste(result);

    expect(harness.pasteFlow.getStatus()).toBe(notice);
  });
}

it('clears a notice on the next key and leaves the key its usual effect', async () => {
  const harness = createInputHarness('normal');

  harness.press('p');
  await harness.clipboardReads[0]?.settle({ ok: false, reason: 'empty' });
  harness.press('s');

  expect(harness.pasteFlow.getStatus()).toBeUndefined();
  expect(harness.actions).toEqual(['splitBelow']);
});

it('replaces a pending clipboard read with a new p, and the old read sends nothing', async () => {
  const harness = createInputHarness('normal');

  harness.press('p');
  harness.press('p');

  expect(harness.clipboardReads[0]?.signal.aborted).toBe(true);

  await harness.clipboardReads[0]?.settle({ ok: true, text: 'old' });
  await harness.clipboardReads[1]?.settle({ ok: true, text: 'new' });

  expect(harness.pasteRequests.map((request) => request.text)).toEqual(['new']);
  expect(harness.pasteFlow.getStatus()).toBeUndefined();
});

it('replaces an open prompt with a host paste, and the prompt sends nothing', async () => {
  const harness = createInputHarness('normal');

  harness.press('p');
  await harness.clipboardReads[0]?.settle({ ok: true, text: 'one\ntwo' });
  await harness.answerPaste(confirmation);
  harness.pastes('x');
  harness.press('y');

  expect(harness.pasteRequests).toHaveLength(1);
  expect(harness.sent).toEqual(['x']);
  expect(harness.pasteFlow.getStatus()).toBeUndefined();
});

it('does not read the clipboard on p when the viewed pane is not running', () => {
  const harness = createInputHarness('normal');

  harness.changeStore(exitedFirstPane(harness.store()));
  harness.press('p');

  expect(harness.clipboardReads).toEqual([]);
  expect(harness.mode()).toBe('normal');
});

for (const initial of ['insert', 'normal'] as const) {
  it(`asks before a multiline host paste reaches a pane without bracketed paste in ${initial} mode`, async () => {
    const harness = createInputHarness(initial);

    harness.pastes('one\ntwo');

    expect(harness.clipboardReads).toEqual([]);

    expect(harness.pasteRequests).toEqual([
      { pane: paneId(1), generation: 1, text: 'one\ntwo', authorization: undefined },
    ]);

    await harness.answerPaste(confirmation);

    expect(harness.pasteFlow.getStatus()).toBe(promptOfTwoLines);
    expect(harness.sent).toEqual([]);
    expect(harness.mode()).toBe(initial);
    expect(harness.modeChanges).toEqual([]);

    harness.press('y');
    await harness.answerPaste(sentTo(paneId(1)));

    expect(harness.pasteRequests[1]?.authorization).toBe('1.token');
    expect(harness.sent).toEqual([]);
    expect(harness.mode()).toBe(initial);
  });
}

it('sends a one-line host paste straight to a pane without bracketed paste', () => {
  const harness = createInputHarness('insert');

  harness.pastes('echo hi');

  expect(harness.sent).toEqual(['echo hi']);
  expect(harness.pasteRequests).toEqual([]);
});

it('sends a multiline host paste through the server even when the cached modes say bracketed paste is on', async () => {
  const harness = createInputHarness('insert', {}, ModeFlag.bracketedPaste);

  harness.pastes('one\ntwo');

  expect(harness.sent).toEqual([]);

  expect(harness.pasteRequests).toEqual([
    { pane: paneId(1), generation: 1, text: 'one\ntwo', authorization: undefined },
  ]);

  await harness.answerPaste(confirmation);

  expect(harness.pasteFlow.getStatus()).toBe(promptOfTwoLines);
  expect(harness.sent).toEqual([]);
});

it('sends a one-line host paste straight to a pane with bracketed paste, wrapped in markers', () => {
  const harness = createInputHarness('insert', {}, ModeFlag.bracketedPaste);

  harness.pastes('echo hi');

  expect(harness.sent).toEqual(['\x1b[200~echo hi\x1b[201~']);
  expect(harness.pasteRequests).toEqual([]);
});

it('keeps a paste that was already sent when the target changes before the server answers', async () => {
  const harness = createInputHarness('insert');

  harness.pastes('one\ntwo');
  harness.changeStore(focusedSecondPane(harness.store()));
  await harness.answerPaste(sentTo(paneId(1)));

  expect(harness.pasteFlow.getStatus()).toBeUndefined();
});

it('shows no prompt when the target changed while the server decided that the paste needs one', async () => {
  const harness = createInputHarness('insert');

  harness.pastes('one\ntwo');
  harness.changeStore(focusedSecondPane(harness.store()));
  await harness.answerPaste(confirmation);
  harness.press('y');

  expect(harness.pasteFlow.getStatus()).toBeUndefined();
  expect(harness.pasteRequests).toHaveLength(1);
  expect(harness.sent).toEqual(['y']);
});

it('cancels a pending clipboard read when the pane moves to another tab that is then shown', async () => {
  const harness = createInputHarness('normal');
  const moved = structuredClone(harness.store());
  const secondTab = moved.tabs.find((tab) => tab.id === tabId(2));

  invariant(secondTab !== undefined, 'the harness has a second tab');
  secondTab.layout = { kind: 'pane', paneId: paneId(1) };
  secondTab.focusedPaneId = paneId(1);

  harness.press('p');
  harness.changeStore(secondTabShown(moved));
  await harness.clipboardReads[0]?.settle({ ok: true, text: 'echo hi' });

  expect(harness.pasteRequests).toEqual([]);
  expect(harness.pasteFlow.getStatus()).toBe(changedNotice);
});

it('keeps the press and release of the key that answers a prompt in insert mode from the pane', async () => {
  // Kitty flags 1 and 2: disambiguated keys with release events.
  const harness = createInputHarness('insert', {}, 0b11 << 9);

  harness.pastes('one\ntwo');
  await harness.answerPaste(confirmation);
  harness.press('\x1b[121u');
  harness.press('\x1b[121;1:3u');

  expect(harness.pasteRequests).toHaveLength(2);
  expect(harness.sent).toEqual([]);
});

const openHostPrompt = async (initial: 'insert' | 'normal') => {
  const harness = createInputHarness(initial);

  harness.pastes('one\ntwo');
  await harness.answerPaste(confirmation);

  return harness;
};

it('keeps a split escape key away from the pane when its Escape cancels a prompt in insert mode', async () => {
  const harness = await openHostPrompt('insert');

  harness.input({ kind: 'key', raw: '\x1b', escapeSent: false });
  harness.input({ kind: 'key', raw: '\x1b[A', escapeSent: true });

  expect(harness.pasteFlow.getStatus()).toBe(canceledNotice);
  expect(harness.sent).toEqual([]);
  expect(harness.toPane).toEqual([]);
  expect(harness.pasteRequests).toHaveLength(1);
  expect(harness.mode()).toBe('insert');
});

it('cancels an open prompt without sending and starts a new clipboard read on p in normal mode', async () => {
  const harness = await openHostPrompt('normal');

  harness.press('p');

  expect(harness.clipboardReads).toHaveLength(1);
  expect(harness.pasteFlow.getStatus()).toBeUndefined();

  await harness.clipboardReads[0]?.settle({ ok: true, text: 'new' });

  expect(harness.pasteRequests.map((request) => request.text)).toEqual(['one\ntwo', 'new']);
  expect(harness.pasteRequests[1]?.authorization).toBeUndefined();
  expect(harness.sent).toEqual([]);
  expect(harness.mode()).toBe('normal');
});

it('only cancels an open prompt on p in insert mode, and keeps the p from the pane', async () => {
  const harness = await openHostPrompt('insert');

  harness.press('p');

  expect(harness.clipboardReads).toEqual([]);
  expect(harness.pasteRequests).toHaveLength(1);
  expect(harness.pasteFlow.getStatus()).toBe(canceledNotice);
  expect(harness.sent).toEqual([]);
  expect(harness.mode()).toBe('insert');
});

it('aborts a pending clipboard read on close and sends nothing when the read ends', async () => {
  const harness = createInputHarness('normal');

  harness.press('p');
  harness.pasteFlow.close();

  expect(harness.clipboardReads[0]?.signal.aborted).toBe(true);

  await harness.clipboardReads[0]?.settle({ ok: true, text: 'echo hi' });

  expect(harness.pasteRequests).toEqual([]);
  expect(harness.sent).toEqual([]);
  expect(harness.toPane).toEqual([]);
});

it('cancels an open prompt on close, so a later y sends nothing', async () => {
  const harness = await openHostPrompt('normal');

  harness.pasteFlow.close();
  harness.press('y');

  expect(harness.pasteRequests).toHaveLength(1);
  expect(harness.pasteFlow.getStatus()).toBeUndefined();
});

it('binds a p held behind a workspace request to the pane the new workspace shows', async () => {
  const harness = createInputHarness('normal');

  harness.press('j');
  harness.press('p');

  expect(harness.clipboardReads).toEqual([]);

  harness.snapshot.focused = secondWorkspace;
  harness.replies[0]?.();
  await harness.clipboardReads[0]?.settle({ ok: true, text: 'echo hi' });

  expect(harness.pasteRequests).toEqual([
    { pane: paneId(5), generation: 1, text: 'echo hi', authorization: undefined },
  ]);
});

const startingFirstPane = (snapshot: StoreSnapshot): StoreSnapshot => ({
  ...snapshot,
  panes: snapshot.panes.map((pane) =>
    pane.id === paneId(1) ? { ...pane, lifecycle: 'starting' as const } : pane,
  ),
});

it('sends a multiline host paste through the server while the client still sees the pane starting', async () => {
  const harness = createInputHarness('insert');
  const running = harness.store();

  harness.changeStore(startingFirstPane(running));
  harness.pastes('one\ntwo');

  expect(harness.sent).toEqual([]);

  expect(harness.pasteRequests).toEqual([
    { pane: paneId(1), generation: 1, text: 'one\ntwo', authorization: undefined },
  ]);

  await harness.answerPaste(confirmation);
  harness.changeStore(running);

  expect(harness.pasteFlow.getStatus()).toBe(promptOfTwoLines);

  harness.press('y');

  expect(harness.pasteRequests[1]?.authorization).toBe('1.token');
  expect(harness.sent).toEqual([]);
});

it('sends a multiline host paste for an exited pane through the server and shows its refusal', async () => {
  const harness = createInputHarness('insert');

  harness.changeStore(exitedFirstPane(harness.store()));
  harness.pastes('one\ntwo');

  expect(harness.sent).toEqual([]);
  expect(harness.pasteRequests).toHaveLength(1);

  await harness.answerPaste({ ok: false, reason: 'paneMissing', paneId: paneId(1) });

  expect(harness.pasteFlow.getStatus()).toBe('Paste failed: the pane is gone.');
  expect(harness.sent).toEqual([]);
});

it('drops a multiline host paste with a notice when no pane is shown', () => {
  const harness = createInputHarness('insert');

  harness.changeStore(
    withViews(harness.store(), (view) => ({ ...view, focusedWorkspaceId: undefined })),
  );

  harness.pastes('one\ntwo');

  expect(harness.sent).toEqual([]);
  expect(harness.toPane).toEqual([]);
  expect(harness.pasteRequests).toEqual([]);
  expect(harness.pasteFlow.getStatus()).toBe('Nothing pasted: no pane is shown.');
});

it('cancels a pending clipboard read with a notice when the view shows no pane any more', async () => {
  const harness = createInputHarness('normal');

  harness.press('p');

  harness.changeStore(
    withViews(harness.store(), (view) => ({ ...view, focusedWorkspaceId: undefined })),
  );

  await harness.clipboardReads[0]?.settle({ ok: true, text: 'echo hi' });

  expect(harness.pasteRequests).toEqual([]);
  expect(harness.pasteFlow.getStatus()).toBe(changedNotice);
});

it('reads no clipboard when the paste flow is asked to paste into an exited pane', () => {
  const harness = createInputHarness('normal');

  harness.changeStore(exitedFirstPane(harness.store()));
  harness.pasteFlow.fromClipboard();

  expect(harness.clipboardReads).toEqual([]);
});
