import { describe, expect, test } from 'bun:test';

import type { SpaceMove } from './spaceDrop.ts';
import { canDrop, dropMoves } from './spaceDrop.ts';

// Applies moves as Herdr does: each index is the one-based final place in the whole order.
const applied = (order: readonly string[], moves: readonly SpaceMove[]): string[] =>
  moves.reduce<string[]>(
    (current, move) => {
      const rest = current.filter((id) => id !== move.id);

      rest.splice(move.index - 1, 0, move.id);

      return rest;
    },
    [...order],
  );

const projects = [
  ['a1', 'a2', 'a3'],
  ['b1', 'b2'],
];

describe('canDrop', () => {
  test('allows a drop on another space of the same project', () => {
    expect(canDrop(projects, 'a1', 'a3')).toBe(true);
  });

  test('allows a drop on the space the drag started from', () => {
    expect(canDrop(projects, 'main', 'main')).toBe(true);
  });

  test('refuses a drop on a space of another project', () => {
    expect(canDrop(projects, 'a1', 'b1')).toBe(false);
  });

  test('refuses a drop on a space that is not below a project header', () => {
    expect(canDrop(projects, 'a1', 'main')).toBe(false);
  });

  test('refuses a drop of a space that is not below a project header', () => {
    expect(canDrop(projects, 'main', 'a1')).toBe(false);
  });
});

describe('dropMoves', () => {
  test('a drop of the first space on the last puts it last with one move', () => {
    const order = ['main', 'a1', 'a2', 'a3', 'b1', 'b2'];
    const moves = dropMoves(order, projects, 'a1', 'a3');

    expect(applied(order, moves)).toEqual(['main', 'a2', 'a3', 'a1', 'b1', 'b2']);
    expect(moves).toHaveLength(1);
  });

  test('a drop of a later space on the first puts it first with one move', () => {
    const order = ['main', 'a1', 'a2', 'a3', 'b1'];
    const moves = dropMoves(order, projects, 'a3', 'a1');

    expect(applied(order, moves)).toEqual(['main', 'a3', 'a1', 'a2', 'b1']);
    expect(moves).toHaveLength(1);
  });

  test('a drop on the next space puts the space below it', () => {
    const order = ['a1', 'a2', 'a3'];

    expect(applied(order, dropMoves(order, projects, 'a1', 'a2'))).toEqual(['a2', 'a1', 'a3']);
  });

  test('a drop among spaces of another project leaves that project in its places', () => {
    const order = ['a1', 'b1', 'a2', 'a3', 'b2'];

    expect(applied(order, dropMoves(order, projects, 'a1', 'a3'))).toEqual([
      'a2',
      'b1',
      'a3',
      'a1',
      'b2',
    ]);
  });

  test('a drop moving up among spaces of another project leaves that project in its places', () => {
    const order = ['b1', 'a1', 'b2', 'a2', 'a3'];

    expect(applied(order, dropMoves(order, projects, 'a3', 'a1'))).toEqual([
      'b1',
      'a3',
      'b2',
      'a1',
      'a2',
    ]);
  });

  test('a drop on a space of another project moves nothing', () => {
    expect(dropMoves(['a1', 'b1'], projects, 'a1', 'b1')).toEqual([]);
  });

  test('a drop on the space the drag started from moves nothing', () => {
    expect(dropMoves(['a1', 'a2'], projects, 'a1', 'a1')).toEqual([]);
  });
});
