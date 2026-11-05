const minuteSeconds = 60;

const hourSeconds = 3600;

const daySeconds = 86_400;

const weekSeconds = 604_800;

const oldSeconds = 314_496_000;

export const shortAge = (thenSeconds: number, nowSeconds: number): string => {
  const elapsed = Math.max(0, nowSeconds - thenSeconds);

  if (elapsed < minuteSeconds) {
    return 'now';
  }

  if (elapsed < hourSeconds) {
    return `${Math.floor(elapsed / minuteSeconds)}m`;
  }

  if (elapsed < daySeconds) {
    return `${Math.floor(elapsed / hourSeconds)}h`;
  }

  if (elapsed < weekSeconds) {
    return `${Math.floor(elapsed / daySeconds)}d`;
  }

  if (elapsed > oldSeconds) {
    return 'old';
  }

  return `${Math.floor(elapsed / weekSeconds)}w`;
};
