import { describe, expect, test } from 'bun:test';

import type { SpaceInfo } from 'herdr';

import { placeOf } from './gitIdentity.ts';
import { observePlaces, placeOfSpace, placesOf } from './places.ts';

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

  test('indexes each live place by space and once by its key', () => {
    const observed = observePlaces(
      [spaceOf('root', '/code/a'), spaceOf('alias', '/code/a'), spaceOf('plain', '')],
      [],
    );

    expect(observed.bySpace).toEqual({
      root: placeOf(null, '/code/a'),
      alias: placeOf(null, '/code/a'),
      plain: placeOf(null, ''),
    });

    expect(observed.byKey).toEqual({ [placeOf(null, '/code/a').key]: placeOf(null, '/code/a') });
  });
});
