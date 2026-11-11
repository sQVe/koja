import { afterAll, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../../tests/drawn.ts';
import { drawn, drawnTexts } from '../../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  kitIndexFake,
} from '../../../../tests/moduleFakes.ts';
import { controlSize, radius, shellSize, spacing } from '../../../kit/size.ts';

const attributes = new WeakMap<DrawnElement, Record<string, unknown[]>>();

const rendered = (): DrawnElement => {
  const element = drawn() as DrawnElement & Record<string, unknown>;
  const values: Record<string, unknown[]> = {};

  const handle: DrawnElement = new Proxy(element, {
    get: (target, key) => {
      if (typeof key !== 'string') {
        return undefined;
      }

      const value = target[key];

      if (typeof value !== 'function') {
        return value;
      }

      const method = value as (...argumentsList: unknown[]) => unknown;

      return (...argumentsList: unknown[]) => {
        values[key] = argumentsList;
        method(...argumentsList);

        return handle;
      };
    },
  });

  attributes.set(handle, values);

  return handle;
};

const attribute = (element: DrawnElement, name: string): unknown =>
  attributes.get(element)?.[name]?.[0];

const textNode = (text: string, role: string): DrawnElement => {
  const node = drawn(role);

  node.texts.push(text);

  return node;
};

await mock.module('gpui-base', () =>
  gpuiBaseFake({
    h_flex: rendered,
    v_flex: rendered,
    Scrollbar: { vertical: () => drawn() },
  }),
);

await mock.module('gpui-kit', () => gpuiKitFake({ div: () => drawn() }));
await mock.module('herdr', () => herdrFake());

await mock.module('../../../kit/index.ts', () =>
  kitIndexFake({
    controlSize,
    radius,
    shellSize,
    spacing,
    colors: () => ({
      foreground: 'foreground',
      dim: 'dim',
      background: 'background',
      selected: 'selected',
      accent: 'accent',
      chrome: 'chrome',
    }),
    icon: (name: string) => drawn(name),
    programIcon: () => drawn('program'),
    iconButton: () => drawn('button'),
    iconToggle: () => drawn('toggle'),
    modePill: (options: { label: string }) => textNode(options.label, 'mode'),
    paneHeader: (options: { name: string; focused: boolean }) =>
      textNode(options.name, options.focused ? 'focused-pane' : 'unfocused-pane'),
    roleText: (role: string, text: string) => textNode(text, role),
    tab: (options: { label: string; active: boolean }) =>
      textNode(options.label, options.active ? 'active-tab' : 'tab'),
  }),
);

const shellPath = './shell.ts';
const ticketPath = '../directions/ticket/scene.ts';
const viewsPath = '../directions/ticket/views.ts';
const tokensPath = '../directions/koja.ts';
const contentPath = './shellContent.ts';

const { shellTicketScene, shellScene, shellContentScene, shellDraftReviewScene } = (await import(
  shellPath
)) as {
  shellTicketScene: () => DrawnElement;
  shellScene: () => DrawnElement;
  shellContentScene: () => DrawnElement;
  shellDraftReviewScene: () => DrawnElement;
};

const { ticketPane } = (await import(ticketPath)) as {
  ticketPane: (state: string, tokens: unknown) => DrawnElement;
};

const { ticketView } = (await import(viewsPath)) as {
  ticketView: (state: string) => { item: { tab: string } };
};

const { koja } = (await import(tokensPath)) as {
  koja: {
    pane: { focusedBorder: string };
    areas: { frame: string; contentGap: number; contentPadding: number };
    tabs: { barHeight: number };
  };
};

const { agentPane } = (await import(contentPath)) as {
  agentPane: { name: string; lines: string[] };
};

const descendants = (node: DrawnElement): DrawnElement[] => [
  node,
  ...node.kids.flatMap(descendants),
];

const required = (
  nodes: DrawnElement[],
  predicate: (node: DrawnElement) => boolean,
): DrawnElement => {
  const node = nodes.find(predicate);

  if (node === undefined) {
    throw new Error('Missing rendered role');
  }

  return node;
};

const shellGeometry = (scene: DrawnElement): { tabBar: DrawnElement; body: DrawnElement } => {
  const main = scene.kids[0]?.kids[1] ?? drawn();

  const tabBar = required(main.kids, (node) =>
    node.kids.some((child) => child.path === 'tab' || child.path === 'active-tab'),
  );

  const body = main.kids[1] ?? drawn();

  return { tabBar, body };
};

afterAll(() => {
  mock.restore();
});

test('shell-ticket uses the judged tab height and pane spacing', () => {
  const { tabBar, body } = shellGeometry(shellTicketScene());

  expect(attribute(tabBar, 'h')).toBe(koja.tabs.barHeight);
  expect(attribute(body, 'gap')).toBe(koja.areas.contentGap);
  expect(attribute(body, 'p')).toBe(koja.areas.contentPadding);
});

test.each([
  { name: 'shell', render: shellScene },
  { name: 'shell-content', render: shellContentScene },
  { name: 'shell-draft-review', render: shellDraftReviewScene },
])('$name keeps the shared shell default tab height and pane spacing', ({ render }) => {
  const { tabBar, body } = shellGeometry(render());

  expect(attribute(tabBar, 'h')).toBe(controlSize.tabBar);
  expect(attribute(body, 'gap')).toBe(spacing.small);
  expect(attribute(body, 'p')).toBe(spacing.small);
});

test('shell-ticket holds an unfocused agent beside the focused container pane in Insert mode', () => {
  const scene = shellTicketScene();
  const nodes = descendants(scene);

  const agent = required(nodes, (node) =>
    node.kids.some((child) => child.path === 'unfocused-pane'),
  );

  const body = required(nodes, (node) => node.kids.includes(agent));
  const ticket = body.kids[1] ?? drawn();
  const activeTabs = nodes.filter((node) => node.path === 'active-tab');

  expect(body.kids).toHaveLength(2);
  expect(body.backgroundColors).toEqual([koja.areas.frame]);
  expect(body.kids[0]).toBe(agent);
  expect(drawnTexts(agent)).toEqual([agentPane.name, ...agentPane.lines]);
  expect(drawnTexts(ticket)).toEqual(drawnTexts(ticketPane('container', koja)));

  expect(
    descendants(ticket).some((node) => node.borderColors.includes(koja.pane.focusedBorder)),
  ).toBe(true);

  expect(activeTabs.map((node) => node.texts)).toEqual([[ticketView('container').item.tab]]);
  expect(required(nodes, (node) => node.path === 'mode').texts).toEqual(['Insert']);
});
