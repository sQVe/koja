import { v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { radius } from './size.ts';
import { colors } from './theme.ts';

export const popupSurface = (id: string): Element =>
  v_flex().id(id).w_full().min_h(0).bg(colors().popover).rounded(radius.dialog);
