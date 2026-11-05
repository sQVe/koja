import { h_flex } from 'gpui-base';
import type { Context, Element } from 'gpui-kit';

import { colors, modName, spacing, statusMark, toggleButton } from '../../kit/index.ts';
import type { StatusFilter } from './filters.ts';
import { statusFilters } from './filters.ts';
import type { PickerData } from './rows.ts';
import { statusCount } from './rows.ts';

const filterCount = (filter: StatusFilter, data: PickerData): number | null => {
  if (filter.statuses === null) {
    return null;
  }

  return statusCount(filter.statuses, data.spaces, data.statuses);
};

const filterChip = (
  filter: StatusFilter,
  index: number,
  activeIndex: number,
  data: PickerData,
  onChange: (index: number, cx: Context) => void,
): Element => {
  const active = index === activeIndex;
  const count = filterCount(filter, data);

  return toggleButton({
    label: filter.label,
    active,
    quiet: count === 0 && !active,
    ...(filter.mark === null ? {} : { start: statusMark(filter.mark) }),
    ...(count === null || count === 0 ? {} : { end: String(count) }),
  })
    .id(`${modName}-filter-${index}`)
    .on_click((_event, cx) => {
      onChange(index, cx);
    });
};

export const footer = (
  activeIndex: number,
  data: PickerData,
  onChange: (index: number, cx: Context) => void,
): Element => {
  return h_flex()
    .flex_none()
    .p(spacing.xsmall)
    .gap(spacing.xxsmall)
    .overflow_hidden()
    .border_t(spacing.hairline)
    .border_color(colors().border)
    .children(
      statusFilters.map((filter, index) => filterChip(filter, index, activeIndex, data, onChange)),
    );
};
