import { describe, expect, test } from 'bun:test';

import { repoName, repoPathName } from './repositoryName.ts';

describe('repoName', () => {
  test('names a repository after its checkout folder, not its git folder', () => {
    expect(repoName('/code/koja')).toBe('koja');
  });

  test('drops the .git ending of a bare repository folder', () => {
    expect(repoName('/code/koja.git')).toBe('koja');
  });
});

describe('repoPathName', () => {
  test('names the checkout that holds a .git or .bare folder', () => {
    expect(repoPathName('/code/koja/.git')).toBe('koja');
    expect(repoPathName('/code/koja/.bare')).toBe('koja');
  });

  test('names a git folder kept outside the checkout', () => {
    expect(repoPathName('/code/elsewhere.git')).toBe('elsewhere');
  });
});
