import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { z } from 'zod';

import { paneId, tabId, workspaceId } from '../ids.ts';
import type { PaneId, TabId, WorkspaceId } from '../ids.ts';
import type { Layout } from '../layout.ts';
import type { SavedSession } from '../store/store.ts';
import { usableStateHome } from './log.ts';
import type { Log } from './log.ts';

type ReadSessionResult =
  | { kind: 'missing' }
  | { kind: 'restored'; session: SavedSession }
  | { kind: 'newer'; version: number }
  | { kind: 'broken'; message: string };

export interface SessionWriter {
  // Writes the session after the running write, unless a newer save replaces it first.
  save: (session: SavedSession) => void;
  // Waits for the running write, writes the session, and ignores every later save.
  stopSaving: (session: SavedSession) => Promise<void>;
  // Resolves once no write runs or waits.
  settled: () => Promise<void>;
}

const currentVersion = 1;

const keyLength = 16;

const directoryMode = 0o700;

const fileMode = 0o600;

export const sessionPathFor = (
  stateHome: string | undefined,
  home: string,
  socketPath: string,
): string => {
  const state = usableStateHome(stateHome) ?? join(home, '.local', 'state');
  const key = createHash('sha256').update(socketPath).digest('hex').slice(0, keyLength);

  return join(state, 'phi', 'sessions', `${key}.json`);
};

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// Accepts only the form the id constructor writes, so a parsed id equals the id that was saved.
const idNumber = (prefix: string) =>
  z
    .string()
    .regex(new RegExp(`^${prefix}-(0|[1-9][0-9]*)$`))
    .transform((id) => Number(id.slice(prefix.length + 1)))
    .refine((number) => Number.isSafeInteger(number));

const paneIdSchema: z.ZodType<PaneId> = idNumber('pane').transform(paneId);

const workspaceIdSchema: z.ZodType<WorkspaceId> = idNumber('workspace').transform(workspaceId);

const tabIdSchema: z.ZodType<TabId> = idNumber('tab').transform(tabId);

// JSON has no undefined, so the writer saves an absent id as null.
const absent = <Schema extends z.ZodType>(schema: Schema) =>
  schema.nullable().transform((value) => value ?? undefined);

const counter = z.number().int().nonnegative();

const layoutSchema: z.ZodType<Layout> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('pane'), paneId: paneIdSchema }),
    z.object({
      kind: z.literal('split'),
      direction: z.enum(['below', 'right']),
      ratio: z.number().gt(0).lt(1),
      first: layoutSchema,
      second: layoutSchema,
    }),
  ]),
);

const layoutPaneIds = (layout: Layout): PaneId[] =>
  layout.kind === 'pane'
    ? [layout.paneId]
    : [...layoutPaneIds(layout.first), ...layoutPaneIds(layout.second)];

const hasDuplicate = (ids: readonly string[]): boolean => new Set(ids).size !== ids.length;

const idNumberOf = (id: string): number => Number(id.slice(id.lastIndexOf('-') + 1));

const exceedsCounter = (ids: readonly string[], next: number): boolean =>
  ids.some((id) => idNumberOf(id) >= next);

const sessionShape = z.object({
  workspaces: z.array(
    z.object({
      id: workspaceIdSchema,
      root: z.string(),
      label: z.string(),
      tabIds: z.array(tabIdSchema),
      activeTabId: tabIdSchema,
    }),
  ),
  tabs: z.array(
    z.object({
      id: tabIdSchema,
      workspaceId: workspaceIdSchema,
      layout: layoutSchema,
      focusedPaneId: paneIdSchema,
      zoomedPaneId: absent(paneIdSchema),
    }),
  ),
  panes: z.array(
    z.object({
      id: paneIdSchema,
      tabId: tabIdSchema,
      startFolder: z
        .string()
        .nullish()
        .transform((value) => value ?? undefined),
    }),
  ),
  focusedWorkspaceId: absent(workspaceIdSchema),
  nextWorkspaceNumber: counter,
  nextTabNumber: counter,
  nextPaneNumber: counter,
});

type Session = z.infer<typeof sessionShape>;

const idProblems = (session: Session): string[] => {
  const problems: string[] = [];
  const workspaceIds = session.workspaces.map((workspace) => workspace.id);
  const tabIds = session.tabs.map((tab) => tab.id);
  const paneIds = session.panes.map((pane) => pane.id);

  if (hasDuplicate(workspaceIds) || hasDuplicate(tabIds) || hasDuplicate(paneIds)) {
    problems.push('An id appears twice.');
  }

  if (exceedsCounter(workspaceIds, session.nextWorkspaceNumber)) {
    problems.push('nextWorkspaceNumber is not above every workspace id.');
  }

  if (exceedsCounter(tabIds, session.nextTabNumber)) {
    problems.push('nextTabNumber is not above every tab id.');
  }

  if (exceedsCounter(paneIds, session.nextPaneNumber)) {
    problems.push('nextPaneNumber is not above every pane id.');
  }

  return problems;
};

const workspaceProblems = (session: Session): string[] => {
  const problems: string[] = [];
  const focused = session.focusedWorkspaceId;
  const hasFocused = focused !== undefined;

  if (session.workspaces.length > 0 && !hasFocused) {
    problems.push('A session with workspaces has no focused workspace.');
  }

  if (hasFocused && !session.workspaces.some((workspace) => workspace.id === focused)) {
    problems.push('The focused workspace is missing.');
  }

  for (const workspace of session.workspaces) {
    if (!workspace.tabIds.includes(workspace.activeTabId)) {
      problems.push(`The active tab of ${workspace.id} is not one of its tabs.`);
    }

    for (const id of workspace.tabIds) {
      const tab = session.tabs.find((candidate) => candidate.id === id);

      if (tab?.workspaceId !== workspace.id) {
        problems.push(`${workspace.id} lists ${id}, which does not belong to it.`);
      }
    }
  }

  return problems;
};

const tabProblems = (session: Session): string[] => {
  const problems: string[] = [];

  for (const tab of session.tabs) {
    const owner = session.workspaces.find((workspace) => workspace.id === tab.workspaceId);
    const inLayout = layoutPaneIds(tab.layout);

    if (owner?.tabIds.includes(tab.id) !== true) {
      problems.push(`${tab.id} is not listed by its workspace.`);
    }

    if (!inLayout.includes(tab.focusedPaneId)) {
      problems.push(`The focused pane of ${tab.id} is not in its layout.`);
    }

    if (tab.zoomedPaneId !== undefined && !inLayout.includes(tab.zoomedPaneId)) {
      problems.push(`The zoomed pane of ${tab.id} is not in its layout.`);
    }
  }

  return problems;
};

const paneProblems = (session: Session): string[] => {
  const problems: string[] = [];
  const layoutPanes = session.tabs.flatMap((tab) => layoutPaneIds(tab.layout));
  const inLayout = new Set(layoutPanes);
  const saved = new Set(session.panes.map((pane) => pane.id));

  if (hasDuplicate(layoutPanes)) {
    problems.push('A pane is in two layouts.');
  }

  if (session.panes.some((pane) => !inLayout.has(pane.id))) {
    problems.push('A pane is in no layout.');
  }

  if (layoutPanes.some((id) => !saved.has(id))) {
    problems.push('A layout holds a pane that is not saved.');
  }

  for (const pane of session.panes) {
    const tab = session.tabs.find((candidate) => candidate.id === pane.tabId);

    if (tab === undefined || !layoutPaneIds(tab.layout).includes(pane.id)) {
      problems.push(`${pane.id} is not in the layout of ${pane.tabId}.`);
    }
  }

  return problems;
};

const sessionSchema = sessionShape.superRefine((session, context) => {
  const problems = [
    ...idProblems(session),
    ...workspaceProblems(session),
    ...tabProblems(session),
    ...paneProblems(session),
  ];

  for (const message of problems) {
    context.addIssue({ code: 'custom', message });
  }
});

const versionSchema = z.object({ version: z.number() });

const fileSchema = z.object({ version: z.literal(currentVersion), session: sessionSchema });

const isMissing = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

const parsedFile = (text: string): ReadSessionResult => {
  let json: unknown;

  try {
    json = JSON.parse(text);
  } catch {
    return { kind: 'broken', message: 'The session file is not valid JSON.' };
  }

  const versioned = versionSchema.safeParse(json);

  if (versioned.success && versioned.data.version > currentVersion) {
    return { kind: 'newer', version: versioned.data.version };
  }

  const parsed = fileSchema.safeParse(json);

  if (!parsed.success) {
    return { kind: 'broken', message: z.prettifyError(parsed.error) };
  }

  return { kind: 'restored', session: parsed.data.session };
};

export const readSessionFile = async (path: string): Promise<ReadSessionResult> => {
  let text: string;

  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (isMissing(error)) {
      return { kind: 'missing' };
    }

    return { kind: 'broken', message: describeError(error) };
  }

  return parsedFile(text);
};

const serialized = (session: SavedSession): string =>
  JSON.stringify({ version: currentVersion, session }, (_key, value: unknown) =>
    value === undefined ? null : value,
  );

// Writes one file at a time and keeps only the newest session that waits.
export const createSessionWriter = (path: string, log: Log): SessionWriter => {
  const temporaryPath = `${path}.tmp`;
  let running: Promise<void> | undefined;
  let waiting: SavedSession | undefined;
  let stopped = false;

  const write = async (session: SavedSession): Promise<void> => {
    try {
      await mkdir(dirname(path), { recursive: true, mode: directoryMode });
      await writeFile(temporaryPath, serialized(session), { mode: fileMode });
      // The mode applies only when writeFile creates the file, not to one a crash left behind.
      await chmod(temporaryPath, fileMode);
      await rename(temporaryPath, path);
    } catch (error) {
      log.error('Cannot save the session.', { path, error: describeError(error) });
    }
  };

  const drain = async (): Promise<void> => {
    const next = waiting;

    if (next === undefined) {
      running = undefined;

      return;
    }

    waiting = undefined;
    await write(next);
    await drain();
  };

  const save = (session: SavedSession): void => {
    if (stopped) {
      return;
    }

    waiting = session;
    running ??= drain();
  };

  const stopSaving = async (session: SavedSession): Promise<void> => {
    stopped = true;
    waiting = undefined;
    await running;
    await write(session);
  };

  const settled = async (): Promise<void> => {
    await running;
  };

  return { save, stopSaving, settled };
};
