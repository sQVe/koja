import type { Element } from 'gpui-kit';

import { linkText } from './text.ts';

// A GitHub link carries the repository it belongs to, so every link names its whole target.
export type LinkTarget = { source: 'GitHub'; repository: string } | { source: 'Linear' | 'tikk' };

export type SourceLinkOptions = LinkTarget & { identifier: string };

const identityOf = (options: SourceLinkOptions): string =>
  options.source === 'GitHub' ? `${options.repository} ${options.identifier}` : options.identifier;

export const sourceLink = (options: SourceLinkOptions): Element => {
  const text = `${identityOf(options)} · ${options.source}`;

  return linkText(text, 'middle').tooltip(text);
};
