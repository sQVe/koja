export interface NormalModeEffects {
  holdKeyboard: () => void;
}

export const runNormalModeCommand = (command: string, effects: NormalModeEffects): void => {
  if (command === 'hold') {
    effects.holdKeyboard();
  }
};
