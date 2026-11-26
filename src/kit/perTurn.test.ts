import { describe, expect, test } from 'bun:test';

import { perTurn } from './perTurn.ts';

describe('perTurn', () => {
  test('reads once however many calls one turn makes', async () => {
    let reads = 0;

    const value = perTurn(() => {
      reads += 1;

      return `value ${reads}`;
    });

    expect(value()).toBe('value 1');
    expect(value()).toBe('value 1');
    expect(reads).toBe(1);

    await Promise.resolve();

    expect(value()).toBe('value 2');
  });

  test('keeps a value read in one turn until the queued microtask runs', async () => {
    let source = 'first';
    const value = perTurn(() => source);

    expect(value()).toBe('first');

    source = 'second';

    expect(value()).toBe('first');

    await Promise.resolve();

    expect(value()).toBe('second');
  });

  test('caches a null read', () => {
    let reads = 0;

    const value = perTurn(() => {
      reads += 1;

      return null;
    });

    expect(value()).toBeNull();
    expect(value()).toBeNull();
    expect(reads).toBe(1);
  });

  test('does not cache a throwing read', () => {
    let reads = 0;

    const value = perTurn((): string => {
      reads += 1;

      throw new Error('no value');
    });

    expect(() => value()).toThrow('no value');
    expect(() => value()).toThrow('no value');
    expect(reads).toBe(2);
  });
});
