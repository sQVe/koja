export interface DragState {
  source: string | null;
  over: string | null;
}

export type DropAction =
  | { kind: 'move'; id: string; index: number }
  | { kind: 'select'; id: string };

export const noDrag: DragState = { source: null, over: null };

export const startDrag = (order: readonly string[], index: number): DragState => {
  const source = order[index] ?? null;

  return { source, over: source };
};

export const setDragOver = (state: DragState, over: string, allowed: boolean): DragState => {
  if (state.source === null) {
    return state;
  }

  return { ...state, over: allowed ? over : null };
};

export const dragLine = (
  state: DragState,
  over: string,
  order: readonly string[],
): 'top' | 'bottom' | undefined => {
  const { source } = state;

  if (source === null || state.over !== over || source === over) {
    return undefined;
  }

  const from = order.indexOf(source);
  const to = order.indexOf(over);

  if (from === -1 || to === -1) {
    return undefined;
  }

  return from < to ? 'bottom' : 'top';
};

export const dropAction = (
  state: DragState,
  over: string,
  order: readonly string[],
): DropAction | null => {
  if (state.source === null || state.over !== over) {
    return null;
  }

  if (!order.includes(state.source)) {
    return null;
  }

  if (state.source === over) {
    return { kind: 'select', id: over };
  }

  const to = order.indexOf(over);

  if (to === -1) {
    return null;
  }

  return { kind: 'move', id: state.source, index: to + 1 };
};
