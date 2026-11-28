import type { AsyncContext, Context, Element } from 'gpui-kit';
import { div, View } from 'gpui-kit';
import { agents, focused, props, run, terminals } from 'herdr';

import { unseenAskAddresses } from '../../data/asks.ts';
import {
  actionButton,
  closeOverlay,
  currentWindow,
  recordOverlayClose,
  toastCard,
  toastCommandBody,
} from '../../kit/index.ts';
import { hidesAsk } from './hideAsk.ts';
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

  private hidden = false;

  override init(_props: unknown, _cx: AsyncContext): void {
    this.toast = readToastProps(props());
  }

  private activate(): void {
    const { action, overlay } = this.toast;

    recordOverlayClose();
    closeOverlay(overlay);

    if (action !== null) {
      run(action.name, action.args);
    }
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

  private shownAskAddresses(): ReadonlySet<string> {
    const sources = {
      terminals: terminals(),
      agents: agents(),
      projects: new Map<string, string>(),
    };

    const view = {
      focusedTab: focused()?.tab ?? null,
      windowActive: currentWindow()?.active === true,
    };

    return unseenAskAddresses(sources, view);
  }

  private hide(cx: Context): void {
    if (this.hidden) {
      return;
    }

    this.hidden = true;

    cx.spawn(async () => {
      await Promise.resolve();
      closeOverlay(this.toast.overlay);
    });
  }

  override render(cx: Context): Element {
    if (hidesAsk(this.toast.action, this.shownAskAddresses())) {
      this.hide(cx);

      return div();
    }

    const { content, fitHeight, icon, level } = this.toast;
    const parts = this.parts(content);
    const cardIcon = icon === null ? null : { path: icon, tint: false };

    return toastCard({
      id: toastId,
      level,
      icon: cardIcon,
      title: parts.title,
      body: parts.body,
      fitHeight,
    }).on_click(() => {
      this.activate();
    });
  }
}
