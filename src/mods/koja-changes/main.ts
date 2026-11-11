import { InputState as InputStates, v_flex } from 'gpui-base';
import type { InputState } from 'gpui-base';
import type { AsyncContext, Context, Element, FocusHandle } from 'gpui-kit';
import { View } from 'gpui-kit';
import { exec, watchFolder } from 'herdr';

import { colors, repeat, withTextRole } from '../../kit/index.ts';
import { canCommit, hasText } from './commit.ts';
import type { CommitRequest } from './commit.ts';
import { DiffPreview } from './diffPreview.ts';
import { commitAll, readChanges } from './git.ts';
import type { ChangesSnapshot } from './git.ts';
import { location, locationKey } from './location.ts';
import { applyRead, emptyReadState, isStale, readStateLine, watchStateLine } from './readState.ts';
import type { ReadState } from './readState.ts';
import { commitBar, diffArea, fileList, headerRow, limitedNotice, noteRow } from './rows.ts';
import type { ChangeFile } from './status.ts';

const refreshMilliseconds = 10000;

const millisecondsPerSecond = 1000;

const nowSeconds = (): number => Math.floor(Date.now() / millisecondsPerSecond);

export default class Changes extends View {
  private state: ReadState = emptyReadState();

  private readonly preview = new DiffPreview();

  private message = '';

  private typing = false;

  private handle: FocusHandle | null = null;

  private input!: InputState;

  private context: string | null = null;

  private watched: string | null = null;

  private watchGeneration = 0;

  private open: string | null = null;

  private loading = false;

  private pendingRefresh = false;

  private busy = false;

  private closed = false;

  private limited = false;

  private note: string | null = null;

  private get files(): ChangeFile[] {
    return this.state.lastGood?.snapshot.files ?? [];
  }

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
      if (this.loading) {
        return;
      }

      this.refresh(timerCx);
    });
  }

  override render(cx: Context): Element {
    if (locationKey() !== this.context) {
      this.startRead(cx);
    }

    const palette = colors();
    const add = this.files.reduce((total, file) => total + file.add, 0);
    const del = this.files.reduce((total, file) => total + file.del, 0);
    const enabled = canCommit(this.commitRequest());
    const now = nowSeconds();

    const root = withTextRole(v_flex(), 'body')
      .id('changes')
      .size_full()
      .min_h(0)
      .overflow_hidden()
      .on_key_down((event, keyCx) => {
        if (event.key === 'escape' && this.typing) {
          this.typing = false;
          this.handle?.focus();
          keyCx.stop_propagation();
          keyCx.notify();
        }
      })
      .child(headerRow(this.files, add, del, palette));

    root.child(
      fileList({
        files: this.files,
        open: this.open,
        line: readStateLine(this.state, this.loading, now),
        watchLine: watchStateLine(this.state),
        palette,
        onRetry: (retryCx) => {
          this.refresh(retryCx);
        },
        onRetryWatch: (retryCx) => {
          this.retryWatch(retryCx);
        },
        onPick: (path, clickCx) => {
          this.pick(path, clickCx);
        },
      }),
    );

    if (this.limited) {
      root.child(limitedNotice());
    }

    root.child(diffArea(this.preview.rows, this.preview.diffWidth, this.open, this.files.length));

    if (this.note !== null) {
      root.child(noteRow(this.note));
    }

    root.child(
      commitBar(this.input, this.typing, this.busy, enabled, palette, (clickCx) => {
        this.commit(clickCx);
      }),
    );

    return this.handle === null ? root : root.track_focus(this.handle);
  }

  private commitRequest(): CommitRequest {
    return {
      message: this.message,
      busy: this.busy,
      loading: this.loading,
      contextCurrent: this.context === locationKey(),
      stale: isStale(this.state),
    };
  }

  private refresh(cx: Context): void {
    if (this.startRead(cx)) {
      cx.notify();
    }
  }

  private startRead(cx: Context): boolean {
    if (this.loading) {
      this.pendingRefresh = true;

      return false;
    }

    if (this.busy) {
      return false;
    }

    const where = location();
    const context = locationKey();

    if (context !== this.context) {
      this.context = context;
      this.state = emptyReadState();
      this.open = null;
      this.preview.setLines([]);
      this.message = '';
      this.input.set_value('');
      this.note = null;
      this.watched = null;
      this.watchGeneration += 1;
      this.closed = false;
      this.limited = false;
    }

    if (where.cwd === null) {
      return false;
    }

    const cwd = where.cwd;

    this.loading = true;

    cx.spawn(async (taskCx) => {
      try {
        const result = await readChanges(exec, cwd, where.on, () => locationKey() === context);

        if (result === null || locationKey() !== context) {
          return;
        }

        if ('failure' in result) {
          this.state = applyRead(this.state, result, nowSeconds());
        } else {
          await this.applySnapshot(result.snapshot, context, taskCx);
        }
      } catch (error) {
        if (locationKey() === context) {
          this.state = applyRead(this.state, { failure: String(error) }, nowSeconds());
        }
      } finally {
        this.loading = false;

        if (this.pendingRefresh) {
          this.pendingRefresh = false;
          this.refresh(taskCx);
        }

        taskCx.notify();
      }
    });

    return true;
  }

  private async applySnapshot(
    snapshot: ChangesSnapshot,
    context: string,
    cx: Context,
  ): Promise<void> {
    this.state = applyRead(this.state, { snapshot }, nowSeconds());
    this.limited = snapshot.limited;
    this.watch(snapshot, cx);

    if (this.open !== null && !this.files.some((file) => file.path === this.open)) {
      this.open = null;
      this.preview.setLines([]);
    }

    if (this.open === null && !this.closed && this.files.length > 0) {
      this.open = this.files[0]?.path ?? null;
    }

    const openPath = this.open;

    if (openPath !== null) {
      try {
        await this.preview.load(
          openPath,
          () => this.state.lastGood?.snapshot ?? null,
          () => locationKey() === context && this.open === openPath,
        );
      } catch {
        if (locationKey() === context && this.open === openPath) {
          this.preview.setLines(['Cannot preview this diff (too large or unreadable)']);
        }
      }
    }
  }

  private watch(snapshot: ChangesSnapshot, cx: Context): void {
    const root = snapshot.root;

    if (this.state.watchFailed || snapshot.on !== null || this.watched === root) {
      return;
    }

    this.watched = root;

    const generation = this.watchGeneration + 1;

    this.watchGeneration = generation;

    if (this.loading) {
      this.pendingRefresh = true;
    }

    cx.spawn(async (taskCx) => {
      try {
        while (this.watchGeneration === generation) {
          // eslint-disable-next-line no-await-in-loop -- one folder watch at a time
          await watchFolder(root);

          if (this.watchGeneration === generation) {
            this.refresh(taskCx);
          }
        }
      } catch {
        if (this.watchGeneration === generation) {
          this.watched = null;
          this.state = { ...this.state, watchFailed: true };
          taskCx.notify();
        }
      }
    });
  }

  private retryWatch(cx: Context): void {
    const snapshot = this.state.lastGood?.snapshot ?? null;

    if (snapshot === null || this.context === null) {
      return;
    }

    this.state = { ...this.state, watchFailed: false };
    this.watch(snapshot, cx);
    this.refresh(cx);
    cx.notify();
  }

  private pick(path: string, cx: Context): void {
    const openPath = this.open === path ? null : path;

    this.open = openPath;
    this.preview.setLines([]);
    this.note = null;
    this.closed = openPath === null;

    const context = this.context;

    if (openPath === null || context === null) {
      cx.notify();

      return;
    }

    cx.spawn(async (taskCx) => {
      try {
        await this.preview.load(
          openPath,
          () => this.state.lastGood?.snapshot ?? null,
          () => locationKey() === context && this.open === openPath,
        );
      } catch (error) {
        if (locationKey() === context && this.open === openPath) {
          this.note = `Cannot preview this diff (too large or unreadable): ${String(error)}`;
        }
      }

      taskCx.notify();
    });

    cx.notify();
  }

  private commit(cx: Context): void {
    const snapshot = this.state.lastGood?.snapshot ?? null;

    if (snapshot === null || !canCommit(this.commitRequest())) {
      return;
    }

    const message = this.message.trim();
    const { root, on } = snapshot;
    const context = this.context;

    this.busy = true;
    this.note = null;

    cx.spawn(async (taskCx) => {
      try {
        await commitAll(exec, root, on, message);

        if (locationKey() === context) {
          this.message = '';
          this.input.set_value('');
        }
      } catch (error) {
        if (locationKey() === context) {
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
