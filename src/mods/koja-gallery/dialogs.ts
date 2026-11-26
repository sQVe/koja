import type { InputState } from 'gpui-base';
import { h_flex, v_flex } from 'gpui-base';
import type { Element } from 'gpui-kit';

import type { DialogButtonKind } from '../../kit/index.ts';
import {
  detailText,
  dialogButton,
  dialogFrame,
  overlaySize,
  spacing,
  textField,
} from '../../kit/index.ts';
import { sample, surfaceSample } from './sample.ts';

const buttonRow = (hovered: boolean): Element =>
  h_flex()
    .gap(spacing.small)
    .items_center()
    .child(dialogButton({ label: 'Save', kind: 'solid', hovered }))
    .child(dialogButton({ label: 'Close', kind: 'danger', hovered }))
    .child(dialogButton({ label: 'Cancel', kind: 'outline', hovered }));

const button = (label: string, kind: DialogButtonKind): Element => dialogButton({ label, kind });

const dialogSurface = (width: number, dialog: Element): Element => {
  const frame = v_flex().w(width).child(dialog);

  return surfaceSample('chrome', frame);
};

const confirmDialog = (): Element =>
  dialogFrame({
    id: 'dialog-confirm-sample',
    title: 'Close space “Design the sidebar”?',
    lines: [
      'Claude Code and Pi stop mid-task, and 4 tabs close.',
      'Its folder, uncommitted changes, and branch stay.',
    ],
    destructive: true,
    actions: [button('Cancel', 'outline'), button('Close', 'danger')],
  });

const promptDialog = (renameField: InputState): Element => {
  const body = v_flex()
    .gap(spacing.small)
    .child(textField(renameField, true))
    .child(detailText('Names show in the tab bar.'));

  return dialogFrame({
    id: 'dialog-prompt-sample',
    title: 'Rename tab',
    body,
    actions: [button('Cancel', 'outline'), button('Save', 'solid')],
  });
};

export const dialogs = (renameField: InputState): Element[] => [
  sample('Dialog buttons: normal', buttonRow(false)),
  sample('Dialog buttons: hovered', buttonRow(true)),
  sample(
    'Confirm: a red Close and an outlined Cancel',
    dialogSurface(overlaySize.confirmWidth, confirmDialog()),
  ),
  sample(
    'Prompt: a text field with a value, a hint, and a filled Save',
    dialogSurface(overlaySize.promptWidth, promptDialog(renameField)),
  ),
];
