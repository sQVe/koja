import type { InputState } from 'gpui-base';
import { v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import type { IconName } from '../../../../kit/index.ts';
import {
  icon,
  keyHint,
  listRow,
  searchField,
  sectionHeader,
  spacing,
} from '../../../../kit/index.ts';

type PaletteQuality = 'clean' | 'nearPass' | 'nearFail' | 'clearFail';

interface FakeCommand {
  label: string;
  shortcut: string;
  icon: IconName;
}

const fakeCommands: FakeCommand[] = [
  { label: 'New terminal', shortcut: 'ctrl-shift-t', icon: 'terminal' },
  { label: 'Open file', shortcut: 'ctrl-p', icon: 'file' },
  { label: 'Check out branch', shortcut: 'ctrl-shift-b', icon: 'git-branch' },
  { label: 'Split pane right', shortcut: 'ctrl-shift-d', icon: 'columns-2' },
];

const selectedIndex = 0;

const isSelected = (quality: PaletteQuality, index: number): boolean => {
  if (quality === 'nearFail') {
    return false;
  }

  return index === selectedIndex;
};

const rowSize = (quality: PaletteQuality, index: number): 'small' | 'medium' => {
  if (quality === 'nearPass' && index === 2) {
    return 'small';
  }

  return 'medium';
};

const rowLabel = (command: FakeCommand, quality: PaletteQuality): string => {
  if (quality === 'clearFail') {
    return '';
  }

  return command.label;
};

const commandRow = (command: FakeCommand, quality: PaletteQuality, index: number): Element =>
  listRow({
    size: rowSize(quality, index),
    inset: true,
    state: isSelected(quality, index) ? 'selected' : 'normal',
    start: icon(command.icon, 'large'),
    label: rowLabel(command, quality),
    end: [keyHint(command.shortcut)],
  });

const paletteScene = (quality: PaletteQuality, input: InputState): Element => {
  const body = v_flex().flex_1().min_h(0).py(spacing.small);

  if (quality !== 'nearFail') {
    body.child(sectionHeader({ label: 'Commands', size: 'default' }));
  }

  body.child(
    v_flex().children(fakeCommands.map((command, index) => commandRow(command, quality, index))),
  );

  return v_flex().flex_1().min_h(0).child(searchField(input, 'command')).child(body);
};

export const paletteClean = (input: InputState): Element => paletteScene('clean', input);

export const paletteNearPass = (input: InputState): Element => paletteScene('nearPass', input);

export const paletteNearFail = (input: InputState): Element => paletteScene('nearFail', input);

export const paletteClearFail = (input: InputState): Element => paletteScene('clearFail', input);
