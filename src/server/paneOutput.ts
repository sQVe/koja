const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// Runs the handler for each chunk of output. The first error goes to onFailed once, as a message,
// and every later chunk is dropped, so one pane's failure never escapes to the process.
export const guardOutput = <Chunk extends unknown[]>(
  handle: (...chunk: Chunk) => void,
  onFailed: (message: string) => void,
): ((...chunk: Chunk) => void) => {
  let failed = false;

  return (...chunk) => {
    if (failed) {
      return;
    }

    try {
      handle(...chunk);
    } catch (error) {
      failed = true;
      onFailed(describeError(error));
    }
  };
};
