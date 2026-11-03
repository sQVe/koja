import { describe, expect, test } from 'bun:test';

import type { KeyModifiers, NormalKeyEvent } from './keyEvent.ts';
import { normalizeKey } from './keyEvent.ts';

const noModifiers: KeyModifiers = {
  shift: false,
  control: false,
  alt: false,
  platform: false,
  function: false,
};

const event = (overrides: Partial<NormalKeyEvent>): NormalKeyEvent => ({
  key: '',
  keystroke: '',
  modifiers: noModifiers,
  ...overrides,
});

describe('normalizeKey', () => {
  test('keeps a control chord from the keystroke even when it types a character', () => {
    const ctrlI = event({
      key: 'i',
      keystroke: 'ctrl-i',
      key_char: '\t',
      modifiers: { ...noModifiers, control: true },
    });

    expect(normalizeKey(ctrlI)).toBe('ctrl-i');
  });

  test('keeps a chord from the keystroke when alt, cmd, or fn is held', () => {
    const commandW = event({
      key: 'w',
      keystroke: 'cmd-w',
      key_char: 'w',
      modifiers: { ...noModifiers, platform: true },
    });

    expect(normalizeKey(commandW)).toBe('cmd-w');
  });

  test('keeps a named key from the keystroke when it types no printable character', () => {
    const tab = event({ key: 'tab', keystroke: 'tab', key_char: '\t' });

    const shiftTab = event({
      key: 'tab',
      keystroke: 'shift-tab',
      key_char: '\t',
      modifiers: { ...noModifiers, shift: true },
    });

    const backspace = event({ key: 'backspace', keystroke: 'backspace' });

    const enter = event({ key: 'enter', keystroke: 'enter', key_char: '\n' });

    const space = event({ key: 'space', keystroke: 'space', key_char: ' ' });

    expect(normalizeKey(tab)).toBe('tab');
    expect(normalizeKey(shiftTab)).toBe('shift-tab');
    expect(normalizeKey(backspace)).toBe('backspace');
    expect(normalizeKey(enter)).toBe('enter');
    expect(normalizeKey(space)).toBe('space');
  });

  test('uses the typed character for a printable key even when the raw key differs', () => {
    const oumlaut = event({ key: 'semicolon', keystroke: 'ö', key_char: 'ö' });

    const pipe = event({ key: 'backslash', keystroke: '|', key_char: '|' });

    const underscore = event({ key: 'minus', keystroke: '_', key_char: '_' });

    expect(normalizeKey(oumlaut)).toBe('ö');
    expect(normalizeKey(pipe)).toBe('|');
    expect(normalizeKey(underscore)).toBe('_');
  });

  test('uses the shifted character when only shift is held', () => {
    const shiftG = event({
      key: 'g',
      keystroke: 'shift-g',
      key_char: 'G',
      modifiers: { ...noModifiers, shift: true },
    });

    expect(normalizeKey(shiftG)).toBe('G');
  });
});
