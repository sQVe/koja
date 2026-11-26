import type { Element } from 'gpui-kit';

import { footerLine } from '../../kit/index.ts';

export const footer = (): Element => footerLine([['tab'], 'Next filter', ['↵'], 'Go to']);
