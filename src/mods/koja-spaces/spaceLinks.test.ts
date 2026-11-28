import { afterAll, describe, expect, test } from 'bun:test';

import { clickablesWithText, openedUrls } from '../../../tests/drawn.ts';
import {
  loadSelectedFooter,
  restoreKojaSpaces,
  setupKojaSpaces,
} from '../../../tests/kojaSpacesView.ts';
import { pullFacts } from '../../../tests/pullFacts.ts';
import {
  checkedOutStack,
  liveState,
  modelOf,
  rowModelOf,
} from '../../../tests/rowModelFixtures.ts';
import type { TicketFacts } from '../../data/snapshot.ts';
import type { RowModel } from './listModel.ts';
import { spaceLinksOf } from './spaceLinks.ts';

await setupKojaSpaces();

const selectedFooter = await loadSelectedFooter();

afterAll(() => {
  restoreKojaSpaces();
});

const stackSpaceOf = (options: {
  pull?: RowModel['pull'];
  ticket?: TicketFacts | null;
  stack?: RowModel['stack'];
}) =>
  rowModelOf({
    id: 'w',
    branch: 'me-11-eleven',
    folder: '/code/me-11-eleven',
    ...options,
  });

const ticket: TicketFacts = {
  id: 'ME-11',
  title: 'The eleven ticket',
  state: 'In Progress',
  url: 'https://linear.app/koja/issue/ME-11',
  parent: null,
};

describe('spaceLinksOf', () => {
  test('a space with no git has no branch and no pull', () => {
    const withGit = stackSpaceOf({});
    const model: RowModel = { ...withGit, row: { ...withGit.row, git: null } };

    expect(spaceLinksOf(model)).toEqual({ ticket: null, pull: null, branch: null });
  });

  test('a populated space gives its ticket, the pull its stack checks out, and its branch', () => {
    const model = stackSpaceOf({
      ticket,
      pull: pullFacts({ number: 99, headRefName: 'me-11-eleven' }),
      stack: checkedOutStack({
        branch: 'me-11-eleven',
        number: 11,
        url: 'https://example.invalid/koja/pull/11',
      }),
    });

    expect(spaceLinksOf(model)).toEqual({
      ticket: { id: 'ME-11', url: 'https://linear.app/koja/issue/ME-11' },
      pull: { number: 11, url: 'https://example.invalid/koja/pull/11' },
      branch: 'me-11-eleven',
    });
  });

  test('the footer and the menu name the same pull', () => {
    const checkedOut = { number: 11, url: 'https://example.invalid/koja/pull/11' };

    const branchPull = pullFacts({
      number: 99,
      headRefName: 'me-11-eleven',
      url: 'https://example.invalid/koja/pull/99',
    });

    const model = rowModelOf({
      id: 'w',
      branch: 'me-11-eleven',
      folder: '/code/me-11-eleven',
      pull: branchPull,
      stack: checkedOutStack({ branch: 'me-11-eleven', ...checkedOut }),
    });

    const footer = selectedFooter(liveState, modelOf([model]), 'w');

    if (footer === null) {
      throw new Error('The selected space draws no footer.');
    }

    expect(spaceLinksOf(model).pull).toEqual(checkedOut);
    expect(openedUrls(footer, `#${checkedOut.number}`)).toEqual([checkedOut.url]);
    expect(clickablesWithText(footer, `#${branchPull.number}`)).toEqual([]);
  });
});
