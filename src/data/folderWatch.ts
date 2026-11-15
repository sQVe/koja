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

// Calls onChange after each batch of changes under folder, and onError once if a watch rejects.
// After cancel(), neither callback runs again.
export const watchFolderChanges = (
  watchFolder: WatchFolder,
  folder: string,
  cx: Context,
  listener: FolderChangeListener,
): FolderWatchHandle => {
  let pending = watchFolder(folder);
  let cancelled = false;

  cx.spawn(async (taskCx) => {
    try {
      for (;;) {
        // eslint-disable-next-line no-await-in-loop -- one folder watch at a time
        await pending;

        if (cancelled) {
          return;
        }

        pending = watchFolder(folder);
        listener.onChange(taskCx);
      }
    } catch {
      if (!cancelled) {
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
