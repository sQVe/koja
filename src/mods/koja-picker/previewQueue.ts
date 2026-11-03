// Herdr cancels unfinished cleanup after 250 ms, so wait less than that before clearing.
const closeWaitMilliseconds = 150;

const sessionLength = 12;

const sessionDigits = 'abcdefghijklmnopqrstuvwxyz0123456789';

const createSessionId = (): string => {
  let id = '';

  for (let index = 0; index < sessionLength; index += 1) {
    id += sessionDigits.charAt(Math.floor(Math.random() * sessionDigits.length));
  }

  return id;
};

export class PreviewSession {
  private shown: string | null | undefined = undefined;

  private wanted: string | null = null;

  private running: Promise<void> | null = null;

  private generation = 0;

  private closed = false;

  private sequence = 0;

  private readonly session: string;

  constructor(
    private readonly write: (
      session: string,
      sequence: number,
      address: string | null,
    ) => Promise<boolean>,
    sessionId: () => string = createSessionId,
  ) {
    this.session = sessionId();
  }

  show(address: string | null): void {
    if (this.closed) {
      return;
    }

    this.wanted = address;
    this.start();
  }

  async close(sleep: (milliseconds: number) => Promise<void>): Promise<void> {
    this.closed = true;
    this.generation += 1;
    this.wanted = null;
    const running = this.running;

    this.running = null;

    if (running !== null) {
      // Wait for the running write only up to the cleanup budget, then clear anyway.
      await Promise.race([running, sleep(closeWaitMilliseconds)]);
    }

    await this.write(this.session, this.nextSequence(), null);
    this.shown = null;
  }

  settled(): Promise<void> {
    return this.running ?? Promise.resolve();
  }

  // Each session counts from one, so a later session never needs the earlier session's state.
  private nextSequence(): number {
    this.sequence += 1;

    return this.sequence;
  }

  private start(): void {
    if (this.running !== null || this.shown === this.wanted) {
      return;
    }

    this.running = this.drain();
  }

  private async drain(): Promise<void> {
    const generation = this.generation;
    let failed: string | null | undefined = undefined;

    while (this.generation === generation && this.shown !== this.wanted && failed !== this.wanted) {
      const address: string | null = this.wanted;

      // eslint-disable-next-line no-await-in-loop -- writes go one at a time, in order
      const written = await this.write(this.session, this.nextSequence(), address);

      if (this.generation !== generation) {
        return;
      }

      if (written) {
        this.shown = address;
        failed = undefined;
      } else {
        failed = address;
      }
    }

    if (this.generation === generation) {
      this.running = null;
    }
  }
}
