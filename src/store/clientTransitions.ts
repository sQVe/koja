import { clientId } from '../ids.ts';
import type { ClientId } from '../ids.ts';
import { paneSize } from '../layout.ts';
import type { TerminalSize } from '../layout.ts';
import { fitPanes, sameSize } from './paneSizes.ts';
import type { Change, Client, State, Theme } from './store.ts';
import { propose, refuse } from './transitionOutcome.ts';
import type { Outcome } from './transitionOutcome.ts';

export const hasClient = (state: State, id: ClientId | undefined): boolean =>
  state.clients.some((client) => client.id === id);

const markActive = (state: State, id: ClientId): State => ({
  ...state,
  foregroundClientId: id,
  clientActivity: new Map(state.clientActivity).set(id, state.nextActivity),
  nextActivity: state.nextActivity + 1,
});

const latestActiveClient = (state: State): ClientId | undefined => {
  let latest: ClientId | undefined;
  let latestActivity = 0;

  for (const client of state.clients) {
    const activity = state.clientActivity.get(client.id) ?? 0;

    if (activity > latestActivity) {
      latest = client.id;
      latestActivity = activity;
    }
  }

  return latest;
};

// Reports the foreground client unless the attach or detach change already implies it.
const foregroundChanges = (implied: ClientId | undefined, state: State): Change[] =>
  state.foregroundClientId === implied
    ? []
    : [{ type: 'foregroundChanged', clientId: state.foregroundClientId }];

const sameTheme = (left: Theme | undefined, right: Theme): boolean =>
  left?.foreground === right.foreground &&
  left.background === right.background &&
  left.palette.every((color, index) => color === right.palette[index]);

export const attachClient = (state: State, size: TerminalSize): Outcome => {
  const client: Client = {
    id: clientId(state.nextClientNumber),
    size,
    theme: undefined,
    view: state.defaultView,
  };

  const previous = state.attachedClientId;
  const changes: Change[] = [];

  if (previous !== undefined) {
    changes.push({ type: 'clientDetached', clientId: previous, reason: 'takenOver' });
  }

  changes.push({ type: 'clientAttached', client });

  const activity = new Map(state.clientActivity);

  if (previous !== undefined) {
    activity.delete(previous);
  }

  const attached: State = markActive(
    {
      ...state,
      attachedClientId: client.id,
      clients: [...state.clients.filter((known) => known.id !== previous), client],
      clientActivity: activity,
      nextClientNumber: state.nextClientNumber + 1,
      layoutArea: paneSize(size),
    },
    client.id,
  );

  const fitted = fitPanes(attached);

  return propose({ ...attached, panes: fitted.panes }, [...changes, ...fitted.changes]);
};

export const resizeClient = (state: State, id: ClientId, size: TerminalSize): Outcome => {
  const resizing = state.clients.find((known) => known.id === id);

  if (resizing === undefined) {
    return refuse('unknownClient');
  }

  const active = markActive(state, id);
  const foreground = foregroundChanges(state.foregroundClientId, active);

  if (sameSize(resizing.size, size)) {
    return propose(active, foreground);
  }

  const resized: State = {
    ...active,
    clients: state.clients.map((client) => (client.id === id ? { ...client, size } : client)),
    layoutArea: paneSize(size),
  };

  const fitted = fitPanes(resized);

  return propose({ ...resized, panes: fitted.panes }, [
    ...foreground,
    { type: 'clientResized', clientId: id, size },
    ...fitted.changes,
  ]);
};

export const markClientActive = (state: State, id: ClientId): Outcome => {
  if (!hasClient(state, id)) {
    return refuse('unknownClient');
  }

  const active = markActive(state, id);

  return propose(active, foregroundChanges(state.foregroundClientId, active));
};

export const setClientTheme = (state: State, id: ClientId, theme: Theme): Outcome => {
  const reporting = state.clients.find((known) => known.id === id);

  if (reporting === undefined) {
    return refuse('unknownClient');
  }

  if (sameTheme(reporting.theme, theme)) {
    return propose(state, []);
  }

  const themed: State = {
    ...state,
    clients: state.clients.map((client) => (client.id === id ? { ...client, theme } : client)),
  };

  return propose(themed, [{ type: 'clientThemeChanged', clientId: id, theme }]);
};

// The pane keeps its size after a detach, so the next attach redraws the same screen.
export const detachClient = (state: State, id: ClientId): Outcome => {
  if (!state.clients.some((client) => client.id === id)) {
    return refuse('unknownClient');
  }

  const attachedClientId = state.attachedClientId === id ? undefined : state.attachedClientId;
  const clientActivity = new Map(state.clientActivity);

  clientActivity.delete(id);

  const remaining: State = {
    ...state,
    attachedClientId,
    clients: state.clients.filter((client) => client.id !== id),
    clientActivity,
  };

  // The client with the latest activity takes over a foreground that its client leaves.
  const leavesForeground = state.foregroundClientId === id;

  const foregroundClientId = leavesForeground
    ? latestActiveClient(remaining)
    : state.foregroundClientId;

  const next: State = { ...remaining, foregroundClientId };
  const implied = leavesForeground ? undefined : state.foregroundClientId;

  return propose(next, [
    { type: 'clientDetached', clientId: id, reason: 'requested' },
    ...foregroundChanges(implied, next),
  ]);
};
