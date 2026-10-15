export interface TerminalKeyboard {
  // Asks the outer terminal for the keys the focused pane's kitty flags need.
  follow: (paneFlags: number) => void;
  // Puts the outer terminal back as it was. Call it once the client stops.
  restore: () => void;
}

const pushFlags = (flags: number): string => `\x1b[>${flags}u`;

const popFlags = '\x1b[<u';

const allKeys = 8;

// Disambiguate, event types, and alternate keys.
const baseFlags = 7;

// All keys as escape codes, and associated text, on top of the base flags.
const allKeysFlags = 31;

const flagsFor = (paneFlags: number): number =>
  (paneFlags & allKeys) === 0 ? baseFlags : allKeysFlags;

// A terminal without kitty keyboard support ignores these sequences and keeps sending legacy keys.
export const createTerminalKeyboard = (write: (text: string) => void): TerminalKeyboard => {
  let asked: number | undefined;

  const follow = (paneFlags: number): void => {
    const wanted = flagsFor(paneFlags);

    if (wanted === asked) {
      return;
    }

    write(asked === undefined ? pushFlags(wanted) : popFlags + pushFlags(wanted));
    asked = wanted;
  };

  const restore = (): void => {
    if (asked !== undefined) {
      write(popFlags);
      asked = undefined;
    }
  };

  return { follow, restore };
};
