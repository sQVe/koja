import { v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import type { IconName } from '../../../../kit/index.ts';
import { icon, keyHint, listRow, sectionHeader, spacing } from '../../../../kit/index.ts';

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

const paletteScene = (quality: PaletteQuality): Element => {
  const root = v_flex().flex_1().min_h(0).py(spacing.small);

  if (quality !== 'nearFail') {
    root.child(sectionHeader({ label: 'Commands', size: 'default' }));
  }

  return root.child(
    v_flex().children(fakeCommands.map((command, index) => commandRow(command, quality, index))),
  );
};

export const paletteClean = (): Element => paletteScene('clean');

export const paletteNearPass = (): Element => paletteScene('nearPass');

export const paletteNearFail = (): Element => paletteScene('nearFail');

export const paletteClearFail = (): Element => paletteScene('clearFail');
