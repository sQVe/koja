import type { ExecResult } from 'herdr';

import { recordOf, stringOf } from '../../kit/fields.ts';

export type { ExecResult } from 'herdr';

export interface PreviewHost {
  hc: (args: string[]) => Promise<ExecResult>;
  read: (path: string) => Promise<string | null>;
  write: (path: string, text: string, expected: string | null) => Promise<void>;
  newFolder: () => Promise<string | null>;
  removeFolder: (path: string) => void;
  kill: (terminal: string) => void;
  script: string;
}

export interface PreviewStart {
  address: string;
  folder: string;
  statePath: string;
}

const label = 'koja.preview=1';

const stateName = 'state';

const heartbeatName = 'heartbeat';

// The picker writes the heartbeat this often; serve's 1200-poll limit spans 60 seconds, 60x
// this interval, so a stall or sleep does not end a live viewer and an orphan ends in a minute.
export const heartbeatIntervalMilliseconds = 1_000;

export class PreviewSession {
  private statePath: string | null = null;

  private folder: string | null = null;

  private viewer: string | null = null;

  // undefined: the state file has not been read yet; null: it is absent.
  private last: string | null | undefined = undefined;

  // Empty and "-" both mean nothing is selected; the session writes one value.
  private wanted = '';

  private running: Promise<void> | null = null;

  private blocked = false;

  private closed = false;

  private handedOff = false;

  private beats = 0;

  private heartbeat: string | null | undefined = undefined;

  constructor(
    private readonly host: PreviewHost,
    start?: PreviewStart,
  ) {
    if (start !== undefined) {
      this.statePath = start.statePath;
      this.folder = start.folder;
      this.viewer = start.address;
    }
  }

  async open(initial: string | null): Promise<PreviewStart | null> {
    const folder = await this.host.newFolder();

    if (folder === null) {
      return null;
    }

    if (this.closed) {
      this.host.removeFolder(folder);

      return null;
    }

    this.folder = folder;
    this.statePath = `${folder}/${stateName}`;
    this.last = null;

    const written = await this.persist(initial ?? '');

    if (!written || this.closedNow()) {
      this.forget();

      return null;
    }

    const address = await this.startViewer();

    if (address === null) {
      this.forget();

      return null;
    }

    if (this.closedNow()) {
      // Owner closed while the viewer started; the late address has no owner left.
      this.host.kill(address);
      this.viewer = null;
      this.forget();

      return null;
    }

    return { address, folder, statePath: this.statePath };
  }

  show(address: string | null): void {
    if (this.closed) {
      return;
    }

    this.wanted = address ?? '';
    this.blocked = false;
    this.start();
  }

  // The list that resumes this viewer calls this after taking ownership, so the
  // launcher's own close() no longer kills the viewer.
  handOff(): void {
    this.handedOff = true;
  }

  close(): void {
    if (this.handedOff) {
      return;
    }

    this.closed = true;

    if (this.viewer !== null) {
      this.host.kill(this.viewer);
      this.viewer = null;
    }

    if (this.folder !== null) {
      // A fire-and-forget exec may still write to the file after this; the viewer is gone.
      this.host.removeFolder(this.folder);
      this.folder = null;
    }
  }

  async beat(): Promise<void> {
    if (this.closed || this.folder === null) {
      return;
    }

    this.beats += 1;

    if (this.heartbeat === undefined) {
      this.heartbeat = await this.host.read(`${this.folder}/${heartbeatName}`).catch(() => null);
    }

    const text = String(this.beats);

    try {
      await this.host.write(`${this.folder}/${heartbeatName}`, text, this.heartbeat);
    } catch {
      this.heartbeat = undefined;

      return;
    }

    this.heartbeat = text;
  }

  settled(): Promise<void> {
    return this.running ?? Promise.resolve();
  }

  private closedNow(): boolean {
    return this.closed;
  }

  private forget(): void {
    if (this.folder !== null) {
      this.host.removeFolder(this.folder);
    }

    this.folder = null;
    this.statePath = null;
  }

  private start(): void {
    if (this.running !== null || this.statePath === null) {
      return;
    }

    const running = this.drain();

    this.running = running;

    void running
      .finally(() => {
        this.running = null;

        if (!this.closed && !this.blocked && this.wanted !== this.last) {
          this.start();
        }
      })
      .catch(() => undefined);
  }

  private async drain(): Promise<void> {
    while (!this.closed && !this.blocked && this.wanted !== this.last) {
      const address = this.wanted;

      // eslint-disable-next-line no-await-in-loop -- writes go one at a time, newest last
      const written = await this.persist(address);

      if (!written) {
        this.blocked = true;
      }
    }
  }

  private async persist(address: string): Promise<boolean> {
    if (this.statePath === null) {
      return false;
    }

    if (this.last === undefined) {
      this.last = await this.host.read(this.statePath).catch(() => null);
    }

    try {
      await this.host.write(this.statePath, address, this.last);
    } catch {
      this.last = undefined;

      return false;
    }

    this.last = address;

    return true;
  }

  private async startViewer(): Promise<string | null> {
    if (this.statePath === null) {
      return null;
    }

    const command = [
      'run',
      '--bg',
      '--rm',
      '--json',
      '--no-parent',
      '--label',
      label,
      '--',
      this.host.script,
      'serve',
      this.statePath,
    ];

    const started = await this.host.hc(command).catch(() => null);

    if (started?.code !== 0) {
      return null;
    }

    let address: string | null;

    try {
      address = stringOf(recordOf(JSON.parse(started.stdout))['address']);
    } catch {
      address = null;
    }

    if (address === null) {
      return null;
    }

    this.viewer = address;

    return address;
  }
}
