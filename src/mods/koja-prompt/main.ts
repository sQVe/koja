import type { InputState } from 'gpui-base';
import { InputState as InputStates, v_flex } from 'gpui-base';
import type { AsyncContext, Context, Element, FocusHandle, KeyEvent } from 'gpui-kit';
import { View } from 'gpui-kit';
import { props, run } from 'herdr';

import type { PromptDialog } from '../../kit/index.ts';
import {
  closeOverlay,
  detailText,
  dialogButton,
  dialogFrame,
  readDialogCommand,
  recordOf,
  recordOverlayClose,
  spacing,
  stringOf,
  textField,
} from '../../kit/index.ts';

// A refocus after the dialog has drawn, when the input can take the keyboard.
const refocusMilliseconds = 600;

const capitalize = (text: string): string =>
  text.replace(/^./, (character) => character.toUpperCase());

const readDialog = (value: unknown): PromptDialog => {
  const record = recordOf(value);

  return {
    title: capitalize(stringOf(record['title']) ?? ''),
    value: stringOf(record['value']) ?? '',
    hint: stringOf(record['hint']) ?? '',
    command: readDialogCommand(record['command']),
  };
};

export default class Prompt extends View {
  private dialog!: PromptDialog;

  private input!: InputState;

  private focused = true;

  private handle: FocusHandle | null = null;

  override init(_props: unknown, cx: AsyncContext): void {
    this.dialog = readDialog(props());
    this.input = InputStates.new({ value: this.dialog.value });

    if (this.dialog.value !== '') {
      this.input.set_selected_range({ start: 0, end: this.dialog.value.length });
    }

    this.input.on('submit', () => {
      this.save();
    });

    this.input.on('focus', (_event, focusCx) => {
      this.focused = true;
      focusCx.notify();
    });

    this.input.on('blur', (_event, blurCx) => {
      this.focused = false;
      blurCx.notify();
    });

    this.input.focus();

    cx.timer.after(refocusMilliseconds, () => {
      this.input.focus();
    });

    this.handle = cx.focus_handle();
  }

  private dismiss(): void {
    recordOverlayClose();
    closeOverlay();
  }

  private save(): void {
    const name = this.input.value();

    this.dismiss();
    run(this.dialog.command.name, { ...this.dialog.command.args, name });
  }

  private keyDown(event: KeyEvent, cx: Context): void {
    if (event.key !== 'escape') {
      return;
    }

    this.dismiss();
    cx.stop_propagation();
  }

  private body(): Element {
    const field = v_flex().gap(spacing.small).child(textField(this.input, this.focused));

    if (this.dialog.hint !== '') {
      field.child(detailText(this.dialog.hint));
    }

    return field;
  }

  private actions(): Element[] {
    const cancel = dialogButton({ label: 'Cancel', kind: 'outline' }).on_click(() => {
      this.dismiss();
    });

    const save = dialogButton({ label: 'Save', kind: 'solid' }).on_click(() => {
      this.save();
    });

    return [cancel, save];
  }

  override render(): Element {
    const frame = dialogFrame({
      id: 'prompt',
      title: this.dialog.title,
      body: this.body(),
      actions: this.actions(),
    }).on_key_down((event, cx) => {
      this.keyDown(event, cx);
    });

    return this.handle === null ? frame : frame.track_focus(this.handle);
  }
}
