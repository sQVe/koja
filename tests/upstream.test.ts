import { describe, expect, test } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';

interface UpstreamMod {
  source: string;
  release: string;
}

interface UpstreamScript {
  source: string;
  commit: string;
}

interface Upstream {
  mods: Record<string, UpstreamMod>;
  scripts: Record<string, UpstreamScript>;
}

const readUpstream = async (): Promise<Upstream> => {
  const record: unknown = JSON.parse(await readFile('herdr/upstream.json', 'utf8'));
  const isRecord = typeof record === 'object' && record !== null;

  if (!isRecord || !('mods' in record) || !('scripts' in record)) {
    throw new TypeError('herdr/upstream.json has no mods or scripts');
  }

  // SAFETY: test fixture data whose shape the tests below check field by field.
  return record as Upstream;
};

describe('the Herdr sources of derived mods', () => {
  test('name a Herdr source and release for mods that exist', async () => {
    const mods = (await readUpstream()).mods;
    const existing = await readdir('src/mods');

    for (const [name, upstream] of Object.entries(mods)) {
      expect(existing).toContain(name);
      expect(upstream.source).toMatch(/^defaults\//);
      expect(upstream.release).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  test('NOTICE names each derived mod with its source and release', async () => {
    const mods = (await readUpstream()).mods;
    const notice = await readFile('NOTICE', 'utf8');

    for (const [name, upstream] of Object.entries(mods)) {
      expect(notice).toContain(
        `- src/mods/${name}, from ${upstream.source} in Herdr ${upstream.release}`,
      );
    }
  });
});

describe('the Herdr sources of derived scripts', () => {
  test('name a Herdr source and commit for scripts that exist', async () => {
    const scripts = (await readUpstream()).scripts;
    const existing = await readdir('scripts');

    for (const [name, upstream] of Object.entries(scripts)) {
      expect(existing).toContain(name);
      expect(upstream.source).toBe(`scripts/${name}`);
      expect(upstream.commit).toMatch(/^[0-9a-f]{40}$/);
    }
  });

  test('NOTICE names each derived script with its source and commit', async () => {
    const scripts = (await readUpstream()).scripts;
    const notice = await readFile('NOTICE', 'utf8');

    for (const [name, upstream] of Object.entries(scripts)) {
      expect(notice).toContain(
        `- scripts/${name}, from ${upstream.source} at Herdr commit ${upstream.commit}`,
      );
    }
  });
});
