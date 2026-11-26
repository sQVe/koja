import { h_flex } from 'gpui-base';
import type { Context, Element } from 'gpui-kit';

import { colors, modName, segmentedChip, spaceMark, spacing } from '../../kit/index.ts';
import type { StatusFilter } from './filters.ts';
import { filterMark, statusFilters } from './filters.ts';
import type { PickerData } from './rows.ts';
import { statusCount } from './rows.ts';

const countOf = (filter: StatusFilter, data: PickerData): number => {
  if (filter.statuses === null) {
    return data.spaces.length;
  }

  return statusCount(filter.statuses, data.spaces, data.statuses);
};

export const chips = (
  activeIndex: number,
  data: PickerData,
  onChange: (index: number, cx: Context) => void,
): Element => {
  const draw = (filter: StatusFilter, index: number): Element => {
    const mark = filterMark(filter);

    const chip = segmentedChip({
      label: filter.label,
      count: countOf(filter, data),
      active: index === activeIndex,
      ...(mark === null ? {} : { start: spaceMark(mark) }),
    });

    return chip.id(`${modName}-filter-${index}`).on_click((_event, cx) => {
      onChange(index, cx);
    });
  };

  return h_flex()
    .flex_none()
    .min_w(0)
    .px(spacing.large)
    .pb(spacing.xsmall)
    .gap(spacing.xsmall)
    .items_center()
    .overflow_hidden()
    .border_b(spacing.hairline)
    .border_color(colors().border)
    .children(statusFilters.map(draw));
};
