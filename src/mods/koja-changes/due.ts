export interface DueState {
  key: string;
  dirtyAt: number;
  catchUp: boolean;
  pollAt: number;
  watchAt: number;
  lastStatus: number | null;
}

export interface DueWorld {
  visible: boolean;
  shownAgain: boolean;
  loading: boolean;
  busy: boolean;
  now: number;
}

export interface ReadRequest {
  after: number;
  visiting: boolean;
  urgent: boolean;
  allowHidden: boolean;
}

export interface ScanTiming {
  started: number;
  pollAt: number;
  watchAt: number;
}

const pollMilliseconds = 10000;

export const emptyDue = (key: string): DueState => ({
  key,
  dirtyAt: 0,
  catchUp: false,
  pollAt: 0,
  watchAt: 0,
  lastStatus: null,
});

export const tickDue = (due: DueState, world: DueWorld, watched: boolean): DueState => {
  const missed = due.dirtyAt > 0 || !watched;
  const catchingUp = world.shownAgain && missed;

  return catchingUp ? { ...due, catchUp: true } : due;
};

export const readDue = (due: DueState, world: DueWorld): boolean => {
  if (!world.visible || world.loading || world.busy) {
    return false;
  }

  if (due.catchUp) {
    return true;
  }

  if (due.dirtyAt > 0 && world.now >= due.watchAt) {
    return true;
  }

  return world.now >= due.pollAt;
};

export const markDirty = (due: DueState, now: number): DueState => ({ ...due, dirtyAt: now + 1 });

export const readRequest = (
  due: DueState,
  now: number,
  visiting: boolean,
  force: boolean,
): { due: DueState; request: ReadRequest } => {
  const catchingUp = due.catchUp && due.dirtyAt === 0;
  const armed = force || catchingUp ? markDirty(due, now) : due;
  const previous = armed.lastStatus ?? -1;

  const request: ReadRequest = {
    after: visiting ? now + 1 : armed.dirtyAt || previous + 1,
    visiting,
    urgent: force || visiting || armed.catchUp,
    allowHidden: force || visiting,
  };

  return {
    due: {
      ...armed,
      catchUp: false,
      pollAt: now + pollMilliseconds,
      watchAt: now + pollMilliseconds,
    },
    request,
  };
};

export const afterScan = (due: DueState, scan: ScanTiming, request: ReadRequest): DueState => {
  const unanswered = request.urgent && request.after > scan.started;

  return {
    ...due,
    lastStatus: scan.started,
    pollAt: scan.pollAt,
    watchAt: scan.watchAt,
    dirtyAt: due.dirtyAt <= scan.started ? 0 : due.dirtyAt,
    catchUp: due.catchUp || unanswered,
  };
};

export const skipDue = (due: DueState, now: number): DueState => ({
  ...due,
  catchUp: false,
  dirtyAt: 0,
  pollAt: now + pollMilliseconds,
});
