import type { Context, Element } from 'gpui-kit';

import { rowHeight, spacing, viewSwitch } from '../../kit/index.ts';
import type { SidebarView } from './sidebarView.ts';
import { readSidebarView, sidebarViewKey } from './sidebarView.ts';
import type { KeyValueStore } from './storage.ts';

const viewOptions: { id: SidebarView; label: string }[] = [
  { id: 'projects', label: 'Projects' },
  { id: 'inbox', label: 'Inbox' },
];

export const viewBar = (store: KeyValueStore, onChange: (cx: Context) => void): Element =>
  viewSwitch({
    options: viewOptions,
    active: readSidebarView(store.get(sidebarViewKey)),
    onSelect: (view, cx) => {
      store.set(sidebarViewKey, view);
      onChange(cx);
    },
  })
    .h(rowHeight.small)
    .px(spacing.xsmall);
