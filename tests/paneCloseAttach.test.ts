import { expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { cliTestTimeoutMs, temporaryDirectory } from './cliHarness.ts';
import { accentWord, setup } from './paneAttachHarness.ts';
import { waitFor } from './serverProcesses.ts';

const tabListSchema = z.array(
  z.object({
    pane: z.string(),
    arrangement: z.object({ choice: z.literal('master'), order: z.array(z.string()) }),
  }),
);

const recordingMaster = async () => {
  const attached = await setup();
  const second = await attached.act('add', attached.first);
  const third = await attached.act('add', second);
  const ids = [attached.first, second, third];
  const directory = await temporaryDirectory();
  const script = join(directory, 'record.ts');

  await writeFile(
    script,
    `
import { appendFileSync, writeFileSync } from 'node:fs';
const path = process.argv[2];
process.stdin.setRawMode(true);
process.stdin.on('data', (bytes) => appendFileSync(path, bytes));
writeFileSync(path + '.ready', '');
console.log('recording-' + path.split('/').at(-1));
`,
  );

  const captured = (id: string): string => readFileSync(join(directory, id), 'utf8');

  for (const id of ids) {
    const path = join(directory, id);
    const command = `${JSON.stringify(process.execPath)} ${JSON.stringify(script)} ${JSON.stringify(path)}\n`;

    await writeFile(path, '');
    await attached.koja('pane', 'send', command, '--pane', id);
    expect(await waitFor(() => existsSync(`${path}.ready`))).toBe(true);

    expect(captured(id)).toBe('');
  }

  return { ...attached, ids, captured };
};

it.each([
  { name: 'master', close: 0, selected: 1, order: [1, 2] },
  { name: 'right-side pane', close: 1, selected: 2, order: [0, 2] },
])(
  'closes the $name through attached input without sending close keys to guests',
  async ({ close, selected, order }) => {
    const attached = await recordingMaster();
    const closing = attached.ids[close] ?? '';
    const selectedId = attached.ids[selected] ?? '';
    const survivors = order.map((index) => attached.ids[index] ?? '');

    await attached.act('focus', closing);
    const selectedColumn = close === 0 ? 0 : 41;

    await attached.until(() => attached.foreground(0, selectedColumn) === accentWord);
    await attached.until(() => attached.lines().at(-1)?.includes('INSERT') === true);
    attached.type('\x02');
    await attached.until(() => attached.lines().at(-1)?.includes('NORMAL') === true);
    await attached.until(() => attached.screenText().includes(`recording-${closing}`));
    attached.type('x');
    expect(await waitFor(async () => (await attached.list()).length === 2)).toBe(true);
    await attached.until(() => !attached.screenText().includes(`recording-${closing}`));

    const tabs = tabListSchema.parse(JSON.parse(await attached.koja('tab', 'list', '--json')));
    const remaining = await attached.list();

    expect(tabs).toEqual([
      { pane: selectedId, arrangement: { choice: 'master', order: survivors } },
    ]);

    expect(remaining.map((pane) => pane.id).toSorted()).toEqual(survivors.toSorted());
    expect(remaining.filter((pane) => pane.focused).map((pane) => pane.id)).toEqual([selectedId]);
    expect(attached.lines().at(-1)).toContain('NORMAL');
    expect(attached.captured(closing)).toBe('');

    for (const id of survivors) {
      await attached.koja('pane', 'send', 'checked', '--pane', id);
      expect(await waitFor(() => attached.captured(id).includes('checked'))).toBe(true);

      expect(attached.captured(id)).toBe('checked');
    }
  },
  cliTestTimeoutMs,
);
