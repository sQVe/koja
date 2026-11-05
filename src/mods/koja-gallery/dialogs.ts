import type { InputState } from 'gpui-base';
import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';
import { div } from 'gpui-kit';

import type { DialogButtonKind } from '../../kit/index.ts';
import {
  colors,
  detailText,
  dialogButton,
  dialogFrame,
  overlaySize,
  spacing,
  textField,
} from '../../kit/index.ts';
import { sample } from './sample.ts';

const buttonRow = (hovered: boolean): Element =>
  h_flex()
    .gap(spacing.small)
    .items_center()
    .child(dialogButton({ label: 'Save', kind: 'solid', hovered }))
    .child(dialogButton({ label: 'Close', kind: 'danger', hovered }))
    .child(dialogButton({ label: 'Cancel', kind: 'outline', hovered }));

const button = (label: string, kind: DialogButtonKind): Element => dialogButton({ label, kind });

// The gallery itself paints `popover`, so each dialog sits on `chrome` to show the popup's edge.
const dialogSurface = (width: number, height: number, dialog: Element): Element =>
  div().p(spacing.medium).bg(colors().chrome).child(v_flex().w(width).h(height).child(dialog));

const confirmDialog = (): Element =>
  dialogFrame({
    id: 'dialog-confirm-sample',
    title: 'Close space?',
    detail: 'Its 2 tabs will close.',
    actions: [button('Cancel', 'outline'), button('Close', 'danger')],
  });

const promptDialog = (renameField: InputState): Element =>
  dialogFrame({
    id: 'dialog-prompt-sample',
    title: 'Rename tab',
    body: v_flex()
      .gap(spacing.small)
      .child(textField(renameField, true))
      .child(detailText('Names show in the tab bar.')),
    actions: [button('Cancel', 'outline'), button('Save', 'solid')],
  });

export const dialogs = (renameField: InputState): Element[] => [
  sample('Dialog buttons: normal', buttonRow(false)),
  sample('Dialog buttons: hovered', buttonRow(true)),
  sample(
    'Confirm: a red Close and an outlined Cancel',
    dialogSurface(overlaySize.confirmWidth, overlaySize.confirmHeight, confirmDialog()),
  ),
  sample(
    'Prompt: a text field with a value, a hint, and a filled Save',
    dialogSurface(overlaySize.promptWidth, overlaySize.promptHeight, promptDialog(renameField)),
  ),
];
