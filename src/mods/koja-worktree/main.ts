import type { InputState } from 'gpui-base';
import { InputState as InputStates, v_flex } from 'gpui-base';
import type { AsyncContext, Context, Element, FocusHandle, KeyEvent } from 'gpui-kit';
import { div, View } from 'gpui-kit';
import { props, run, spaces } from 'herdr';

import type { GroveAction } from '../../kit/index.ts';
import {
  closeOverlay,
  detailText,
  dialogButton,
  dialogFrame,
  overlaySize,
  recordOf,
  recordOverlayClose,
  spacing,
  stateLine,
  stringOf,
  textField,
} from '../../kit/index.ts';
import type { RemoveRisk, Workspace } from './grove.ts';
import { addArguments, removeArguments } from './grove.ts';
import { findWorktreeFolder, readRisk, readWorkspace, runGrove } from './workspace.ts';

type Phase =
  | { kind: 'checking' }
  | { kind: 'asking'; workspace: Workspace; risk: RemoveRisk }
  | { kind: 'running'; workspace: Workspace }
  | { kind: 'failed'; message: string; retry: Workspace | null };

// A refocus after the dialog has drawn, when the input can take the keyboard.
const refocusMilliseconds = 600;

const titles: Record<GroveAction, string> = { new: 'New worktree', remove: 'Remove worktree' };

const riskText: Record<'changes' | 'agent', string> = {
  changes: 'It has uncommitted changes. Removing it deletes them.',
  agent: 'An agent runs in its space. Removing it stops the agent.',
};

const readAction = (value: unknown): GroveAction | null => {
  const action = stringOf(recordOf(value)['action']);

  return action === 'new' || action === 'remove' ? action : null;
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const failedPhase = (message: string, retry: Workspace | null = null): Phase => ({
  kind: 'failed',
  message,
  retry,
});

export default class Worktree extends View {
  private action: GroveAction | null = null;

  private phase: Phase = { kind: 'checking' };

  private input!: InputState;

  private focused = true;

  private handle: FocusHandle | null = null;

  // The error box scrolls only under a fixed height. A max height, even beside a fixed one, stops
  // the wheel. Wrapped text has no height before it is drawn, so its drawn height sizes the box.
  private messageHeight: number | null = null;

  override init(_props: unknown, cx: AsyncContext): void {
    this.action = readAction(props());
    this.input = InputStates.new({ value: '' });

    this.input.on('submit', (_event, submitCx) => {
      this.start(submitCx);
    });

    this.input.on('focus', (_event, focusCx) => {
      this.focused = true;
      focusCx.notify();
    });

    this.input.on('blur', (_event, blurCx) => {
      this.focused = false;
      blurCx.notify();
    });

    this.handle = cx.focus_handle();
    this.handle.focus();

    if (this.action === 'new') {
      this.input.focus();

      cx.timer.after(refocusMilliseconds, () => {
        this.input.focus();
      });
    }

    cx.spawn(async (taskCx) => {
      const checked = await this.check().catch((error: unknown) =>
        failedPhase(errorMessage(error)),
      );

      if (checked.kind === 'asking' && this.action === 'remove' && checked.risk === null) {
        await this.remove(checked.workspace, false, taskCx);

        return;
      }

      this.phase = checked;
      taskCx.notify();
    });
  }

  private async check(): Promise<Phase> {
    const space = spaces().find(
      (candidate) => candidate.id === stringOf(recordOf(props())['space']),
    );

    if (this.action === null) {
      return failedPhase('The dialog got no worktree action.');
    }

    if (space === undefined) {
      return failedPhase('The space is gone.');
    }

    const workspace = await readWorkspace(space);
    const risk = this.action === 'remove' ? await readRisk(workspace) : null;

    return { kind: 'asking', workspace, risk };
  }

  private dismiss(): void {
    recordOverlayClose();
    closeOverlay();
  }

  private start(cx: Context): void {
    const workspace = this.workspaceToRun();

    if (workspace === null) {
      return;
    }

    cx.spawn(async (taskCx) => {
      await (this.action === 'new'
        ? this.add(workspace, taskCx)
        : this.remove(workspace, true, taskCx));
    });
  }

  private workspaceToRun(): Workspace | null {
    if (this.phase.kind === 'asking') {
      return this.phase.workspace;
    }

    return this.phase.kind === 'failed' ? this.phase.retry : null;
  }

  private async remove(workspace: Workspace, confirmed: boolean, cx: AsyncContext): Promise<void> {
    await this.running(workspace, cx, async () => {
      const failure = await runGrove(workspace, removeArguments(workspace.name, confirmed));

      if (failure !== null) {
        return failedPhase(failure);
      }

      this.dismiss();
      run('space.close', { id: workspace.space, confirmed: true });

      return null;
    });
  }

  private async add(workspace: Workspace, cx: AsyncContext): Promise<void> {
    const branch = this.input.value().trim();

    if (branch === '') {
      return;
    }

    await this.running(workspace, cx, async () => {
      const failure = await runGrove(workspace, addArguments(branch));

      if (failure !== null) {
        return failedPhase(failure, workspace);
      }

      const folder = await findWorktreeFolder(workspace, branch);

      if (folder === null) {
        return failedPhase(`Grove added ${branch}, but its folder was not found.`);
      }

      this.dismiss();
      run('space.new', { folder, machine: workspace.machine ?? '' });

      return null;
    });
  }

  private async running(
    workspace: Workspace,
    cx: AsyncContext,
    work: () => Promise<Phase | null>,
  ): Promise<void> {
    this.phase = { kind: 'running', workspace };
    cx.notify();

    const next = await work().catch((error: unknown) => failedPhase(errorMessage(error)));

    if (next !== null) {
      this.phase = next;
      cx.notify();
    }
  }

  private keyDown(event: KeyEvent, cx: Context): void {
    if (event.key === 'escape') {
      this.dismiss();
    } else if (event.key === 'enter' && this.action === 'remove') {
      this.start(cx);
    } else {
      return;
    }

    cx.stop_propagation();
  }

  private status(): Element | null {
    if (this.phase.kind === 'checking') {
      return stateLine({ kind: 'loading', text: 'Checking the worktree…' });
    }

    if (this.phase.kind === 'running') {
      return stateLine({ kind: 'loading', text: 'Running Grove…' });
    }

    if (this.phase.kind !== 'failed') {
      return null;
    }

    const message = stateLine({ kind: 'error', text: this.phase.message, wrap: true })
      .id('worktree-error-text')
      .on_size_change((size, cx) => {
        this.measureMessage(size.height, cx);
      });

    const box = div().id('worktree-error');

    if (this.messageHeight === null) {
      box.max_h(overlaySize.groveMessageHeight);
    } else {
      box.h(Math.min(this.messageHeight, overlaySize.groveMessageHeight));
    }

    return box.overflow_y_scrollbar().child(message);
  }

  private measureMessage(height: number, cx: Context): void {
    if (height === this.messageHeight) {
      return;
    }

    this.messageHeight = height;
    cx.notify();
  }

  private body(): Element {
    const body = v_flex().gap(spacing.small);

    if (this.action === 'new') {
      body.child(textField(this.input, this.focused));
    }

    if (this.phase.kind === 'asking' && this.phase.risk !== null) {
      body.child(detailText(riskText[this.phase.risk]));
    }

    const status = this.status();

    return status === null ? body : body.child(status);
  }

  private actions(): Element[] {
    const cancel = dialogButton({ label: 'Cancel', kind: 'outline' }).on_click(() => {
      this.dismiss();
    });

    if (this.workspaceToRun() === null) {
      return [cancel];
    }

    const label = this.action === 'new' ? 'Create' : 'Remove';
    const kind = this.action === 'new' ? 'solid' : 'danger';

    const main = dialogButton({ label, kind }).on_click((_event, cx) => {
      this.start(cx);
    });

    return [cancel, main];
  }

  override render(): Element {
    const frame = dialogFrame({
      id: 'worktree',
      title: this.action === null ? 'Worktree' : titles[this.action],
      body: this.body(),
      actions: this.actions(),
    }).on_key_down((event, cx) => {
      this.keyDown(event, cx);
    });

    return this.handle === null ? frame : frame.track_focus(this.handle);
  }
}
