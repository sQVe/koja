import type { Context, Element } from 'gpui-kit';

import type { DataState } from '../../data/consumer.ts';
import { linkText, spaceFooter } from '../../kit/index.ts';
import type { ListModel } from './listModel.ts';
import { stackProgressOf } from './progress.ts';
import type { SpaceLinks } from './spaceLinks.ts';
import { spaceLinksOf } from './spaceLinks.ts';

const linkOf = (text: string, url: string): Element =>
  linkText(text).on_click((_event, cx: Context) => {
    cx.open_url(url);
  });

const ticketLinksOf = (ticket: SpaceLinks['ticket']): Element[] => {
  if (ticket === null) {
    return [];
  }

  return [linkOf(ticket.id, ticket.url)];
};

const pullLinksOf = (pull: SpaceLinks['pull']): Element[] => {
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
  const links = spaceLinksOf(rowModel);

  return spaceFooter({
    title: rowModel.title,
    ...(progress === null ? {} : { progress }),
    links: [...ticketLinksOf(links.ticket), ...pullLinksOf(links.pull)],
  });
};
