const minuteSeconds = 60;

const hourSeconds = 3600;

const daySeconds = 86_400;

const weekSeconds = 604_800;

// Whole units of the largest size that fits, such as `4m` or `2d`; a time under a minute reads `now`.
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

  return `${Math.floor(elapsed / weekSeconds)}w`;
};
