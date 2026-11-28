import type { AsyncContext, Context, Element } from 'gpui-kit';
import { View } from 'gpui-kit';
import { props, run } from 'herdr';

import { actionButton, closeOverlay, toastCard, toastCommandBody } from '../../kit/index.ts';
import type { ToastContent, ToastProps } from './toastProps.ts';
import { readToastProps } from './toastProps.ts';

type LoginContent = Extract<ToastContent, { kind: 'login' }>;

interface ToastParts {
  title: string;
  body: Element | string | null;
}

const toastId = 'toast';

export default class Toast extends View {
  private toast!: ToastProps;

  private copied = false;

  override init(_props: unknown, _cx: AsyncContext): void {
    this.toast = readToastProps(props());
  }

  private activate(): void {
    const { action, overlay } = this.toast;

    if (action !== null) {
      run(action.name, action.args);
    }

    closeOverlay(overlay);
  }

  private copyCommand(command: string, cx: Context): void {
    cx.stop_propagation();
    cx.write_to_clipboard(command);
    this.copied = true;
    cx.notify();
  }

  private loginBody(content: LoginContent): Element {
    const label = this.copied ? 'Copied' : 'Copy';

    const copy = actionButton({ label, enabled: true }).on_click((_event, cx) => {
      this.copyCommand(content.command, cx);
    });

    return toastCommandBody(content.command, copy);
  }

  private parts(content: ToastContent): ToastParts {
    if (content.kind === 'login') {
      return { title: `${content.machine} needs a login: run`, body: this.loginBody(content) };
    }

    return { title: content.title, body: content.body };
  }

  override render(): Element {
    const { content, fitHeight, icon, level } = this.toast;
    const parts = this.parts(content);

    return toastCard({
      id: toastId,
      level,
      icon,
      title: parts.title,
      body: parts.body,
      fitHeight,
    }).on_click(() => {
      this.activate();
    });
  }
}
