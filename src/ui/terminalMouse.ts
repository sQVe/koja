export interface TerminalMouse {
  // Asks the outer terminal to report every mouse event in SGR encoding.
  enable: () => void;
  // Turns the reporting off. Call it once the client stops.
  restore: () => void;
}

const enableSequence = '\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h';

// Also clears the encodings the client never sets, in case an earlier program left them on.
const disableSequence =
  '\x1b[?1006l\x1b[?1016l\x1b[?1015l\x1b[?1005l\x1b[?1003l\x1b[?1002l\x1b[?1000l';

export const createTerminalMouse = (write: (text: string) => void): TerminalMouse => {
  let enabled = false;

  const enable = (): void => {
    if (!enabled) {
      write(enableSequence);
      enabled = true;
    }
  };

  const restore = (): void => {
    if (enabled) {
      write(disableSequence);
      enabled = false;
    }
  };

  return { enable, restore };
};
