import { v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { icon } from '../../../../kit/index.ts';
import { contentSectionHeader, sectionBodyInset } from '../content/parts.ts';
import { diffCounts, fileStatusInk } from '../panels/changes.ts';
import { fixedLabel, middleCutLabel, row } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import type { PullView } from './data.ts';
import {
  hasResolvedReview,
  isBottomBarView,
  pullFileTotals,
  pullRequestFiles,
  pullThreads,
} from './data.ts';

const markSlotWidth = 12;

export const filesSection = (view: PullView, open: boolean, tokens: DirectionTokens): Element => {
  const files = pullRequestFiles;

  const detail = isBottomBarView(view)
    ? []
    : diffCounts(pullFileTotals.added, pullFileTotals.removed, tokens);

  const sectionLook = isBottomBarView(view)
    ? { name: 'Files' }
    : { name: 'Files', count: files.length };

  const header = contentSectionHeader(sectionLook, open, detail, tokens).child(
    fixedLabel('opens in Greppa', tokens.text.detail, tokens.ink.dim),
  );

  const section = v_flex().flex_none().min_w(0).child(header);

  if (!open) {
    return section;
  }

  return section.children(
    files.map((file) => {
      const end = diffCounts(file.add, file.del, tokens);

      const unresolved = !hasResolvedReview(view.state);
      const hasThread = pullThreads.some((thread) => thread.path === file.path);

      if (unresolved && hasThread) {
        const threadIcon = icon('message-square', 'xsmall').text_color(tokens.marks.working);

        end.push(threadIcon);
      }

      const statusInk = fileStatusInk(file.status, tokens);
      const status = fixedLabel(file.status, tokens.text.detail, statusInk).w(markSlotWidth);

      const pathLabel = middleCutLabel(file.path, tokens.text.body, tokens.ink.text).tooltip(
        file.path,
      );

      return row(
        {
          selected: false,
          start: status,
          label: pathLabel,
          end,
        },
        tokens,
      ).ml(sectionBodyInset(tokens) - tokens.rows.paddingX);
    }),
  );
};
