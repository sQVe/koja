import type { OverlaySpec } from 'herdr';
import { openOverlay } from 'herdr';

// Opens a popup at the top of the window, `offset` pixels down, as Herdr's own picker and the
// palette's mod.json do. herdr.d.ts declares `at` only as "pointer" or a point, so the spec is
// passed as a plain record.
export const openAtTop = (spec: OverlaySpec, offset: number): string => {
  const placed: Record<string, unknown> = { ...spec, kind: 'popup', at: 'top', offset };

  return openOverlay(placed);
};
