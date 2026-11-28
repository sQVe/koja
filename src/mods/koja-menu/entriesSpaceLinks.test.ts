import { describe, expect, test } from 'bun:test';

import type { Context } from 'gpui-kit';

import type { MenuAction, MenuEntry, MenuHost } from './entries.ts';
import { isAction, menuEntries, readMenuProps } from './entries.ts';

interface Recorder {
  cx: Context;
  opened: string[];
  copied: string[];
}

const host: MenuHost = {
  run: () => undefined,
  openWorktreeDialog: () => undefined,
  openGroveDialog: () => undefined,
  terminals: () => [],
  panes: () => [],
  themes: () => [],
};

const recorder = (): Recorder => {
  const opened: string[] = [];
  const copied: string[] = [];

  const cx = {
    open_url: (url: string) => {
      opened.push(url);
    },
    write_to_clipboard: (text: string) => {
      copied.push(text);
    },
  } as unknown as Context;

  return { cx, opened, copied };
};

const spaceProps = (links: Record<string, unknown>): unknown => ({
  tab: 'space',
  target: { id: 'space-1' },
  ...links,
});

const entriesOf = (links: Record<string, unknown>): MenuEntry[] =>
  menuEntries(readMenuProps(spaceProps(links)), null, host);

const labelsOf = (links: Record<string, unknown>): string[] =>
  entriesOf(links).map((entry) => (entry.kind === 'error' ? entry.text : entry.label));

const actionOf = (links: Record<string, unknown>, label: string): MenuAction => {
  const entry = entriesOf(links).find(
    (candidate): candidate is MenuAction => isAction(candidate) && candidate.label === label,
  );

  if (entry === undefined) {
    throw new Error(`The space menu draws no ${label} entry.`);
  }

  return entry;
};

const groupOf = (links: Record<string, unknown>, label: string): boolean | undefined =>
  entriesOf(links)
    .filter(isAction)
    .find((entry) => entry.label === label)?.group;

const ticket = { id: 'ME-1182', url: 'https://linear.app/sqve/issue/ME-1182' };

const pull = { number: 505, url: 'https://example.invalid/koja/pull/505' };

const branch = 'me-1182-space-menu-links';

describe('space menu links', () => {
  test('the space menu lists the ticket, PR, and branch entries for a space with all three', () => {
    expect(labelsOf({ ticket, pull, branch })).toEqual([
      'Rename',
      'Open ticket',
      'Open PR on GitHub',
      'Copy branch name',
      'Close',
    ]);
  });

  test('a space without a ticket or PR lists none of their entries', () => {
    expect(labelsOf({ branch })).toEqual(['Rename', 'Copy branch name', 'Close']);
  });

  test('a space with no facts keeps the entries it has today', () => {
    expect(labelsOf({})).toEqual(['Rename', 'Close']);
  });

  test('the first present link entry starts a new group', () => {
    expect(groupOf({ ticket, pull, branch }, 'Open ticket')).toBe(true);
    expect(groupOf({ ticket, pull, branch }, 'Open PR on GitHub')).toBe(false);
    expect(groupOf({ pull, branch }, 'Open PR on GitHub')).toBe(true);
    expect(groupOf({ branch }, 'Copy branch name')).toBe(true);
    expect(groupOf({}, 'Close')).toBe(true);
  });

  test('Open PR on GitHub opens the pull URL', () => {
    const { cx, opened } = recorder();

    actionOf({ pull }, 'Open PR on GitHub').action(cx);

    expect(opened).toEqual([pull.url]);
  });

  test('Open ticket opens the ticket URL', () => {
    const { cx, opened } = recorder();

    actionOf({ ticket }, 'Open ticket').action(cx);

    expect(opened).toEqual([ticket.url]);
  });

  test('Copy branch name writes the branch to the clipboard', () => {
    const { cx, copied } = recorder();

    actionOf({ branch }, 'Copy branch name').action(cx);

    expect(copied).toEqual([branch]);
  });

  test('a branch with spaces around it is copied without them', () => {
    const { cx, copied } = recorder();

    actionOf({ branch: `  ${branch}  ` }, 'Copy branch name').action(cx);

    expect(copied).toEqual([branch]);
  });

  test.each([
    ['a ticket URL that is not http or https', { ticket: { id: 'ME-1182', url: 'file:///tmp' } }],
    ['a pull URL that is not http or https', { pull: { number: 505, url: 'file:///tmp' } }],
    [
      'a URL whose port is not a number',
      { ticket: { id: 'ME-1182', url: 'https://example.invalid:notaport/1' } },
    ],
    [
      'a URL with a space after its host',
      { pull: { number: 505, url: 'https://example.invalid /1' } },
    ],
    ['a blank ticket id', { ticket: { id: '   ', url: ticket.url } }],
    ['a ticket without an id', { ticket: { url: ticket.url } }],
    ['a pull number that is not a whole number', { pull: { number: 5.5, url: pull.url } }],
    ['a pull number that is not a positive whole number', { pull: { number: 0, url: pull.url } }],
    ['a blank branch', { branch: '   ' }],
  ])('%s drops its entry', (_name, links) => {
    expect(labelsOf(links as Record<string, unknown>)).toEqual(['Rename', 'Close']);
  });
});
