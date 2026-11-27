import type { Context, Element } from 'gpui-kit';

import type { DataState } from '../../data/consumer.ts';
import type { Pull } from '../../data/pulls.ts';
import type { Facts, TicketFacts } from '../../data/snapshot.ts';
import { linkText, spaceFooter } from '../../kit/index.ts';
import type { ListModel, RowModel } from './listModel.ts';
import { stackProgressOf } from './progress.ts';

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

const pullOfNumber = (facts: Facts, repositoryKey: string, number: number): Pull | null =>
  facts.pulls[repositoryKey]?.pulls.find((pull) => pull.number === number) ?? null;

const footerPullOf = (facts: Facts, model: RowModel): Pull | null => {
  if (model.stack === null) {
    return model.pull;
  }

  const checkedOut = model.stack.pulls.find((pull) => pull.checkedOut);
  const number = checkedOut?.number ?? null;
  const repositoryKey = model.row.git?.repo.key;

  if (number === null || repositoryKey === undefined) {
    return null;
  }

  return pullOfNumber(facts, repositoryKey, number);
};

const pullLinksOf = (pull: Pull | null): Element[] => {
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
  const pull = footerPullOf(state.snapshot.facts, rowModel);

  return spaceFooter({
    title: rowModel.title,
    ...(progress === null ? {} : { progress }),
    links: [...ticketLinksOf(rowModel.ticket), ...pullLinksOf(pull)],
  });
};
