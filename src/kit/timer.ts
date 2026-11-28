import type { AsyncContext, Context, Task } from 'gpui-kit';

export const repeat = (
  cx: Context,
  milliseconds: number,
  handler: (cx: AsyncContext) => void,
): Task => {
  // oxlint-disable-next-line unicorn/no-array-method-this-argument -- Timer.every is not an array method
  return cx.timer.every(milliseconds, handler);
};
