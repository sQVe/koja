import type { InputState } from 'gpui-base';
import { h_flex, InputState as InputStates, v_flex } from 'gpui-base';
import type { AsyncContext, Context, Element, FocusHandle } from 'gpui-kit';
import { View } from 'gpui-kit';
import type { PaneInfo } from 'herdr';
import { focused, panes, spaces, watchFolder } from 'herdr';

import {
  actionButton,
  colors,
  diffSize,
  emptyState,
  repeat,
  spacing,
  textField,
  textSize,
} from '../../kit/index.ts';
import type { DiffRow } from './diffRows.ts';
import { diffRows } from './diffRows.ts';
import { commitAll, loadFileLines, readChanges } from './git.ts';
import type { ChangesSnapshot } from './git.ts';
import {
  diffArea,
  emptyMessage,
  fileListHeight,
  fileRow,
  headerRow,
  limitedNotice,
  noteRow,
} from './rows.ts';
import { showsSelectionHint } from './selection.ts';
import type { ChangeFile } from './status.ts';

interface Location {
  cwd: string | null;
  on: string | null;
}

const refreshMilliseconds = 10000;

const present = (value: string | null | undefined): value is string => Boolean(value);

const paneFor = (paneId: string | null | undefined): PaneInfo | null => {
  if (paneId === null || paneId === undefined) {
    return null;
  }

  return panes().find((candidate) => candidate.pane === paneId) ?? null;
};

const remoteFor = (terminal: string | null): string | null => {
  if (terminal?.includes('/') !== true) {
    return null;
  }

  return terminal.split('/')[0] ?? null;
};

const location = (): Location => {
  const activeSpace = spaces().find((space) => space.active);
  const current = focused();
  const pane = paneFor(current?.pane);
  const terminal = current?.terminal ?? null;

  const on = current?.pane === null ? remoteFor(terminal) : (activeSpace?.machine ?? null);

  const cwd = [pane?.cwd, current?.cwd, activeSpace?.folder].find(present) ?? null;

  return { cwd, on };
};

const key = (): string => JSON.stringify(location());

const hasText = (text: string): boolean => text.trim() !== '';

export default class Changes extends View {
  private files: ChangeFile[] = [];

  private rows: DiffRow[] = [];

  private diffWidth: number = diffSize.minimumWidth;

  private message = '';

  private typing = false;

  private handle: FocusHandle | null = null;

  private input!: InputState;

  private root: string | null = null;

  private on: string | null = null;

  private context: string | null = null;

  private watched: string | null = null;

  private open: string | null = null;

  private hasHead = false;

  private loading = false;

  private busy = false;

  private closed = false;

  private limited = false;

  private error: string | null = null;

  private note: string | null = null;

  override init(_props: unknown, cx: AsyncContext): void {
    this.handle = cx.focus_handle();
    this.input = InputStates.new({ placeholder: 'Commit message' });

    this.input.on('change', (_event, changeCx) => {
      const hadMessage = hasText(this.message);

      this.message = this.input.value();

      if (hadMessage !== hasText(this.message)) {
        changeCx.notify();
      }
    });

    this.input.on('submit', (_event, submitCx) => {
      this.commit(submitCx);
    });

    this.input.on('focus', (_event, focusCx) => {
      this.typing = true;
      focusCx.notify();
    });

    this.input.on('blur', (_event, blurCx) => {
      this.typing = false;
      blurCx.notify();
    });

    this.refresh(cx);

    repeat(cx, refreshMilliseconds, (timerCx) => {
      this.refresh(timerCx);
    });
  }

  override render(cx: Context): Element {
    if (key() !== this.context) {
      this.refresh(cx);
    }

    const palette = colors();
    const add = this.files.reduce((total, file) => total + file.add, 0);
    const del = this.files.reduce((total, file) => total + file.del, 0);
    const idle = !this.busy && !this.loading;
    const ready = this.root !== null && idle;
    const enabled = ready && hasText(this.message);

    const root = v_flex()
      .id('changes')
      .size_full()
      .min_h(0)
      .overflow_hidden()
      .text_color(palette.foreground)
      .text_size(textSize.default)
      .on_key_down((event, keyCx) => {
        if (event.key === 'escape' && this.typing) {
          this.typing = false;
          this.handle?.focus();
          keyCx.stop_propagation();
          keyCx.notify();
        }
      })
      .child(headerRow(this.files, add, del, palette));

    const list = v_flex()
      .id('changes-list')
      .flex_none()
      .h(fileListHeight(this.files.length))
      .overflow_y_scrollbar()
      .p(spacing.xsmall)
      .border_b(spacing.hairline)
      .border_color(palette.border)
      .children(
        this.files.map((file) =>
          fileRow(file, this.open === file.path, palette, (path) => {
            this.pick(path, cx);
          }),
        ),
      );

    if (this.files.length === 0) {
      list.child(emptyState(emptyMessage(this.error, this.loading, this.root)));
    }

    root.child(list);

    if (this.limited) {
      root.child(limitedNotice(palette));
    }

    root.child(
      diffArea(
        this.rows,
        this.diffWidth,
        showsSelectionHint(this.open, this.files.length),
        palette,
      ),
    );

    if (this.note !== null) {
      root.child(noteRow(this.note, palette));
    }

    root.child(
      h_flex()
        .flex_none()
        .p(spacing.large)
        .gap(spacing.medium)
        .border_t(spacing.hairline)
        .border_color(palette.border)
        .child(textField(this.input, this.typing).flex_1().min_w(0))
        .child(
          actionButton({ label: this.busy ? 'Committing…' : 'Commit', enabled })
            .id('commit')
            .on_click((_event, clickCx) => {
              this.commit(clickCx);
            }),
        ),
    );

    return this.handle === null ? root : root.track_focus(this.handle);
  }

  private refresh(cx: Context): void {
    if (this.loading || this.busy) {
      return;
    }

    const where = location();
    const context = key();

    if (context !== this.context) {
      this.context = context;
      this.root = null;
      this.files = [];
      this.open = null;
      this.setLines([]);
      this.message = '';
      this.input.set_value('');
      this.error = null;
      this.note = null;
      this.watched = null;
      this.closed = false;
      this.limited = false;
    }

    if (where.cwd === null) {
      return;
    }

    const cwd = where.cwd;

    this.loading = true;

    cx.spawn(async (taskCx) => {
      try {
        const result = await readChanges(cwd, where.on, () => key() === context);

        if (result === null || key() !== context) {
          return;
        }

        if (result.snapshot === null) {
          this.clearForError(result.error);
        } else {
          await this.applySnapshot(result.snapshot, context, taskCx);
        }
      } catch (error) {
        if (key() === context) {
          this.error = String(error);
        }
      } finally {
        this.loading = false;
        taskCx.notify();
      }
    });
  }

  private clearForError(error: string | null): void {
    this.root = null;
    this.files = [];
    this.setLines([]);
    this.open = null;
    this.error = error;
  }

  private async applySnapshot(
    snapshot: ChangesSnapshot,
    context: string,
    cx: Context,
  ): Promise<void> {
    this.root = snapshot.root;
    this.on = snapshot.on;
    this.hasHead = snapshot.hasHead;
    this.files = snapshot.files;
    this.limited = snapshot.limited;
    this.error = null;
    this.watch(snapshot.root, cx);

    if (this.open !== null && !this.files.some((file) => file.path === this.open)) {
      this.open = null;
      this.setLines([]);
    }

    if (this.open === null && !this.closed && this.files.length > 0) {
      this.open = this.files[0]?.path ?? null;
    }

    const openPath = this.open;

    if (openPath !== null) {
      try {
        await this.load(openPath, context);
      } catch {
        if (key() === context) {
          this.setLines(['Cannot preview this diff (too large or unreadable)']);
        }
      }
    }
  }

  private watch(root: string, cx: Context): void {
    if (this.on !== null || this.watched === root) {
      return;
    }

    this.watched = root;

    cx.spawn(async (taskCx) => {
      try {
        while (this.watched === root) {
          // eslint-disable-next-line no-await-in-loop -- one folder watch at a time
          await watchFolder(root);

          if (this.watched === root) {
            this.refresh(taskCx);
          }
        }
      } catch {
        this.watched = null;
      }
    });
  }

  private async load(path: string, context: string): Promise<void> {
    const file = this.files.find((candidate) => candidate.path === path);
    const root = this.root;

    if (file === undefined || root === null) {
      return;
    }

    const lines = await loadFileLines(file, root, this.hasHead, this.on);

    if (key() === context && this.open === path) {
      this.setLines(lines);
    }
  }

  private setLines(lines: string[]): void {
    this.rows = diffRows(lines);

    this.diffWidth = Math.max(
      diffSize.minimumWidth,
      ...lines.map((line) => line.length * diffSize.characterWidth + diffSize.widthPadding),
    );
  }

  private pick(path: string, cx: Context): void {
    const openPath = this.open === path ? null : path;

    this.open = openPath;
    this.setLines([]);
    this.note = null;
    this.closed = openPath === null;

    const context = this.context;

    if (openPath === null || context === null) {
      cx.notify();

      return;
    }

    cx.spawn(async (taskCx) => {
      try {
        await this.load(openPath, context);
      } catch (error) {
        if (key() === context && this.open === openPath) {
          this.note = `Cannot preview this diff (too large or unreadable): ${String(error)}`;
        }
      }

      taskCx.notify();
    });

    cx.notify();
  }

  private commit(cx: Context): void {
    const message = this.message.trim();

    if (message === '') {
      return;
    }

    if (this.busy || this.loading) {
      return;
    }

    if (this.root === null || this.context !== key()) {
      return;
    }

    const root = this.root;
    const on = this.on;
    const context = this.context;

    this.busy = true;
    this.note = null;

    cx.spawn(async (taskCx) => {
      try {
        await commitAll(root, on, message);

        if (key() === context) {
          this.message = '';
          this.input.set_value('');
        }
      } catch (error) {
        if (key() === context) {
          this.note = `Commit failed: ${String(error)}`;
        }
      } finally {
        this.busy = false;
        this.refresh(taskCx);
        taskCx.notify();
      }
    });

    cx.notify();
  }
}
