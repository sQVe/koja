export class PreviewSession {
  private shown: string | null | undefined = undefined;

  private wanted: string | null = null;

  private running: Promise<void> | null = null;

  constructor(private readonly write: (address: string | null) => Promise<boolean>) {}

  show(address: string | null): void {
    this.wanted = address;
    this.start();
  }

  async close(): Promise<void> {
    this.wanted = null;
    this.start();
    await this.settled();
  }

  settled(): Promise<void> {
    return this.running ?? Promise.resolve();
  }

  private start(): void {
    if (this.running !== null || this.shown === this.wanted) {
      return;
    }

    this.running = this.drain();
  }

  private async drain(): Promise<void> {
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
