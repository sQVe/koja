import type { AsyncContext, Context } from 'gpui-kit';

export const repeat = (
  cx: Context,
  milliseconds: number,
  handler: (cx: AsyncContext) => void,
): void => {
  // oxlint-disable-next-line unicorn/no-array-method-this-argument -- Timer.every is not an array method
  cx.timer.every(milliseconds, handler);
};
