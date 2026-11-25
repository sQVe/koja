import { InputState as InputStates, v_flex } from 'gpui-base';
import type { InputState } from 'gpui-base';
import type { AsyncContext, Context, Element, FocusHandle } from 'gpui-kit';
import { View } from 'gpui-kit';
import { checking, exec, watchFolder } from 'herdr';

import { watchFolderChanges } from '../../data/folderWatch.ts';
import type { FolderWatchHandle } from '../../data/folderWatch.ts';
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

interface WatchedRoot {
  root: string;
  handle: FolderWatchHandle;
}

const refreshMilliseconds = 10000;

const millisecondsPerSecond = 1000;

const nowSeconds = (): number => Math.floor(Date.now() / millisecondsPerSecond);

const previewFailureNote = (error: unknown): string => {
  const detail = error instanceof Error ? error.message : String(error);
  const oneLine = detail.replace(/\s+/g, ' ').trim();

  if (oneLine === '') {
    return 'Cannot preview this diff';
  }

  return `Cannot preview this diff: ${oneLine}`;
};

export default class Changes extends View {
  private state: ReadState = emptyReadState();

  private readonly preview = new DiffPreview();

  private message = '';

  private typing = false;

  private handle: FocusHandle | null = null;

  private input!: InputState;

  private context: string | null = null;

  private watched: WatchedRoot | null = null;

  private open: string | null = null;

  private loading = false;

  private pendingRefresh = false;

  private pendingCommit = false;

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

  override close(): void {
    this.stopWatch();
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
    if (checking()) {
      return false;
    }

    const context = locationKey();
    const moved = context !== this.context;

    if (moved) {
      this.stopWatch();
    }

    if (this.loading) {
      this.pendingRefresh = true;

      return false;
    }

    if (this.busy) {
      return false;
    }

    const where = location();

    if (moved) {
      this.context = context;
      this.state = emptyReadState();
      this.open = null;
      this.preview.setLines([]);
      this.message = '';
      this.input.set_value('');
      this.note = null;
      this.closed = false;
      this.limited = false;
    }

    if (where.cwd === null) {
      return false;
    }

    const cwd = where.cwd;

    this.loading = true;

    const refusal = this.spawnRead(cx, cwd, where.on, context);

    if (refusal !== null) {
      this.loading = false;
      this.state = applyRead(this.state, { failure: refusal.message }, nowSeconds());
    }

    return true;
  }

  private spawnTask(cx: Context, body: (taskCx: AsyncContext) => unknown): Error | null {
    try {
      cx.spawn(body);

      return null;
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error));
    }
  }

  private spawnRead(cx: Context, cwd: string, on: string | null, context: string): Error | null {
    return this.spawnTask(cx, async (taskCx) => {
      try {
        const result = await readChanges(exec, cwd, on, () => locationKey() === context);

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

        if (this.pendingCommit) {
          this.pendingCommit = false;
          this.commit(taskCx);
        }

        if (this.pendingRefresh) {
          this.pendingRefresh = false;
          this.refresh(taskCx);
        }

        taskCx.notify();
      }
    });
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
      } catch (error) {
        if (locationKey() === context && this.open === openPath) {
          this.preview.setLines([previewFailureNote(error)]);
        }
      }
    }
  }

  private stopWatch(): void {
    this.watched?.handle.cancel();
    this.watched = null;
  }

  private watch(snapshot: ChangesSnapshot, cx: Context): void {
    const root = snapshot.root;

    if (this.state.watchFailed || snapshot.on !== null || this.watched?.root === root) {
      return;
    }

    this.stopWatch();

    const handle = watchFolderChanges(watchFolder, root, cx, {
      onChange: (taskCx) => {
        this.refresh(taskCx);
      },
      onError: (taskCx) => {
        this.watched = null;
        this.state = { ...this.state, watchFailed: true };
        taskCx.notify();
      },
    });

    this.watched = { root, handle };

    if (this.loading) {
      this.pendingRefresh = true;
    }
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
    const context = this.context;

    const previous = {
      open: this.open,
      closed: this.closed,
      rows: this.preview.rows,
      width: this.preview.diffWidth,
    };

    this.open = openPath;
    this.preview.setLines([]);
    this.note = null;
    this.closed = openPath === null;

    if (openPath === null || context === null) {
      cx.notify();

      return;
    }

    const refusal = this.spawnTask(cx, async (taskCx) => {
      try {
        await this.preview.load(
          openPath,
          () => this.state.lastGood?.snapshot ?? null,
          () => locationKey() === context && this.open === openPath,
        );
      } catch (error) {
        if (locationKey() === context && this.open === openPath) {
          this.note = previewFailureNote(error);
        }
      }

      taskCx.notify();
    });

    if (refusal !== null) {
      this.open = previous.open;
      this.closed = previous.closed;
      this.preview.rows = previous.rows;
      this.preview.diffWidth = previous.width;
      this.note = previewFailureNote(refusal);
    }

    cx.notify();
  }

  private commit(cx: Context): void {
    const request = this.commitRequest();

    if (request.loading) {
      this.pendingCommit = hasText(request.message);

      return;
    }

    const snapshot = this.state.lastGood?.snapshot ?? null;

    if (snapshot === null || !canCommit(request)) {
      return;
    }

    const message = this.message.trim();
    const { root, on } = snapshot;
    const context = this.context;

    this.busy = true;
    this.note = null;

    const refusal = this.spawnTask(cx, async (taskCx) => {
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

    if (refusal !== null) {
      this.busy = false;
      this.note = `Commit failed: ${refusal.message}`;
    }

    cx.notify();
  }
}
