import type { Context, Element } from 'gpui-kit';

import type { DataState } from '../../data/consumer.ts';
import type { TicketFacts } from '../../data/snapshot.ts';
import { linkText, spaceFooter } from '../../kit/index.ts';
import type { ListModel, RowModel } from './listModel.ts';
import { stackProgressOf } from './progress.ts';
import { isMain } from './projects.ts';
import { rowTitleOf } from './rows.ts';

const titleOf = (model: RowModel): string => {
  if (isMain(model.row)) {
    return model.project;
  }

  const { space } = model.row;

  return rowTitleOf(space.named, space.name, model.pull, model.ticketTitle);
};

const linkOf = (text: string, url: string): Element =>
  linkText(text).on_click((_event, cx: Context) => {
    cx.open_url(url);
  });

const ticketLinksOf = (ticket: TicketFacts | null): Element[] => {
  if (ticket === null) {
    return [];
  }

  return [linkOf(ticket.id, ticket.url)];
};

const pullLinksOf = (model: RowModel): Element[] => {
  if (model.pull === null) {
    return [];
  }

  return [linkOf(`#${model.pull.number}`, model.pull.url)];
};

export const selectedFooter = (
  state: DataState,
  model: ListModel,
  activeId: string | null,
): Element | null => {
  if (state.kind === 'unavailable' || activeId === null) {
    return null;
  }

  const rowModel = model.rows.get(activeId);

  if (rowModel === undefined) {
    return null;
  }

  const progress = stackProgressOf(rowModel.stack);

  return spaceFooter({
    title: titleOf(rowModel),
    ...(progress === null ? {} : { progress }),
    links: [...ticketLinksOf(rowModel.ticket), ...pullLinksOf(rowModel)],
  });
};
