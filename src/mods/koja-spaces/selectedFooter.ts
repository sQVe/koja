import type { Context, Element } from 'gpui-kit';

import type { DataState } from '../../data/consumer.ts';
import type { TicketFacts } from '../../data/snapshot.ts';
import { linkText, spaceFooter } from '../../kit/index.ts';
import type { ListModel, RowModel } from './listModel.ts';
import { stackProgressOf } from './progress.ts';

interface PullLink {
  number: number;
  url: string;
}

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

const footerPullOf = (model: RowModel): PullLink | null => {
  if (model.stack === null) {
    return model.pull;
  }

  const checkedOut = model.stack.pulls.find((pull) => pull.checkedOut);

  if (checkedOut === undefined) {
    return null;
  }

  if (checkedOut.number === null || checkedOut.url === null) {
    return null;
  }

  return { number: checkedOut.number, url: checkedOut.url };
};

const pullLinksOf = (pull: PullLink | null): Element[] => {
  if (pull === null) {
    return [];
  }

  return [linkOf(`#${pull.number}`, pull.url)];
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
  const pull = footerPullOf(rowModel);

  return spaceFooter({
    title: rowModel.title,
    ...(progress === null ? {} : { progress }),
    links: [...ticketLinksOf(rowModel.ticket), ...pullLinksOf(pull)],
  });
};
