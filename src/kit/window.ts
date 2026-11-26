import { window } from 'herdr';

import type { Platform } from './keys.ts';

type WindowState = ReturnType<typeof window>;

export const currentWindow = (): WindowState | null => window();

export const currentPlatform = (): Platform => currentWindow()?.platform ?? 'linux';
