import { z } from 'zod';

import { clientId, paneId, tabId, workspaceId } from '../ids.ts';
import type { ClientId, PaneId, TabId, WorkspaceId } from '../ids.ts';
import type {
  Change,
  Client,
  DetachReason,
  Intent,
  Pane,
  Snapshot,
  Tab,
  Theme,
  View,
  WorkspaceRecord,
} from '../store/store.ts';

// The package.json version and the Ghostty commit, as `phi --version` prints them.
export interface BuildVersion {
  version: string;
  ghostty: string;
}

type ParseControlResult =
  | { ok: true; message: ControlMessage }
  | { ok: false; reason: 'invalidText' }
  | { ok: false; reason: 'invalidJson' }
  | { ok: false; reason: 'invalidMessage' };

type Hello = Extract<ControlMessage, { type: 'hello' }>;

type HelloAnswer = Extract<ControlMessage, { type: 'welcome' | 'refused' }>;

type Layout = Tab['layout'];

type ResizeDirection = Extract<Intent, { type: 'resizePane' }>['direction'];

type SplitDirection = Extract<Layout, { kind: 'split' }>['direction'];

// JSON has no undefined, so a value that is absent travels as null.
const absent = <Schema extends z.ZodType>(schema: Schema) =>
  schema.nullable().transform((value) => value ?? undefined);

// Accepts only the form the id constructor writes, so a parsed id equals the id that was sent.
const idNumber = (prefix: string) =>
  z
    .string()
    .regex(new RegExp(`^${prefix}-(0|[1-9][0-9]*)$`))
    .transform((id) => Number(id.slice(prefix.length + 1)))
    .refine((number) => Number.isSafeInteger(number));

const paneIdSchema: z.ZodType<PaneId> = idNumber('pane').transform(paneId);

const workspaceIdSchema: z.ZodType<WorkspaceId> = idNumber('workspace').transform(workspaceId);

const tabIdSchema: z.ZodType<TabId> = idNumber('tab').transform(tabId);

const clientIdSchema: z.ZodType<ClientId> = idNumber('client').transform(clientId);

const count = z.number().int().nonnegative();

// The terminal passes sizes as 16-bit numbers.
const largestDimension = 0xff_ff;

const dimension = z.number().int().positive().max(largestDimension);

const sizeSchema = z.object({ columns: dimension, rows: dimension });

// A row update carries its sequence as one 32-bit word.
const largestSequence = 0xff_ff_ff_ff;

const buildVersionSchema: z.ZodType<BuildVersion> = z.object({
  version: z.string(),
  ghostty: z.string(),
});

const lifecycleSchema: z.ZodType<Pane['lifecycle']> = z.enum([
  'starting',
  'running',
  'exited',
  'closing',
]);

const paneSchema: z.ZodType<Pane> = z.object({
  id: paneIdSchema,
  tabId: tabIdSchema,
  lifecycle: lifecycleSchema,
  size: sizeSchema,
  generation: count,
  exitCode: absent(z.number().int()),
});

const resizeDirectionSchema: z.ZodType<ResizeDirection> = z.enum(['left', 'right', 'up', 'down']);

const splitDirectionSchema: z.ZodType<SplitDirection> = z.enum(['below', 'right']);

const layoutSchema: z.ZodType<Layout> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('pane'), paneId: paneIdSchema }),
    z.object({
      kind: z.literal('split'),
      direction: splitDirectionSchema,
      ratio: z.number().gt(0).lt(1),
      first: layoutSchema,
      second: layoutSchema,
    }),
  ]),
);

const tabSchema: z.ZodType<Tab> = z.object({
  id: tabIdSchema,
  workspaceId: workspaceIdSchema,
  layout: layoutSchema,
  focusedPaneId: paneIdSchema,
  zoomedPaneId: absent(paneIdSchema),
});

const workspaceSchema: z.ZodType<WorkspaceRecord> = z.object({
  id: workspaceIdSchema,
  root: z.string(),
  label: z.string(),
  tabIds: z.array(tabIdSchema),
});

const largestColor = 0xff_ff_ff;

const paletteSize = 16;

const color = z.number().int().min(0).max(largestColor);

const themeSchema: z.ZodType<Theme> = z.object({
  foreground: color,
  background: color,
  palette: z.array(color).length(paletteSize),
});

const viewSchema: z.ZodType<View> = z.object({
  focusedWorkspaceId: absent(workspaceIdSchema),
  activeTabs: z.array(z.object({ workspaceId: workspaceIdSchema, tabId: tabIdSchema })),
});

const clientSchema: z.ZodType<Client> = z.object({
  id: clientIdSchema,
  size: sizeSchema,
  theme: absent(themeSchema),
  view: viewSchema,
});

const detachReasonSchema: z.ZodType<DetachReason> = z.enum(['requested', 'takenOver']);

const changeSchema: z.ZodType<Change> = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('workspaceAdded'),
    workspace: workspaceSchema,
    activeTabId: tabIdSchema,
    focusedWorkspaceId: workspaceIdSchema,
  }),
  z.object({ type: z.literal('tabAdded'), tab: tabSchema }),
  z.object({ type: z.literal('paneAdded'), pane: paneSchema }),
  z.object({ type: z.literal('workspaceFocused'), workspaceId: workspaceIdSchema }),
  z.object({
    type: z.literal('workspaceRenamed'),
    workspaceId: workspaceIdSchema,
    label: z.string(),
  }),
  z.object({
    type: z.literal('tabFocused'),
    workspaceId: workspaceIdSchema,
    tabId: tabIdSchema,
  }),
  z.object({
    type: z.literal('workspaceRemoved'),
    workspaceId: workspaceIdSchema,
    focusedWorkspaceId: absent(workspaceIdSchema),
  }),
  z.object({ type: z.literal('tabRemoved'), tabId: tabIdSchema }),
  z.object({ type: z.literal('paneRemoved'), paneId: paneIdSchema }),
  z.object({ type: z.literal('tabLayoutChanged'), tabId: tabIdSchema, layout: layoutSchema }),
  z.object({ type: z.literal('paneFocused'), tabId: tabIdSchema, paneId: paneIdSchema }),
  z.object({
    type: z.literal('tabZoomChanged'),
    tabId: tabIdSchema,
    zoomedPaneId: absent(paneIdSchema),
  }),
  z.object({
    type: z.literal('paneStateChanged'),
    paneId: paneIdSchema,
    lifecycle: lifecycleSchema,
    exitCode: absent(z.number().int()),
  }),
  z.object({ type: z.literal('paneResized'), paneId: paneIdSchema, size: sizeSchema }),
  z.object({ type: z.literal('clientAttached'), client: clientSchema }),
  z.object({ type: z.literal('clientViewChanged'), clientId: clientIdSchema, view: viewSchema }),
  z.object({ type: z.literal('foregroundChanged'), clientId: absent(clientIdSchema) }),
  z.object({ type: z.literal('clientResized'), clientId: clientIdSchema, size: sizeSchema }),
  z.object({ type: z.literal('clientThemeChanged'), clientId: clientIdSchema, theme: themeSchema }),
  z.object({
    type: z.literal('clientDetached'),
    clientId: clientIdSchema,
    reason: detachReasonSchema,
  }),
  z.object({ type: z.literal('serverStopping') }),
]);

const snapshotSchema: z.ZodType<Snapshot> = z.object({
  revision: count,
  workspaces: z.array(workspaceSchema),
  tabs: z.array(tabSchema),
  panes: z.array(paneSchema),
  defaultView: viewSchema,
  attachedClientId: absent(clientIdSchema),
  foregroundClientId: absent(clientIdSchema),
  clients: z.array(clientSchema),
});

const paneFailureSchema = z.enum([
  'unknownPane',
  'paneTooSmall',
  'noSplit',
  'serverStopping',
  'paneFailedToStart',
]);

const workspaceFailureSchema = z.enum(['unknownWorkspace', 'paneFailedToStart', 'serverStopping']);

const tabFailureSchema = z.enum([
  'unknownWorkspace',
  'unknownTab',
  'serverStopping',
  'paneFailedToStart',
]);

const controlSchema = z.discriminatedUnion('type', [
  // A CLI client has no terminal, so it sends no size.
  z.object({ type: z.literal('hello'), version: buildVersionSchema, size: absent(sizeSchema) }),
  z.object({ type: z.literal('welcome') }),
  z.object({ type: z.literal('refused'), client: buildVersionSchema, server: buildVersionSchema }),
  z.object({ type: z.literal('detach') }),
  // Builds stop each other's servers with this frame, so it must keep this shape in every build.
  z.object({ type: z.literal('stop') }),
  z.object({ type: z.literal('resize'), size: sizeSchema }),
  z.object({ type: z.literal('theme'), theme: themeSchema }),
  z.object({
    type: z.literal('ack'),
    paneId: paneIdSchema,
    sequence: count.max(largestSequence),
  }),
  z.object({ type: z.literal('resync') }),
  z.object({ type: z.literal('snapshot'), snapshot: snapshotSchema }),
  z.object({ type: z.literal('change'), revision: count, change: changeSchema }),
  z.object({ type: z.literal('takenOver') }),
  z.object({ type: z.literal('detached') }),
  // Answers a detach. False when no terminal client was attached.
  z.object({ type: z.literal('detachResult'), detached: z.boolean() }),
  z.object({ type: z.literal('paneRead'), paneId: paneIdSchema }),
  z.object({ type: z.literal('paneRows'), paneId: paneIdSchema, rows: z.array(z.string()) }),
  // Asks for the shell folder and the foreground folder of every running pane.
  z.object({ type: z.literal('paneFolders') }),
  z.object({
    type: z.literal('paneFoldersReply'),
    panes: z.array(
      z.object({
        paneId: paneIdSchema,
        folder: absent(z.string()),
        foregroundFolder: absent(z.string()),
      }),
    ),
  }),
  z.object({ type: z.literal('paneProcessInfo'), paneId: paneIdSchema }),
  z.object({
    type: z.literal('paneProcessInfoReply'),
    paneId: paneIdSchema,
    shellPid: count,
    foregroundGroup: absent(count),
    processes: z.array(
      z.object({
        pid: count,
        name: z.string(),
        argv: z.array(z.string()),
        cmdline: z.string(),
        folder: absent(z.string()),
      }),
    ),
  }),
  z.object({ type: z.literal('paneSend'), paneId: paneIdSchema, text: z.string() }),
  z.object({ type: z.literal('paneSent'), paneId: paneIdSchema }),
  z.object({ type: z.literal('paneMissing'), paneId: paneIdSchema }),
  z.object({ type: z.literal('paneSplit'), paneId: paneIdSchema, direction: splitDirectionSchema }),
  z.object({ type: z.literal('paneFocus'), paneId: paneIdSchema }),
  z.object({ type: z.literal('paneClose'), paneId: paneIdSchema }),
  z.object({ type: z.literal('paneZoom'), paneId: paneIdSchema }),
  z.object({
    type: z.literal('paneResize'),
    paneId: paneIdSchema,
    direction: resizeDirectionSchema,
    cells: z.number().int().positive(),
  }),
  // Answers a pane split, focus, close, zoom, or resize that worked, with the pane it acted on.
  // For a split, that is the new pane.
  z.object({ type: z.literal('paneDone'), paneId: paneIdSchema }),
  // Answers a pane request that changed nothing. The message is present for paneFailedToStart.
  z.object({
    type: z.literal('paneFailed'),
    reason: paneFailureSchema,
    message: absent(z.string()),
  }),
  z.object({
    type: z.literal('workspaceCreate'),
    root: z.string(),
    label: absent(z.string()),
    background: z.boolean(),
  }),
  z.object({ type: z.literal('workspaceFocus'), workspaceId: workspaceIdSchema }),
  z.object({
    type: z.literal('workspaceRename'),
    workspaceId: workspaceIdSchema,
    label: z.string(),
  }),
  z.object({ type: z.literal('workspaceClose'), workspaceId: workspaceIdSchema }),
  // Answers a workspace request that worked, with the workspace it acted on.
  z.object({ type: z.literal('workspaceDone'), workspaceId: workspaceIdSchema }),
  // Answers a workspace request that changed nothing. The message is present for paneFailedToStart.
  z.object({
    type: z.literal('workspaceFailed'),
    reason: workspaceFailureSchema,
    message: absent(z.string()),
  }),
  z.object({ type: z.literal('tabCreate'), workspaceId: workspaceIdSchema }),
  z.object({ type: z.literal('tabFocus'), tabId: tabIdSchema }),
  z.object({ type: z.literal('tabClose'), tabId: tabIdSchema }),
  // Answers a tab request that worked, with the tab it acted on.
  z.object({ type: z.literal('tabDone'), tabId: tabIdSchema }),
  // Answers a tab request that changed nothing. The message is present for paneFailedToStart.
  z.object({
    type: z.literal('tabFailed'),
    reason: tabFailureSchema,
    message: absent(z.string()),
  }),
]);

export type ControlMessage = z.output<typeof controlSchema>;

const textDecoder = new TextDecoder('utf-8', { fatal: true });

const textEncoder = new TextEncoder();

export const encodeControl = (message: ControlMessage): Uint8Array =>
  textEncoder.encode(JSON.stringify(message, (_key, value: unknown) => value ?? null));

const decodeText = (bytes: Uint8Array): string | undefined => {
  try {
    return textDecoder.decode(bytes);
  } catch {
    return undefined;
  }
};

const parseJson = (text: string): { ok: true; value: unknown } | { ok: false } => {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
};

export const parseControl = (bytes: Uint8Array): ParseControlResult => {
  const text = decodeText(bytes);

  if (text === undefined) {
    return { ok: false, reason: 'invalidText' };
  }

  const json = parseJson(text);

  if (!json.ok) {
    return { ok: false, reason: 'invalidJson' };
  }

  const parsed = controlSchema.safeParse(json.value);

  return parsed.success
    ? { ok: true, message: parsed.data }
    : { ok: false, reason: 'invalidMessage' };
};

const sameBuild = (left: BuildVersion, right: BuildVersion): boolean =>
  left.version === right.version && left.ghostty === right.ghostty;

// A client and server from different builds may disagree on any message, so they refuse each other.
export const answerHello = (server: BuildVersion, hello: Hello): HelloAnswer =>
  sameBuild(hello.version, server)
    ? { type: 'welcome' }
    : { type: 'refused', client: hello.version, server };
