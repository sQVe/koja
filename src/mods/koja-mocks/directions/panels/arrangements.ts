import { v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { iconToggle } from '../parts.ts';
import { dimFact } from '../sidebars/facts.ts';
import { mapSidebar } from '../sidebars/sidebar.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { PanelArrangement } from '../window.ts';
import { directionWindow } from '../window.ts';
import { changeList, changeSwitch, changeTotals, commitBar, uncommittedCount } from './changes.ts';
import type { FakePull } from './data.ts';
import { fileFacts, fileList } from './files.ts';
import type { PanelTab } from './frame.ts';
import {
  oneCard,
  panelCard,
  panelColumn,
  panelHeader,
  panelTitle,
  panelWidth,
  sectionDivider,
  sectionHeader,
  spacer,
  tabStrip,
} from './frame.ts';
import { pullLine, stackAlerts, stackFacts, stackList, twoLinePull } from './stack.ts';
import { workerAlerts, workerCount, workerList } from './workers.ts';

export type PanelName = 'Stack' | 'Changes' | 'Workers' | 'Files';

interface PanelContent {
  name: PanelName;
  facts: (tokens: DirectionTokens) => Element[];
  alerts: (tokens: DirectionTokens) => Element[];
  body: (tokens: DirectionTokens) => Element[];
  footer: (tokens: DirectionTokens) => Element[];
}

const blockIndent = 20;

const none = (): Element[] => [];

const panels: PanelContent[] = [
  {
    name: 'Stack',
    facts: stackFacts,
    alerts: stackAlerts,
    body: (tokens) => [stackList(twoLinePull, tokens)],
    footer: none,
  },
  {
    name: 'Changes',
    facts: changeTotals,
    alerts: none,
    body: (tokens) => [changeSwitch(tokens), changeList(tokens)],
    footer: (tokens) => [commitBar(tokens)],
  },
  {
    name: 'Workers',
    facts: (tokens) => [dimFact(`${workerCount} workers`, tokens)],
    alerts: workerAlerts,
    body: (tokens) => [workerList(true, tokens)],
    footer: none,
  },
  {
    name: 'Files',
    facts: fileFacts,
    alerts: none,
    body: (tokens) => [fileList(tokens)],
    footer: none,
  },
];

const panelTabs = (shown: PanelContent[], active: PanelName, tokens: DirectionTokens): PanelTab[] =>
  shown.map((panel) => ({
    name: panel.name,
    active: panel.name === active,
    alerts: panel.alerts(tokens),
  }));

const panelParts = (panel: PanelContent, tokens: DirectionTokens): Element[] => [
  ...panel.body(tokens),
  spacer(),
  ...panel.footer(tokens),
];

const tabsCard = (active: PanelName, tokens: DirectionTokens): Element => {
  const panel = panels.find((candidate) => candidate.name === active);

  if (panel === undefined) {
    return v_flex();
  }

  const strip = tabStrip(panelTabs(panels, active, tokens), panel.facts(tokens), tokens);

  return panelCard([strip, ...panelParts(panel, tokens)], panelWidth, tokens);
};

const sectionsCard = (tokens: DirectionTokens): Element => {
  const count = (value: number): Element[] => [dimFact(String(value), tokens)];

  const parts = [
    sectionHeader(
      { name: 'Stack', open: true, detail: stackFacts(tokens), end: stackAlerts(tokens) },
      tokens,
    ),
    stackList(pullLine, tokens),
    sectionDivider(tokens),
    sectionHeader(
      { name: 'Changes', open: true, detail: count(uncommittedCount), end: [] },
      tokens,
    ),
    changeList(tokens),
    sectionDivider(tokens),
    sectionHeader(
      { name: 'Workers', open: true, detail: count(workerCount), end: workerAlerts(tokens) },
      tokens,
    ),
    workerList(false, tokens),
    sectionDivider(tokens),
    sectionHeader({ name: 'Files', open: false, detail: fileFacts(tokens), end: [] }, tokens),
  ];

  return panelCard(
    [v_flex().flex_none().pt(tokens.rows.listPadding).children(parts)],
    panelWidth,
    tokens,
  );
};

const spineLook = (pull: FakePull, tokens: DirectionTokens): Element => {
  if (!pull.checkedOut) {
    return pullLine(pull, tokens);
  }

  return v_flex()
    .flex_none()
    .child(pullLine(pull, tokens))
    .child(
      v_flex()
        .flex_none()
        .pl(blockIndent)
        .child(changeSwitch(tokens))
        .child(changeList(tokens))
        // The file list already ends with the list padding.
        .child(workerList(false, tokens).pt(0)),
    );
};

const spineCard = (showFiles: boolean, tokens: DirectionTokens): Element => {
  const swap = iconToggle('folder', showFiles, tokens);

  if (showFiles) {
    const header = panelHeader([panelTitle('Files', tokens), ...fileFacts(tokens)], [swap], tokens);

    return panelCard([header, fileList(tokens)], panelWidth, tokens);
  }

  const header = panelHeader([panelTitle('Stack', tokens), ...stackFacts(tokens)], [swap], tokens);

  return panelCard([header, stackList(spineLook, tokens)], panelWidth, tokens);
};

const changesDock = (tokens: DirectionTokens): Element => {
  const tabs = panelTabs(
    panels.filter((panel) => panel.name === 'Changes' || panel.name === 'Files'),
    'Changes',
    tokens,
  );

  return panelCard(
    [
      tabStrip(tabs, changeTotals(tokens), tokens),
      changeSwitch(tokens),
      changeList(tokens),
      spacer(),
      commitBar(tokens),
    ],
    tokens.areas.panelWidth,
    tokens,
  );
};

const workDock = (tokens: DirectionTokens): Element => {
  const stackHalf = panelColumn([
    sectionHeader({ name: 'Stack', open: true, detail: stackFacts(tokens), end: [] }, tokens),
    stackList(twoLinePull, tokens),
  ]).pt(tokens.rows.listPadding);

  const workersHalf = panelColumn([
    sectionHeader(
      { name: 'Workers', open: true, detail: [dimFact(String(workerCount), tokens)], end: [] },
      tokens,
    ),
    workerList(true, tokens),
  ]).pt(tokens.rows.listPadding);

  return panelCard(
    [stackHalf, sectionDivider(tokens), workersHalf],
    tokens.areas.panelWidth,
    tokens,
  );
};

const docks: PanelArrangement = {
  toggles: (tokens) => [
    iconToggle('git-compare', true, tokens),
    iconToggle('layers', true, tokens),
  ],
  panes: (tokens) => [changesDock(tokens), workDock(tokens)],
};

export const tabsScene = (active: PanelName, tokens: DirectionTokens): Element =>
  directionWindow(
    tokens,
    mapSidebar,
    oneCard((cardTokens) => tabsCard(active, cardTokens)),
  );

export const sectionsScene = (tokens: DirectionTokens): Element =>
  directionWindow(tokens, mapSidebar, oneCard(sectionsCard));

export const spineScene = (showFiles: boolean, tokens: DirectionTokens): Element =>
  directionWindow(
    tokens,
    mapSidebar,
    oneCard((cardTokens) => spineCard(showFiles, cardTokens)),
  );

export const docksScene = (tokens: DirectionTokens): Element =>
  directionWindow(tokens, mapSidebar, docks);
