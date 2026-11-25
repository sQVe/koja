import { describe, expect, test } from 'bun:test';

import { pullFacts } from '../../../tests/pullFacts.ts';
import type { Pull } from '../../data/pulls.ts';
import { rowCut, rowTitleOf } from './rows.ts';

const pull = (title: string): Pull => pullFacts({ number: 1, headRefName: 'main', title });

describe('rowTitleOf', () => {
  test('takes the ticket title for an unnamed space on a ticket branch', () => {
    const ticketTitle = 'Add the login form';
    const pullTitle = pull('Fix the login redirect');

    expect(rowTitleOf(true, 'login', pullTitle, ticketTitle)).toBe('login');
    expect(rowTitleOf(false, 'login', pullTitle, ticketTitle)).toBe(ticketTitle);
  });

  test('falls back to the pull title, then the space name', () => {
    expect(rowTitleOf(false, 'login', pull('Fix the login redirect'), null)).toBe(
      'Fix the login redirect',
    );

    expect(rowTitleOf(false, 'login', null, null)).toBe('login');
  });
});

describe('rowCut', () => {
  test('cuts a named space in the middle even when it has a pull title', () => {
    expect(rowCut(true, pull('Fix the login redirect'), null)).toBe('middle');
  });

  test('cuts an unnamed space without a pull or ticket title in the middle', () => {
    expect(rowCut(false, null, null)).toBe('middle');
  });

  test('cuts an unnamed space whose pull has no title in the middle', () => {
    expect(rowCut(false, pull(''), null)).toBe('middle');
  });

  test('cuts an unnamed space whose pull has a title at the end', () => {
    expect(rowCut(false, pull('Fix the login redirect'), null)).toBe('end');
  });

  test('cuts an unnamed space whose ticket has a title at the end', () => {
    expect(rowCut(false, null, 'Add the login form')).toBe('end');
  });
});
