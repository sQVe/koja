import type { Element } from 'gpui-kit';

import type { TextRole } from '../../kit/index.ts';
import { roleText } from '../../kit/index.ts';

const roleOrder: TextRole[] = ['viewTitle', 'title', 'body', 'sectionHeading', 'detail', 'badge'];

export const textSizes = (): Element[] =>
  roleOrder.map((role) => roleText(role, `${role}: The quick brown fox`));
