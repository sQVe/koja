import { recordOf } from './fields.ts';

export interface SpaceOrder {
  shown: string[];
  hidden: string[];
}

const spaceOrderKey = 'spaces.order';

const isIdList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isSpaceOrder = (value: unknown): value is SpaceOrder => {
  const record = recordOf(value);

  return isIdList(record['shown']) && isIdList(record['hidden']);
};

export const readSpaceOrder = (get: (key: string) => unknown): SpaceOrder | null => {
  const value = get(spaceOrderKey);

  if (!isSpaceOrder(value)) {
    return null;
  }

  return { shown: [...value.shown], hidden: [...value.hidden] };
};

export const writeSpaceOrder = (
  set: (key: string, value: unknown) => void,
  order: SpaceOrder,
): void => {
  set(spaceOrderKey, { shown: [...order.shown], hidden: [...order.hidden] });
};

export const clearSpaceOrder = (set: (key: string, value: unknown) => void): void => {
  set(spaceOrderKey, null);
};
