import type { InputState } from 'gpui-base';
import type { AsyncContext } from 'gpui-kit';

export interface SearchFocusHost {
  input: InputState;
  isSearchFocused: () => boolean;
  setSearchFocused: (focused: boolean) => void;
  isLeaving: () => boolean;
}

// The search input can't take the keyboard until the popup has drawn it, and a click on the
// preview terminal takes the keyboard away; both need another try, this often, this many times.
const focusRetryMilliseconds = 50;

const focusAttempts = 40;

const focusSearch = (host: SearchFocusHost, cx: AsyncContext, attemptsLeft: number): void => {
  if (host.isSearchFocused() || host.isLeaving() || attemptsLeft === 0) {
    return;
  }

  host.input.focus();

  cx.timer.after(focusRetryMilliseconds, (timerCx) => {
    focusSearch(host, timerCx, attemptsLeft - 1);
  });
};

export const keepSearchFocused = (host: SearchFocusHost, cx: AsyncContext): void => {
  host.input.on('focus', () => {
    host.setSearchFocused(true);
  });

  host.input.on('blur', () => {
    host.setSearchFocused(false);
    focusSearch(host, cx, focusAttempts);
  });

  focusSearch(host, cx, focusAttempts);
};
