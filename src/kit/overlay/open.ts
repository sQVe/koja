import { setShared, shared } from 'herdr';

const overlayClosesKey = 'koja-overlay.closes';

export const overlayCloseCount = (): number => {
  const stored: unknown = shared(overlayClosesKey);

  return typeof stored === 'number' && Number.isInteger(stored) ? stored : 0;
};

export const recordOverlayClose = (): void => {
  setShared(overlayClosesKey, overlayCloseCount() + 1);
};
