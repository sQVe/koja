import { chmod, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { z } from 'zod';

export const report = {
  processId: 0,
  piVersion: '1.4.0',
  sessionId: 'conversation-1',
  sessionFile: null,
  leafId: 'leaf-1',
  provider: 'anthropic',
  model: 'claude-opus',
  thinkingLevel: 'high',
  ownership: 'interactive',
  event: { kind: 'start', reason: 'startup' },
  sequence: 1,
};

const recordedReportSchema = z.object({
  sequence: z.number(),
  event: z.object({ kind: z.string(), reason: z.string().optional() }),
});

export interface RecordedReport {
  report: z.infer<typeof recordedReportSchema>;
  stdout: string;
  exitCode: number;
}

const quote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;

// Each run saves the report it reads, runs the real command on it, and saves the command's stdout
// and exit status. The exit status is written last, so a record that has it is complete.
export const writeRecordingBinary = async (
  path: string,
  realBinaryPath: string,
  reportsDirectory: string,
): Promise<void> => {
  const script = [
    '#!/bin/sh',
    `record=${quote(reportsDirectory)}/"$$"`,
    'cat > "$record.json"',
    `${quote(realBinaryPath)} "$@" < "$record.json" > "$record.out"`,
    'status=$?',
    'echo "$status" > "$record.exit"',
    'exit "$status"',
    '',
  ];

  await writeFile(path, script.join('\n'));
  await chmod(path, 0o755);
};

export const recordedReportsOf = async (reportsDirectory: string): Promise<RecordedReport[]> => {
  const stems = (await readdir(reportsDirectory))
    .filter((name) => name.endsWith('.exit'))
    .map((name) => basename(name, '.exit'));

  return Promise.all(
    stems.map(async (stem) => {
      const base = join(reportsDirectory, stem);

      const [saved, stdout, exitStatus] = await Promise.all([
        readFile(`${base}.json`, 'utf8'),
        readFile(`${base}.out`, 'utf8'),
        readFile(`${base}.exit`, 'utf8'),
      ]);

      return {
        report: recordedReportSchema.parse(JSON.parse(saved)),
        stdout,
        exitCode: Number(exitStatus.trim()),
      };
    }),
  );
};
