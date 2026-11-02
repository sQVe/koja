// Readers for values Herdr types as `any` or `unknown`, such as `props()` and `terminals()`.
// Each answers a safe empty value when the field is missing or has another type.

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const recordOf = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});

export const stringOf = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

export const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
