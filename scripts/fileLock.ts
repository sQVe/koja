import { resolve } from 'node:path';
import { clearTimeout, setTimeout } from 'node:timers';

interface LockOptions {
  readonly onWait?: (() => void) | undefined;
  readonly timeoutMilliseconds?: number | undefined;
}

interface CheckoutLockOptions extends LockOptions {
  readonly held?: boolean | undefined;
}

interface LockChild {
  readonly stdout: ReadableStream<Uint8Array>;
  kill: () => void;
}

interface PendingTimeout {
  readonly promise: Promise<never>;
  cancel: () => void;
}

const readyMarker = 'koja-checkout-lock-ready\n';

// A free lock is granted at once, so a wait signal this late means the lock is really held.
const waitGraceMilliseconds = 100;

const readUntil = async (stream: ReadableStream<Uint8Array>, marker: string): Promise<string> => {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = '';

  try {
    while (!output.includes(marker)) {
      // eslint-disable-next-line no-await-in-loop -- readiness arrives one chunk at a time
      const { done, value } = await reader.read();

      if (done) {
        return output;
      }

      output += decoder.decode(value, { stream: true });
    }

    return output;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
};

export class LockTimeoutError extends Error {
  override name = 'LockTimeoutError';

  constructor(milliseconds: number, target: string) {
    super(`Timed out after ${milliseconds} ms waiting for the lock on ${target}`);
  }
}

const timeoutAfter = (milliseconds: number, target: string): PendingTimeout => {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const promise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new LockTimeoutError(milliseconds, target));
    }, milliseconds);
  });

  return {
    promise,
    cancel: () => {
      clearTimeout(timer);
    },
  };
};

const readReady = async (
  child: LockChild,
  target: string,
  options: LockOptions,
): Promise<string> => {
  const waitTimer = setTimeout(() => options.onWait?.(), waitGraceMilliseconds);
  const ready = readUntil(child.stdout, readyMarker);

  const timeout =
    options.timeoutMilliseconds === undefined
      ? null
      : timeoutAfter(options.timeoutMilliseconds, target);

  const settled = timeout === null ? ready : Promise.race([ready, timeout.promise]);

  try {
    return await settled;
  } finally {
    clearTimeout(waitTimer);
    timeout?.cancel();
  }
};

export const acquireFileLock = async (
  path: string,
  options: LockOptions = {},
): Promise<() => Promise<void>> => {
  const target = resolve(path);

  const child = Bun.spawn({
    // --close keeps the descriptor out of the shell, so killing flock releases the lock.
    cmd: ['flock', '--exclusive', '--close', target, 'sh', '-c', `printf '${readyMarker}'; cat`],
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const output = await readReady(child, target, options).catch(async (error: unknown) => {
    child.kill();
    await child.exited;

    throw error;
  });

  if (!output.includes(readyMarker)) {
    const stderr = await new Response(child.stderr).text();

    child.kill();
    await child.exited;

    throw new Error(`Could not acquire the lock on ${target}: ${stderr.trim()}`);
  }

  let released = false;

  return async () => {
    if (released) {
      return;
    }

    released = true;

    await child.stdin.end();
    await child.exited;
  };
};

export const acquireCheckoutLock = async (
  checkout: string,
  options: CheckoutLockOptions = {},
): Promise<() => Promise<void>> => {
  // Sandbox launchers already hold this same lock around the whole install command, and name the
  // checkout they locked, so an inherited value never skips the lock of another checkout.
  const heldByLauncher = Bun.env['KOJA_CHECKOUT_LOCK_HELD'] === resolve(checkout);

  if (options.held === true || heldByLauncher) {
    return () => Promise.resolve();
  }

  return acquireFileLock(checkout, options);
};
