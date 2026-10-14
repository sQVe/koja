import { workspaceId } from '../ids.ts';
import type { WorkspaceId } from '../ids.ts';

export type IdResult<Id> = { ok: true; id: Id } | { ok: false; message: string };

export const parseId = (value: string, prefix: string): number | undefined => {
  const match = new RegExp(`^${prefix}-(0|[1-9][0-9]*)$`).exec(value);
  const number = Number(match?.[1]);

  return Number.isSafeInteger(number) ? number : undefined;
};

export const parseWorkspaceId = (value: string | undefined): IdResult<WorkspaceId> => {
  const number = parseId(value ?? '', 'workspace');

  return number === undefined
    ? { ok: false, message: `'${value ?? ''}' is not a workspace id, such as workspace-1.` }
    : { ok: true, id: workspaceId(number) };
};
