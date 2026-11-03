export interface KeyModifiers {
  shift: boolean;
  control: boolean;
  alt: boolean;
  platform: boolean;
  function: boolean;
}

export interface NormalKeyEvent {
  key: string;
  keystroke: string;
  key_char?: string;
  modifiers: KeyModifiers;
}

const chordModifiers = ['control', 'alt', 'platform', 'function'] as const;

const hasChordModifier = (modifiers: KeyModifiers): boolean =>
  chordModifiers.some((modifier) => modifiers[modifier]);

const isPrintable = (character: string | undefined): character is string =>
  character !== undefined && /^\S$/.test(character);

export const normalizeKey = (event: NormalKeyEvent): string => {
  if (hasChordModifier(event.modifiers)) {
    return event.keystroke;
  }

  return isPrintable(event.key_char) ? event.key_char : event.keystroke;
};
