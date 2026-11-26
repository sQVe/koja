import { recordOf, stringOf } from './fields.ts';

export interface DialogCommand {
  name: string;
  args: Record<string, unknown>;
}

export interface ConfirmDialog {
  title: string;
  body: string[];
  action: string;
  destroys: boolean;
  command: DialogCommand;
}

export interface PromptDialog {
  title: string;
  value: string;
  hint: string;
  command: DialogCommand;
}

export const readDialogCommand = (value: unknown): DialogCommand => {
  const record = recordOf(value);

  return { name: stringOf(record['name']) ?? '', args: recordOf(record['args']) };
};
