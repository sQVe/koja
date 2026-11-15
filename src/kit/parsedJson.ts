export const parsedJson = (text: string): unknown => {
  try {
    const value: unknown = JSON.parse(text);

    return value;
  } catch {
    return null;
  }
};
