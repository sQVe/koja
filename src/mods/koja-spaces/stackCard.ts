import type { SpaceStack, StackPull } from '../../data/spaceStack.ts';
import type { StackCardModel, StackCardPull } from '../../kit/index.ts';
import type { RowModel } from './listModel.ts';
import { showsTitle } from './rows.ts';

const isMerged = (pull: StackPull): boolean => pull.state === 'merged';

const mergedNumbers = (pull: StackPull): number[] => (pull.number === null ? [] : [pull.number]);

const endOf = (pull: StackPull): StackCardPull['end'] => {
  if (pull.need !== null) {
    return pull.need;
  }

  if (pull.state === 'draft' || pull.state === 'closed') {
    return pull.state;
  }

  return null;
};

const cardPullOf = (pull: StackPull): StackCardPull => ({
  number: pull.number,
  ticket: pull.ticket,
  title: showsTitle(pull.title) ? pull.title : pull.branch,
  checkedOut: pull.checkedOut,
  end: endOf(pull),
});

const cardOf = (stack: SpaceStack, project: string, title: string): StackCardModel => ({
  title,
  project,
  merged: stack.pulls.filter(isMerged).flatMap(mergedNumbers),
  pulls: stack.pulls.filter((pull) => !isMerged(pull)).map(cardPullOf),
  total: stack.total,
});

export const stackCardOf = (model: RowModel, title: string): StackCardModel | null => {
  if (model.stack === null) {
    return null;
  }

  return cardOf(model.stack, model.project, title);
};
