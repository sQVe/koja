import type { Context, Element } from 'gpui-kit';

import { rowHeight, spacing, viewSwitch } from '../../kit/index.ts';
import { readSidebarView, sidebarViewKey } from './sidebarView.ts';

export interface SidebarViewStore {
  get: (key: string) => string | null;
  set: (key: string, value: string) => void;
}

export const viewBar = (store: SidebarViewStore, onChange: (cx: Context) => void): Element =>
  viewSwitch({
    options: [
      { id: 'projects', label: 'Projects' },
      { id: 'inbox', label: 'Inbox' },
    ],
    active: readSidebarView(store.get(sidebarViewKey)),
    onSelect: (view, cx) => {
      store.set(sidebarViewKey, view);
      onChange(cx);
    },
  })
    .h(rowHeight.small)
    .px(spacing.xsmall);
