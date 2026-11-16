export const parsedJson = (text: string | null): unknown => {
  if (text === null) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(text);

    return value;
  } catch {
    return null;
  }
};
