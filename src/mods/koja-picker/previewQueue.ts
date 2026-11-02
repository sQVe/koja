// The picker's preview queue: one FIFO write at a time, always of the latest selection. A failed
// write is not recorded as shown, so the next selection retries it; a close is queued behind any
// write already running.

export class PreviewSession {
  // undefined until the first successful write, so the first selection always reaches the preview.
  private shown: string | null | undefined = undefined;

  private wanted: string | null = null;

  private running: Promise<void> | null = null;

  constructor(private readonly write: (address: string | null) => Promise<boolean>) {}

  show(address: string | null): void {
    this.wanted = address;
    this.start();
  }

  // Queues "show nothing" behind a running write, so it cannot land before one.
  async close(): Promise<void> {
    this.wanted = null;
    this.start();
    await this.settled();
  }

  // Resolves when the queued writes finish; `close` waits on it.
  settled(): Promise<void> {
    return this.running ?? Promise.resolve();
  }

  private start(): void {
    // Nothing to do when the preview already shows the wanted value. Starting a drain anyway
    // could finish synchronously and store a spent promise, which would block every later write.
    if (this.running !== null || this.shown === this.wanted) {
      return;
    }

    this.running = this.drain();
  }

  private async drain(): Promise<void> {
    // One failed address is not retried until something else is selected.
    let failed: string | null | undefined = undefined;

    while (this.shown !== this.wanted && failed !== this.wanted) {
      const address: string | null = this.wanted;

      // eslint-disable-next-line no-await-in-loop -- writes go one at a time, in order
      const written = await this.write(address);

      if (written) {
        this.shown = address;
        failed = undefined;
      } else {
        failed = address;
      }
    }

    this.running = null;
  }
}
