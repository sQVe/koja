import { runPiReport, runPiStatus } from '../client/client.ts';
import type { PiReportMessage, PiReportResult, PiStatus } from '../client/client.ts';
import { paneId } from '../ids.ts';
import type { PaneId } from '../ids.ts';
import { piReportSchema, reportPassSchema } from '../protocol/protocol.ts';
import type { BuildVersion } from '../protocol/protocol.ts';
import { resolveSocketPath } from './environment.ts';
import type { Environment } from './environment.ts';
import { parseId } from './idParse.ts';
import { connectionFailureMessage, print, printJson } from './output.ts';
import type { Outcome } from './output.ts';
import type { PiCliCommand } from './piCommandParse.ts';

type PiReportRefusal = Extract<PiReportResult, { ok: false }>['reason'];

type ReportBuilt = { ok: true; message: PiReportMessage } | { ok: false; message: string };

type PiOutput =
  | null
  | { state: 'switching'; recoveryEligible: false }
  | {
      state: 'reported' | 'lost';
      recoveryEligible: boolean;
      piVersion: string;
      sessionId: string | null;
      sessionFile: string | null;
      reportedLeafId: string | null;
      provider: string | null;
      model: string | null;
      thinkingLevel: string;
      ownership: 'interactive' | 'tauWorker';
    };

interface PiStatusOutput {
  pane: string;
  pi: PiOutput;
}

const outsidePane = 'pi report runs only inside a Koja pane.';

const piOutputOf = (pi: PiStatus): PiOutput => {
  if (pi === null) {
    return null;
  }

  if (pi.state === 'switching') {
    return { state: 'switching', recoveryEligible: false };
  }

  return {
    state: pi.state,
    recoveryEligible: pi.ineligibleReasons.length === 0,
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

const piTextOf = (pi: PiStatus): string => {
  if (pi === null) {
    return 'none';
  }

  if (pi.state === 'switching') {
    return 'switching conversation';
  }

  const parts = pi.state === 'lost' ? ['lost'] : [];

  parts.push(pi.sessionFile ?? 'no session file');

  if (pi.provider !== undefined && pi.model !== undefined) {
    parts.push(`${pi.provider}/${pi.model}`);
  }

  return parts.join('  ');
};

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
    json: { pane, pi: piOutputOf(result.pi) },
    text: `${pane}  pi  ${piTextOf(result.pi)}`,
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
