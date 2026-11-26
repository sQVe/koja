import type { InputState } from 'gpui-base';
import { InputState as InputStates, v_flex } from 'gpui-base';
import type { AsyncContext, Context, Element, FocusHandle, KeyEvent } from 'gpui-kit';
import { div, View } from 'gpui-kit';
import { checking, props, run, spaces } from 'herdr';

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
import { closeRiskText, refusedText, riskText } from './dialogText.ts';
import type { AgentRisk, RemoveRisks, Workspace } from './grove.ts';
import { addArguments, removeArguments, sameRisks } from './grove.ts';
import {
  findWorktreeFolder,
  readAgentRisks,
  readRisk,
  readWorkspace,
  runGrove,
} from './workspace.ts';

type FindingPhase = Extract<Phase, { kind: 'finding' }>;

type ClosingPhase = Extract<Phase, { kind: 'closing' }>;

type Phase =
  | { kind: 'checking' }
  | { kind: 'asking'; workspace: Workspace; risks: RemoveRisks }
  | { kind: 'closing'; workspace: Workspace; risks: AgentRisk[] }
  | { kind: 'running'; workspace: Workspace }
  | { kind: 'failed'; message: string; retry: Workspace | null }
  | { kind: 'finding'; message: string; workspace: Workspace; branch: string };

// A refocus after the dialog has drawn, when the input can take the keyboard.
const refocusMilliseconds = 600;

const titles: Record<GroveAction, string> = { new: 'New worktree', remove: 'Remove worktree' };

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

const findingPhase = (message: string, workspace: Workspace, branch: string): Phase => ({
  kind: 'finding',
  message,
  workspace,
  branch,
});

export default class Worktree extends View {
  private action: GroveAction | null = null;

  private phase: Phase = { kind: 'checking' };

  private dismissed = false;

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

    if (checking()) {
      return;
    }

    cx.spawn(async (taskCx) => {
      const checked = await this.check().catch((error: unknown) =>
        failedPhase(errorMessage(error)),
      );

      if (checked === null || this.isDismissed()) {
        return;
      }

      if (checked.kind === 'asking' && this.action === 'remove' && checked.risks.length === 0) {
        await this.remove(checked.workspace, [], taskCx);

        return;
      }

      this.phase = checked;
      taskCx.notify();
    });
  }

  private async check(): Promise<Phase | null> {
    const space = spaces().find(
      (candidate) => candidate.id === stringOf(recordOf(props())['space']),
    );

    if (this.action === null) {
      return failedPhase('The dialog got no worktree action.');
    }

    if (space === undefined) {
      return failedPhase('The space is gone.');
    }

    const workspace = await readWorkspace(space, () => this.isDismissed());

    if (this.isDismissed()) {
      return null;
    }

    const risks = this.action === 'remove' ? await readRisk(workspace) : [];

    return { kind: 'asking', workspace, risks };
  }

  private isDismissed(): boolean {
    return this.dismissed;
  }

  private dismiss(): void {
    this.dismissed = true;
    recordOverlayClose();
    closeOverlay();
  }

  override close(): void {
    this.dismissed = true;
    recordOverlayClose();
  }

  private start(cx: Context): void {
    if (this.isDismissed()) {
      return;
    }

    if (this.phase.kind === 'finding') {
      this.startFinding(this.phase, cx);

      return;
    }

    if (this.phase.kind === 'closing') {
      this.startClosing(this.phase, cx);

      return;
    }

    const workspace = this.workspaceToRun();

    if (workspace === null) {
      return;
    }

    if (this.action === 'new') {
      this.startAdd(workspace, cx);

      return;
    }

    if (this.phase.kind === 'asking') {
      this.startRemove(workspace, this.phase.risks, cx);
    }
  }

  private startFinding(phase: FindingPhase, cx: Context): void {
    const { workspace, branch } = phase;

    this.begin(workspace, cx);

    cx.spawn(async (taskCx) => {
      await this.running(workspace, taskCx, () => this.openFolder(workspace, branch));
    });
  }

  private startClosing(phase: ClosingPhase, cx: Context): void {
    const { workspace, risks } = phase;

    this.begin(workspace, cx);

    cx.spawn(async (taskCx) => {
      await this.running(workspace, taskCx, () => this.closeWhenUnchanged(workspace, risks));
    });
  }

  private startAdd(workspace: Workspace, cx: Context): void {
    const branch = this.input.value().trim();

    if (branch === '') {
      return;
    }

    this.begin(workspace, cx);

    cx.spawn(async (taskCx) => {
      await this.add(workspace, branch, taskCx);
    });
  }

  private startRemove(workspace: Workspace, shown: RemoveRisks, cx: Context): void {
    this.begin(workspace, cx);

    cx.spawn(async (taskCx) => {
      await this.remove(workspace, shown, taskCx);
    });
  }

  private begin(workspace: Workspace, cx: Context): void {
    this.phase = { kind: 'running', workspace };
    cx.notify();
  }

  private workspaceToRun(): Workspace | null {
    if (this.phase.kind === 'asking') {
      return this.phase.workspace;
    }

    return this.phase.kind === 'failed' ? this.phase.retry : null;
  }

  private async remove(workspace: Workspace, shown: RemoveRisks, cx: AsyncContext): Promise<void> {
    await this.running(workspace, cx, async () => {
      const risks = await readRisk(workspace);

      if (this.isDismissed()) {
        return null;
      }

      if (!sameRisks(shown, risks)) {
        return { kind: 'asking', workspace, risks };
      }

      const built = removeArguments(workspace.name, risks.includes('changes'));

      if (built.kind === 'refused') {
        return failedPhase(refusedText(built));
      }

      const failure = await runGrove(workspace, built.args);

      if (this.isDismissed()) {
        return null;
      }

      if (failure !== null) {
        return failedPhase(failure);
      }

      const agentRisks = readAgentRisks(workspace);
      const agentAppeared = agentRisks.includes('agent') && !shown.includes('agent');

      if (agentAppeared) {
        return { kind: 'closing', workspace, risks: agentRisks };
      }

      this.dismiss();
      run('space.close', { id: workspace.space, confirmed: true });

      return null;
    });
  }

  private closeWhenUnchanged(workspace: Workspace, shown: RemoveRisks): Phase | null {
    const risks = readAgentRisks(workspace);

    if (this.isDismissed()) {
      return null;
    }

    const agentAppeared = risks.includes('agent') && !shown.includes('agent');

    if (agentAppeared) {
      return { kind: 'closing', workspace, risks };
    }

    this.dismiss();
    run('space.close', { id: workspace.space, confirmed: true });

    return null;
  }

  private async add(workspace: Workspace, branch: string, cx: AsyncContext): Promise<void> {
    await this.running(workspace, cx, async () => {
      const built = addArguments(branch);

      if (built.kind === 'refused') {
        return failedPhase(refusedText(built), workspace);
      }

      const failure = await runGrove(workspace, built.args);

      if (this.isDismissed()) {
        return null;
      }

      if (failure !== null) {
        return failedPhase(failure, workspace);
      }

      return this.openFolder(workspace, branch);
    });
  }

  private async openFolder(workspace: Workspace, branch: string): Promise<Phase | null> {
    try {
      const folder = await findWorktreeFolder(workspace, branch);

      if (this.isDismissed()) {
        return null;
      }

      if (folder === null) {
        return findingPhase(
          `Grove added ${branch}, but its folder was not found.`,
          workspace,
          branch,
        );
      }

      this.dismiss();
      run('space.new', { folder, machine: workspace.machine ?? '' });

      return null;
    } catch (error) {
      if (this.isDismissed()) {
        return null;
      }

      return findingPhase(errorMessage(error), workspace, branch);
    }
  }

  private async running(
    workspace: Workspace,
    cx: AsyncContext,
    work: () => Phase | null | Promise<Phase | null>,
  ): Promise<void> {
    this.phase = { kind: 'running', workspace };
    cx.notify();

    const next = await Promise.resolve(work()).catch((error: unknown) =>
      failedPhase(errorMessage(error)),
    );

    if (this.isDismissed()) {
      return;
    }

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

    if (this.phase.kind !== 'failed' && this.phase.kind !== 'finding') {
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

    // A finding retries the lookup for the branch Grove already added, so its field has nothing to
    // accept.
    if (this.action === 'new' && this.phase.kind !== 'finding') {
      body.child(textField(this.input, this.focused));
    }

    if (this.phase.kind === 'asking') {
      for (const risk of this.phase.risks) {
        body.child(detailText(riskText[risk]));
      }
    }

    if (this.phase.kind === 'closing') {
      for (const risk of this.phase.risks) {
        body.child(detailText(closeRiskText[risk]));
      }
    }

    const status = this.status();

    return status === null ? body : body.child(status);
  }

  private actions(): Element[] {
    const cancel = dialogButton({ label: 'Cancel', kind: 'outline' }).on_click(() => {
      this.dismiss();
    });

    if (this.phase.kind === 'finding') {
      const retry = dialogButton({ label: 'Find folder', kind: 'solid' }).on_click((_event, cx) => {
        this.start(cx);
      });

      return [cancel, retry];
    }

    if (this.phase.kind === 'closing') {
      const close = dialogButton({ label: 'Close', kind: 'danger' }).on_click((_event, cx) => {
        this.start(cx);
      });

      return [cancel, close];
    }

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

  private title(): string {
    if (this.phase.kind === 'closing') {
      return 'Close space';
    }

    return this.action === null ? 'Worktree' : titles[this.action];
  }

  override render(): Element {
    const title = this.title();

    const frame = dialogFrame({
      id: 'worktree',
      title,
      body: this.body(),
      actions: this.actions(),
    }).on_key_down((event, cx) => {
      this.keyDown(event, cx);
    });

    return this.handle === null ? frame : frame.track_focus(this.handle);
  }
}
