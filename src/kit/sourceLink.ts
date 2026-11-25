import type { Element } from 'gpui-kit';

import { linkText } from './text.ts';

export type SourceTarget = 'GitHub' | 'Linear' | 'tikk';

export interface SourceLinkOptions {
  identifier: string;
  source: SourceTarget;
  // A GitHub identifier carries the repository it belongs to: `koja #41 · GitHub`.
  repository?: string;
}

const identityOf = (options: SourceLinkOptions): string =>
  options.repository === undefined
    ? options.identifier
    : `${options.repository} ${options.identifier}`;

export const sourceLink = (options: SourceLinkOptions): Element => {
  const text = `${identityOf(options)} · ${options.source}`;

  return linkText(text, 'middle').tooltip(text);
};
