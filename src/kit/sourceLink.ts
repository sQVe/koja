import type { Element } from 'gpui-kit';

import { linkText } from './text.ts';

export type SourceLinkOptions =
  | { identifier: string; source: 'GitHub'; repository: string }
  | { identifier: string; source: 'Linear' | 'tikk' };

const identityOf = (options: SourceLinkOptions): string =>
  options.source === 'GitHub' ? `${options.repository} ${options.identifier}` : options.identifier;

export const sourceLink = (options: SourceLinkOptions): Element => {
  const text = `${identityOf(options)} · ${options.source}`;

  return linkText(text, 'middle').tooltip(text);
};
