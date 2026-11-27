import { format, lint } from '@sqve/stomme-ts-style';
import { defineConfig } from 'vite-plus';

const scriptChecks = [
  'bunx --bun stomme-ts-style',
  'bunx --bun vp fmt --check --no-error-on-unmatched-pattern',
];

export default defineConfig({
  lint: {
    extends: [lint],
    // Herdr's declarations are kept as Herdr wrote them, so an upgrade's diff shows only
    // Herdr's changes.
    ignorePatterns: ['herdr/*.d.ts'],
    overrides: [
      {
        // Herdr's runtime declares only bare module specifiers, so a `node:` import neither
        // typechecks nor resolves in a mod.
        files: ['src/mods/**/*.ts'],
        excludeFiles: ['src/mods/**/*.test.ts'],
        rules: { 'unicorn/prefer-node-protocol': 'off' },
      },
    ],
  },
  fmt: {
    ...format,
    // Local agent state is not source and must not be reformatted.
    // `stomme sync` writes `docs/stomme/**`; a formatter change makes `stomme check` report
    // the files as edited.
    // `src/data/fixtures/gh-stack/**` holds records as `gh stack` writes them, and one is
    // cut off on purpose so a reader test can see the parse fail.
    ignorePatterns: [
      'bun.lock',
      '.tau/**',
      'herdr/*.d.ts',
      'docs/stomme/**',
      'src/data/fixtures/gh-stack/**',
    ],
  },
  staged: {
    // Declaration files are kept as Herdr wrote them, so lint never gets them.
    '!(*.d).ts': scriptChecks,
    '*.{tsx,js,jsx,mjs,cjs}': scriptChecks,
    '*.{json,md,yaml,yml,css}': 'bunx --bun vp fmt --check --no-error-on-unmatched-pattern',
  },
});
