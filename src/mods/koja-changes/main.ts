import { InputState as InputStates, v_flex } from 'gpui-base';
import type { InputState } from 'gpui-base';
import type { AsyncContext, Context, Element, FocusHandle } from 'gpui-kit';
import { View } from 'gpui-kit';
import { exec, watchFolder } from 'herdr';

import { colors, repeat, textSize } from '../../kit/index.ts';
import { canCommit, hasText } from './commit.ts';
import { DiffPreview } from './diffPreview.ts';
import { commitAll, readChanges } from './git.ts';
import type { ChangesSnapshot } from './git.ts';
import { location, locationKey } from './location.ts';
import { commitBar, diffArea, fileList, headerRow, limitedNotice, noteRow } from './rows.ts';
import type { ChangeFile } from './status.ts';

const refreshMilliseconds = 10000;

export default class Changes extends View {
  private snapshot: ChangesSnapshot | null = null;

  private readonly preview = new DiffPreview();

  private message = '';

  private typing = false;

  private handle: FocusHandle | null = null;

  private input!: InputState;

  private context: string | null = null;

  private watched: string | null = null;

  private open: string | null = null;

  private loading = false;

  private busy = false;

  private closed = false;

  private limited = false;

  private error: string | null = null;

  private note: string | null = null;

  private get files(): ChangeFile[] {
    return this.snapshot?.files ?? [];
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
      this.refresh(timerCx);
    });
  }

  override render(cx: Context): Element {
    if (locationKey() !== this.context) {
      this.refresh(cx);
    }

    const palette = colors();
    const add = this.files.reduce((total, file) => total + file.add, 0);
    const del = this.files.reduce((total, file) => total + file.del, 0);
    const idle = !this.busy && !this.loading;
    const ready = this.snapshot !== null && idle;
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

    root.child(
      fileList(
        this.files,
        this.open,
        this.error,
        this.loading,
        this.snapshot?.root ?? null,
        palette,
        (path, clickCx) => {
          this.pick(path, clickCx);
        },
      ),
    );

    if (this.limited) {
      root.child(limitedNotice(palette));
    }

    root.child(diffArea(this.preview.rows, this.preview.diffWidth, this.open, this.files.length));

    if (this.note !== null) {
      root.child(noteRow(this.note, palette));
    }

    root.child(
      commitBar(this.input, this.typing, this.busy, enabled, palette, (clickCx) => {
        this.commit(clickCx);
      }),
    );

    return this.handle === null ? root : root.track_focus(this.handle);
  }

  private refresh(cx: Context): void {
    if (this.loading || this.busy) {
      return;
    }

    const where = location();
    const context = locationKey();

    if (context !== this.context) {
      this.context = context;
      this.snapshot = null;
      this.open = null;
      this.preview.setLines([]);
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
        const result = await readChanges(exec, cwd, where.on, () => locationKey() === context);

        if (result === null || locationKey() !== context) {
          return;
        }

        if (result.snapshot === null) {
          this.clearForError(result.error);
        } else {
          await this.applySnapshot(result.snapshot, context, taskCx);
        }
      } catch (error) {
        if (locationKey() === context) {
          this.error = String(error);
        }
      } finally {
        this.loading = false;
        taskCx.notify();
      }
    });
  }

  private clearForError(error: string | null): void {
    this.snapshot = null;
    this.preview.setLines([]);
    this.open = null;
    this.error = error;
  }

  private async applySnapshot(
    snapshot: ChangesSnapshot,
    context: string,
    cx: Context,
  ): Promise<void> {
    this.snapshot = snapshot;
    this.limited = snapshot.limited;
    this.error = null;
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
          () => this.snapshot,
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

    if (snapshot.on !== null || this.watched === root) {
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
          () => this.snapshot,
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
    const snapshot = this.snapshot;

    const request = {
      message: this.message,
      busy: this.busy,
      loading: this.loading,
      contextCurrent: this.context === locationKey(),
    };

    if (snapshot === null || !canCommit(request)) {
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
