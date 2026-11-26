import { window } from 'herdr';

import type { Platform } from './keys.ts';

type WindowState = NonNullable<ReturnType<typeof window>>;

export const currentWindow = (): WindowState | null => window();

export const currentPlatform = (): Platform => currentWindow()?.platform ?? 'linux';
