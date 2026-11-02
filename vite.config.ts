import { format, lint } from '@sqve/seam';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  lint: {
    extends: [lint],
    // The Herdr sources stay as they were until they are converted to TypeScript. Herdr's
    // declarations are kept as Herdr wrote them, so an upgrade's diff shows only Herdr's changes.
    ignorePatterns: ['src/mods/**/*.js', 'herdr/**'],
  },
  fmt: {
    ...format,
    // Local agent state is not source and must not be reformatted.
    ignorePatterns: ['bun.lock', '.tau/**', 'herdr/**', 'src/mods/**', 'config/**'],
  },
  staged: {
    '*.{ts,tsx,js,jsx,mjs,cjs}': [
      'bunx --bun seam --no-error-on-unmatched-pattern',
      'bunx --bun vp fmt --check --no-error-on-unmatched-pattern',
    ],
    '*.{json,md,yaml,yml,css}': 'bunx --bun vp fmt --check --no-error-on-unmatched-pattern',
  },
});
