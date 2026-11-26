import { describe, expect, test } from 'bun:test';

import { repoName, repoPathName, repositoryNameOf } from './repositoryName.ts';

describe('repoName', () => {
  test('names a repository after its checkout folder', () => {
    expect(repoName('/code/koja')).toBe('koja');
  });

  test('names a checkout whose folder ends in .git', () => {
    expect(repoName('/code/koja.git')).toBe('koja');
  });

  test('names the checkout that holds the git folder', () => {
    expect(repoName('/code/koja/.git')).toBe('koja');
    expect(repoName('/code/koja/.bare')).toBe('koja');
  });

  test('ignores a trailing slash', () => {
    expect(repoName('/code/koja/')).toBe('koja');
  });
});

describe('repoPathName', () => {
  test('names the checkout that holds a .git or .bare folder', () => {
    expect(repoPathName('/code/koja/.git')).toBe('koja');
    expect(repoPathName('/code/koja/.bare')).toBe('koja');
  });

  test('ignores a trailing slash', () => {
    expect(repoPathName('/code/koja/.git/')).toBe('koja');
  });

  test('names a git folder kept outside the checkout', () => {
    expect(repoPathName('/code/elsewhere.git')).toBe('elsewhere');
  });
});

describe('repositoryNameOf', () => {
  test('names a repository after its own checkout', () => {
    expect(repositoryNameOf('/code/koja', '/code/koja/.bare')).toBe('koja');
  });

  test('falls back to the git folder when there is no checkout to name', () => {
    expect(repositoryNameOf(null, '/code/koja/.git')).toBe('koja');
    expect(repositoryNameOf(null, '/code/elsewhere.git')).toBe('elsewhere');
  });
});
