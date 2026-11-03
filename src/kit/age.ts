const minuteSeconds = 60;

const hourSeconds = 3600;

const daySeconds = 86_400;

const weekSeconds = 604_800;

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
