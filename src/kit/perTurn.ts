// A host read is cached for one turn: the microtask below clears the cache, and the host runs
// queued jobs between renders, so a changed value still shows on the next render.
export const perTurn = <T>(read: () => T): (() => T) => {
  let entry: { value: T } | null = null;

  const clear = (): void => {
    entry = null;
  };

  return (): T => {
    if (entry === null) {
      entry = { value: read() };

      Promise.resolve().then(clear).catch(clear);
    }

    return entry.value;
  };
};
