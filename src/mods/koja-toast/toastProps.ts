import { recordOf, stringOf } from '../../kit/fields.ts';
import type { ToastLevel } from '../../kit/index.ts';

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

const toastLevels: ToastLevel[] = ['info', 'success', 'warning', 'error'];

const loginPattern = /^([a-z0-9][a-z0-9_.-]{0,31}) needs login; run hc machine login \1$/;

const readLevel = (value: unknown): ToastLevel => {
  const level = stringOf(value);
  const known = toastLevels.find((candidate) => candidate === level);

  return known ?? 'info';
};

const readAction = (value: unknown): ToastProps['action'] => {
  const record = recordOf(value);
  const name = stringOf(record['name']);

  if (name === null) {
    return null;
  }

  return { name, args: recordOf(record['args']) };
};

const readContent = (title: string, body: string | null): ToastContent => {
  if (body === null) {
    return { kind: 'plain', title, body };
  }

  const login = loginPattern.exec(body);

  if (login === null) {
    return { kind: 'plain', title, body };
  }

  const machine = login[1] ?? '';

  return { kind: 'login', machine, command: `hc machine login ${machine}` };
};

export const readToastProps = (value: unknown): ToastProps => {
  const record = recordOf(value);
  const title = stringOf(record['title']) ?? '';

  return {
    overlay: stringOf(record['overlay']),
    level: readLevel(record['level']),
    icon: stringOf(record['icon']),
    action: readAction(record['action']),
    fitHeight: record['fitHeight'] === true,
    content: readContent(title, stringOf(record['body'])),
  };
};
