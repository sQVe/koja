import type { InputState } from 'gpui-base';
import type { AsyncContext, Task } from 'gpui-kit';

export interface SearchFocusHost {
  input: InputState;
  isSearchFocused: () => boolean;
  setSearchFocused: (focused: boolean) => void;
  isLeaving: () => boolean;
}

interface PendingRetry {
  task: Task | null;
}

// The search input can't take the keyboard until the popup has drawn it, and a click on the
// preview terminal takes the keyboard away; both need another try, this often, this many times.
const focusRetryMilliseconds = 50;

const focusAttempts = 40;

const cancelRetry = (retry: PendingRetry): void => {
  retry.task?.cancel();
  retry.task = null;
};

const focusSearch = (
  host: SearchFocusHost,
  cx: AsyncContext,
  retry: PendingRetry,
  attemptsLeft: number,
): void => {
  if (host.isSearchFocused() || host.isLeaving() || attemptsLeft === 0) {
    return;
  }

  host.input.focus();

  // focus() can emit 'focus' synchronously, which cancels a retry that is not yet scheduled, so
  // this guard is the only thing that stops the retry in that case.
  if (host.isSearchFocused()) {
    return;
  }

  retry.task = cx.timer.after(focusRetryMilliseconds, (timerCx) => {
    retry.task = null;
    focusSearch(host, timerCx, retry, attemptsLeft - 1);
  });
};

export const keepSearchFocused = (host: SearchFocusHost, cx: AsyncContext): void => {
  const retry: PendingRetry = { task: null };

  host.input.on('focus', () => {
    host.setSearchFocused(true);
    cancelRetry(retry);
  });

  host.input.on('blur', () => {
    host.setSearchFocused(false);
    cancelRetry(retry);
    focusSearch(host, cx, retry, focusAttempts);
  });

  focusSearch(host, cx, retry, focusAttempts);
};
