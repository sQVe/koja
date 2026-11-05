import type { Context } from 'gpui-kit';
import { hc } from 'herdr';

import type { Machine } from './machines.ts';
import { readMachineList } from './machines.ts';
import type { ReadState } from './readState.ts';
import { readErrorLine, readFailed, readSucceeded } from './readState.ts';

export class MachineTracker {
  private list: Machine[] = [];

  private readState: ReadState | undefined;

  private fetching = false;

  lookup(): Machine[] {
    return this.list;
  }

  refresh(cx: Context): void {
    if (this.fetching) {
      return;
    }

    this.fetch(cx);
  }

  retry(cx: Context): void {
    this.refresh(cx);
  }

  errorLine(): string | null {
    return readErrorLine(this.readState, 'machines', Date.now());
  }

  private fetch(cx: Context): void {
    this.fetching = true;

    cx.spawn(async (taskCx) => {
      try {
        const result = await hc(['machine', 'ls', '--json']);
        const list = result.code === 0 ? readMachineList(JSON.parse(result.stdout)) : null;

        if (list === null) {
          this.readState = readFailed(this.readState);
        } else {
          this.list = list;
          this.readState = readSucceeded(Date.now());
        }
      } catch {
        this.readState = readFailed(this.readState);
      } finally {
        this.fetching = false;
        taskCx.notify();
      }
    });
  }
}
