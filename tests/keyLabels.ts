import { isUpperCaseLetter } from '../src/kit/keys.ts';

// The glyph a keycap draws for one key, so a test can compare the drawn card with the key table.
export const keyLabel = (key: string): string => (isUpperCaseLetter(key) ? `⇧${key}` : key);
