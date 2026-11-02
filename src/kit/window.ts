import { window } from 'herdr';

import type { Platform } from './keys.ts';

type WindowState = ReturnType<typeof window>;

// herdr.d.ts types `window()` as always there, but it is null while no window is open, such as
// under `herdr-app check`.
export const currentWindow = (): WindowState | null => window();

export const currentPlatform = (): Platform => currentWindow()?.platform ?? 'linux';
