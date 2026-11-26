export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

export const createDeferred = <T>(): Deferred<T> => {
  let resolveValue!: (value: T) => void;

  const promise = new Promise<T>((resolve) => {
    resolveValue = resolve;
  });

  return { promise, resolve: resolveValue };
};
