import type { OverlaySpec } from 'herdr';
import { closeOverlay as closeHerdrOverlay, openOverlay, props } from 'herdr';

import { recordOf, stringOf } from './fields.ts';

// The id Herdr gave the overlay this mod runs in, or null outside one.
export const overlayId = (): string | null => stringOf(recordOf(props())['overlay']);

// Closes this mod's overlay, or the captured one `id` names, and does nothing outside one.
export const closeOverlay = (id: string | null = overlayId()): void => {
  if (id !== null) {
    closeHerdrOverlay(id);
  }
};

// Opens a popup at the top of the window, `offset` pixels down, as Herdr's own picker and the
// palette's mod.json do. herdr.d.ts declares `at` only as "pointer" or a point, so the spec is
// passed as a plain record.
export const openAtTop = (spec: OverlaySpec, offset: number): string => {
  const placed: Record<string, unknown> = { ...spec, kind: 'popup', at: 'top', offset };

  return openOverlay(placed);
};
