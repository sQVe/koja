import { keys } from 'herdr';

import type { OverlayHint } from './shortcutBinding.ts';
import { bindingFor, hintFor as hintFrom } from './shortcutBinding.ts';
import { currentPlatform } from './window.ts';

export const shortcutFor = (...actions: string[]): string | null => bindingFor(keys(), ...actions);

export const hintFor = (...actions: string[]): OverlayHint =>
  hintFrom(keys(), currentPlatform(), ...actions);
