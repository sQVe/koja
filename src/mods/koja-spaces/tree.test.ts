import { describe, expect, test } from 'bun:test';

import type { SpaceInfo } from 'herdr';

import { placeOf, placeOfSpace, repoName, repoOf } from './tree.ts';

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

  test('the place of a remote space carries its machine', () => {
    const space: SpaceInfo = {
      id: 'remote',
      index: 1,
      name: 'remote',
      named: false,
      folder: '/srv/app',
      machine: 'build-box',
      branch: null,
      active: false,
      status: null,
      tabs: [],
    };

    expect(placeOfSpace(space, [])).toEqual(placeOf('build-box', '/srv/app'));
  });

  test('one repository path on two machines makes two repositories', () => {
    expect(repoOf(null, '/code/koja/.git').key).not.toBe(
      repoOf('build-box', '/code/koja/.git').key,
    );
  });
});
