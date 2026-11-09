import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import { icon } from '../../../../kit/index.ts';
import { dot, fixedLabel, label, row } from '../parts.ts';
import type { DirectionTokens } from '../tokens.ts';
import { fileStatusInk } from './changes.ts';
import type { FakeTreeEntry } from './data.ts';
import { fileTree } from './data.ts';

const levelIndent = 12;
const chevronWidth = 12;
const iconGap = 4;
const statusWidth = 12;
const changedDotSize = 5;

const chevron = (entry: FakeTreeEntry, tokens: DirectionTokens): Element => {
  const slot = h_flex().w(chevronWidth).flex_none().items_center().justify_center();

  if (!entry.folder) {
    return slot;
  }

  const name = entry.open ? 'chevron-down' : 'chevron-right';

  return slot.child(icon(name, 'xsmall').text_color(tokens.ink.dim));
};

const entryIcon = (entry: FakeTreeEntry, tokens: DirectionTokens): Element => {
  if (!entry.folder) {
    return icon('file', 'small').text_color(tokens.ink.dim);
  }

  const name = entry.open ? 'folder-open' : 'folder';

  return icon(name, 'small').text_color(tokens.ink.muted);
};

const entryEnd = (entry: FakeTreeEntry, tokens: DirectionTokens): Element[] => {
  const slot = h_flex().w(statusWidth).flex_none().items_center().justify_center();

  if (entry.status !== undefined) {
    return [
      slot.child(fixedLabel(entry.status, tokens.text.title, fileStatusInk(entry.status, tokens))),
    ];
  }

  return entry.changed ? [slot.child(dot(changedDotSize, tokens.marks.modified))] : [];
};

const treeRow = (entry: FakeTreeEntry, tokens: DirectionTokens): Element =>
  row(
    {
      selected: false,
      start: h_flex()
        .flex_none()
        .pl(entry.depth * levelIndent)
        .gap(iconGap)
        .items_center()
        .child(chevron(entry, tokens))
        .child(entryIcon(entry, tokens)),
      label: label(entry.name, tokens.text.body, tokens.ink.text),
      end: entryEnd(entry, tokens),
    },
    tokens,
  );

const fileListOf = (entries: FakeTreeEntry[], tokens: DirectionTokens): Element =>
  v_flex()
    .flex_none()
    .py(tokens.rows.listPadding)
    .gap(tokens.rows.gap)
    .children(entries.map((entry) => treeRow(entry, tokens)));

export const fileList = (tokens: DirectionTokens): Element => fileListOf(fileTree, tokens);

export const fileFacts = (tokens: DirectionTokens): Element[] => [
  fixedLabel('koja', tokens.text.detail, tokens.ink.dim),
];
