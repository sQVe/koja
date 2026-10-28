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
  PiReport,
  WorkspaceRecord,
} from '../store/store.ts';

// The package.json version and the Ghostty commit, as `koja --version` prints them.
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

type Arrangement = Tab['arrangement'];

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

const maxWord = 0xff_ff_ff_ff;

const wordSchema = z.number().int().min(0).max(maxWord);

// lines is absent for the default. Row numbers are stable row numbers, and epoch is absent to read
// in the current epoch.
const paneReadSelectionSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('visible'), lines: absent(count) }),
  z.object({ source: z.literal('recent'), lines: absent(count) }),
  z.object({ source: z.literal('recentUnwrapped'), lines: absent(count) }),
  z.object({
    source: z.literal('range'),
    from: z.number().int().nonnegative(),
    to: z.number().int().nonnegative(),
    epoch: absent(wordSchema),
    screen: absent(wordSchema),
  }),
]);

// pruned: the range starts below the oldest row kept. staleEpoch: the request named another epoch
// than the current one. screenChanged: the request named the primary or alternate screen, which is
// not the current one. The screens share row numbers and the epoch, and a generation grows each
// time the pane switches between them. screen is the current generation. tooManyBytes: the
// selection is larger than one snapshot can be. It names the rows the selection covers, as the
// epoch, the screen generation, the first stable row number, and the row count, so a client can
// read them as a range in several snapshots. noSnapshot: the connection holds no snapshot for
// the request a part was asked for.
export const pendingPaneReadLimit = 64;

const paneReadFailureSchema = z.discriminatedUnion('reason', [
  z.object({ reason: z.literal('pruned'), oldest: z.number().int().nonnegative() }),
  z.object({ reason: z.literal('staleEpoch'), epoch: wordSchema }),
  z.object({ reason: z.literal('screenChanged'), screen: wordSchema }),
  z.object({
    reason: z.literal('tooManyBytes'),
    limitBytes: count,
    epoch: wordSchema,
    screen: wordSchema,
    first: z.number().int().nonnegative(),
    count,
  }),
  z.object({ reason: z.literal('noSnapshot') }),
  z.object({ reason: z.literal('tooManyPendingReads'), limit: z.literal(pendingPaneReadLimit) }),
]);

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
  'failed',
]);

const paneSchema: z.ZodType<Pane> = z.object({
  id: paneIdSchema,
  tabId: tabIdSchema,
  lifecycle: lifecycleSchema,
  size: sizeSchema,
  generation: count,
  exitCode: absent(z.number().int()),
  startFolder: absent(z.string()),
  restored: z.boolean(),
  error: absent(z.string()),
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

const layoutChoiceSchema: z.ZodType<Arrangement['choice']> = z.enum(['legacy', 'master']);

const arrangementSchema: z.ZodType<Arrangement> = z.object({
  choice: layoutChoiceSchema,
  order: z.array(paneIdSchema),
});

const tabSchema: z.ZodType<Tab> = z.object({
  id: tabIdSchema,
  workspaceId: workspaceIdSchema,
  layout: layoutSchema,
  arrangement: arrangementSchema,
  focusedPaneId: paneIdSchema,
  zoomedPaneId: absent(paneIdSchema),
  label: absent(z.string()),
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
  scrolls: z.array(z.object({ paneId: paneIdSchema, topRow: count })),
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
  z.object({ type: z.literal('tabRenamed'), tabId: tabIdSchema, label: z.string() }),
  z.object({ type: z.literal('tabRemoved'), tabId: tabIdSchema }),
  z.object({ type: z.literal('paneRemoved'), paneId: paneIdSchema }),
  z.object({ type: z.literal('paneMoved'), paneId: paneIdSchema, tabId: tabIdSchema }),
  z.object({
    type: z.literal('tabLayoutChanged'),
    tabId: tabIdSchema,
    layout: layoutSchema,
    arrangement: arrangementSchema,
  }),
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
    error: absent(z.string()),
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
  'unknownTab',
  'paneTooSmall',
  'sameTab',
  'noSplit',
  'requiresLegacyLayout',
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

const detachOutcomeSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true) }),
  z.strictObject({ ok: z.literal(false), reason: z.enum(['noClient', 'unknownClient']) }),
]);

const stopOutcomeSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true) }),
  z.strictObject({ ok: z.literal(false), message: z.string() }),
]);

const paneScrollTargetSchema = z.union([z.literal('top'), z.literal('bottom'), count]);

const paneScrollOutcomeSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), clientId: clientIdSchema, topRow: absent(count) }),
  z.strictObject({
    ok: z.literal(false),
    reason: z.enum(['noClient', 'unknownClient', 'unknownPane']),
  }),
]);

const cellPositionSchema = z.strictObject({ row: count, column: count });

type CellPosition = z.infer<typeof cellPositionSchema>;

const startsBeforeEnd = ({ start, end }: { start: CellPosition; end: CellPosition }): boolean => {
  const inOrderOnOneRow = start.row === end.row && start.column <= end.column;

  return start.row < end.row || inOrderOnOneRow;
};

// pruned: the range starts below the oldest row kept, which is `oldest`. tooLarge: the range holds
// more rows than one read can, or its encoded reply would not fit in one reply.
const paneCopyOutcomeSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), text: z.string(), clientId: absent(clientIdSchema) }),
  z.strictObject({
    ok: z.literal(false),
    reason: z.enum(['noClient', 'unknownPane', 'tooLarge', 'pruned']),
    oldest: absent(count),
  }),
]);

const panePasteOutcomeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('sent'), paneId: paneIdSchema, generation: count }),
  z.strictObject({
    kind: z.literal('confirmationRequired'),
    paneId: paneIdSchema,
    generation: count,
    lines: count,
    authorization: z.string(),
  }),
  z.strictObject({ kind: z.literal('paneMissing'), paneId: paneIdSchema }),
  z.strictObject({ kind: z.literal('paneReplaced'), paneId: paneIdSchema, generation: count }),
  z.strictObject({ kind: z.literal('authorizationMismatch') }),
]);

const piReportText = (maxLength: number) => z.string().min(1).max(maxLength);

export const reportPassSchema = z.string().regex(/^[0-9a-f]{64}$/);

const piReportLimits = {
  shortText: 64,
  identifier: 256,
  path: 4096,
};

const piSwitchReasons = ['reload', 'new', 'resume', 'fork'] as const;

const piEventSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('start'), reason: z.enum(['startup', ...piSwitchReasons]) }),
  z.strictObject({ kind: z.literal('tree') }),
  z.strictObject({ kind: z.literal('model') }),
  z.strictObject({ kind: z.literal('thinking') }),
  z.strictObject({ kind: z.literal('shutdown'), reason: z.enum(['quit', ...piSwitchReasons]) }),
]);

const piIdentitySchema = z.strictObject({
  piVersion: piReportText(piReportLimits.shortText),
  sessionId: absent(piReportText(piReportLimits.identifier)),
  sessionFile: absent(piReportText(piReportLimits.path)),
  leafId: absent(piReportText(piReportLimits.identifier)),
  provider: absent(piReportText(piReportLimits.identifier)),
  model: absent(piReportText(piReportLimits.identifier)),
  thinkingLevel: piReportText(piReportLimits.shortText),
  ownership: z.enum(['interactive', 'tauWorker']),
});

export const piReportSchema: z.ZodType<PiReport> = piIdentitySchema.extend({
  processId: z.number().int().positive(),
  event: piEventSchema,
  sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

const piReportOutcomeSchema = z.discriminatedUnion('ok', [
  z.strictObject({
    ok: z.literal(true),
    status: z.enum(['recorded', 'updated', 'ignored']),
  }),
  z.strictObject({
    ok: z.literal(false),
    reason: z.enum([
      'unauthorized',
      'processNotInPane',
      'processNotRecorded',
      'unknownPane',
      'staleGeneration',
    ]),
  }),
]);

const piIneligibleReasons = [
  'tauWorker',
  'switchPending',
  'noSessionFile',
  'sessionNotSaved',
] as const;

const piIneligibleReasonsSchema = z
  .array(z.enum(piIneligibleReasons))
  .max(piIneligibleReasons.length);

const piStatusSchema = z.union([
  z.null(),
  z.strictObject({ state: z.literal('switching'), ineligibleReasons: piIneligibleReasonsSchema }),
  piIdentitySchema.extend({
    state: z.enum(['reported', 'lost']),
    ineligibleReasons: piIneligibleReasonsSchema,
  }),
]);

const controlSchema = z.discriminatedUnion('type', [
  // A CLI client has no terminal, so it sends no size.
  z.object({ type: z.literal('hello'), version: buildVersionSchema, size: absent(sizeSchema) }),
  z.object({ type: z.literal('welcome') }),
  z.object({ type: z.literal('refused'), client: buildVersionSchema, server: buildVersionSchema }),
  // Without a client id, the foreground client detaches.
  z.object({ type: z.literal('detach'), clientId: absent(clientIdSchema) }),
  // Scrolls a client's view of a pane to its oldest row, to the bottom, or to a stable row.
  // Without a client id, the foreground client scrolls.
  z.object({
    type: z.literal('paneScroll'),
    paneId: paneIdSchema,
    to: paneScrollTargetSchema,
    clientId: absent(clientIdSchema),
  }),
  z.object({ type: z.literal('paneScrollResult'), result: paneScrollOutcomeSchema }),
  // Copies the text from one cell to another, both inclusive, as stable rows and columns from 0.
  // Without print, the foreground client gets it as a clipboardWrite. With print, the result holds
  // the text and no client gets anything. The result names the client that got the text.
  z
    .object({
      type: z.literal('paneCopy'),
      paneId: paneIdSchema,
      start: cellPositionSchema,
      end: cellPositionSchema,
      print: z.boolean(),
    })
    .refine(startsBeforeEnd),
  z.object({ type: z.literal('paneCopyResult'), result: paneCopyOutcomeSchema }),
  // Builds stop each other's servers with this frame, so it must keep this shape in every build.
  z.object({ type: z.literal('stop') }),
  // The server sends this to each stop connection before it closes it. Builds that predate it send
  // none, so a missing one still means success. It must keep this shape in every build.
  z.object({ type: z.literal('stopResult'), result: stopOutcomeSchema }),
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
  // A pane rang the bell this many times. Only the foreground client gets it.
  z.object({ type: z.literal('bell'), count: count.min(1) }),
  // A pane program wrote text to the clipboard. Only the foreground client gets it.
  z.object({ type: z.literal('clipboardWrite'), text: z.string() }),
  z.object({ type: z.literal('takenOver') }),
  z.object({ type: z.literal('detached') }),
  z.object({ type: z.literal('detachResult'), result: detachOutcomeSchema }),
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
  // Asks for the rows of a pane. The rows come back in a paneRows frame, or as paneReadFailed.
  z.object({
    type: z.literal('paneRead'),
    paneId: paneIdSchema,
    requestId: wordSchema,
    selection: paneReadSelectionSchema,
  }),
  // Asks for the next part of the snapshot a paneRead took. The part comes back in a paneRows
  // frame, or as paneReadFailed.
  z.object({ type: z.literal('paneReadNext'), paneId: paneIdSchema, requestId: wordSchema }),
  z.object({
    type: z.literal('paneReadFailed'),
    paneId: paneIdSchema,
    requestId: wordSchema,
    failure: paneReadFailureSchema,
  }),
  z.object({ type: z.literal('paneSend'), paneId: paneIdSchema, text: z.string() }),
  z.object({ type: z.literal('paneSent'), paneId: paneIdSchema }),
  z.object({
    type: z.literal('panePaste'),
    paneId: paneIdSchema,
    generation: absent(count),
    text: z.string(),
    authorization: absent(z.string()),
  }),
  z.object({ type: z.literal('panePasteResult'), result: panePasteOutcomeSchema }),
  z.object({ type: z.literal('paneMissing'), paneId: paneIdSchema }),
  z.object({
    type: z.literal('paneSplit'),
    paneId: paneIdSchema,
    direction: splitDirectionSchema,
    cwd: absent(z.string()),
  }),
  z.object({ type: z.literal('paneAdd'), paneId: paneIdSchema, cwd: absent(z.string()) }),
  z.object({
    type: z.literal('paneMove'),
    paneId: paneIdSchema,
    destination: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('tab'), tabId: tabIdSchema }),
      z.object({ kind: z.literal('newTab') }),
      z.object({ kind: z.literal('newWorkspace') }),
    ]),
  }),
  z.object({ type: z.literal('paneFocus'), paneId: paneIdSchema }),
  z.object({ type: z.literal('paneClose'), paneId: paneIdSchema }),
  z.object({ type: z.literal('paneZoom'), paneId: paneIdSchema }),
  z.object({
    type: z.literal('paneResize'),
    paneId: paneIdSchema,
    direction: resizeDirectionSchema,
    cells: z.number().int().positive(),
  }),
  // Answers a pane split, add, focus, close, move, zoom, or resize that worked, with the pane it
  // acted on. For a split or an add, that is the new pane.
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
    focus: z.boolean(),
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
  z.object({
    type: z.literal('tabCreate'),
    workspaceId: workspaceIdSchema,
    cwd: absent(z.string()),
    focus: z.boolean(),
  }),
  z.object({ type: z.literal('tabFocus'), tabId: tabIdSchema }),
  z.object({ type: z.literal('tabRename'), tabId: tabIdSchema, label: z.string() }),
  z.object({ type: z.literal('tabClose'), tabId: tabIdSchema }),
  z.object({ type: z.literal('tabLayout'), tabId: tabIdSchema, choice: layoutChoiceSchema }),
  // Answers a tab request that worked, with the tab it acted on.
  z.object({ type: z.literal('tabDone'), tabId: tabIdSchema }),
  // Answers a tab request that changed nothing. The message is present for paneFailedToStart.
  z.object({
    type: z.literal('tabFailed'),
    reason: tabFailureSchema,
    message: absent(z.string()),
  }),
  z.strictObject({
    type: z.literal('piReport'),
    paneId: paneIdSchema,
    token: reportPassSchema,
    report: piReportSchema,
  }),
  z.strictObject({ type: z.literal('piReportResult'), result: piReportOutcomeSchema }),
  z.strictObject({ type: z.literal('piStatus'), paneId: paneIdSchema }),
  z.strictObject({ type: z.literal('piStatusReply'), paneId: paneIdSchema, pi: piStatusSchema }),
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
