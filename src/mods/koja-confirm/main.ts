import type { AsyncContext, Context, Element, FocusHandle, KeyEvent } from 'gpui-kit';
import { View } from 'gpui-kit';
import { props, run } from 'herdr';

import type { ConfirmDialog, DialogButtonKind } from '../../kit/index.ts';
import {
  closeOverlay,
  dialogButton,
  dialogFrame,
  readDialogCommand,
  recordOf,
  recordOverlayClose,
  stringOf,
} from '../../kit/index.ts';

const defaultTitle = 'Are you sure?';

const defaultAction = 'Confirm';

const readDialog = (value: unknown): ConfirmDialog => {
  const record = recordOf(value);

  return {
    title: stringOf(record['title']) ?? defaultTitle,
    detail: stringOf(record['detail']) ?? '',
    action: stringOf(record['action']) ?? defaultAction,
    destroys: record['destroys'] === true,
    command: readDialogCommand(record['command']),
  };
};

export default class Confirm extends View {
  private dialog!: ConfirmDialog;

  private handle: FocusHandle | null = null;

  override init(_props: unknown, cx: AsyncContext): void {
    this.dialog = readDialog(props());

    this.handle = cx.focus_handle();
    this.handle.focus();
  }

  private dismiss(): void {
    recordOverlayClose();
    closeOverlay();
  }

  private confirm(): void {
    this.dismiss();
    run(this.dialog.command.name, this.dialog.command.args);
  }

  private keyDown(event: KeyEvent, cx: Context): void {
    if (event.key === 'enter') {
      this.confirm();
    } else if (event.key === 'escape') {
      this.dismiss();
    } else {
      return;
    }

    cx.stop_propagation();
  }

  private actions(): Element[] {
    const mainKind: DialogButtonKind = this.dialog.destroys ? 'danger' : 'solid';

    const cancel = dialogButton({ label: 'Cancel', kind: 'outline' }).on_click(() => {
      this.dismiss();
    });

    const main = dialogButton({ label: this.dialog.action, kind: mainKind }).on_click(() => {
      this.confirm();
    });

    return [cancel, main];
  }

  override render(): Element {
    const frame = dialogFrame({
      id: 'confirm',
      title: this.dialog.title,
      detail: this.dialog.detail,
      actions: this.actions(),
    }).on_key_down((event, cx) => {
      this.keyDown(event, cx);
    });

    return this.handle === null ? frame : frame.track_focus(this.handle);
  }
}
