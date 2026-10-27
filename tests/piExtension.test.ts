import { expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { quitReportWaitMs } from '../extensions/pi/koja.ts';
import { pollUntil, readJson, setup } from './paneHarness.ts';
import type { PaneSetup } from './paneHarness.ts';
import { recordedReportsOf, writeRecordingBinary } from './piReportHarness.ts';
import type { RecordedReport } from './piReportHarness.ts';
import {
  branchedConversation,
  headerIdOf,
  lastEntryIdOf,
  piCommand,
  piDirectories,
  pinnedPiVersion,
  savedConversation,
  savedIdentityOf,
  testModel,
  testProvider,
  testThinkingLevel,
} from './piSessionHarness.ts';

interface ScreenRead {
  current: string[];
  unchanged: boolean;
}

const piTestTimeoutMs = 60_000;

const footerEnd = `${testModel} • ${testThinkingLevel}`;

const piStatusSchema = z.object({
  pane: z.string(),
  pi: z
    .object({
      state: z.string(),
      recoveryEligible: z.boolean(),
      ineligibleReasons: z.array(z.string()),
      piVersion: z.string().optional(),
      sessionId: z.string().nullable().optional(),
      sessionFile: z.string().nullable().optional(),
      reportedLeafId: z.string().nullable().optional(),
      provider: z.string().nullable().optional(),
      model: z.string().nullable().optional(),
      thinkingLevel: z.string().optional(),
      ownership: z.string().optional(),
    })
    .nullable(),
});

type PiStatus = z.infer<typeof piStatusSchema>;

const processInfoSchema = z.object({
  shell_pid: z.number(),
  foreground_processes: z.array(z.object({ pid: z.number() })),
});

const send = async (pane: PaneSetup, text: string): Promise<void> => {
  const sent = await pane.koja('pane', 'send', text);

  expect({ exitCode: sent.exitCode, stderr: sent.stderr }).toEqual({ exitCode: 0, stderr: '' });
};

const piStatus = async (pane: PaneSetup): Promise<PiStatus> => {
  const status = await pane.koja('pi', 'status', pane.first, '--json');

  expect({ exitCode: status.exitCode, stderr: status.stderr }).toEqual({ exitCode: 0, stderr: '' });

  return piStatusSchema.parse(JSON.parse(status.stdout));
};

const waitForPi = (pane: PaneSetup, state: string | null): Promise<PiStatus> =>
  pollUntil(
    () => piStatus(pane),
    (status) => (status.pi?.state ?? null) === state,
  );

const waitForReported = (
  pane: PaneSetup,
  done: (pi: NonNullable<PiStatus['pi']>) => boolean,
): Promise<PiStatus> =>
  pollUntil(
    () => piStatus(pane),
    (status) => status.pi?.state === 'reported' && done(status.pi),
  );

const processInfo = async (pane: PaneSetup) => {
  const info = await pane.koja('pane', 'process-info', pane.first);

  expect(info.exitCode).toBe(0);

  return processInfoSchema.parse(JSON.parse(info.stdout));
};

const onlyShellRuns = (info: z.infer<typeof processInfoSchema>): boolean =>
  info.foreground_processes.map((process) => process.pid).join(',') === String(info.shell_pid);

const killForegroundProcesses = (info: z.infer<typeof processInfoSchema>): void => {
  for (const { pid } of info.foreground_processes) {
    if (pid !== info.shell_pid) {
      process.kill(pid, 'SIGKILL');
    }
  }
};

const visibleLines = async (pane: PaneSetup): Promise<string[]> =>
  (await readJson(pane.koja, pane.first, '--lines', '30')).lines;

const isSettledReady = ({ current, unchanged }: ScreenRead): boolean =>
  unchanged && (current.at(-1)?.endsWith(footerEnd) ?? false);

// `pollUntil` returns its last read after a timeout, so the check repeats here.
const settledScreen = async (pane: PaneSetup): Promise<string[]> => {
  let previous: string[] = [];

  const settled = await pollUntil(async () => {
    const current = await visibleLines(pane);
    const unchanged = current.join('\n') === previous.join('\n');

    previous = current;

    return { current, unchanged };
  }, isSettledReady);

  expect({ ready: isSettledReady(settled), screen: settled.current }).toEqual({
    ready: true,
    screen: settled.current,
  });

  return settled.current;
};

const showsText = async (pane: PaneSetup, text: string): Promise<boolean> => {
  const hasText = (lines: string[]): boolean => lines.some((line) => line.includes(text));

  return hasText(await pollUntil(() => visibleLines(pane), hasText));
};

const showsLine = async (pane: PaneSetup, line: string): Promise<boolean> => {
  const shown = await pollUntil(
    () => visibleLines(pane),
    (lines) => lines.includes(line),
  );

  return shown.includes(line);
};

const paneBinaryPathOf = async (pane: PaneSetup): Promise<string> => {
  const { shell_pid: shellPid } = await processInfo(pane);
  const environment = (await readFile(`/proc/${shellPid}/environ`, 'utf8')).split('\0');
  const entry = environment.find((item) => item.startsWith('KOJA_BIN_PATH='));

  expect(entry).toBeDefined();

  return entry?.slice('KOJA_BIN_PATH='.length) ?? '';
};

const isReloadStart = (recorded: RecordedReport): boolean =>
  recorded.report.event.kind === 'start' && recorded.report.event.reason === 'reload';

const startPiWithSlowQuitReport = async (
  pane: PaneSetup,
  quitDelaySeconds: number,
): Promise<string> => {
  const directories = await piDirectories(pane.directory);
  const reportsDirectory = join(pane.directory, 'reports');
  const recordingBinary = join(pane.directory, 'koja-recording');

  await mkdir(reportsDirectory);

  await writeRecordingBinary(
    recordingBinary,
    await paneBinaryPathOf(pane),
    reportsDirectory,
    quitDelaySeconds,
  );

  await send(pane, piCommand(directories, { extension: true, binaryPath: recordingBinary }));
  await waitForPi(pane, 'reported');

  return reportsDirectory;
};

it(
  'reports the exact conversation of pi in the pane, the one it switches to, and its quit',
  async () => {
    const pane = await setup();
    const directories = await piDirectories(pane.directory);
    const conversation = savedConversation(pane, directories);

    await send(pane, piCommand(directories, { extension: true, sessionFile: conversation }));

    const { pi } = await waitForPi(pane, 'reported');

    expect(existsSync(conversation)).toBe(true);

    expect(pi).toEqual({
      state: 'reported',
      recoveryEligible: true,
      ineligibleReasons: [],
      piVersion: pinnedPiVersion,
      sessionId: await headerIdOf(conversation),
      sessionFile: conversation,
      reportedLeafId: await lastEntryIdOf(conversation),
      provider: testProvider,
      model: testModel,
      thinkingLevel: testThinkingLevel,
      ownership: 'interactive',
    });

    await send(pane, '/new\r');

    const switched = (await waitForReported(pane, (next) => next.sessionId !== pi?.sessionId)).pi;
    const newSessionFile = switched?.sessionFile ?? '';

    expect(switched).toEqual({
      state: 'reported',
      recoveryEligible: false,
      ineligibleReasons: ['sessionNotSaved'],
      piVersion: pinnedPiVersion,
      sessionId: expect.any(String) as string,
      sessionFile: expect.stringContaining(directories.sessions) as string,
      reportedLeafId: expect.any(String) as string,
      provider: testProvider,
      model: testModel,
      thinkingLevel: testThinkingLevel,
      ownership: 'interactive',
    });

    expect(switched?.sessionId).not.toBe(pi?.sessionId);
    expect(newSessionFile).not.toBe(conversation);
    expect(existsSync(newSessionFile)).toBe(false);

    await send(pane, '/quit\r');

    expect((await waitForPi(pane, null)).pi).toBeNull();
    expect(onlyShellRuns(await pollUntil(() => processInfo(pane), onlyShellRuns))).toBe(true);
    expect((await pane.list()).map((listed) => listed.lifecycle)).toEqual(['running']);
  },
  piTestTimeoutMs,
);

it(
  'reports the conversation pi resumes, reloads, and forks to, and keeps a killed pi as lost',
  async () => {
    const pane = await setup();
    const directories = await piDirectories(pane.directory);
    const conversation = savedConversation(pane, directories);
    const other = savedConversation(pane, directories, ['resumable first', 'resumable second']);
    const reportsDirectory = join(pane.directory, 'reports');
    const recordingBinary = join(pane.directory, 'koja-recording');

    await mkdir(reportsDirectory);
    await writeRecordingBinary(recordingBinary, await paneBinaryPathOf(pane), reportsDirectory);

    await send(
      pane,
      piCommand(directories, {
        extension: true,
        sessionFile: conversation,
        binaryPath: recordingBinary,
      }),
    );

    await waitForPi(pane, 'reported');
    await send(pane, '/resume\r');
    await send(pane, 'resumable');

    expect(await showsText(pane, '› resumable first')).toBe(true);

    await send(pane, '\r');

    const resumed = await waitForReported(pane, (next) => next.sessionFile === other);

    expect(resumed.pi).toMatchObject({ ...(await savedIdentityOf(other)), recoveryEligible: true });

    await send(pane, '/reload\r');

    expect(await showsText(pane, 'Reloaded keybindings')).toBe(true);

    const recorded = await pollUntil(
      () => recordedReportsOf(reportsDirectory),
      (all) => all.some(isReloadStart),
    );

    const reloadReport = recorded.find(isReloadStart);
    const earlier = recorded.filter((item) => item !== reloadReport);

    expect(reloadReport).toMatchObject({
      report: { event: { kind: 'start', reason: 'reload' } },
      stdout: 'updated\n',
      exitCode: 0,
    });

    expect(reloadReport?.report.sequence).toBeGreaterThan(
      Math.max(...earlier.map((item) => item.report.sequence)),
    );

    const reloaded = await waitForReported(pane, (next) => next.sessionFile === other);

    expect(reloaded.pi).toMatchObject({
      ...(await savedIdentityOf(other)),
      recoveryEligible: true,
    });

    await send(pane, '/fork\r');

    expect(await showsText(pane, '› resumable second')).toBe(true);

    await send(pane, '\r');

    const forked = await waitForReported(
      pane,
      (next) => next.sessionFile !== other && next.sessionFile !== conversation,
    );

    const forkedFile = forked.pi?.sessionFile ?? '';

    expect(existsSync(forkedFile)).toBe(true);

    expect(forked.pi).toMatchObject({
      ...(await savedIdentityOf(forkedFile)),
      recoveryEligible: true,
    });

    killForegroundProcesses(await processInfo(pane));

    const lost = await waitForPi(pane, 'lost');

    expect(lost.pi).toMatchObject(await savedIdentityOf(forkedFile));
    expect(onlyShellRuns(await pollUntil(() => processInfo(pane), onlyShellRuns))).toBe(true);
  },
  piTestTimeoutMs,
);

it(
  'shows no pi, not a lost one, once pi quits while its quit report is slow',
  async () => {
    const pane = await setup();

    const reportsDirectory = await startPiWithSlowQuitReport(pane, 1);

    await send(pane, '/quit\r');

    expect(onlyShellRuns(await pollUntil(() => processInfo(pane), onlyShellRuns))).toBe(true);

    const delayed = (await recordedReportsOf(reportsDirectory)).filter(
      (recorded) => recorded.delayed,
    );

    expect(delayed.map((recorded) => [recorded.report.event, recorded.exitCode])).toEqual([
      [{ kind: 'shutdown', reason: 'quit' }, 0],
    ]);

    expect((await piStatus(pane)).pi).toBeNull();
  },
  piTestTimeoutMs,
);

it(
  'lets pi exit within the quit wait when its quit report hangs',
  async () => {
    const pane = await setup();
    const exitMarginMs = 2500;

    await startPiWithSlowQuitReport(pane, 6);

    const quitAt = performance.now();

    await send(pane, '/quit\r');

    const exited = onlyShellRuns(await pollUntil(() => processInfo(pane), onlyShellRuns));
    const elapsedMs = performance.now() - quitAt;

    expect(exited).toBe(true);
    expect(elapsedMs).toBeLessThan(quitReportWaitMs + exitMarginMs);
  },
  piTestTimeoutMs,
);

it(
  'reports a pi in a Tau worker pane and draws nothing on its screen',
  async () => {
    const pane = await setup();

    const directories = await piDirectories(pane.directory, { quietStartup: true });

    await send(pane, piCommand(directories, { extension: false }));

    const withoutExtension = await settledScreen(pane);

    await send(pane, '/quit\r');
    await pollUntil(() => processInfo(pane), onlyShellRuns);
    await send(pane, piCommand(directories, { extension: true, workerRecord: 'worker-1' }));

    const { pi } = await waitForPi(pane, 'reported');

    expect(pi?.ownership).toBe('tauWorker');
    expect(pi?.ineligibleReasons).toContain('tauWorker');
    expect(await settledScreen(pane)).toEqual(withoutExtension);
  },
  piTestTimeoutMs,
);

it(
  'reports the thinking level and the selected leaf after pi changes them in one conversation',
  async () => {
    const pane = await setup();

    const directories = await piDirectories(pane.directory, {
      branchSummary: { skipPrompt: true },
    });

    const { sessionFile: conversation, firstId } = branchedConversation(pane, directories);

    await send(pane, piCommand(directories, { extension: true, sessionFile: conversation }));

    const { pi } = await waitForPi(pane, 'reported');

    expect(pi?.reportedLeafId).toBe(await lastEntryIdOf(conversation));

    await send(pane, '/thinking high\r');

    const thought = await waitForReported(pane, (next) => next.thinkingLevel === 'high');

    expect(thought.pi).toEqual(
      pi === null
        ? null
        : { ...pi, thinkingLevel: 'high', reportedLeafId: await lastEntryIdOf(conversation) },
    );

    expect(thought.pi?.reportedLeafId).not.toBe(pi?.reportedLeafId);

    await send(pane, '/tree\r');

    expect(await showsLine(pane, '› ├─ • user: branch two')).toBe(true);

    await send(pane, '\u001B[B');

    expect(await showsLine(pane, '› └─ user: branch one')).toBe(true);

    await send(pane, '\r');

    const selected = await waitForReported(
      pane,
      (next) => next.reportedLeafId !== thought.pi?.reportedLeafId,
    );

    expect(selected.pi).toEqual(
      thought.pi === null ? null : { ...thought.pi, reportedLeafId: firstId },
    );
  },
  piTestTimeoutMs,
);
