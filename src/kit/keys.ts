// How a keys.json binding reads in a hint: "ctrl-shift-t" is "Ctrl+Shift+T", or "⌃⇧T" on macOS.

export type Platform = 'linux' | 'macos' | 'windows';

const modifierOrder = ['ctrl', 'alt', 'shift', 'cmd', 'fn'] as const;

type Modifier = (typeof modifierOrder)[number];

const macosModifiers: Record<Modifier, string> = {
  ctrl: '⌃',
  alt: '⌥',
  shift: '⇧',
  cmd: '⌘',
  fn: 'fn',
};

const otherModifiers: Record<Modifier, string> = {
  ctrl: 'Ctrl',
  alt: 'Alt',
  shift: 'Shift',
  cmd: 'Super',
  fn: 'Fn',
};

const isUpperCaseLetter = (key: string): boolean => /^[A-Z]$/.test(key);

const modifierAlias = (modifier: string, platform: Platform): string => {
  const lower = modifier.toLowerCase();

  if (lower === 'secondary') {
    return platform === 'macos' ? 'cmd' : 'ctrl';
  }

  const isCommandKey = lower === 'super' || lower === 'win';

  return isCommandKey ? 'cmd' : lower;
};

// "ctrl--" binds the minus key: the last part is empty and the dash before it is the key.
const splitStroke = (stroke: string): { held: string[]; key: string } => {
  const parts = stroke.split('-');
  const last = parts.pop() ?? '';

  if (last === '' && parts.length > 0) {
    parts.pop();

    return { held: parts, key: '-' };
  }

  return { held: parts, key: last };
};

const keyLabel = (key: string): string => {
  if (key.length <= 1) {
    return key.toUpperCase();
  }

  return key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
};

const formatStroke = (stroke: string, platform: Platform): string => {
  const { held, key } = splitStroke(stroke);
  const heldModifiers = new Set(held.map((modifier) => modifierAlias(modifier, platform)));

  if (isUpperCaseLetter(key)) {
    heldModifiers.add('shift');
  }

  const names = platform === 'macos' ? macosModifiers : otherModifiers;
  const modifiers = modifierOrder.filter((modifier) => heldModifiers.has(modifier));
  const parts = [...modifiers.map((modifier) => names[modifier]), keyLabel(key)];

  return parts.join(platform === 'macos' ? '' : '+');
};

export const formatKeys = (keys: string, platform: Platform): string =>
  keys
    .trim()
    .split(/\s+/)
    .filter((stroke) => stroke !== '')
    .map((stroke) => formatStroke(stroke, platform))
    .join(' ');
