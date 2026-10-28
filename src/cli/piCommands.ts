import { runPiReport, runPiStatus } from '../client/client.ts';
import type {
  PiRecoveryStatus,
  PiReportMessage,
  PiReportResult,
  PiStatus,
} from '../client/client.ts';
import { paneId } from '../ids.ts';
import type { PaneId } from '../ids.ts';
import { piReportSchema, reportPassSchema } from '../protocol/protocol.ts';
import type { BuildVersion } from '../protocol/protocol.ts';
import { piRecoveryReasonText } from '../server/server.ts';
import { resolveSocketPath } from './environment.ts';
import type { Environment } from './environment.ts';
import { parseId } from './idParse.ts';
import { connectionFailureMessage, print, printJson } from './output.ts';
import type { Outcome } from './output.ts';
import type { PiCliCommand } from './piCommandParse.ts';

type PiReportRefusal = Extract<PiReportResult, { ok: false }>['reason'];

type ReportBuilt = { ok: true; message: PiReportMessage } | { ok: false; message: string };

type PiIneligibleReason = NonNullable<PiStatus>['ineligibleReasons'][number];

interface PiEligibilityOutput {
  recoveryEligible: boolean;
  ineligibleReasons: PiIneligibleReason[];
}

type PiOutput =
  | null
  | ({ state: 'switching' } & PiEligibilityOutput)
  | ({
      state: 'reported' | 'lost';
      piVersion: string;
      sessionId: string | null;
      sessionFile: string | null;
      reportedLeafId: string | null;
      provider: string | null;
      model: string | null;
      thinkingLevel: string;
      ownership: 'interactive' | 'tauWorker';
    } & PiEligibilityOutput);

type PiRecoveryReason = Exclude<NonNullable<PiRecoveryStatus>, { status: 'ready' }>['reason'];

interface PiStatusOutput {
  pane: string;
  pi: PiOutput;
  recovery: {
    status: NonNullable<PiRecoveryStatus>['status'];
    reason: PiRecoveryReason | null;
  } | null;
}

const outsidePane = 'pi report runs only inside a Koja pane.';

const reasonTextOf: Record<PiIneligibleReason, string> = {
  tauWorker: 'a Tau worker owns this pi',
  switchPending: 'the conversation is switching',
  noSessionFile: 'pi reported no session file',
  sessionNotSaved: 'the session file is not saved yet',
};

const piOutputOf = (pi: PiStatus): PiOutput => {
  if (pi === null) {
    return null;
  }

  const eligibility = {
    recoveryEligible: pi.ineligibleReasons.length === 0,
    ineligibleReasons: pi.ineligibleReasons,
  };

  if (pi.state === 'switching') {
    return { state: 'switching', ...eligibility };
  }

  return {
    state: pi.state,
    ...eligibility,
    piVersion: pi.piVersion,
    sessionId: pi.sessionId ?? null,
    sessionFile: pi.sessionFile ?? null,
    reportedLeafId: pi.leafId ?? null,
    provider: pi.provider ?? null,
    model: pi.model ?? null,
    thinkingLevel: pi.thinkingLevel,
    ownership: pi.ownership,
  };
};

const recoveryTextOf = (reasons: PiIneligibleReason[]): string => {
  if (reasons.length === 0) {
    return 'recovery  eligible';
  }

  return `recovery  not eligible: ${reasons.map((reason) => reasonTextOf[reason]).join(', ')}`;
};

const identityTextOf = (pi: NonNullable<PiStatus>): string[] => {
  if (pi.state === 'switching') {
    return [];
  }

  const parts = [pi.sessionFile ?? 'no session file'];

  if (pi.provider !== undefined && pi.model !== undefined) {
    parts.push(`${pi.provider}/${pi.model}`);
  }

  return parts;
};

const piTextOf = (pane: PaneId, pi: PiStatus): string => {
  if (pi === null) {
    return `${pane}  pi  none`;
  }

  const summary = [pane, 'pi', pi.state, ...identityTextOf(pi)].join('  ');

  return `${summary}\n${recoveryTextOf(pi.ineligibleReasons)}`;
};

const restoreOutputOf = (recovery: PiRecoveryStatus): PiStatusOutput['recovery'] => {
  if (recovery === null) {
    return null;
  }

  return recovery.status === 'ready'
    ? { status: 'ready', reason: null }
    : { status: recovery.status, reason: recovery.reason };
};

const restoreTextOf = (recovery: PiRecoveryStatus): string[] => {
  if (recovery === null) {
    return [];
  }

  if (recovery.status === 'ready') {
    return ['restore  ready'];
  }

  return [`restore  ${recovery.status}: ${piRecoveryReasonText[recovery.reason]}`];
};

const statusTextOf = (pane: PaneId, pi: PiStatus, recovery: PiRecoveryStatus): string =>
  [piTextOf(pane, pi), ...restoreTextOf(recovery)].join('\n');

const runPiStatusCommand = async (
  command: PiCliCommand,
  pane: PaneId,
  version: BuildVersion,
  environment: Environment,
): Promise<Outcome> => {
  const socketPath = resolveSocketPath(command.socket, environment);
  const result = await runPiStatus(socketPath, version, pane);

  if (!result.ok && result.reason === 'unknownPane') {
    return { ok: false, message: `There is no pane ${pane}.` };
  }

  if (!result.ok) {
    return { ok: false, message: connectionFailureMessage(result, socketPath, 'pi status') };
  }

  print<PiStatusOutput>(command.json, {
    json: { pane, pi: piOutputOf(result.pi), recovery: restoreOutputOf(result.recovery) },
    text: statusTextOf(pane, result.pi, result.recovery),
  });

  return { ok: true };
};

const parseJson = (text: string): { ok: true; value: unknown } | { ok: false } => {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
};

const readReport = async (): Promise<
  { ok: true; report: PiReportMessage['report'] } | { ok: false; message: string }
> => {
  if (process.stdin.isTTY) {
    return { ok: false, message: 'pi report reads one JSON report from stdin, not a terminal.' };
  }

  const json = parseJson(await Bun.stdin.text());

  if (!json.ok) {
    return { ok: false, message: 'The report on stdin is not valid JSON.' };
  }

  const parsed = piReportSchema.safeParse(json.value);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.join('.') ?? '';
    const detail = field === '' ? issue?.message : `${field}: ${issue?.message}`;

    return { ok: false, message: `The report on stdin is not a valid pi report. ${detail}` };
  }

  return { ok: true, report: parsed.data };
};

const buildReport = async (environment: Environment): Promise<ReportBuilt> => {
  const paneValue = environment.KOJA_PANE_ID;

  if (paneValue === undefined) {
    return { ok: false, message: `KOJA_PANE_ID is not set. ${outsidePane}` };
  }

  const paneNumber = parseId(paneValue, 'pane');

  if (paneNumber === undefined) {
    return { ok: false, message: `KOJA_PANE_ID is not a pane id. ${outsidePane}` };
  }

  const token = environment.KOJA_REPORT_TOKEN;

  if (token === undefined) {
    return { ok: false, message: `KOJA_REPORT_TOKEN is not set. ${outsidePane}` };
  }

  if (!reportPassSchema.safeParse(token).success) {
    return { ok: false, message: 'KOJA_REPORT_TOKEN is not a Koja report pass.' };
  }

  const read = await readReport();

  if (!read.ok) {
    return read;
  }

  return {
    ok: true,
    message: { type: 'piReport', paneId: paneId(paneNumber), token, report: read.report },
  };
};

const refusalMessage = (reason: PiReportRefusal, report: PiReportMessage): string => {
  if (reason === 'unauthorized') {
    return `The server refused the report: KOJA_REPORT_TOKEN does not match pane ${report.paneId}.`;
  }

  if (reason === 'processNotInPane') {
    return `The server refused the report: process ${report.report.processId} does not run in pane ${report.paneId}.`;
  }

  if (reason === 'processNotRecorded') {
    return `The server refused the report: process ${report.report.processId} has not started a pi session in pane ${report.paneId}.`;
  }

  return reason === 'unknownPane'
    ? `The server refused the report: there is no pane ${report.paneId}.`
    : `The server refused the report: pane ${report.paneId} restarted.`;
};

const runPiReportCommand = async (
  command: PiCliCommand,
  version: BuildVersion,
  environment: Environment,
): Promise<Outcome> => {
  const built = await buildReport(environment);

  if (!built.ok) {
    return built;
  }

  const socketPath = resolveSocketPath(command.socket, environment);
  const sent = await runPiReport(socketPath, version, built.message);

  if (!sent.ok) {
    return { ok: false, message: connectionFailureMessage(sent, socketPath, 'pi report') };
  }

  if (command.json) {
    printJson(sent.result);
  }

  if (!sent.result.ok) {
    return { ok: false, message: refusalMessage(sent.result.reason, built.message) };
  }

  if (!command.json) {
    process.stdout.write(`${sent.result.status}\n`);
  }

  return { ok: true };
};

export const runPiAction = (
  command: PiCliCommand,
  version: BuildVersion,
  environment: Environment,
): Promise<Outcome> =>
  command.pi.action === 'status'
    ? runPiStatusCommand(command, command.pi.pane, version, environment)
    : runPiReportCommand(command, version, environment);
