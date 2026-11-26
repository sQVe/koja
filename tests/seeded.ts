export const pick = <T>(items: readonly T[], random: () => number): T => {
  const item = items[Math.floor(random() * items.length)];

  if (item === undefined) {
    throw new Error('picked from an empty list');
  }

  return item;
};

export const seededRandom = (seed: number): (() => number) => {
  let state = seed + 1;

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;

    return state / 4_294_967_296;
  };
};
