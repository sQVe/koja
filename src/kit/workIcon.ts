import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { icon, iconSlot } from './icon.ts';
import type { IconName } from './iconNames.ts';
import type { ThemeToken } from './palette.ts';
import { colors } from './theme.ts';

export type WorkNeed = 'conflict' | 'failing' | 'review' | 'restack' | 'merge';

interface WorkLook {
  icon: IconName;
  color: ThemeToken;
  label: string;
}

const workLooks: Record<WorkNeed, WorkLook> = {
  conflict: { icon: 'triangle-alert', color: 'blocked', label: 'Conflict' },
  failing: { icon: 'circle-x', color: 'blocked', label: 'CI failing' },
  review: { icon: 'message-square', color: 'ansi3', label: 'Review needed' },
  restack: { icon: 'layers', color: 'ansi3', label: 'Restack needed' },
  merge: { icon: 'git-merge', color: 'done', label: 'Ready to merge' },
};

export const emptyWorkSlot = (): Element => iconSlot(div());

export const workIcon = (need: WorkNeed): Element => {
  const look = workLooks[need];
  const drawnIcon = icon(look.icon, 'small').text_color(colors()[look.color]);

  return iconSlot(drawnIcon).tooltip(look.label).accessibility_label(look.label);
};
