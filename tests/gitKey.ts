import { placeOf } from '../src/data/gitIdentity.ts';

export const keyOf = (machine: string | null, path: string): string => placeOf(machine, path).key;
