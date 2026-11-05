import type { Context } from 'gpui-kit';
import { hc } from 'herdr';

import type { Machine } from './machines.ts';
import { readMachineList } from './machines.ts';
import { readErrorLine } from './readState.ts';

export class MachineTracker {
  private list: Machine[] = [];

  private goodAt: number | null = null;

  private failed = false;

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
    return this.failed ? readErrorLine('machines', this.goodAt, Date.now()) : null;
  }

  private fetch(cx: Context): void {
    this.fetching = true;

    cx.spawn(async (taskCx) => {
      try {
        const result = await hc(['machine', 'ls', '--json']);
        const list = result.code === 0 ? readMachineList(JSON.parse(result.stdout)) : null;

        if (list === null) {
          this.failed = true;
        } else {
          this.list = list;
          this.goodAt = Date.now();
          this.failed = false;
        }
      } catch {
        this.failed = true;
      } finally {
        this.fetching = false;
        taskCx.notify();
      }
    });
  }
}
