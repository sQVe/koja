// A host read is cached for one turn: the microtask below clears the cache, and the host runs
// queued jobs between renders, so a changed value still shows on the next render.
export const perTurn = <T>(read: () => T): (() => T) => {
  let value: T | null = null;

  const clear = (): void => {
    value = null;
  };

  return (): T => {
    if (value === null) {
      value = read();
      Promise.resolve().then(clear).catch(clear);
    }

    return value;
  };
};
