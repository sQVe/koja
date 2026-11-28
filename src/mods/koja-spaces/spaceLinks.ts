import type { RowModel } from './listModel.ts';

export interface SpaceLinks {
  ticket: { id: string; url: string } | null;
  pull: { number: number; url: string } | null;
  branch: string | null;
}

const ticketLinkOf = (model: RowModel): SpaceLinks['ticket'] => {
  if (model.ticket === null) {
    return null;
  }

  return { id: model.ticket.id, url: model.ticket.url };
};

const checkedOutPullOf = (model: RowModel): SpaceLinks['pull'] => {
  const checkedOut = model.stack?.pulls.find((pull) => pull.checkedOut);
  const number = checkedOut?.number ?? null;
  const url = checkedOut?.url ?? null;

  if (number === null || url === null) {
    return null;
  }

  return { number, url };
};

const pullLinkOf = (model: RowModel): SpaceLinks['pull'] => {
  if (model.stack !== null) {
    return checkedOutPullOf(model);
  }

  if (model.pull === null) {
    return null;
  }

  return { number: model.pull.number, url: model.pull.url };
};

export const spaceLinksOf = (model: RowModel): SpaceLinks => ({
  ticket: ticketLinkOf(model),
  pull: pullLinkOf(model),
  branch: model.row.git?.branch ?? null,
});
