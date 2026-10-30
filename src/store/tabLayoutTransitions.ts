import type { PaneId, TabId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import { layoutForOrder } from '../layout.ts';
import type { LayoutChoice } from '../layout.ts';
import { fitPanes } from './paneSizes.ts';
import type { Change, Intent, State, Tab } from './store.ts';
import { propose, refuse } from './transitionOutcome.ts';
import type { Outcome } from './transitionOutcome.ts';

type RotatePanesIntent = Extract<Intent, { type: 'rotatePanes' }>;

export const masterPlacement = (tab: Tab, id: PaneId): Pick<Tab, 'layout' | 'arrangement'> => {
  const order = [...tab.arrangement.order, id];
  const layout = layoutForOrder(tab.layout, order);

  invariant(layout !== undefined, `Tab ${tab.id} has no panes to add to.`);

  return { layout, arrangement: { choice: 'master', order } };
};

const rotatedOrder = (order: readonly PaneId[], direction: 'forward' | 'backward'): PaneId[] =>
  direction === 'forward'
    ? [...order.slice(1), ...order.slice(0, 1)]
    : [...order.slice(-1), ...order.slice(0, -1)];

export const setTabLayout = (state: State, id: TabId, choice: LayoutChoice): Outcome => {
  if (state.stopping) {
    return refuse('serverStopping');
  }

  const tab = state.tabs.find((known) => known.id === id);

  if (tab === undefined) {
    return refuse('unknownTab');
  }

  if (tab.arrangement.choice === choice) {
    return propose(state, []);
  }

  const arrangement = { ...tab.arrangement, choice };
  const switched: Tab = { ...tab, arrangement };

  const next: State = {
    ...state,
    tabs: state.tabs.map((known) => (known.id === tab.id ? switched : known)),
  };

  const fitted = fitPanes(next);

  return propose({ ...next, panes: fitted.panes }, [
    { type: 'tabLayoutChanged', tabId: tab.id, layout: tab.layout, arrangement },
    ...fitted.changes,
  ]);
};

export const rotatePanes = (state: State, intent: RotatePanesIntent): Outcome => {
  const { paneId: id, direction } = intent;

  if (state.stopping) {
    return refuse('serverStopping');
  }

  const target = state.panes.find((pane) => pane.id === id);
  const tab = state.tabs.find((known) => known.id === target?.tabId);

  if (tab === undefined) {
    return refuse('unknownPane');
  }

  if (tab.arrangement.choice !== 'master') {
    return refuse('requiresMasterLayout');
  }

  if (tab.arrangement.order.length < 2) {
    return propose(state, []);
  }

  const order = rotatedOrder(tab.arrangement.order, direction);
  const [master] = order;

  invariant(master !== undefined, `Tab ${tab.id} has no panes to rotate.`);

  const arrangement = { ...tab.arrangement, order };
  const zoomedPaneId = tab.zoomedPaneId === undefined ? undefined : master;
  const rotatedTab: Tab = { ...tab, arrangement, focusedPaneId: master, zoomedPaneId };

  const next: State = {
    ...state,
    tabs: state.tabs.map((known) => (known.id === tab.id ? rotatedTab : known)),
  };

  const changes: Change[] = [
    { type: 'tabLayoutChanged', tabId: tab.id, layout: tab.layout, arrangement },
  ];

  if (tab.focusedPaneId !== master) {
    changes.push({ type: 'paneFocused', tabId: tab.id, paneId: master });
  }

  if (zoomedPaneId !== tab.zoomedPaneId) {
    changes.push({ type: 'tabZoomChanged', tabId: tab.id, zoomedPaneId });
  }

  const fitted = fitPanes(next);

  return propose({ ...next, panes: fitted.panes }, [...changes, ...fitted.changes]);
};
