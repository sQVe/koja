import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../tests/drawn.ts';
import { drawn, drawnIcons, drawnTexts, elementWithIcon } from '../../tests/drawn.ts';
import { gpuiBaseFake, gpuiKitFake, herdrFake } from '../../tests/moduleFakes.ts';
import type { AttentionStatus } from './attentionStatus.ts';
import { shellSize } from './size.ts';

interface HeaderOptions {
  program: null;
  name: string;
  role?: string;
  task?: string;
  branch?: string;
  folder: string;
  status: AttentionStatus | null;
  focused: boolean;
  zoomed: boolean;
  width: number;
}

Object.assign(globalThis, { kojaModName: 'koja' });

await mock.module('gpui-base', () => gpuiBaseFake({ h_flex: () => drawn() }));

await mock.module('gpui-kit', () =>
  gpuiKitFake({ div: () => drawn(), svg: (path: string) => drawn(path) }),
);

await mock.module('herdr', () =>
  herdrFake({
    theme: () => ({
      foreground: '#000000',
      muted: '#111111',
      blocked: '#222222',
      working: '#333333',
      done: '#444444',
    }),
  }),
);

const modulePath = './paneHeader.ts';

const { paneHeader } = (await import(modulePath)) as {
  paneHeader: (options: HeaderOptions) => DrawnElement;
};

afterAll(() => {
  mock.restore();
});

const header = (role?: string): DrawnElement =>
  paneHeader({
    program: null,
    name: 'Pi',
    folder: '~/code/koja',
    status: null,
    focused: false,
    zoomed: false,
    width: shellSize.wideSpecimenWidth,
    ...(role === undefined ? {} : { role }),
  });

const textsAfterName = (element: DrawnElement): string[] | null => {
  const nameIndex = element.kids.findIndex((kid) => kid.texts.includes('Pi'));
  const next = element.kids.at(nameIndex + 1);

  return next === undefined ? null : drawnTexts(next);
};

const roleElement = (width: number): DrawnElement | undefined => {
  const element = paneHeader({
    program: null,
    name: 'Pi',
    role: 'integration-test-runner',
    folder: '~/code/koja',
    status: null,
    focused: false,
    zoomed: false,
    width,
  });

  return element.kids.find((kid) => drawnTexts(kid).includes('integration-test-runner'));
};

describe('paneHeader role badge', () => {
  test('the role badge draws right after the pane name', () => {
    expect(textsAfterName(header('architect'))).toEqual(['architect']);
  });

  test('a pane without a role draws no badge', () => {
    expect(drawnTexts(header())).toEqual(['Pi', '~/code/koja']);
  });

  test('an empty role draws no badge', () => {
    expect(drawnTexts(header(''))).toEqual(['Pi', '~/code/koja']);
  });

  test('a full role badge draws without the cut minimum', () => {
    const badge = roleElement(shellSize.wideSpecimenWidth);

    expect(badge?.styles['min_w']).toBeUndefined();
    expect(badge?.styles['flex_none']).toEqual([]);
  });

  test('a cut role badge can shrink below the built-in width', () => {
    const badge = roleElement(120);

    expect(badge?.styles['flex_initial']).toEqual([]);
    expect(badge?.styles['min_w']).toEqual([0]);
  });

  test('a wide header without a task end-aligns its folder', () => {
    const element = paneHeader({
      program: null,
      name: 'Pi',
      role: 'lead',
      folder: '~/code/koja',
      status: null,
      focused: false,
      zoomed: false,
      width: shellSize.wideSpecimenWidth,
    });

    const folder = element.kids.find((kid) => drawnTexts(kid).includes('~/code/koja'));
    const actionRow = element.kids.find((kid) => kid.styles['ml_auto'] !== undefined);

    expect(folder?.styles['ml_auto']).toEqual([]);
    expect(actionRow?.styles['ml_auto']).toEqual([]);
  });

  test('a task keeps the trailing fields in place', () => {
    const element = paneHeader({
      program: null,
      name: 'Pi',
      role: 'lead',
      task: 'Build window shell',
      branch: 'me-1089-window-shell',
      folder: '~/code/koja',
      status: 'working',
      focused: false,
      zoomed: false,
      width: shellSize.wideSpecimenWidth,
    });

    const task = element.kids.find((kid) => drawnTexts(kid).includes('Build window shell'));
    const branch = element.kids.find((kid) => drawnTexts(kid).includes('me-1089-window-shell'));

    expect(task?.styles['flex_1']).toEqual([]);
    expect(branch?.styles['ml_auto']).toBeUndefined();
  });

  test('a task with no room is omitted and the badge stays whole', () => {
    const element = paneHeader({
      program: null,
      name: 'Pi',
      role: 'architect',
      task: 'Build window shell',
      folder: '~/code/koja',
      status: null,
      focused: false,
      zoomed: false,
      width: 159,
    });

    const badge = element.kids.find((kid) => drawnTexts(kid).includes('architect'));

    expect(drawnTexts(element)).not.toContain('Build window shell');
    expect(badge?.styles['flex_none']).toEqual([]);
  });

  test('a branch without a task end-aligns first', () => {
    const element = paneHeader({
      program: null,
      name: 'Pi',
      role: 'lead',
      branch: 'me-1089-window-shell',
      folder: '~/code/koja',
      status: null,
      focused: false,
      zoomed: false,
      width: shellSize.wideSpecimenWidth,
    });

    const branch = element.kids.find((kid) => drawnTexts(kid).includes('me-1089-window-shell'));
    const folder = element.kids.find((kid) => drawnTexts(kid).includes('~/code/koja'));

    expect(branch?.styles['ml_auto']).toEqual([]);
    expect(folder?.styles['ml_auto']).toBeUndefined();
  });

  test('a compact header without a task has no empty spacer and ends its action', () => {
    const element = paneHeader({
      program: null,
      name: 'Pi',
      role: 'architect',
      folder: '~/pi-fixture',
      status: null,
      focused: false,
      zoomed: false,
      width: 120,
    });

    const spacers = element.kids.filter(
      (kid) =>
        kid.styles['flex_1'] !== undefined && kid.texts.length === 0 && kid.kids.length === 0,
    );

    const actionRow = element.kids.find((kid) => kid.styles['ml_auto'] !== undefined);

    expect(spacers).toEqual([]);
    expect(actionRow?.styles['ml_auto']).toEqual([]);
  });
});

describe('paneHeader focus', () => {
  test('the focused header draws no fill', () => {
    const focused = paneHeader({
      program: null,
      name: 'Pi',
      folder: '~/code/koja',
      status: null,
      focused: true,
      zoomed: false,
      width: shellSize.wideSpecimenWidth,
    });

    expect(focused.styles['bg']).toBeUndefined();
  });
});

const statusHeader = (status: AttentionStatus | null): DrawnElement =>
  paneHeader({
    program: null,
    name: 'Pi',
    folder: '~/code/koja',
    status,
    focused: false,
    zoomed: false,
    width: shellSize.wideSpecimenWidth,
  });

const markCount = (element: DrawnElement, name: string): number =>
  drawnIcons(element).filter((icon) => icon === name).length;

const leadsWith = (element: DrawnElement, name: string): boolean =>
  elementWithIcon(element.kids[0] ?? drawn(), name) !== null;

describe('paneHeader attention mark', () => {
  test('blocked leads with the question bubble and draws no program icon', () => {
    const marked = statusHeader('blocked');

    expect(leadsWith(marked, 'message-circle-question.svg')).toBe(true);
    expect(markCount(marked, 'message-circle-question.svg')).toBe(1);
    expect(elementWithIcon(marked, 'message-circle-question.svg')?.textColors).toEqual(['#222222']);
    expect(drawnIcons(marked)).not.toContain('terminal.svg');
    expect(drawnTexts(marked)).not.toContain('Needs you');
  });

  test('done leads with the check and draws no program icon', () => {
    const marked = statusHeader('done');

    expect(leadsWith(marked, 'check.svg')).toBe(true);
    expect(markCount(marked, 'check.svg')).toBe(1);
    expect(elementWithIcon(marked, 'check.svg')?.textColors).toEqual(['#444444']);
    expect(drawnIcons(marked)).not.toContain('terminal.svg');
  });

  test('working leads with the spinner and draws no program icon', () => {
    const marked = statusHeader('working');

    expect(leadsWith(marked, 'loader-circle.svg')).toBe(true);
    expect(markCount(marked, 'loader-circle.svg')).toBe(1);
    expect(drawnIcons(marked)).not.toContain('terminal.svg');
  });

  test('crashed leads with the triangle alert and draws no program icon', () => {
    const marked = statusHeader('crashed');

    expect(leadsWith(marked, 'triangle-alert.svg')).toBe(true);
    expect(markCount(marked, 'triangle-alert.svg')).toBe(1);
    expect(elementWithIcon(marked, 'triangle-alert.svg')?.textColors).toEqual(['#222222']);
    expect(drawnIcons(marked)).not.toContain('terminal.svg');
  });

  test('idle and no status keep the program icon and draw no mark', () => {
    for (const status of ['idle', null] as const) {
      const quiet = statusHeader(status);
      const icons = drawnIcons(quiet);

      expect(icons[0]).toBe('terminal.svg');
      expect(icons).not.toContain('message-circle-question.svg');
      expect(icons).not.toContain('triangle-alert.svg');
      expect(icons).not.toContain('check.svg');
      expect(icons).not.toContain('loader-circle.svg');
    }
  });
});

describe('paneHeader leading slot width', () => {
  const folderAt = (width: number, status: AttentionStatus | null): string[] =>
    drawnTexts(
      paneHeader({
        program: null,
        name: 'Pi',
        role: 'lead',
        folder: '~/code/koja',
        status,
        focused: false,
        zoomed: false,
        width,
      }),
    );

  test('a mark charges its 12 px slot at 198 px, where the 14 px program icon drops the folder', () => {
    expect(folderAt(198, 'working')).toContain('~/code/koja');
    expect(folderAt(198, null)).not.toContain('~/code/koja');
  });
});
