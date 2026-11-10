import { v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { icon } from '../../../../kit/index.ts';
import { contentSectionHeader } from '../content/parts.ts';
import { diffCounts, fileStatusInk } from '../panels/changes.ts';
import { fixedLabel, middleCutLabel, row } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { PullState } from './data.ts';
import { filesFor, pullThreads } from './data.ts';

const markSlotWidth = 12;

export const filesSection = (state: PullState, open: boolean, tokens: DirectionTokens): Element => {
  const files = filesFor(state);
  const added = files.reduce((sum, file) => sum + file.add, 0);
  const removed = files.reduce((sum, file) => sum + file.del, 0);
  const detail = diffCounts(added, removed, tokens);

  const header = contentSectionHeader(
    { name: 'Files', count: files.length },
    open,
    detail,
    tokens,
  ).child(fixedLabel('opens in Greppa', tokens.text.detail, tokens.ink.dim));

  const section = v_flex().flex_none().min_w(0).child(header);

  if (!open) {
    return section;
  }

  return section.children(
    files.map((file) => {
      const end = diffCounts(file.add, file.del, tokens);

      if (pullThreads.some((thread) => thread.path === file.path)) {
        end.push(icon('message-square', 'xsmall').text_color(tokens.marks.working));
      }

      return row(
        {
          selected: false,
          start: fixedLabel(file.status, tokens.text.detail, fileStatusInk(file.status, tokens)).w(
            markSlotWidth,
          ),
          label: middleCutLabel(file.path, tokens.text.body, tokens.ink.text).tooltip(file.path),
          end,
        },
        tokens,
      );
    }),
  );
};
