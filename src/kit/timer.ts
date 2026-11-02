import type { AsyncContext, Context } from 'gpui-kit';

// Calls `handler` every `milliseconds`, measured from the end of each call.
export const repeat = (
  cx: Context,
  milliseconds: number,
  handler: (cx: AsyncContext) => void,
): void => {
  // oxlint-disable-next-line unicorn/no-array-method-this-argument -- Timer.every is not an array method
  cx.timer.every(milliseconds, handler);
};
