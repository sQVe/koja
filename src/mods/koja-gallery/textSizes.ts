import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import { textSize } from '../../kit/index.ts';

export const textSizes = (): Element[] =>
  (['xsmall', 'small', 'default', 'large'] as const).map((size) =>
    div().text_size(textSize[size]).child(`${size}: The quick brown fox`),
  );
