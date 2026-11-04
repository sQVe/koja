import { v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import {
  detailText,
  highlightedText,
  keyHint,
  listRow,
  searchField,
  sectionHeader,
  spacing,
} from '../../../kit/index.ts';
import type { SceneInputs } from './inputs.ts';

interface FakeCommand {
  title: string;
  group?: string;
  keys?: string;
}

interface FakeGroup {
  heading: string;
  commands: FakeCommand[];
}

export const popupQuery = 'pane';

const selectedTitle = 'Split pane right';

const fakeGroups: FakeGroup[] = [
  {
    heading: 'Recent',
    commands: [
      { title: 'Split pane right', keys: 'ctrl-shift-d' },
      { title: 'Focus pane left', keys: 'ctrl-alt-left' },
      { title: 'Rename pane…' },
    ],
  },
  {
    heading: 'Commands',
    commands: [
      { title: 'Close pane', group: 'Pane', keys: 'ctrl-shift-w' },
      { title: 'Split pane down', group: 'Pane', keys: 'ctrl-shift-e' },
      { title: 'Toggle pane zoom', group: 'Layout', keys: 'ctrl-shift-z' },
      { title: 'Move pane to new tab', group: 'Tabs' },
      { title: 'Swap panes', group: 'Layout' },
      { title: 'Show pane header', group: 'Settings' },
    ],
  },
];

const matchPositions = (title: string): number[] => {
  const start = title.toLowerCase().indexOf(popupQuery);

  if (start === -1) {
    return [];
  }

  return Array.from(popupQuery, (_letter, offset) => start + offset);
};

const commandEnd = (command: FakeCommand): Element[] => {
  const end: Element[] = [];

  if (command.group !== undefined) {
    end.push(detailText(command.group));
  }

  if (command.keys !== undefined) {
    end.push(keyHint(command.keys));
  }

  return end;
};

const commandRow = (command: FakeCommand): Element => {
  const selected = command.title === selectedTitle;

  return listRow({
    size: 'large',
    inset: true,
    state: selected ? 'selected' : 'normal',
    label: highlightedText(command.title, matchPositions(command.title), selected),
    end: commandEnd(command),
  });
};

const group = (fakeGroup: FakeGroup): Element[] => [
  sectionHeader({ label: fakeGroup.heading, size: 'default' }),
  ...fakeGroup.commands.map(commandRow),
];

export const popupScene = (inputs: SceneInputs): Element =>
  v_flex()
    .flex_1()
    .min_h(0)
    .child(searchField(inputs.search, 'search'))
    .child(v_flex().my(spacing.xsmall).children(fakeGroups.flatMap(group)));
