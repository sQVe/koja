// Which keys use `ESC O` forms: none under kitty flags, the function keys, or cursor keys too.
type Ss3Use = 'none' | 'function' | 'all';

type KeyKind = 'press' | 'repeat' | 'release';

// `key` is one character, such as `a`, or a name: enter, tab, backspace, escape, up, down, left,
// right, home, end, insert, delete, pageUp, pageDown, f1 to f12. Two names are not keys a pane
// receives: `unsupported` for keypad and modifier-only keys, and `opaque` for bytes this module
// does not parse; those pass through unchanged.
export interface KeyEvent {
  key: string;
  // Kitty modifier bits, without the offset of 1 the wire form adds.
  modifiers: number;
  kind: KeyKind;
  shifted: number | undefined;
  base: number | undefined;
  text: string | undefined;
  raw: string;
  // The bytes are a legacy key, so flags 0 send them as they came.
  legacy: boolean;
}

export const keyModifier = { shift: 1, alt: 2, ctrl: 4, super: 8, hyper: 16, meta: 32 } as const;

const kittyFlag = {
  disambiguate: 1,
  eventTypes: 2,
  alternateKeys: 4,
  allKeys: 8,
  associatedText: 16,
} as const;

const encoder = new TextEncoder();

const escape = '\x1b';
const csi = '\x1b[';
const ss3 = '\x1bO';

const modifierMask = 0xff;
const keyModifierMask = 0x3f;
const legacyModifierMask = keyModifier.shift | keyModifier.alt | keyModifier.ctrl;

const unicodeLimit = 0x10ffff;
const firstPrivateUse = 0xe000;
const lastPrivateUse = 0xf8ff;

const eventNumbers: Record<KeyKind, number> = { press: 1, repeat: 2, release: 3 };

const editingCodes = new Map<string, number>(
  Object.entries({ escape: 27, enter: 13, tab: 9, backspace: 127 }),
);

const keysOfCode = new Map<number, string>(
  Array.from(editingCodes, ([name, code]) => [code, name]),
);

const finalKeys = new Map<string, string>(
  Object.entries({
    A: 'up',
    B: 'down',
    C: 'right',
    D: 'left',
    H: 'home',
    F: 'end',
    P: 'f1',
    Q: 'f2',
    R: 'f3',
    S: 'f4',
    E: 'unsupported',
  }),
);

const keyFinals = new Map<string, string>(Array.from(finalKeys, ([final, key]) => [key, final]));

const tildeCodes = new Map<string, number>(
  Object.entries({
    insert: 2,
    delete: 3,
    pageUp: 5,
    pageDown: 6,
    f5: 15,
    f6: 17,
    f7: 18,
    f8: 19,
    f9: 20,
    f10: 21,
    f11: 23,
    f12: 24,
  }),
);

const tildeAliases: Record<string, string> = {
  1: 'home',
  4: 'end',
  7: 'home',
  8: 'end',
  11: 'f1',
  12: 'f2',
  13: 'f3',
  14: 'f4',
};

const tildeKeys = new Map<number, string>([
  ...Array.from(tildeCodes, ([key, code]): [number, string] => [code, key]),
  ...Object.entries(tildeAliases).map(([code, key]): [number, string] => [Number(code), key]),
]);

const keyKinds: Record<number, KeyKind> = { 1: 'press', 2: 'repeat', 3: 'release' };

const firstSurrogate = 0xd800;
const lastSurrogate = 0xdfff;
const firstSupplementaryPrivateUse = 0xf0000;
const lastC0Control = 0x1f;
const firstC1Control = 0x7f;
const lastC1Control = 0x9f;
const lastControlLetter = 26;
const firstControlSymbol = 28;
const controlLetters = 'abcdefghijklmnopqrstuvwxyz';
const controlSymbols = '\\]^_';
const controlSymbolCount = controlSymbols.length;

const hasFlag = (flags: number, flag: number): boolean => (flags & flag) !== 0;

const isCodePoint = (code: number): boolean => code >= 0 && code <= unicodeLimit;

const isSurrogate = (code: number): boolean => code >= firstSurrogate && code <= lastSurrogate;

const isPrivateUse = (code: number): boolean => code >= firstPrivateUse && code <= lastPrivateUse;

const isControlText = (text: string): boolean =>
  Array.from(text).some((character) => {
    const code = character.codePointAt(0) ?? 0;

    const isC1 = code >= firstC1Control && code <= lastC1Control;

    return code <= lastC0Control || isC1;
  });

const isAsciiLetter = (character: string): boolean => /^[a-z]$/i.test(character);

const isCharacterKey = (key: string): boolean => Array.from(key).length === 1;

const isFunctionalKey = (key: string): boolean => keyFinals.has(key) || tildeCodes.has(key);

const isEditingKey = (key: string): boolean => editingCodes.has(key);

const toNumber = (field: string | undefined): number | undefined => {
  const value = Number.parseInt(field ?? '', 10);

  return Number.isNaN(value) ? undefined : value;
};

const numbersOf = (field: string | undefined): (number | undefined)[] =>
  (field ?? '').split(':').map(toNumber);

const makeEvent = (raw: string, key: string, legacy: boolean): KeyEvent => ({
  key,
  modifiers: 0,
  kind: 'press',
  shifted: undefined,
  base: undefined,
  text: undefined,
  raw,
  legacy,
});

const opaqueEvent = (raw: string): KeyEvent => makeEvent(raw, 'opaque', true);

const keyOfCode = (code: number | undefined): string => {
  if (code === undefined || !isCodePoint(code) || isSurrogate(code)) {
    return 'unsupported';
  }

  const name = keysOfCode.get(code);

  if (name !== undefined) {
    return name;
  }

  return isPrivateUse(code) || code >= firstSupplementaryPrivateUse
    ? 'unsupported'
    : String.fromCodePoint(code);
};

const isTextCode = (code: number | undefined): boolean =>
  code !== undefined && isCodePoint(code) && !isSurrogate(code);

const textOfCodes = (field: string | undefined): string | undefined => {
  const codes = numbersOf(field);
  const valid = codes.every(isTextCode);

  if (!valid) {
    return undefined;
  }

  return codes.map((code) => String.fromCodePoint(code ?? 0)).join('');
};

// The second field of a kitty key: modifiers plus one, then the event type.
const withModifiers = (event: KeyEvent, field: string | undefined): KeyEvent => {
  const [modifiers, eventType] = numbersOf(field);

  return {
    ...event,
    modifiers: Math.max((modifiers ?? 1) - 1, 0),
    kind: keyKinds[eventType ?? 1] ?? 'press',
  };
};

const parseCsiU = (raw: string, fields: string[]): KeyEvent => {
  const [code, rawShifted, rawBase] = numbersOf(fields[0]);
  const shifted = isTextCode(rawShifted) ? rawShifted : undefined;
  const base = isTextCode(rawBase) ? rawBase : undefined;
  const event = makeEvent(raw, keyOfCode(code), false);

  return withModifiers({ ...event, shifted, base, text: textOfCodes(fields[2]) }, fields[1]);
};

const parseCsiFunctional = (raw: string, final: string, fields: string[]): KeyEvent => {
  const legacy = !raw.includes(':');

  if (final === 'Z') {
    const event = withModifiers(makeEvent(raw, 'tab', legacy), fields[1]);

    return { ...event, modifiers: event.modifiers | keyModifier.shift };
  }

  const key = final === '~' ? tildeKeys.get(toNumber(fields[0]) ?? 0) : finalKeys.get(final);

  if (key === undefined) {
    return opaqueEvent(raw);
  }

  return withModifiers(makeEvent(raw, key, legacy), fields[1]);
};

const parseCsi = (raw: string): KeyEvent => {
  const params = raw.slice(2, -1);

  if (!/^[0-9:;]*$/.test(params)) {
    return opaqueEvent(raw);
  }

  const fields = params.split(';');
  const final = raw.slice(-1);

  return final === 'u' ? parseCsiU(raw, fields) : parseCsiFunctional(raw, final, fields);
};

const parseControl = (raw: string): KeyEvent | undefined => {
  const code = raw.charCodeAt(0);
  const name = keysOfCode.get(code);

  if (name !== undefined) {
    return makeEvent(raw, name, true);
  }

  if (code >= 1 && code <= lastControlLetter) {
    const letter = controlLetters.charAt(code - 1);

    return { ...makeEvent(raw, letter, true), modifiers: keyModifier.ctrl };
  }

  const symbolIndex = code - firstControlSymbol;

  if (symbolIndex >= 0 && symbolIndex < controlSymbolCount) {
    const symbol = controlSymbols.charAt(symbolIndex);

    return { ...makeEvent(raw, symbol, true), modifiers: keyModifier.ctrl };
  }

  if (code === 0) {
    return { ...makeEvent(raw, ' ', true), modifiers: keyModifier.ctrl };
  }

  return undefined;
};

const parseCharacter = (raw: string): KeyEvent => {
  const isUpperLetter = isAsciiLetter(raw) && raw !== raw.toLowerCase();

  if (!isUpperLetter) {
    return { ...makeEvent(raw, raw, true), text: raw };
  }

  return {
    ...makeEvent(raw, raw.toLowerCase(), true),
    modifiers: keyModifier.shift,
    shifted: raw.charCodeAt(0),
    text: raw,
  };
};

const parseAlt = (raw: string, inner: KeyEvent): KeyEvent => ({
  ...inner,
  raw,
  modifiers: inner.modifiers | keyModifier.alt,
});

const parseSs3 = (raw: string): KeyEvent => {
  const key = finalKeys.get(raw.slice(2));

  return key === undefined ? opaqueEvent(raw) : makeEvent(raw, key, true);
};

// Parses the bytes of one key token: legacy bytes or a kitty `CSI ... u`, `CSI ... ~`, or
// `CSI 1;mods X` sequence.
export const parseKey = (raw: string): KeyEvent => {
  if (raw.startsWith(csi) && raw.length > 2) {
    return parseCsi(raw);
  }

  if (raw.startsWith(ss3) && raw.length === ss3.length + 1) {
    return parseSs3(raw);
  }

  if (raw.startsWith(escape) && raw.length > 1) {
    return Array.from(raw).length === 2 ? parseAlt(raw, parseKey(raw.slice(1))) : opaqueEvent(raw);
  }

  if (Array.from(raw).length !== 1) {
    return opaqueEvent(raw);
  }

  return parseControl(raw) ?? parseCharacter(raw);
};

const typedModifiers = (event: KeyEvent): number => event.modifiers & keyModifierMask;

// The text the key types: the associated text a terminal sent, or the character the key makes
// with no modifier or with shift. A release types nothing.
export const keyText = (event: KeyEvent): string | undefined => {
  if (event.kind === 'release') {
    return undefined;
  }

  if (event.text !== undefined) {
    return event.text;
  }

  if (!isCharacterKey(event.key)) {
    return undefined;
  }

  const modifiers = typedModifiers(event);

  if (modifiers === 0) {
    return event.key;
  }

  if (modifiers !== keyModifier.shift) {
    return undefined;
  }

  if (event.shifted !== undefined) {
    return String.fromCodePoint(event.shifted);
  }

  return isAsciiLetter(event.key) ? event.key.toUpperCase() : undefined;
};

// Whether a press or repeat is this key with exactly these modifiers. Lock bits do not count.
export const isKey = (event: KeyEvent, key: string, modifiers = 0): boolean => {
  const isHeld = event.kind !== 'release';

  return isHeld && event.key === key && typedModifiers(event) === modifiers;
};

const controlCharacters = new Map<string, string>([
  [' ', '\x00'],
  ['@', '\x00'],
  ['2', '\x00'],
  ['[', '\x1b'],
  ['3', '\x1b'],
  ['\\', '\x1c'],
  ['4', '\x1c'],
  [']', '\x1d'],
  ['5', '\x1d'],
  ['^', '\x1e'],
  ['6', '\x1e'],
  ['_', '\x1f'],
  ['/', '\x1f'],
  ['7', '\x1f'],
  ['-', '\x1f'],
]);

const controlOf = (character: string): string => {
  const letterIndex = controlLetters.indexOf(character.toLowerCase());

  if (character.length === 1 && letterIndex !== -1) {
    return String.fromCharCode(letterIndex + 1);
  }

  return controlCharacters.get(character) ?? character;
};

const withCursorMode = (raw: string, applicationCursor: boolean): string => {
  const tail = raw.slice(2);
  const isCursorKey = raw.startsWith(csi) && tail.length === 1 && 'ABCDHF'.includes(tail);

  return applicationCursor && isCursorKey ? `${ss3}${tail}` : raw;
};

const modifierField = (modifiers: number, eventNumber: number): string => {
  const suffix = eventNumber > 1 ? `:${eventNumber}` : '';

  return `${1 + modifiers}${suffix}`;
};

const f3Tilde = 13;

const encodeFunctional = (
  key: string,
  modifiers: number,
  eventNumber: number,
  ss3Use: Ss3Use,
): string => {
  const isKittyF3 = key === 'f3' && ss3Use === 'none';
  const final = isKittyF3 ? undefined : keyFinals.get(key);
  const tildeCode = isKittyF3 ? f3Tilde : tildeCodes.get(key);
  const isPlain = modifiers === 0 && eventNumber === 1;

  if (final === undefined) {
    const code = tildeCode ?? 0;

    return isPlain ? `${csi}${code}~` : `${csi}${code};${modifierField(modifiers, eventNumber)}~`;
  }

  if (!isPlain) {
    return `${csi}1;${modifierField(modifiers, eventNumber)}${final}`;
  }

  const isFunctionKey = key.startsWith('f');

  const functionKeyUsesSs3 = ss3Use === 'function' && isFunctionKey;
  const usesSs3 = ss3Use === 'all' || functionKeyUsesSs3;

  return usesSs3 ? `${ss3}${final}` : `${csi}${final}`;
};

const encodeLegacyBody = (event: KeyEvent, modifiers: number): string => {
  if (event.key === 'enter') {
    return '\r';
  }

  if (event.key === 'tab') {
    return hasFlag(modifiers, keyModifier.shift) ? `${csi}Z` : '\t';
  }

  if (event.key === 'backspace') {
    return '\x7f';
  }

  if (event.key === 'escape') {
    return escape;
  }

  if (hasFlag(modifiers, keyModifier.ctrl)) {
    return controlOf(event.key);
  }

  return keyText({ ...event, modifiers }) ?? event.key;
};

const encodeLegacy = (event: KeyEvent, applicationCursor: boolean): string => {
  if (event.legacy) {
    return withCursorMode(event.raw, applicationCursor);
  }

  const modifiers = event.modifiers & legacyModifierMask;

  if (isFunctionalKey(event.key)) {
    return encodeFunctional(event.key, modifiers, 1, applicationCursor ? 'all' : 'function');
  }

  const withoutAlt = modifiers & ~keyModifier.alt;
  const body = encodeLegacyBody(event, withoutAlt);

  return hasFlag(modifiers, keyModifier.alt) ? `${escape}${body}` : body;
};

const codepointOf = (key: string): number => editingCodes.get(key) ?? key.codePointAt(0) ?? 0;

const shiftedOf = (event: KeyEvent): number | undefined => {
  if (event.shifted !== undefined) {
    return event.shifted;
  }

  const hasShift = hasFlag(event.modifiers, keyModifier.shift);

  if (hasShift && isCharacterKey(event.key) && isAsciiLetter(event.key)) {
    return event.key.toUpperCase().charCodeAt(0);
  }

  return undefined;
};

const codeField = (event: KeyEvent, flags: number): string => {
  const code = String(codepointOf(event.key));

  if (!hasFlag(flags, kittyFlag.alternateKeys)) {
    return code;
  }

  const shifted = shiftedOf(event);
  const parts = [code, shifted === undefined ? '' : String(shifted)];

  if (event.base !== undefined) {
    parts.push(String(event.base));
  }

  return parts.join(':').replace(/:+$/, '');
};

const textField = (event: KeyEvent, flags: number): string | undefined => {
  if (!hasFlag(flags, kittyFlag.associatedText)) {
    return undefined;
  }

  const text = keyText(event);

  if (text === undefined || isControlText(text)) {
    return undefined;
  }

  return Array.from(text, (character) => character.codePointAt(0)).join(':');
};

const encodeCodepoint = (event: KeyEvent, flags: number, eventNumber: number): string => {
  const modifiers = modifierField(event.modifiers & modifierMask, eventNumber);
  const text = textField(event, flags);
  const code = codeField(event, flags);

  if (text !== undefined) {
    return `${csi}${code};${modifiers};${text}u`;
  }

  return modifiers === '1' ? `${csi}${code}u` : `${csi}${code};${modifiers}u`;
};

// Whether a key that makes text or an editing byte is sent as an escape for these flags.
const needsEscape = (event: KeyEvent, flags: number, eventNumber: number): boolean => {
  const modifiers = typedModifiers(event);
  const hasModifier = (modifiers & ~keyModifier.shift) !== 0;

  if (hasFlag(flags, kittyFlag.allKeys) || hasModifier) {
    return true;
  }

  if (isCharacterKey(event.key)) {
    return event.kind === 'release';
  }

  if (event.key === 'escape') {
    return hasFlag(flags, kittyFlag.disambiguate) || eventNumber > 1;
  }

  return modifiers !== 0 || event.kind === 'release';
};

const encodeKitty = (event: KeyEvent, flags: number, applicationCursor: boolean): string => {
  const reportsEvents = hasFlag(flags, kittyFlag.eventTypes);
  const eventNumber = reportsEvents ? eventNumbers[event.kind] : 1;

  if (isFunctionalKey(event.key)) {
    const modifiers = event.modifiers & modifierMask;

    return encodeFunctional(event.key, modifiers, eventNumber, 'none');
  }

  if (!needsEscape(event, flags, eventNumber)) {
    return encodeLegacy(event, applicationCursor);
  }

  const isPlainEditingKey = isEditingKey(event.key) && event.key !== 'escape';
  const isPlain = isPlainEditingKey && typedModifiers(event) === 0;
  const isRelease = event.kind === 'release';
  const isPlainEditingRelease = isRelease && isPlain && !hasFlag(flags, kittyFlag.allKeys);

  return isPlainEditingRelease ? '' : encodeCodepoint(event, flags, eventNumber);
};

const usesEscapes = (flags: number): boolean =>
  hasFlag(flags, kittyFlag.disambiguate | kittyFlag.eventTypes | kittyFlag.allKeys);

const encodeText = (event: KeyEvent, flags: number, applicationCursor: boolean): string => {
  if (event.key === 'unsupported') {
    return '';
  }

  const reportsEvents = hasFlag(flags, kittyFlag.eventTypes);

  if (event.kind === 'release' && !reportsEvents) {
    return '';
  }

  if (event.key === 'opaque') {
    return event.kind === 'release' ? '' : withCursorMode(event.raw, applicationCursor);
  }

  if (!usesEscapes(flags)) {
    return encodeLegacy(event, applicationCursor);
  }

  return encodeKitty(event, flags, applicationCursor);
};

// The bytes a pane expects for one key under its kitty keyboard flags. Flags 0 give legacy bytes.
export const encodeKey = (event: KeyEvent, flags: number, applicationCursor: boolean): Uint8Array =>
  encoder.encode(encodeText(event, flags, applicationCursor));
