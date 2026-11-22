export const replaceOnce = (source: string, from: string, to: string): string => {
  const parts = source.split(from);

  if (parts.length !== 2) {
    throw new Error(`expected one occurrence of ${from}`);
  }

  return parts.join(to);
};
