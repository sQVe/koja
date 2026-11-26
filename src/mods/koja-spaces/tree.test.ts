import { describe, expect, test } from 'bun:test';

import { placeOf, repositoryOf } from '../../data/gitIdentity.ts';

describe('places and repositories', () => {
  test('one folder on two machines makes two places', () => {
    expect(placeOf(null, '/code/koja').key).not.toBe(placeOf('build-box', '/code/koja').key);
  });

  test('one repository path on two machines makes two repositories', () => {
    expect(repositoryOf(null, '/code/koja/.git').key).not.toBe(
      repositoryOf('build-box', '/code/koja/.git').key,
    );
  });
});
