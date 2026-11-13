import { describe, expect, test } from 'bun:test';

import { placeOf, repoName, repoOf } from './tree.ts';

describe('repository names', () => {
  test('names a repository after its checkout folder, not its git folder', () => {
    expect(repoName('/code/koja')).toBe('koja');
  });

  test('drops the .git ending of a bare repository folder', () => {
    expect(repoName('/code/koja.git')).toBe('koja');
  });
});

describe('places and repositories', () => {
  test('one folder on two machines makes two places', () => {
    expect(placeOf(null, '/code/koja').key).not.toBe(placeOf('build-box', '/code/koja').key);
  });

  test('one repository path on two machines makes two repositories', () => {
    expect(repoOf(null, '/code/koja/.git').key).not.toBe(
      repoOf('build-box', '/code/koja/.git').key,
    );
  });
});
