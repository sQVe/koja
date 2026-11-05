export const hoveredAfter = (
  current: string | null,
  id: string,
  hovered: boolean,
): string | null => {
  if (hovered) {
    return id;
  }

  return current === id ? null : current;
};
