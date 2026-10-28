import type { PaneId, TabId } from '../ids.ts';
import { invariant } from '../invariant.ts';
import { layoutForOrder } from '../layout.ts';
import type { LayoutChoice } from '../layout.ts';
import { fitPanes } from './paneSizes.ts';
import type { State, Tab } from './store.ts';
import { propose, refuse } from './transitionOutcome.ts';
import type { Outcome } from './transitionOutcome.ts';

export const masterPlacement = (tab: Tab, id: PaneId): Pick<Tab, 'layout' | 'arrangement'> => {
  const order = [...tab.arrangement.order, id];
  const layout = layoutForOrder(tab.layout, order);

  invariant(layout !== undefined, `Tab ${tab.id} has no panes to add to.`);

  return { layout, arrangement: { choice: 'master', order } };
};

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
