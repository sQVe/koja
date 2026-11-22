import type { Element } from 'gpui-kit';

import { roleText, textRoleNames } from '../../kit/index.ts';

export const textSizes = (): Element[] =>
  textRoleNames.map((role) => roleText(role, `${role}: The quick brown fox`));
