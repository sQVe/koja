import { recordOf, stringOf } from '../../kit/fields.ts';
import type { ToastLevel } from '../../kit/toast/toastLevel.ts';
import { toastLevels } from '../../kit/toast/toastLevel.ts';

export type ToastContent =
  | { kind: 'plain'; title: string; body: string | null }
  | { kind: 'login'; machine: string; command: string };

export interface ToastProps {
  overlay: string | null;
  level: ToastLevel;
  icon: string | null;
  action: { name: string; args: Record<string, unknown> } | null;
  fitHeight: boolean;
  content: ToastContent;
}

// Matches the login guidance Herdr shows with Copy in Settings > Machines, a sidebar group, the welcome screen, and the failed New space toast. The lookahead repeats the captured name in the command, so equality stays inside the match and the match itself is the machine name.
const loginPattern = /^(\S.*?)(?= needs login; run hc machine login \1$)/;

const readLevel = (value: unknown): ToastLevel => {
  const level = stringOf(value);
  const known = toastLevels.find((candidate) => candidate === level);

  return known ?? 'info';
};

const presentStringOf = (value: unknown): string | null => {
  const text = stringOf(value);

  return text === '' ? null : text;
};

const readAction = (value: unknown): ToastProps['action'] => {
  const record = recordOf(value);
  const name = presentStringOf(record['name']);

  if (name === null) {
    return null;
  }

  return { name, args: recordOf(record['args']) };
};

const readContent = (title: string, body: string | null): ToastContent => {
  const login = body === null ? null : loginPattern.exec(body.trim());

  if (login === null) {
    return { kind: 'plain', title, body };
  }

  const machine = login[0];

  return { kind: 'login', machine, command: `hc machine login ${machine}` };
};

export const readToastProps = (value: unknown): ToastProps => {
  const record = recordOf(value);
  const title = stringOf(record['title']) ?? '';

  return {
    overlay: stringOf(record['overlay']),
    level: readLevel(record['level']),
    icon: presentStringOf(record['icon']),
    action: readAction(record['action']),
    fitHeight: record['fitHeight'] === true,
    content: readContent(title, presentStringOf(record['body'])),
  };
};
