import type { AsyncContext, Context, Element, Task } from 'gpui-kit';
import { div, View } from 'gpui-kit';
import { agents, checking, focused, props, run, shared, terminals } from 'herdr';

import { asksOf, askViewOf, cardAsks, handledAsksKey } from '../../data/asks.ts';
import {
  actionButton,
  closeOverlay,
  currentWindow,
  recordOverlayClose,
  repeat,
  stringListOf,
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

const hideCheckMilliseconds = 100;

// The hide rule reads no project name, so the toast passes none.
const noProjects = new Map<string, string>();

export default class Toast extends View {
  private toast!: ToastProps;

  private copied = false;

  private hidden = false;

  private task: Task | null = null;

  override init(_props: unknown, cx: AsyncContext): void {
    this.toast = readToastProps(props());

    if (this.check()) {
      this.hidden = true;
      closeOverlay(this.toast.overlay);

      return;
    }

    if (this.toast.action?.name === 'agent.focus' && !checking()) {
      this.task = repeat(cx, hideCheckMilliseconds, (taskCx) => {
        this.recheck(taskCx);
      });
    }
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

  private cardAskAddresses(): ReadonlySet<string> {
    const sources = {
      terminals: terminals(),
      agents: agents(),
      projects: noProjects,
    };

    const live = asksOf(sources);
    const view = askViewOf(focused(), currentWindow());
    const handled = stringListOf(shared(handledAsksKey));
    const addresses = cardAsks(live, view, handled).map((ask) => ask.address);

    return new Set(addresses);
  }

  private check(): boolean {
    return hidesAsk(this.toast.action, () => this.cardAskAddresses());
  }

  private recheck(cx: AsyncContext): void {
    if (!this.check()) {
      return;
    }

    this.hidden = true;
    cx.notify();
    closeOverlay(this.toast.overlay);
    this.task?.cancel();
  }

  override render(): Element {
    if (this.hidden) {
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
