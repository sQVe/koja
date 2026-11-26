import { InputState as InputStates, v_flex } from 'gpui-base';
import type { InputState } from 'gpui-base';
import type { AsyncContext, Context, Element, FocusHandle } from 'gpui-kit';
import { View } from 'gpui-kit';
import { checking, exec, watchFolder, window } from 'herdr';

import { watchFolderChanges } from '../../data/folderWatch.ts';
import type { FolderWatchHandle } from '../../data/folderWatch.ts';
import { colors, repeat, terminalFontSize, withTextRole } from '../../kit/index.ts';
import { canCommit, canQueueCommit, hasText } from './commit.ts';
import type { CommitRequest } from './commit.ts';
import { DiffPreview } from './diffPreview.ts';
import type { DueState, DueWorld, ReadRequest } from './due.ts';
import { emptyDue, markDirty, readDue, readRequest, skipDue, tickDue, afterScan } from './due.ts';
import { changeSnapshot, commitAll, readRepository, statusCommand } from './git.ts';
import type { ChangesSnapshot } from './git.ts';
import { location, locationKey } from './location.ts';
import { applyRead, emptyReadState, isStale, readStateLine, watchStateLine } from './readState.ts';
import type { ReadState } from './readState.ts';
import { commitBar, diffArea, fileList, headerRow, limitedNotice, noteRow } from './rows.ts';
import type { RepoScan } from './scans.ts';
import { repoStatus } from './scans.ts';
import type { ChangeFile } from './status.ts';

interface WatchedRoot {
  root: string;
  handle: FolderWatchHandle;
}

const tickMilliseconds = 500;

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

const windowVisible = (): boolean => window()?.visible !== false;

export default class Changes extends View {
  private state: ReadState = emptyReadState();

  private readonly preview = new DiffPreview();

  private message = '';

  private typing = false;

  private handle: FocusHandle | null = null;

  private input!: InputState;

  private due: DueState | null = null;

  private visit = 0;

  private windowWasVisible = true;

  private watched: WatchedRoot | null = null;

  private open: string | null = null;

  private loading = false;

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

    repeat(cx, tickMilliseconds, (timerCx) => {
      if (this.tick(timerCx)) {
        timerCx.notify();
      }
    });
  }

  override close(): void {
    this.stopWatch();
  }

  override render(cx: Context): Element {
    if (this.due === null || locationKey() !== this.due.key) {
      this.refresh(cx);
    } else {
      this.tick(cx);
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

    root.child(
      diffArea({
        document: this.preview.document,
        open: this.open,
        fileCount: this.files.length,
        fontSize: terminalFontSize(),
      }),
    );

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

  private world(): DueWorld {
    const visible = windowVisible();
    const shownAgain = visible && !this.windowWasVisible;

    this.windowWasVisible = visible;

    return { visible, shownAgain, loading: this.loading, busy: this.busy, now: Date.now() };
  }

  private tick(cx: Context): boolean {
    const world = this.world();

    if (this.due !== null) {
      this.due = tickDue(this.due, world, this.watched !== null);
    }

    if (this.due === null || !readDue(this.due, world)) {
      return false;
    }

    this.refresh(cx);

    return this.loading;
  }

  private isCurrent(key: string, visit: number): boolean {
    return this.visit === visit && this.due?.key === key && locationKey() === key;
  }

  private commitRequest(): CommitRequest {
    return {
      message: this.message,
      busy: this.busy,
      loading: this.loading,
      contextCurrent: this.due !== null && this.due.key === locationKey(),
      stale: isStale(this.state),
    };
  }

  private refresh(cx: Context, force = false): void {
    if (checking()) {
      return;
    }

    const key = locationKey();
    const visiting = this.due === null || key !== this.due.key;

    if (visiting) {
      this.visit += 1;
      this.stopWatch();
      this.due = emptyDue(key);
      this.state = emptyReadState();
      this.open = null;
      this.preview.setLines([]);
      this.message = '';
      this.input.set_value('');
      this.note = null;
      this.closed = false;
      this.limited = false;
      this.loading = false;
    }

    const due = this.due;

    if (due === null) {
      return;
    }

    const now = Date.now();
    const where = location();

    if (where.cwd === null) {
      this.due = skipDue(due, now);

      return;
    }

    if (this.loading || this.busy) {
      return;
    }

    const read = readRequest(due, now, visiting, force);

    this.due = read.due;
    this.loading = true;

    const refusal = this.spawnRead(cx, where.cwd, where.on, key, this.visit, read.request);

    if (refusal !== null) {
      this.loading = false;
      this.state = applyRead(this.state, { failure: refusal.message }, nowSeconds());
    }
  }

  private spawnTask(cx: Context, body: (taskCx: AsyncContext) => unknown): Error | null {
    try {
      cx.spawn(body);

      return null;
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error));
    }
  }

  private spawnRead(
    cx: Context,
    cwd: string,
    on: string | null,
    key: string,
    visit: number,
    request: ReadRequest,
  ): Error | null {
    return this.spawnTask(cx, async (taskCx) => {
      try {
        const repository = await readRepository(exec, cwd, on);

        if (!this.isCurrent(key, visit)) {
          return;
        }

        if (repository.kind === 'failed') {
          throw new Error(repository.error);
        }

        if (repository.kind === 'missing') {
          this.state = applyRead(this.state, { failure: 'Not a git repository' }, nowSeconds());

          return;
        }

        const root = repository.root;

        this.watch(root, on, key, taskCx);

        const scan = await repoStatus(
          {
            now: () => Date.now(),
            visible: windowVisible,
            status: (scanRoot, scanOn) => statusCommand(exec, scanRoot, scanOn),
          },
          root,
          on,
          request,
          taskCx,
          () => this.isCurrent(key, visit),
        );

        if (scan === null || !this.isCurrent(key, visit)) {
          return;
        }

        await this.applyScan(scan, root, on, key, visit, request);
      } catch (error) {
        if (this.isCurrent(key, visit)) {
          this.state = applyRead(this.state, { failure: String(error) }, nowSeconds());
        }
      } finally {
        if (this.due?.key === key && this.visit === visit) {
          this.loading = false;
        }

        if (this.pendingCommit) {
          this.pendingCommit = false;
          this.commit(taskCx);
        }

        taskCx.notify();
      }
    });
  }

  private async applyScan(
    scan: RepoScan,
    root: string,
    on: string | null,
    key: string,
    visit: number,
    request: ReadRequest,
  ): Promise<void> {
    if (this.due !== null) {
      this.due = afterScan(this.due, scan, request);
    }

    if (scan.error instanceof Error) {
      throw scan.error;
    }

    if (scan.error !== null && scan.error !== undefined) {
      throw new Error('git status failed');
    }

    if (scan.status?.code !== 0) {
      throw new Error(scan.status?.stderr ?? 'git status failed');
    }

    const snapshot = await changeSnapshot(exec, root, on, scan.status.stdout);

    if (!this.isCurrent(key, visit)) {
      return;
    }

    await this.applySnapshot(snapshot, key, visit);
  }

  private async applySnapshot(
    snapshot: ChangesSnapshot,
    key: string,
    visit: number,
  ): Promise<void> {
    this.state = applyRead(this.state, { snapshot }, nowSeconds());
    this.limited = snapshot.limited;

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
          () => this.isCurrent(key, visit) && this.open === openPath,
        );
      } catch (error) {
        if (this.isCurrent(key, visit) && this.open === openPath) {
          this.preview.setLines([previewFailureNote(error)]);
        }
      }
    }
  }

  private stopWatch(): void {
    this.watched?.handle.cancel();
    this.watched = null;
  }

  private watch(root: string, on: string | null, key: string, cx: Context): void {
    if (this.state.watchFailed || on !== null || this.watched?.root === root) {
      return;
    }

    this.stopWatch();

    const handle = watchFolderChanges(watchFolder, root, cx, {
      onChange: (taskCx, paths) => {
        if (paths.length === 0 || this.due === null || this.due.key !== key) {
          return;
        }

        this.due = markDirty(this.due, Date.now());

        if (this.tick(taskCx)) {
          taskCx.notify();
        }
      },
      onError: (taskCx) => {
        this.watched = null;
        this.state = { ...this.state, watchFailed: true };
        taskCx.notify();
      },
    });

    this.watched = { root, handle };
  }

  private retryWatch(cx: Context): void {
    const snapshot = this.state.lastGood?.snapshot ?? null;

    if (snapshot === null || this.due === null) {
      return;
    }

    this.state = { ...this.state, watchFailed: false };
    this.watch(snapshot.root, snapshot.on, this.due.key, cx);
    this.refresh(cx);
    cx.notify();
  }

  private pick(path: string, cx: Context): void {
    const openPath = this.open === path ? null : path;
    const key = this.due?.key ?? null;
    const visit = this.visit;

    const previous = {
      open: this.open,
      closed: this.closed,
      document: this.preview.document,
    };

    this.open = openPath;
    this.preview.setLines([]);
    this.note = null;
    this.closed = openPath === null;

    if (openPath === null || key === null) {
      cx.notify();

      return;
    }

    const refusal = this.spawnTask(cx, async (taskCx) => {
      try {
        await this.preview.load(
          openPath,
          () => this.state.lastGood?.snapshot ?? null,
          () => this.isCurrent(key, visit) && this.open === openPath,
        );
      } catch (error) {
        if (this.isCurrent(key, visit) && this.open === openPath) {
          this.note = previewFailureNote(error);
        }
      }

      taskCx.notify();
    });

    if (refusal !== null) {
      this.open = previous.open;
      this.closed = previous.closed;
      this.preview.document = previous.document;
      this.note = previewFailureNote(refusal);
    }

    cx.notify();
  }

  private commit(cx: Context): void {
    const request = this.commitRequest();

    if (request.loading) {
      this.pendingCommit = canQueueCommit(request);

      return;
    }

    const snapshot = this.state.lastGood?.snapshot ?? null;

    if (snapshot === null || !canCommit(request)) {
      return;
    }

    const message = this.message.trim();
    const { root, on } = snapshot;
    const key = this.due?.key ?? null;
    const visit = this.visit;

    this.busy = true;
    this.note = null;

    const refusal = this.spawnTask(cx, async (taskCx) => {
      try {
        await commitAll(exec, root, on, message);

        if (key !== null && this.isCurrent(key, visit)) {
          this.message = '';
          this.input.set_value('');
        }
      } catch (error) {
        if (key !== null && this.isCurrent(key, visit)) {
          this.note = `Commit failed: ${String(error)}`;
        }
      } finally {
        this.busy = false;
        this.refresh(taskCx, true);
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
