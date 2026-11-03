import { keys } from 'herdr';

import { bindingFor } from './shortcutBinding.ts';

export const shortcutFor = (...actions: string[]): string | null => bindingFor(keys(), ...actions);
