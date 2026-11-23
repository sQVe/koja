import { resolve } from 'node:path';

interface CheckoutLockOptions {
  readonly held?: boolean | undefined;
  readonly onWait?: (() => void) | undefined;
}

const readyMarker = 'koja-checkout-lock-ready\n';

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

export const acquireCheckoutLock = async (
  checkout: string,
  options: CheckoutLockOptions = {},
): Promise<() => Promise<void>> => {
  // Sandbox launchers already hold this same lock around the whole install command.
  if (options.held === true || Bun.env['KOJA_CHECKOUT_LOCK_HELD'] === '1') {
    return () => Promise.resolve();
  }

  const path = resolve(checkout);

  const child = Bun.spawn({
    cmd: ['flock', '--exclusive', path, 'sh', '-c', `printf '${readyMarker}'; cat`],
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  });

  options.onWait?.();

  const output = await readUntil(child.stdout, readyMarker).catch(async (error: unknown) => {
    child.kill();
    await child.exited;

    throw error;
  });

  if (!output.includes(readyMarker)) {
    const stderr = await new Response(child.stderr).text();

    child.kill();
    await child.exited;

    throw new Error(`Could not acquire the checkout lock for ${path}: ${stderr.trim()}`);
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
