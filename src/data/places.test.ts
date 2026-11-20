import { describe, expect, test } from 'bun:test';

import type { SpaceInfo } from 'herdr';

import { placeOf } from './gitIdentity.ts';
import { placeOfSpace, placesOf } from './places.ts';

const spaceOf = (id: string, folder: string, machine: string | null = null): SpaceInfo => ({
  id,
  index: 1,
  name: id,
  named: false,
  folder,
  machine,
  branch: null,
  active: false,
  status: null,
  tabs: [],
});

describe('places', () => {
  test('maps each space ID to its place', () => {
    const local = spaceOf('local', '/code/koja');
    const remote = spaceOf('remote', '/srv/app', 'build-box');

    expect(placesOf([local, remote], [])).toEqual({
      [local.id]: placeOf(null, '/code/koja'),
      [remote.id]: placeOf('build-box', '/srv/app'),
    });
  });

  test('the place of a remote space carries its machine', () => {
    const space = spaceOf('remote', '/srv/app', 'build-box');

    expect(placeOfSpace(space, [])).toEqual(placeOf('build-box', '/srv/app'));
  });
});
