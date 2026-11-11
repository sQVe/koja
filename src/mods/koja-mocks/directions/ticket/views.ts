import type { ContentItem } from '../content/data.ts';
import { openingItem } from '../content/states.ts';
import type { Criterion, Slice, TicketData, TicketState, TicketView } from './data.ts';
import {
  acceptance,
  footerSlice,
  isActiveSlice,
  sliceAgents,
  slices,
  ticketItems,
} from './data.ts';
import { tikkAgents, tikkItem, tikkSlices } from './tikk.ts';

const plainItem: ContentItem = {
  ...ticketItems.container,
  identifier: 'ME-1301',
  title: 'Fix the tab icon for mod panes',
  tab: 'ME-1301 Fix the tab icon for mod panes',
  state: 'Backlog',
  facts: [{ name: 'Project', value: 'Koja' }],
  description: [
    "Use the mod's kind icon in its tab so ticket and PR panes are easy to recognize.",
    'Keep the existing program icon for terminal tabs.',
  ],
};

const plainCriteria: Criterion[] = [
  { title: "A mod pane's tab uses its kind icon", state: 'todo' },
  { title: 'Terminal tabs keep their program icon', state: 'todo' },
];

const extraSlices: Slice[] = [
  {
    identifier: 'ME-1310',
    title: 'Preserve the selected space when a project group is folded and reopened',
    readiness: 'blocked',
    blockedBy: 'ME-1287',
  },
  {
    identifier: 'ME-1311',
    title: 'Keep work-need marks visible while switching between repository groups',
    readiness: 'blocked',
    blockedBy: 'ME-1310',
  },
  {
    identifier: 'ME-1312',
    title: 'Explain empty search results without hiding the current stack',
    readiness: 'blocked',
    blockedBy: 'ME-1311',
  },
  {
    identifier: 'ME-1313',
    title: 'Restore the selected project after the sidebar reconnects',
    readiness: 'blocked',
    blockedBy: 'ME-1312',
  },
  {
    identifier: 'ME-1314',
    title: 'Check the sidebar with long branch names and several nested stacks',
    readiness: 'blocked',
    blockedBy: 'ME-1313',
  },
  {
    identifier: 'ME-1315',
    title: 'Check keyboard navigation across folded and expanded projects',
    readiness: 'blocked',
    blockedBy: 'ME-1314',
  },
  {
    identifier: 'ME-1316',
    title: 'Judge the complete sidebar across narrow and wide window sizes',
    readiness: 'blocked',
    blockedBy: 'ME-1315',
  },
];

const longSlices = slices.map((slice): Slice => {
  if (slice.identifier === 'ME-1283') {
    return {
      ...slice,
      title:
        'Add the selected space footer links for tickets and pull requests across repositories',
    };
  }

  if (slice.identifier === 'ME-1285') {
    return {
      ...slice,
      title: 'Fold project groups while keeping the selected space and its work-need marks visible',
    };
  }

  return slice;
});

const mergedSlice = (slice: Slice): Slice => ({
  identifier: slice.identifier,
  title: slice.title,
  readiness: 'merged',
});

const nothingReadySlices = slices.map((slice): Slice => {
  if (isActiveSlice(slice)) {
    return mergedSlice(slice);
  }

  if (slice.readiness === 'ready') {
    return {
      identifier: slice.identifier,
      title: slice.title,
      readiness: 'blocked',
      blockedBy: 'ME-1290',
    };
  }

  return slice;
});

const baseData: TicketData = {
  item: ticketItems.container,
  slices,
  agents: sliceAgents,
  criteria: acceptance.container,
};

const viewData: Record<Exclude<TicketState, 'single'>, TicketData> = {
  container: baseData,
  loading: { ...baseData, item: openingItem(ticketItems.container) },
  unreachable: { ...baseData, item: openingItem(ticketItems.container) },
  'sync-failed': baseData,
  'nothing-ready': { ...baseData, slices: nothingReadySlices, agents: {} },
  done: {
    ...baseData,
    item: { ...ticketItems.container, state: 'Done' },
    slices: slices.map(mergedSlice),
    agents: {},
  },
  plain: { item: plainItem, slices: [], agents: {}, criteria: plainCriteria },
  tikk: { ...baseData, item: tikkItem, slices: tikkSlices, agents: tikkAgents },
  long: { ...baseData, slices: [...longSlices, ...extraSlices] },
  normal: baseData,
  wide: baseData,
};

export const ticketView = (state: TicketState): TicketView => {
  if (state === 'single') {
    return {
      ...baseData,
      state,
      item: ticketItems.single,
      criteria: acceptance.single,
      current: footerSlice,
    };
  }

  return { ...viewData[state], state };
};
