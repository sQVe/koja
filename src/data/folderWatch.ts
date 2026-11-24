import type { AsyncContext, Context } from 'gpui-kit';
import type { FolderWatch } from 'herdr';

export type WatchFolder = (folder: string) => FolderWatch;

export interface FolderChangeListener {
  onChange: (cx: AsyncContext) => void;
  onError: (cx: AsyncContext) => void;
}

export interface FolderWatchHandle {
  cancel: () => void;
}

export const watchFolderChanges = (
  watchFolder: WatchFolder,
  folder: string,
  cx: Context,
  listener: FolderChangeListener,
): FolderWatchHandle => {
  let pending = watchFolder(folder);
  let cancelled = false;

  // The listener can cancel synchronously through the handle, so read the flag through a call
  // rather than the value the compiler has narrowed.
  const isCancelled = (): boolean => cancelled;

  cx.spawn(async (taskCx) => {
    try {
      for (;;) {
        // eslint-disable-next-line no-await-in-loop -- one folder watch at a time
        await pending;

        if (isCancelled()) {
          return;
        }

        listener.onChange(taskCx);

        if (isCancelled()) {
          return;
        }

        pending = watchFolder(folder);
      }
    } catch {
      if (!isCancelled()) {
        listener.onError(taskCx);
      }
    }
  });

  return {
    cancel: () => {
      cancelled = true;
      pending.cancel();
    },
  };
};
