import { afterAll, describe, expect, mock, test } from 'bun:test';

import type { DrawnElement } from '../../../../../tests/drawn.ts';
import {
  drawn,
  drawnIcons,
  drawnTexts,
  drawnTooltips,
  spinning,
} from '../../../../../tests/drawn.ts';
import {
  gpuiBaseFake,
  gpuiKitFake,
  herdrFake,
  kitIndexFake,
} from '../../../../../tests/moduleFakes.ts';
import { overlaySize, spacing } from '../../../../kit/size.ts';
import type { SceneName } from '../../catalog.ts';
import { findScene } from '../../catalog.ts';

type TicketState =
  Extract<SceneName, `ticket-view-${string}`> extends `ticket-view-${infer State}` ? State : never;

type FixtureFact =
  | { name: 'Project'; value: string }
  | {
      name: 'Parent' | 'Related';
      value: string;
      target: 'Linear' | 'tikk' | 'GitHub';
      title: string | null;
    };

type Attributes = Record<string, unknown[]>;
type DrawingMethod = (...values: unknown[]) => unknown;

type FixtureSlice = { identifier: string; title: string } & (
  | { readiness: 'PR open' | 'PR draft'; pull: string; agent: string | null; detail: string }
  | { readiness: 'merged' | 'ready' }
  | { readiness: 'blocked'; blockedBy: string }
);

interface Fixture {
  item: {
    identifier: string;
    source: string;
    title: string | null;
    description: string[];
    state: string | null;
    readAge: string | null;
    facts: FixtureFact[];
  };
  slices: FixtureSlice[];
  agents: Record<string, { identifier: string; title: string; state: string }[]>;
  criteria: { title: string; state: 'done' | 'in progress' | 'todo' }[];
}

interface Tokens {
  text: { body: { size: number }; detail: { size: number } };
  ink: { text: string; dim: string; muted: string };
  marks: { done: string; working: string; idle: string; blocked: string };
  rows: { height: number; inset: number; paddingX: number; selectedFill: string };
  pane: { focusedBorder: string; focusedHeaderFill: string; headerDivider: string };
}

const attributes = new WeakMap<DrawnElement, Attributes>();

const rendered = (path: string | null = null, layout = 'element'): DrawnElement => {
  const element = drawn(path) as DrawnElement & Record<string, unknown>;
  const values: Attributes = { layout: [layout] };

  const handle: DrawnElement = new Proxy(element, {
    get: (target, key) => {
      if (typeof key !== 'string') {
        return undefined;
      }

      const value = target[key];

      if (typeof value !== 'function') {
        return value;
      }

      const method = value as DrawingMethod;

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

const hasStyle = (element: DrawnElement, name: string): boolean =>
  name in (attributes.get(element) ?? {});

await mock.module('gpui-base', () =>
  gpuiBaseFake({
    h_flex: () => rendered(null, 'row'),
    v_flex: () => rendered(null, 'column'),
    Scrollbar: { vertical: () => rendered('scrollbar') },
  }),
);

await mock.module('gpui-kit', () => gpuiKitFake({ div: () => rendered() }));
await mock.module('herdr', () => herdrFake());

await mock.module('../../../../kit/index.ts', () =>
  kitIndexFake({
    icon: (name: string) => rendered(name),
    stateLine: (options: { kind: string; text: string }) => {
      const line = rendered(options.kind);

      line.texts.push(options.text);

      return line;
    },
  }),
);

const scenePath = './scene.ts';
const tokensPath = '../koja.ts';
const viewsPath = './views.ts';

const { ticketScene } = (await import(scenePath)) as {
  ticketScene: (state: TicketState) => DrawnElement;
};

const { koja, kojaNormal } = (await import(tokensPath)) as { koja: Tokens; kojaNormal: Tokens };
const { ticketView } = (await import(viewsPath)) as { ticketView: (state: TicketState) => Fixture };
const partsPath = './parts.ts';
const factsPath = './facts.ts';

const { acceptanceSection } = (await import(partsPath)) as {
  acceptanceSection: (items: Fixture['criteria'], tokens: Tokens) => DrawnElement;
};

const { ticketFacts } = (await import(factsPath)) as {
  ticketFacts: (facts: FixtureFact[], tokens: Tokens) => DrawnElement;
};

const descendants = (element: DrawnElement): DrawnElement[] => [
  element,
  ...element.kids.flatMap(descendants),
];

const required = (
  elements: DrawnElement[],
  predicate: (element: DrawnElement) => boolean,
): DrawnElement => {
  const found = elements.findLast(predicate);

  if (found === undefined) {
    throw new Error('Expected rendered element is missing');
  }

  return found;
};

const paneOf = (state: TicketState): DrawnElement =>
  required(descendants(ticketScene(state)), (part) =>
    part.kids.some((child) => child.kids.some((label) => label.texts.includes('Ticket'))),
  );

const section = (pane: DrawnElement, name: string): DrawnElement =>
  required(
    descendants(pane),
    (part) =>
      attribute(part, 'layout') === 'column' &&
      part.kids.length > 1 &&
      drawnTexts(part.kids[0] ?? drawn()).includes(name),
  );

const heading = (pane: DrawnElement, name: string): DrawnElement =>
  required(descendants(pane), (part) => part.kids.some((child) => child.texts.includes(name)));

const rowFor = (root: DrawnElement, identifier: string): DrawnElement =>
  required(
    descendants(root),
    (part) => attribute(part, 'h') === koja.rows.height && drawnTexts(part).includes(identifier),
  );

const textElement = (root: DrawnElement, text: string): DrawnElement =>
  required(descendants(root), (part) => part.texts.includes(text));

const identifierCellOf = (root: DrawnElement, identifier: string): DrawnElement => {
  const text = textElement(root, identifier);

  return required(descendants(root), (part) => part.kids.includes(text));
};

// The fixed capture's pane is 690px tall; row positions come from its rendered children.
const fixedPaneHeight = 690;
const defaultLineHeight = (1 + Math.sqrt(5)) / 2;

const verticalEdge = (part: DrawnElement, kind: 'p' | 'm', edge: 't' | 'b'): number =>
  Number(
    attribute(part, `${kind}${edge}`) ?? attribute(part, `${kind}y`) ?? attribute(part, kind) ?? 0,
  );

const flowChildren = (part: DrawnElement): DrawnElement[] =>
  part.kids.filter((child) => !hasStyle(child, 'absolute'));

// The narrow fold fixtures use single-line text. Native captures also check font metrics.
const measuredHeight = (part: DrawnElement): number => {
  const fixed = attribute(part, 'h') ?? attribute(part, 'size');

  if (typeof fixed === 'number') {
    return fixed;
  }

  const children = flowChildren(part);

  const heights = children.map(
    (child) =>
      measuredHeight(child) + verticalEdge(child, 'm', 't') + verticalEdge(child, 'm', 'b'),
  );

  const gap = Number(attribute(part, 'gap_y') ?? attribute(part, 'gap') ?? 0);

  const stacked =
    heights.reduce((sum, height) => sum + height, 0) + Math.max(0, heights.length - 1) * gap;

  const childHeight = attribute(part, 'layout') === 'row' ? Math.max(0, ...heights) : stacked;
  const fontSize = Number(attribute(part, 'text_size') ?? koja.text.body.size);
  const specifiedHeight = attribute(part, 'line_height');

  const lineHeight =
    typeof specifiedHeight === 'string'
      ? Number.parseFloat(specifiedHeight)
      : Number(specifiedHeight ?? Math.ceil(fontSize * defaultLineHeight));

  const textHeight = part.texts.length === 0 ? 0 : lineHeight;
  const padding = verticalEdge(part, 'p', 't') + verticalEdge(part, 'p', 'b');
  const border = Number(attribute(part, 'border') ?? 0) * 2;

  return Math.max(
    Number(attribute(part, 'min_h') ?? 0),
    Math.max(textHeight, childHeight) + padding + border,
  );
};

const flowPositions = (root: DrawnElement): Map<DrawnElement, number> => {
  const positions = new Map<DrawnElement, number>();

  const visit = (part: DrawnElement, top: number): void => {
    positions.set(part, top);

    let cursor = top + verticalEdge(part, 'p', 't') + Number(attribute(part, 'border') ?? 0);
    const gap = Number(attribute(part, 'gap_y') ?? attribute(part, 'gap') ?? 0);

    for (const child of flowChildren(part)) {
      visit(child, cursor + verticalEdge(child, 'm', 't'));

      if (attribute(part, 'layout') !== 'row') {
        cursor +=
          measuredHeight(child) +
          verticalEdge(child, 'm', 't') +
          verticalEdge(child, 'm', 'b') +
          gap;
      }
    }
  };

  visit(root, 0);

  return positions;
};

const intrinsicWidth = (part: DrawnElement): number => {
  const width = attribute(part, 'w');

  if (typeof width === 'number') {
    return width;
  }

  const textWidth =
    (part.texts.join('').length * Number(attribute(part, 'text_size') ?? koja.text.detail.size)) /
    2;

  const childrenWidth = part.kids.reduce((sum, child) => sum + intrinsicWidth(child), 0);
  const gaps = Math.max(0, part.kids.length - 1) * Number(attribute(part, 'gap') ?? 0);

  return textWidth + childrenWidth + gaps + Number(attribute(part, 'px') ?? 0) * 2;
};

const allocatedWidths = (row: DrawnElement, width: number): number[] => {
  const flexible = row.kids.filter((part) => hasStyle(part, 'flex_1'));
  const fixed = row.kids.filter((part) => !hasStyle(part, 'flex_1'));
  const reserved = fixed.reduce((sum, part) => sum + intrinsicWidth(part), 0);
  const gaps = Math.max(0, row.kids.length - 1) * Number(attribute(row, 'gap') ?? 0);
  const remaining = width - Number(attribute(row, 'px') ?? 0) * 2 - gaps - reserved;

  return row.kids.map((part) =>
    hasStyle(part, 'flex_1') ? remaining / flexible.length : intrinsicWidth(part),
  );
};

const firstColumnInsetOf = (row: DrawnElement): number =>
  Number(attribute(row, 'mx')) +
  Number(attribute(row, 'px')) +
  Number(attribute(row.kids[0] ?? drawn(), 'w')) +
  Number(attribute(row, 'gap'));

const identifierInsetOf = (row: DrawnElement, identifier: string): number => {
  const cell = identifierCellOf(row, identifier);
  const columns = required(descendants(row), (part) => part.kids.includes(cell));

  return firstColumnInsetOf(row) + Number(attribute(columns, 'pl'));
};

const links = (root: DrawnElement): DrawnElement[] =>
  descendants(root).filter((part) => hasStyle(part, 'underline'));

const targets = (root: DrawnElement): string[] =>
  links(root).flatMap((part) => part.texts.map((text) => text.split(' · ')[0] ?? text));

const itemHeader = (pane: DrawnElement, fixture: Fixture): DrawnElement =>
  required(
    descendants(pane),
    (part) =>
      attribute(part, 'layout') === 'column' &&
      targets(part.kids[0] ?? drawn()).includes(fixture.item.identifier),
  );

const stateChip = (pane: DrawnElement, fixture: Fixture): DrawnElement =>
  required(
    descendants(itemHeader(pane, fixture)),
    (part) => hasStyle(part, 'border') && drawnTexts(part).includes(fixture.item.state ?? ''),
  );

const textActions = (pane: DrawnElement): DrawnElement[] =>
  descendants(pane).filter((part) => {
    const surface = hasStyle(part, 'border') || hasStyle(part, 'bg');
    const interactive = hasStyle(part, 'cursor_pointer') || part.clickHandlers.length > 0;
    const actionable = surface || interactive;
    const leaf = part.kids.length === 0 && part.texts.length === 1;
    const wrapped = part.kids.length === 1 && drawnTexts(part.kids[0] ?? drawn()).length === 1;
    const textOnly = leaf || wrapped;
    const plainAction = textOnly && !hasStyle(part, 'underline') && drawnIcons(part).length === 0;

    return actionable && plainAction;
  });

const permittedTargets = (fixture: Fixture): string[] => {
  const destinations = [fixture.item.identifier, ...fixture.item.facts.map((fact) => fact.value)];

  for (const slice of fixture.slices) {
    destinations.push(slice.identifier);

    if ('blockedBy' in slice) {
      destinations.push(slice.blockedBy);
    }

    if ('pull' in slice) {
      destinations.push(`koja ${slice.pull}`);

      if (slice.agent !== null) {
        destinations.push(slice.agent);
      }
    }
  }

  for (const agents of Object.values(fixture.agents)) {
    destinations.push(...agents.map((agent) => agent.identifier));
  }

  return destinations;
};

const track = (root: DrawnElement): DrawnElement =>
  required(
    descendants(root),
    (part) =>
      part.kids.length >= 7 && part.kids.every((child) => child.backgroundColors.length === 1),
  );

const trackParent = (root: DrawnElement): DrawnElement => {
  const segments = track(root);

  return required(descendants(root), (part) => part.kids.includes(segments));
};

const countGroups = (root: DrawnElement): DrawnElement[] => {
  const parent = trackParent(root);
  const counts = parent.kids.at(-1);

  if (counts === undefined) {
    throw new Error('Missing track counts');
  }

  return counts.kids.filter((part) => part.kids.length > 0);
};

const numbers = (root: DrawnElement): number[] =>
  drawnTexts(root).flatMap((text) => [...text.matchAll(/\d+/g)].map((match) => Number(match[0])));

const summaryIdentifiers = (state: TicketState): string[] => {
  const fixture = ticketView(state);

  if (['loading', 'unreachable', 'done', 'plain'].includes(state)) {
    return [];
  }

  if (state === 'single') {
    const agents = fixture.agents[fixture.item.identifier] ?? [];

    return agents.filter((agent) => agent.state === 'in progress').map((agent) => agent.identifier);
  }

  const identifiers = fixture.slices
    .filter((slice) => slice.readiness === 'PR open' || slice.readiness === 'PR draft')
    .map((slice) => slice.identifier);

  const next =
    fixture.slices.find((slice) => slice.readiness === 'ready') ??
    fixture.slices.find((slice) => slice.readiness === 'blocked');

  if (next !== undefined) {
    identifiers.push(next.identifier);
  }

  return identifiers;
};

const parentName = 'Parent plan';

const states = [
  'container',
  'single',
  'loading',
  'unreachable',
  'sync-failed',
  'nothing-ready',
  'done',
  'plain',
  'tikk',
  'long',
  'normal',
  'wide',
] satisfies TicketState[];

afterAll(() => {
  mock.restore();
});

describe('ticket role contracts', () => {
  test('earlier ticket scene identifiers are rejected', () => {
    for (const take of ['document', 'plan', 'board', 'tree', 'refined', 'focus', 'nested']) {
      for (const kind of ['container', 'single']) {
        expect(findScene(`ticket-${take}-${kind}`)).toHaveProperty('error');
      }
    }
  });

  test.each(states)('%s exposes a text recovery action only for a failed read', (state) => {
    const pane = paneOf(state);
    const failed = state === 'unreachable' || state === 'sync-failed';
    const actions = textActions(pane);

    expect(actions).toHaveLength(failed ? 1 : 0);
    const destinations = permittedTargets(ticketView(state));

    expect(targets(pane).every((target) => destinations.includes(target))).toBe(true);

    for (const action of actions) {
      const failure = required(descendants(pane), (part) => part.kids.includes(action));

      expect(drawnIcons(failure)).toContain('circle-alert');
      expect(links(action)).toHaveLength(0);
    }
  });

  test.each(states.filter((state) => ticketView(state).item.state !== null))(
    '%s keeps tracker state in the item chip and source in the identity',
    (state) => {
      const pane = paneOf(state);
      const fixture = ticketView(state);
      const chip = stateChip(pane, fixture);
      const identity = itemHeader(pane, fixture).kids[0] ?? drawn();

      expect(drawnTexts(chip)).toEqual([fixture.item.state ?? '']);
      expect(drawnTexts(pane).filter((text) => text === fixture.item.state)).toHaveLength(1);
      expect(targets(identity)).toEqual([fixture.item.identifier]);
      expect(drawnTexts(identity).some((text) => text.includes(fixture.item.source))).toBe(true);
    },
  );

  test.each([
    'container',
    'single',
    'sync-failed',
    'tikk',
    'long',
    'normal',
    'wide',
  ] satisfies TicketState[])('%s puts each PR state once in the summary status role', (state) => {
    const pane = paneOf(state);
    const fixture = ticketView(state);
    const now = section(pane, 'Now');
    const planName = state === 'single' ? parentName : 'Whole plan';
    const plan = section(pane, planName);
    const active = fixture.slices.filter((slice) => 'pull' in slice);
    const tokens = state === 'normal' ? kojaNormal : koja;

    expect(active).toHaveLength(2);

    for (const slice of active) {
      const planStatus = rowFor(plan, slice.identifier).kids.at(-1) ?? drawn();
      const summarized = state !== 'single' || slice.identifier === fixture.item.identifier;
      const summaryCount = summarized ? 1 : 0;

      expect(planStatus.texts).toEqual([slice.readiness]);
      expect(planStatus.textColors).toEqual([tokens.ink.dim]);

      expect(drawnTexts(now).filter((text) => text === slice.readiness)).toHaveLength(summaryCount);

      if (summarized) {
        const summaryStatus = textElement(now, slice.readiness);

        expect(summaryStatus.textColors).toEqual([tokens.ink.dim]);
        expect(hasStyle(summaryStatus, 'text_right')).toBe(state !== 'wide');

        const pull = required(links(now), (part) =>
          part.texts.some((text) => text.includes(slice.pull)),
        );

        expect(pull.textColors).toEqual([tokens.ink.dim]);
        expect(attribute(pull, 'text_size')).toBe(tokens.text.body.size);
        expect(hasStyle(pull, 'underline')).toBe(true);

        const item =
          state === 'single'
            ? now
            : required(
                descendants(now),
                (part) =>
                  attribute(part, 'layout') === 'column' &&
                  drawnTexts(part.kids[0] ?? drawn()).includes(slice.title),
              );

        let detail = item.kids.at(-1);

        if (state === 'single') {
          detail = item.kids[2];
        }

        if (state === 'wide') {
          detail = item.kids[1];
        }

        const detailText = drawnTexts(detail ?? drawn())[0] ?? '';

        if (state === 'wide') {
          const facts = drawnTexts(detail ?? drawn()).filter((text) => text.trim() !== '·');

          expect(facts).toEqual([slice.identifier, ...slice.detail.split(' · ')]);
        } else {
          expect(detailText).toBe(slice.detail);
        }
      }
    }
  });

  test.each(states.filter((state) => ticketView(state).item.readAge !== null))(
    '%s attributes header freshness only to successful source reads',
    (state) => {
      const pane = paneOf(state);
      const fixture = ticketView(state);
      const chip = stateChip(pane, fixture);

      const stateRow = required(descendants(itemHeader(pane, fixture)), (part) =>
        part.kids.includes(chip),
      );

      const age = stateRow.kids[1] ?? drawn();
      const tokens = state === 'normal' ? kojaNormal : koja;

      expect(stateRow.kids).toHaveLength(2);
      expect(age.texts).toHaveLength(1);
      expect(age.texts[0]?.indexOf(fixture.item.source)).toBe(0);

      const githubScenes: TicketState[] = [
        'container',
        'single',
        'nothing-ready',
        'done',
        'tikk',
        'long',
        'normal',
        'wide',
      ];

      expect(age.texts[0]?.includes('GitHub')).toBe(githubScenes.includes(state));
      expect(age.texts[0]).toContain(fixture.item.readAge ?? '');
      expect(age.textColors).toEqual([tokens.ink.dim]);
      expect(attribute(age, 'text_size')).toBe(tokens.text.detail.size);
    },
  );

  test('sync failure keeps the ticket read age separate from the PR failure banner', () => {
    const pane = paneOf('sync-failed');
    const fixture = ticketView('sync-failed');
    const chip = stateChip(pane, fixture);

    const stateRow = required(descendants(itemHeader(pane, fixture)), (part) =>
      part.kids.includes(chip),
    );

    const age = stateRow.kids[1] ?? drawn();

    expect(stateRow.kids).toHaveLength(2);
    expect(fixture.item.readAge).toBe(ticketView('container').item.readAge);
    expect(fixture.item.readAge).not.toBeNull();
    expect(age.texts[0]).toContain(fixture.item.readAge ?? '');
    expect(age.textColors).toEqual([koja.ink.dim]);
  });

  test.each(['loading', 'unreachable'] satisfies TicketState[])(
    '%s has an identity-only item header without title facts or age',
    (state) => {
      const pane = paneOf(state);
      const fixture = ticketView(state);
      const header = itemHeader(pane, fixture);

      expect(header.kids).toHaveLength(1);
      expect(drawnTexts(header)).toHaveLength(1);
      expect(drawnIcons(header)).toHaveLength(0);
      expect(targets(header)).toEqual([fixture.item.identifier]);
      expect(descendants(header).filter((part) => hasStyle(part, 'border'))).toHaveLength(0);
    },
  );

  test.each([
    ['tikk', 'done'],
    ['plain', 'idle'],
  ] satisfies [TicketState, keyof Tokens['marks']][])(
    '%s uses the %s tone for its chip dot',
    (state, tone) => {
      const chip = stateChip(paneOf(state), ticketView(state));
      const mark = chip.kids[0] ?? drawn();

      expect(chip.kids).toHaveLength(2);
      expect(mark.backgroundColors).toEqual([koja.marks[tone]]);
      expect(Number(attribute(mark, 'size'))).toBeGreaterThan(0);
      expect(hasStyle(mark, 'rounded')).toBe(true);
      expect(drawnIcons(mark)).toHaveLength(0);
    },
  );

  test('done places its completion mark inside the item state chip', () => {
    const pane = paneOf('done');
    const chip = stateChip(pane, ticketView('done'));

    expect(drawnIcons(chip)).toEqual(['check']);
    expect(chip.kids).toHaveLength(2);
    expect(drawnIcons(chip.kids[0] ?? drawn())).toEqual(['check']);
  });

  test('wide orders facts before Now and Next in the rail', () => {
    const pane = paneOf('wide');
    const now = section(pane, 'Now');
    const next = section(pane, 'Next');

    const rail = required(
      descendants(pane),
      (part) => part.kids.includes(now) && part.kids.includes(next),
    );

    const factNames = ticketView('wide').item.facts.map((fact) => fact.name);

    const facts = required(rail.kids, (part) =>
      factNames.every((name) => drawnTexts(part).includes(name)),
    );

    expect(factNames.length).toBeGreaterThan(0);
    expect(rail.kids.indexOf(facts)).toBeLessThan(rail.kids.indexOf(now));
    expect(rail.kids.indexOf(now)).toBeLessThan(rail.kids.indexOf(next));
  });

  test.each(['container', 'tikk', 'single'] satisfies TicketState[])(
    '%s qualifies every linked plan identifier with its source in the tooltip',
    (state) => {
      const pane = paneOf(state);
      const fixture = ticketView(state);
      const name = state === 'single' ? parentName : 'Whole plan';
      const planLinks = links(section(pane, name));

      expect(planLinks.length).toBeGreaterThan(0);

      for (const link of planLinks) {
        const identifier = link.texts[0] ?? '';

        expect(identifier.length).toBeGreaterThan(0);
        expect(link.tooltipText).toContain(identifier);
        expect(link.tooltipText).toContain(fixture.item.source);
      }
    },
  );

  test('tikk keeps the source run in its own tracker role', () => {
    const pane = paneOf('tikk');
    const fixture = ticketView('tikk');
    const otherSource = ticketView('container').item.source;
    const source = heading(pane, 'Whole plan').kids.at(-1) ?? drawn();

    expect(source.texts.some((text) => text.includes(fixture.item.source))).toBe(true);
    expect(source.textColors).toEqual([koja.ink.dim]);
    expect(drawnTexts(pane).some((text) => text.includes(otherSource))).toBe(false);
  });

  test('plain keeps a populated Description before Acceptance', () => {
    const pane = paneOf('plain');
    const description = section(pane, 'Description');
    const texts = drawnTexts(pane);

    expect(description.kids.length).toBeGreaterThan(1);
    expect(drawnTexts(description.kids[1] ?? drawn()).length).toBeGreaterThan(0);
    expect(texts.indexOf('Description')).toBeLessThan(texts.indexOf('Acceptance'));
  });
});

describe('ticket scene structure', () => {
  test.each(states.filter((state) => ticketView(state).item.readAge !== null))(
    '%s gives section labels row-sized strong semibold text',
    (state) => {
      const pane = paneOf(state);
      const tokens = state === 'normal' ? kojaNormal : koja;

      const names = [
        'Now',
        'Next',
        'Whole plan',
        'Acceptance',
        parentName,
        'Relations',
        'Description',
        'Activity',
      ];

      if (state === 'done') {
        names.push('merged');
      }

      const present = names.filter((name) => drawnTexts(pane).includes(name));

      expect(present.length).toBeGreaterThan(0);

      for (const name of present) {
        const title = heading(pane, name);
        const label = title.kids[0] ?? drawn();
        const row = required(descendants(pane), (part) => part.kids.includes(title));

        expect(attribute(row, 'h')).toBe(tokens.rows.height);
        expect(attribute(label, 'text_size')).toBe(tokens.text.body.size);
        expect(label.textColors).toEqual([tokens.ink.text]);
        expect(hasStyle(label, 'font_semibold')).toBe(true);

        for (const detail of title.kids.slice(1)) {
          expect(detail.textColors).toEqual([tokens.ink.dim]);
          expect(attribute(detail, 'text_size')).toBe(tokens.text.detail.size);
        }
      }
    },
  );

  test.each(states)('%s acceptance states appear only as marks', (state) => {
    const fixture = ticketView(state);
    const tokens = state === 'normal' ? kojaNormal : koja;
    const acceptance = acceptanceSection(fixture.criteria, tokens);
    const rows = acceptance.kids.slice(1);
    const done = fixture.criteria.filter((item) => item.state === 'done').length;

    expect(rows).toHaveLength(fixture.criteria.length);
    expect(numbers(acceptance.kids[0] ?? drawn())).toEqual([done, fixture.criteria.length]);

    for (const row of rows) {
      const criterion = fixture.criteria.find((item) => drawnTexts(row).includes(item.title));

      if (criterion === undefined) {
        throw new Error('Acceptance row has no fixture');
      }

      const mark = row.kids[0] ?? drawn();

      const tones = {
        done: tokens.marks.done,
        todo: tokens.marks.idle,
        'in progress': tokens.marks.working,
      };

      const tone = tones[criterion.state];

      const colors = descendants(mark).flatMap((part) =>
        part.textColors.concat(part.backgroundColors),
      );

      expect(drawnTexts(row)).toEqual([criterion.title]);
      expect(colors).toContain(tone);

      if (criterion.state === 'done') {
        expect(drawnIcons(mark)).toContain('check');
      }

      expect(descendants(row).some((part) => hasStyle(part, 'text_right'))).toBe(false);
    }

    if (state !== 'loading' && state !== 'unreachable') {
      expect(numbers(heading(paneOf(state), 'Acceptance'))).toEqual([
        done,
        fixture.criteria.length,
      ]);
    }
  });

  test.each(states.filter((state) => !['loading', 'unreachable', 'plain'].includes(state)))(
    '%s ticket facts carry a normal-ink title before their link without wrapping',
    (state) => {
      const pane = paneOf(state);
      const facts = ticketView(state).item.facts.filter((fact) => fact.name !== 'Project');

      for (const fact of facts) {
        const pair = required(descendants(pane), (part) =>
          part.kids.some((child) => child.texts.includes(fact.name)),
        );

        const title = textElement(pair, fact.title ?? '');
        const owner = required(descendants(pane), (part) => part.kids.includes(pair));

        expect(hasStyle(owner, 'flex_wrap')).toBe(false);
        const texts = drawnTexts(pair);
        const linkIndex = texts.findIndex((text) => text.startsWith(fact.value));

        expect(fact.title).toBeDefined();
        expect(linkIndex).toBeGreaterThanOrEqual(0);
        expect(texts.indexOf(fact.title ?? '')).toBeLessThan(linkIndex);
        expect(title.textColors).toEqual([koja.ink.text]);
        expect(drawnTooltips(title)).toContain(fact.title ?? '');
        expect(hasStyle(title, 'truncate')).toBe(true);
        expect(hasStyle(title, 'underline')).toBe(false);

        expect(
          descendants(pair).some(
            (part) => hasStyle(part, 'flex_wrap') || hasStyle(part, 'whitespace_normal'),
          ),
        ).toBe(false);
      }
    },
  );

  test.each(['single', 'container', 'tikk', 'normal'] satisfies TicketState[])(
    '%s inline fact titles precede whole links with only a normal gap',
    (state) => {
      const pane = paneOf(state);
      const tokens = state === 'normal' ? kojaNormal : koja;

      for (const fact of ticketView(state).item.facts) {
        if (fact.name === 'Project' || fact.title === null) {
          continue;
        }

        const pair = required(descendants(pane), (part) =>
          part.kids.some((child) => child.texts.includes(fact.name)),
        );

        const title = textElement(pair, fact.title);
        const line = required(descendants(pair), (part) => part.kids.includes(title));
        const link = line.kids.at(-1) ?? drawn();

        expect(line.kids).toHaveLength(2);
        expect(line.kids[0]).toBe(title);
        expect(drawnTexts(line)).not.toContain(' · ');
        expect(Number(attribute(line, 'gap'))).toBeGreaterThan(0);
        expect(attribute(title, 'flex_shrink')).toBe(1);
        expect(hasStyle(title, 'flex_1')).toBe(false);
        expect(hasStyle(link, 'flex_none')).toBe(true);
        expect(targets(link)).toEqual([fact.value]);
        expect(title.textColors).toEqual([tokens.ink.text]);
      }
    },
  );

  test('wide fact titles have more than a first-word slot above their links', () => {
    const pane = paneOf('wide');
    const rail = required(descendants(pane), (part) => hasStyle(part, 'border_l'));
    const facts = ticketView('wide').item.facts;

    for (const fact of facts) {
      if (fact.name === 'Project' || fact.title === null) {
        continue;
      }

      const pair = required(descendants(rail), (part) =>
        part.kids.some((child) => child.texts.includes(fact.name)),
      );

      const group = required(descendants(rail), (part) => part.kids.includes(pair));
      const title = textElement(pair, fact.title);
      const value = required(descendants(pair), (part) => part.kids.includes(title));

      const valueWidth =
        Number(attribute(rail, 'w')) -
        Number(attribute(rail, 'border_l')) -
        Number(attribute(group, 'mx')) * 2 -
        Number(attribute(pair.kids[0] ?? drawn(), 'w')) -
        Number(attribute(pair, 'gap'));

      const firstWord = fact.title.split(' ')[0] ?? '';
      const minimumTitleWidth = (firstWord.length + 2) * Number(attribute(title, 'text_size'));

      expect(attribute(value, 'layout')).toBe('column');
      expect(valueWidth).toBeGreaterThan(minimumTitleWidth);
      expect(drawnTexts(value).some((text) => text.startsWith(fact.value))).toBe(true);
      expect(drawnTexts(value)).not.toContain(' · ');
      expect(value.kids[0]).toBe(title);
      expect(title.textColors).toEqual([koja.ink.text]);
    }
  });

  test.each([280, 320])(
    'header facts reserve Project width and give the reference the remaining %ipx row',
    (width) => {
      const fixture = ticketView('single');
      const facts = ticketFacts(fixture.item.facts, koja);
      const project = facts.kids[0] ?? drawn();
      const reference = facts.kids[1] ?? drawn();

      const available =
        width - Number(attribute(facts, 'px')) * 2 - Number(attribute(facts, 'gap'));

      const projectWidth = intrinsicWidth(project);
      const allocated = allocatedWidths(facts, width);

      expect(allocated[0]).toBe(projectWidth);
      expect(allocated[1]).toBe(available - projectWidth);
      expect(allocated[1]).toBeLessThan(intrinsicWidth(reference));
      expect(attribute(reference, 'min_w')).toBe(0);
      expect(allocated.reduce((sum, value) => sum + value, 0)).toBe(available);
    },
  );

  test.each(['single', 'container', 'tikk'] satisfies TicketState[])(
    '%s constrained header titles retain a readable prefix and leave the link whole',
    (state) => {
      const fixture = ticketView(state);
      const reference = fixture.item.facts.find((fact) => fact.name !== 'Project');

      if (reference === undefined) {
        throw new Error('Missing reference fixture');
      }

      if (reference.title === null) {
        throw new Error('Missing reference title');
      }

      const longTitle = Array.from({ length: 8 }, () => reference.title).join(' ');

      const facts = ticketFacts(
        fixture.item.facts.map((fact) =>
          fact === reference ? { ...reference, title: longTitle } : fact,
        ),
        koja,
      );

      const referenceIndex = fixture.item.facts.indexOf(reference);
      const pair = facts.kids[referenceIndex] ?? drawn();
      const title = textElement(pair, longTitle);
      const value = required(descendants(pair), (part) => part.kids.includes(title));
      const link = value.kids.at(-1) ?? drawn();
      const pairWidth = allocatedWidths(facts, 460)[referenceIndex] ?? 0;
      const labelWidth = intrinsicWidth(pair.kids[0] ?? drawn());
      const valueWidth = pairWidth - labelWidth - Number(attribute(pair, 'gap'));
      const titleWidth = valueWidth - intrinsicWidth(link) - Number(attribute(value, 'gap'));
      const firstWord = longTitle.split(' ')[0] ?? '';
      const prefixAndEllipsisWidth = (firstWord.length + 3) * koja.text.detail.size;

      expect(titleWidth).toBeGreaterThan(prefixAndEllipsisWidth);
      expect(titleWidth).toBeLessThan(intrinsicWidth(title));
      expect(hasStyle(title, 'truncate')).toBe(true);
      expect(attribute(title, 'flex_shrink')).toBe(1);
      expect(drawnTooltips(title)).toContain(longTitle);
      expect(hasStyle(link, 'flex_none')).toBe(true);
      expect(targets(link)).toEqual([reference.value]);
      expect(drawnTexts(link).some((text) => text.endsWith(reference.target))).toBe(true);
    },
  );

  test.each(['container', 'single', 'nothing-ready', 'tikk', 'wide'] satisfies TicketState[])(
    '%s plan and summary ID columns stay before their titles',
    (state) => {
      const fixture = ticketView(state);
      const items = [...fixture.slices, ...Object.values(fixture.agents).flat()];

      const rows = descendants(paneOf(state)).filter(
        (part) => attribute(part, 'h') === koja.rows.height,
      );

      let matched = 0;

      for (const row of rows) {
        const texts = drawnTexts(row);

        for (const item of items) {
          const identifierIndex = texts.findIndex((text) => text.startsWith(item.identifier));
          const titleIndex = texts.indexOf(item.title);

          if (identifierIndex === -1 || titleIndex === -1) {
            continue;
          }

          expect(identifierIndex).toBeLessThan(titleIndex);
          matched += 1;
        }
      }

      expect(matched).toBeGreaterThan(0);
    },
  );

  test('a ticket fact without a known title keeps its link without an empty title', () => {
    const fixture = ticketView('single');
    const fact = fixture.item.facts.find((item) => item.name === 'Parent');

    if (fact?.name !== 'Parent') {
      throw new Error('Missing parent fixture');
    }

    const known = ticketFacts([fact], koja);
    const unknown = ticketFacts([{ ...fact, title: null }], koja);

    expect(drawnTexts(unknown)).toEqual(
      drawnTexts(known).filter((text) => text !== fact.title && text.trim() !== '·'),
    );

    expect(drawnTooltips(unknown)).not.toContain(fact.title ?? '');
    expect(fact.title).toBe(ticketView('container').item.title);
  });

  test.each(['container', 'single', 'tikk', 'long', 'normal', 'wide'] satisfies TicketState[])(
    '%s retains state words on visible agent-ticket plan rows',
    (state) => {
      const fixture = ticketView(state);
      const pane = paneOf(state);
      const name = state === 'single' ? parentName : 'Whole plan';
      const plan = section(pane, name);
      const tokens = state === 'normal' ? kojaNormal : koja;

      const visible = Object.values(fixture.agents)
        .flat()
        .filter((agent) => drawnTexts(plan).includes(agent.identifier));

      expect(visible.length).toBeGreaterThan(0);

      for (const agent of visible) {
        const row = rowFor(plan, agent.identifier);
        const status = textElement(row, agent.state);

        expect(hasStyle(status, 'text_right')).toBe(true);
        expect(status.textColors).toEqual([tokens.ink.dim]);
      }
    },
  );

  test('fixture acceptance and descriptions contain no link-like chevrons', () => {
    for (const state of states) {
      const fixture = ticketView(state);
      const text = [...fixture.item.description, ...fixture.criteria.map((item) => item.title)];

      expect(text.join('\n')).not.toContain('›');
    }
  });

  test('outside blocker facts use dim separators without parentheses', () => {
    const next = section(paneOf('nothing-ready'), 'Next');
    const detail = next.kids[2] ?? drawn();
    const facts = detail.kids.at(-1) ?? drawn();
    const separators = facts.kids.filter((part) => part.texts[0]?.trim() === '·');

    expect(drawnTexts(detail).join(' ')).not.toMatch(/[()]/);
    expect(separators).toHaveLength(3);

    for (const fact of facts.kids.slice(1)) {
      expect(fact.textColors).toEqual([koja.ink.dim]);
    }
  });

  test('wide PR states stay beside their links without right alignment or wrapping', () => {
    const now = section(paneOf('wide'), 'Now');
    const active = ticketView('wide').slices.filter((slice) => 'pull' in slice);

    for (const slice of active) {
      const item = required(now.kids, (part) => drawnTexts(part).includes(slice.title));
      const line = item.kids[2] ?? drawn();
      const status = line.kids.at(-1) ?? drawn();

      expect(line.kids).toHaveLength(3);
      expect(attribute(line, 'layout')).toBe('row');
      expect(hasStyle(line, 'justify_between')).toBe(false);
      expect(hasStyle(line, 'justify_end')).toBe(false);
      expect(targets(line.kids[0] ?? drawn())).toHaveLength(1);
      expect(drawnTexts(status).join(' ')).toContain(slice.readiness);
      expect(status.textColors).toEqual([koja.ink.dim]);
      expect(hasStyle(status, 'text_right')).toBe(false);
      expect(hasStyle(status, 'w')).toBe(false);
      expect(hasStyle(status, 'flex_none')).toBe(true);
      expect(hasStyle(status, 'whitespace_normal')).toBe(false);
      expect(line.kids.some((part) => hasStyle(part, 'flex_1'))).toBe(false);
    }
  });

  test('all registered views keep the shell size', () => {
    for (const state of states) {
      const name: SceneName = `ticket-view-${state}`;

      expect(findScene(name)).toEqual({
        scene: { name, width: overlaySize.shellWidth, height: overlaySize.shellHeight },
      });
    }
  });

  test.each(states)('%s repeats only summary identity navigation targets', (state) => {
    const pane = paneOf(state);
    const destinations = targets(pane);

    expect(destinations.length).toBeGreaterThan(0);
    const repeated = summaryIdentifiers(state);

    for (const target of new Set(destinations)) {
      const count = repeated.includes(target) ? 2 : 1;
      expect(destinations.filter((destination) => destination === target)).toHaveLength(count);
    }

    for (const identifier of repeated) {
      expect(destinations.filter((target) => target === identifier)).toHaveLength(2);
    }

    expect(drawnIcons(pane)).not.toContain('refresh-cw');
  });

  test.each([
    'container',
    'single',
    'sync-failed',
    'nothing-ready',
    'tikk',
    'long',
    'normal',
    'wide',
  ] satisfies TicketState[])(
    '%s summary identity links match plan ink and source tooltips',
    (state) => {
      const pane = paneOf(state);
      const planName = state === 'single' ? parentName : 'Whole plan';
      const plan = section(pane, planName);
      const summaries = [section(pane, 'Now')];

      if (state !== 'single') {
        summaries.push(section(pane, 'Next'));
      }

      for (const identifier of summaryIdentifiers(state)) {
        const summaryLink = required(summaries.flatMap(links), (part) =>
          part.texts.includes(identifier),
        );

        const planLink = required(links(plan), (part) => part.texts.includes(identifier));

        expect(hasStyle(summaryLink, 'underline')).toBe(true);
        expect(summaryLink.textColors).toEqual(planLink.textColors);
        expect(drawnTooltips(summaryLink)).toEqual(drawnTooltips(planLink));
      }
    },
  );

  test('wide plan and track share a capped reading width', () => {
    const wide = paneOf('wide');

    const scroll = required(
      descendants(wide),
      (part) => attribute(part, 'id') === 'ticket-view-wide',
    );

    const content = scroll.kids[0] ?? drawn();

    const narrow = required(
      descendants(paneOf('container')),
      (part) => attribute(part, 'id') === 'ticket-view-container',
    );

    expect(Number(attribute(content, 'max_w'))).toBeGreaterThan(0);
    expect(attribute(narrow.kids[0] ?? drawn(), 'max_w')).toBeUndefined();
    expect(drawnTexts(content)).toContain('Whole plan');
    expect(track(content).kids).toHaveLength(ticketView('wide').slices.length);
  });

  test.each([
    'container',
    'sync-failed',
    'nothing-ready',
    'tikk',
    'long',
    'normal',
  ] satisfies TicketState[])('%s aligns summary details with their identity column', (state) => {
    const pane = paneOf(state);
    const now = section(pane, 'Now');

    for (const slice of ticketView(state).slices.filter((item) => 'pull' in item)) {
      const item = required(now.kids, (part) => drawnTexts(part).includes(slice.title));
      const row = rowFor(item, slice.identifier);

      expect(attribute(item.kids.at(-1) ?? drawn(), 'ml')).toBe(
        identifierInsetOf(row, slice.identifier),
      );
    }

    const next = section(pane, 'Next');
    const identifier = summaryIdentifiers(state).at(-1) ?? '';
    const row = rowFor(next, identifier);

    expect(attribute(next.kids[2] ?? drawn(), 'ml')).toBe(identifierInsetOf(row, identifier));
  });

  test.each([
    'container',
    'single',
    'sync-failed',
    'nothing-ready',
    'tikk',
    'long',
    'normal',
  ] satisfies TicketState[])('%s summary identity rows share the ID column', (state) => {
    const pane = paneOf(state);
    const identifiers = summaryIdentifiers(state);
    const reference = rowFor(section(paneOf('container'), 'Next'), 'ME-1285');
    const expectedInset = identifierInsetOf(reference, 'ME-1285');
    const summaries = [section(pane, 'Now')];

    if (state !== 'single') {
      summaries.push(section(pane, 'Next'));
    }

    for (const identifier of identifiers) {
      const owner = required(summaries, (part) => targets(part).includes(identifier));

      expect(identifierInsetOf(rowFor(owner, identifier), identifier)).toBe(expectedInset);
    }

    if (state === 'nothing-ready') {
      expect(attribute(summaries[0]?.kids[1] ?? drawn(), 'ml')).toBe(expectedInset);
    }
  });

  test('single Now details align with the PR row first text', () => {
    const now = section(paneOf('single'), 'Now');
    const row = now.kids[1] ?? drawn();
    const label = row.kids[1] ?? drawn();

    expect(links(label)).toHaveLength(1);
    expect(drawnTexts(label)).toHaveLength(1);

    const agent = ticketView('single').agents[ticketView('single').item.identifier]?.find(
      (item) => item.state === 'in progress',
    );

    const identifier = agent?.identifier ?? '';
    const expectedInset = identifierInsetOf(rowFor(now, identifier), identifier);

    const labelInset = descendants(label).reduce(
      (total, part) => total + Number(attribute(part, 'pl') ?? 0),
      0,
    );

    expect(firstColumnInsetOf(row) + labelInset).toBe(expectedInset);
    expect(attribute(now.kids[2] ?? drawn(), 'ml')).toBe(expectedInset);
  });

  test('wide detail lines align with their own title row first text', () => {
    const pane = paneOf('wide');

    for (const name of ['Now', 'Next']) {
      for (const item of section(pane, name).kids.slice(1)) {
        const title = item.kids[0] ?? drawn();
        const metadata = item.kids[1] ?? drawn();
        const lines = [...metadata.kids, ...item.kids.slice(2)];

        expect(drawnTexts(title.kids[1] ?? drawn())).toHaveLength(1);

        for (const line of lines) {
          const factInset = Number(attribute(line, 'ml'));
          const markInset = Number(attribute(title, 'mx')) + Number(attribute(title, 'px'));

          expect(factInset).toBe(firstColumnInsetOf(title));
          expect(factInset).toBeGreaterThan(markInset);
        }
      }
    }
  });

  test('wide terminal icons start at their slice fact column without changing row rhythm', () => {
    const now = section(paneOf('wide'), 'Now');

    for (const slice of ticketView('wide').slices) {
      if (!('agent' in slice) || slice.agent === null) {
        continue;
      }

      const item = required(now.kids, (part) => drawnTexts(part).includes(slice.title));
      const firstFact = item.kids[1]?.kids[0] ?? drawn();
      const terminalRow = item.kids[3] ?? drawn();
      const link = terminalRow.kids[0] ?? drawn();
      const icon = link.kids[0] ?? drawn();
      const text = link.kids[1] ?? drawn();

      const iconInset =
        Number(attribute(terminalRow, 'ml')) +
        Number(attribute(link, 'pl') ?? 0) +
        Number(attribute(icon, 'ml') ?? 0);

      expect(item.kids.at(-1)).toBe(terminalRow);
      expect(attribute(terminalRow, 'h')).toBe(koja.rows.height);
      expect(iconInset).toBe(Number(attribute(firstFact, 'ml')));
      expect(drawnIcons(icon)).toEqual(['terminal']);
      expect(attribute(link, 'gap')).toBe(spacing.xsmall);
      expect(targets(text)).toEqual([slice.agent]);
    }
  });

  test('nothing-ready puts its availability note in the header detail role', () => {
    const pane = paneOf('nothing-ready');
    const nextHeading = heading(pane, 'Next');
    const planHeading = heading(pane, 'Whole plan');
    const detail = nextHeading.kids[1] ?? drawn();
    const count = planHeading.kids[1] ?? drawn();

    expect(nextHeading.kids).toHaveLength(2);
    expect(detail.texts).toHaveLength(1);
    expect(detail.textColors).toEqual(count.textColors);
    expect(detail.textColors).toEqual([koja.ink.dim]);
    expect(attribute(detail, 'text_size')).toBe(attribute(count, 'text_size'));
    expect(links(detail)).toHaveLength(0);
    expect(heading(paneOf('container'), 'Next').kids).toHaveLength(1);
  });

  test.each(['container', 'sync-failed', 'tikk', 'long', 'normal', 'wide'] satisfies TicketState[])(
    '%s keeps all three draft facts in metadata order',
    (state) => {
      const slice = ticketView(state).slices.find((item) => item.readiness === 'PR draft');
      const now = section(paneOf(state), 'Now');
      const item = required(now.kids, (part) => drawnTexts(part).includes(slice?.title ?? ''));
      const details = item.kids[1] ?? drawn();

      if (state === 'wide') {
        expect(details.kids).toHaveLength(3);
        expect(details.kids[0]?.kids).toHaveLength(3);
        expect(details.kids.slice(1).every((line) => line.kids.length === 1)).toBe(true);
      } else {
        expect((drawnTexts(details)[0] ?? '').split(' · ')).toHaveLength(3);
      }
    },
  );

  test('container summaries link their identities without linking reason references', () => {
    const pane = paneOf('container');
    const now = section(pane, 'Now');
    const next = section(pane, 'Next');
    const plan = section(pane, 'Whole plan');

    for (const identifier of ['ME-1283', 'ME-1284']) {
      expect(drawnTexts(now)).toContain(identifier);
      expect(targets(now)).toContain(identifier);
      expect(targets(plan)).toContain(identifier);

      expect(textElement(now, identifier).textColors).toEqual(
        textElement(plan, identifier).textColors,
      );
    }

    expect(drawnTexts(next)).toContain('ME-1285');

    expect(textElement(next, 'ME-1285').textColors).toEqual(
      textElement(plan, 'ME-1285').textColors,
    );

    expect(targets(next)).toEqual(['ME-1285']);
    expect(targets(now).filter((target) => target.includes('#'))).toHaveLength(2);
    expect(drawnIcons(now).filter((name) => name === 'terminal')).toHaveLength(1);

    const order = ['Now', 'Next', 'Whole plan', 'Description'].map((name) =>
      drawnTexts(pane).indexOf(name),
    );

    expect(order).toEqual(order.toSorted((left, right) => left - right));
  });

  test('single keeps selection and all acceptance ahead of its parent and folded tail', () => {
    const pane = paneOf('single');
    const plan = section(pane, parentName);
    const acceptance = section(pane, 'Acceptance');
    const now = section(pane, 'Now');

    const order = ['Now', 'Acceptance', parentName, 'Relations', 'Description', 'Activity'].map(
      (name) => drawnTexts(pane).indexOf(name),
    );

    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual(order.toSorted((left, right) => left - right));
    expect(acceptance.kids.slice(1)).toHaveLength(5);
    expect(numbers(heading(pane, 'Acceptance'))).toEqual([2, 5]);
    expect(rowFor(plan, 'ME-1283').backgroundColors).toContain(koja.rows.selectedFill);

    const selectedNode = required(
      descendants(plan),
      (part) => part.kids.length === 3 && drawnTexts(part.kids[0] ?? drawn()).includes('ME-1283'),
    );

    expect(selectedNode.kids.at(-1)?.backgroundColors).toContain(koja.rows.selectedFill);
    expect(drawnTexts(pane)).not.toContain('Next');
    expect(track(plan).kids).toHaveLength(7);
    expect(drawnTexts(now)).toContain('AI-413');
    expect(drawnTexts(now)).not.toContain('AI-412');
    expect(drawnTexts(now)).not.toContain('AI-414');
    expect(targets(now)).toContain('AI-413');
    expect(targets(plan)).toContain('AI-413');
    expect(targets(plan)).not.toContain('ME-1283');
    expect(heading(pane, parentName).kids).toHaveLength(2);
    expect(heading(pane, parentName).kids[1]?.textColors).toEqual([koja.ink.dim]);
    const parentFixture = ticketView('container').item;
    const detail = heading(pane, parentName).kids[1] ?? drawn();

    expect(numbers(detail)).toEqual([ticketView('single').slices.length]);
    expect(drawnTexts(detail).some((text) => text.includes(parentFixture.title ?? ''))).toBe(false);
    expect(drawnTexts(detail).some((text) => text.includes(parentFixture.identifier))).toBe(false);

    expect(textElement(now, 'AI-413').textColors).toEqual(textElement(plan, 'AI-413').textColors);

    expect(
      drawnTexts(heading(pane, parentName)).some((text) =>
        text.includes(ticketView('single').item.source),
      ),
    ).toBe(true);
  });

  test('plan disclosures distinguish empty open and closed slices', () => {
    const plan = section(paneOf('container'), 'Whole plan');

    expect(drawnIcons(rowFor(plan, 'ME-1281'))).not.toContain('chevron-down');
    expect(drawnIcons(rowFor(plan, 'ME-1281'))).not.toContain('chevron-right');
    expect(drawnIcons(rowFor(plan, 'ME-1283'))).toContain('chevron-down');
    expect(drawnIcons(rowFor(plan, 'ME-1284'))).toContain('chevron-right');
    expect(drawnTexts(plan)).toContain('AI-412');
    expect(drawnTexts(plan)).not.toContain('AI-418');

    const slots = ['ME-1281', 'ME-1283', 'ME-1284'].map(
      (identifier) => rowFor(plan, identifier).kids[1]?.kids[0]?.kids[0] ?? drawn(),
    );

    const slotWidths = slots.map((slot) => Number(attribute(slot, 'w')));

    expect(slotWidths[0]).toBeGreaterThan(0);
    expect(new Set(slotWidths).size).toBe(1);
    expect(slots[0]?.kids).toHaveLength(0);

    const title = heading(plan, 'Whole plan');

    expect(title.kids).toHaveLength(2);
    expect(title.kids.at(-1)?.textColors).toContain(koja.ink.dim);
    expect(targets(title)).toHaveLength(0);
    expect(heading(paneOf('container'), 'Description').kids).toHaveLength(1);
  });

  test('track segments match the marked state groups without empty counts', () => {
    const pane = paneOf('container');
    const segments = track(pane).kids;

    expect(segments.map((part) => part.backgroundColors[0])).toEqual([
      koja.marks.done,
      koja.marks.done,
      koja.marks.working,
      koja.marks.working,
      koja.marks.idle,
      koja.marks.blocked,
      koja.marks.blocked,
    ]);

    expect(countGroups(pane).map(numbers)).toEqual([[2, 7], [2], [1], [2]]);
    const groups = countGroups(pane);

    const parent = required(descendants(pane), (part) =>
      groups.every((group) => part.kids.includes(group)),
    );

    expect(parent.kids).toHaveLength(groups.length * 2 - 1);
    expect(parent.kids[0]).toBe(groups[0]);
    expect(parent.kids.at(-1)).toBe(groups.at(-1));
    expect(countGroups(paneOf('nothing-ready')).map(numbers)).toEqual([[4, 7], [3]]);

    expect(
      track(paneOf('nothing-ready'))
        .kids.slice(0, 4)
        .every((part) => part.backgroundColors.includes(koja.marks.done)),
    ).toBe(true);
  });

  test.each(
    states.filter(
      (state) => ticketView(state).slices.length > 0 && !['loading', 'unreachable'].includes(state),
    ),
  )('%s uses the legend mark tone at full strength for every track segment', (state) => {
    const pane = paneOf(state);
    const fixture = ticketView(state);
    const tokens = state === 'normal' ? kojaNormal : koja;

    const tones = {
      merged: tokens.marks.done,
      'PR open': tokens.marks.working,
      'PR draft': tokens.marks.working,
      ready: tokens.marks.idle,
      blocked: tokens.marks.blocked,
    };

    const segments = track(pane).kids;
    const marks = countGroups(pane).flatMap(descendants);

    const legendColors = marks.flatMap((mark) =>
      mark.backgroundColors.concat(mark.textColors, mark.borderColors),
    );

    const parent = trackParent(pane);
    const merged = fixture.slices.filter((slice) => slice.readiness === 'merged').length;

    expect(parent.kids).toHaveLength(2);
    expect(parent.kids[0]).toBe(track(pane));
    expect(Number(attribute(parent, 'pt'))).toBeGreaterThan(Number(attribute(parent, 'gap')));
    expect(attribute(parent, 'mr')).toBe(tokens.rows.inset + tokens.rows.paddingX);
    expect(numbers(countGroups(pane)[0] ?? drawn())).toEqual([merged, fixture.slices.length]);
    expect(segments).toHaveLength(fixture.slices.length);

    for (const [index, slice] of fixture.slices.entries()) {
      const segment = segments[index] ?? drawn();
      const tone = tones[slice.readiness];

      expect(segment.backgroundColors).toEqual([tone]);
      expect(attribute(segment, 'opacity') ?? 1).toBe(1);
      expect(legendColors).toContain(tone);
    }
  });

  test('track spacing balances count lines without a working mark', () => {
    const working = Number(attribute(trackParent(paneOf('container')), 'pt'));

    for (const state of ['nothing-ready', 'done'] satisfies TicketState[]) {
      const quiet = Number(attribute(trackParent(paneOf(state)), 'pt'));
      expect(quiet).toBeGreaterThan(working);
    }
  });

  test('ready marks match between the summary and plan', () => {
    const pane = paneOf('container');
    const next = rowFor(section(pane, 'Next'), 'ME-1285');
    const plan = section(pane, 'Whole plan');

    const node = required(
      descendants(plan),
      (part) => part.kids.length === 3 && drawnTexts(part.kids[0] ?? drawn()).includes('ME-1285'),
    );

    expect(descendants(next).some((part) => part.borderColors.includes(koja.marks.idle))).toBe(
      true,
    );

    expect(
      descendants(node.kids.at(-1) ?? drawn()).some((part) =>
        part.borderColors.includes(koja.marks.idle),
      ),
    ).toBe(true);

    const planRow = rowFor(plan, 'ME-1285');
    const planStatus = planRow.kids.at(-1) ?? drawn();

    expect(planRow.kids).toHaveLength(next.kids.length + 1);
    expect(hasStyle(planStatus, 'text_right')).toBe(true);
    expect(planStatus.texts).toHaveLength(1);
    expect(descendants(next).filter((part) => hasStyle(part, 'text_right'))).toHaveLength(0);
  });

  test('only the single plan puts the next PR reason beside its title', () => {
    const single = rowFor(section(paneOf('single'), parentName), 'ME-1285');
    const container = rowFor(section(paneOf('container'), 'Whole plan'), 'ME-1285');

    const reason = required(descendants(single), (part) =>
      part.texts.some((text) => text.includes('#58')),
    );

    expect(reason.textColors).toContain(koja.ink.dim);
    expect(targets(single)).toEqual(['ME-1285']);

    expect(drawnTexts(single.kids.at(-1) ?? drawn()).some((text) => text.includes('#58'))).toBe(
      false,
    );

    expect(drawnTexts(container).some((text) => text.includes('#58'))).toBe(false);
  });

  test('blocked reasons stay with titles outside the aligned status column', () => {
    const plan = section(paneOf('container'), 'Whole plan');
    const blocked = rowFor(plan, 'ME-1286');
    const active = rowFor(plan, 'ME-1283');
    const status = blocked.kids.at(-1);

    expect(status?.texts).toHaveLength(1);
    expect(drawnTexts(status ?? drawn()).some((text) => text.includes('ME-1285'))).toBe(false);
    expect(drawnTexts(blocked).some((text) => text.includes('ME-1285'))).toBe(true);

    const reason = required(descendants(blocked), (part) =>
      part.texts.some((text) => text.includes('ME-1285')),
    );

    const titleGroup = required(descendants(blocked), (part) => part.kids.includes(reason));
    expect(titleGroup.kids).toHaveLength(3);
    expect(titleGroup.kids[1]?.texts).toEqual(['·']);
    expect(Number(attribute(titleGroup, 'gap'))).toBeGreaterThan(0);
    expect(reason.texts[0]?.startsWith('·')).toBe(false);
    expect(hasStyle(reason, 'flex_none')).toBe(true);
    expect(attribute(status ?? drawn(), 'w')).toBe(attribute(active.kids.at(-1) ?? drawn(), 'w'));
    expect(hasStyle(status ?? drawn(), 'text_right')).toBe(true);
    expect(Number(attribute(status ?? drawn(), 'w'))).toBeGreaterThan(0);
  });

  test('sync failure precedes the track without repeating ages in summaries', () => {
    const pane = paneOf('sync-failed');
    const nodes = descendants(pane);
    const failure = required(nodes, (part) => part.path === 'circle-alert');
    const now = section(pane, 'Now');
    const fresh = section(paneOf('container'), 'Now');

    expect(nodes.indexOf(failure)).toBeLessThan(nodes.indexOf(track(pane)));
    expect(nodes.filter((part) => part.path === 'circle-alert')).toHaveLength(1);
    expect(targets(pane)).toContain('ME-1090');
    expect(spinning(pane)).toBe(false);

    for (const index of [1, 2]) {
      const staleDetail = now.kids[index]?.kids.at(-1) ?? drawn();
      const freshDetail = fresh.kids[index]?.kids.at(-1) ?? drawn();
      const staleText = drawnTexts(staleDetail)[0] ?? '';
      const freshText = drawnTexts(freshDetail)[0] ?? '';

      expect(staleText).toBe(freshText);
      expect(staleDetail.kids[0]?.textColors).toContain(koja.ink.dim);
    }

    expect(drawnTexts(section(pane, 'Next'))).toEqual(
      drawnTexts(section(paneOf('container'), 'Next')),
    );
  });

  test('outside blockers link once with a source while summaries have no PR targets', () => {
    const pane = paneOf('nothing-ready');
    const next = section(pane, 'Next');

    const blocker = required(links(next), (part) =>
      drawnTexts(part).some((text) => text.includes('ME-1290')),
    );

    expect(
      drawnTexts(blocker).some((text) => text.includes(ticketView('nothing-ready').item.source)),
    ).toBe(true);

    expect(targets(pane).filter((target) => target.includes('#'))).toHaveLength(0);
    expect(targets(next)).toEqual(['ME-1285', 'ME-1290']);
    expect(drawnTexts(section(pane, 'Now')).some((text) => text.includes('ME-1290'))).toBe(false);
    expect(next.kids).toHaveLength(3);
    expect(drawnTexts(next.kids[1] ?? drawn()).some((text) => text.includes('ME-1285'))).toBe(true);
    expect(targets(next.kids[1] ?? drawn())).toEqual(['ME-1285']);
    expect(targets(next.kids[2] ?? drawn())).toEqual(['ME-1290']);
    expect(next.kids[2]?.kids[0]?.textColors).toEqual([koja.ink.dim]);
    expect(drawnIcons(section(pane, 'Whole plan'))).not.toContain('chevron-right');
  });

  test.each(['container', 'tikk'] satisfies TicketState[])(
    '%s aligns nested and slice title columns',
    (state) => {
      const pane = paneOf(state);
      const fixture = ticketView(state);
      const slice = fixture.slices[2];

      if (slice === undefined) {
        throw new Error('Missing active fixture');
      }

      const agent = fixture.agents[slice.identifier]?.[0];

      if (agent === undefined) {
        throw new Error('Missing agent fixture');
      }

      const plan = section(pane, 'Whole plan');

      const sliceCell = required(
        descendants(rowFor(plan, slice.identifier)),
        (part) => hasStyle(part, 'w') && drawnTexts(part).includes(slice.identifier),
      );

      const agentRow = rowFor(plan, agent.identifier);

      const agentCell = required(
        descendants(agentRow),
        (part) => hasStyle(part, 'w') && drawnTexts(part).includes(agent.identifier),
      );

      const indentation = required(
        descendants(plan),
        (part) => hasStyle(part, 'ml') && descendants(part).includes(agentRow),
      );

      expect(Number(attribute(agentCell, 'w')) + Number(attribute(indentation, 'ml'))).toBe(
        Number(attribute(sliceCell, 'w')),
      );

      expect(Number(attribute(agentCell, 'w'))).toBeLessThan(Number(attribute(sliceCell, 'w')));
    },
  );

  test.each(['loading', 'unreachable'] satisfies TicketState[])(
    '%s keeps only its source and read state',
    (state) => {
      const pane = paneOf(state);

      for (const absent of ['Now', 'Next', 'Whole plan', 'Description']) {
        expect(drawnTexts(pane)).not.toContain(absent);
      }

      const marker = state === 'loading' ? 'loading' : 'circle-alert';
      const identifier = ticketView(state).item.identifier;

      const body = required(
        descendants(pane),
        (part) =>
          attribute(part, 'layout') === 'column' &&
          part.kids.some((child) => drawnIcons(child).includes(marker)) &&
          part.kids.some((child) => targets(child).includes(identifier)),
      );

      expect(body.kids).toHaveLength(2);
      expect(targets(pane)).toHaveLength(1);
      expect(drawnIcons(pane).includes('loading')).toBe(state === 'loading');
      expect(drawnIcons(pane).includes('circle-alert')).toBe(state === 'unreachable');
    },
  );

  test('done keeps merged colors and a folded summary instead of work rows', () => {
    const pane = paneOf('done');

    expect(track(pane).kids.every((part) => part.backgroundColors.includes(koja.marks.done))).toBe(
      true,
    );

    expect(countGroups(pane).map(numbers)).toEqual([[7, 7]]);
    expect(drawnIcons(pane)).toContain('check');
    expect(numbers(heading(pane, 'merged'))).toEqual([7]);
    expect(drawnIcons(pane).filter((name) => name === 'chevron-right')).toHaveLength(3);
    expect(drawnTexts(pane)).not.toContain('Now');
    expect(drawnTexts(pane)).not.toContain('Next');
    expect(drawnTexts(pane)).not.toContain('ME-1281');
    expect(numbers(heading(pane, 'Acceptance'))).toEqual([1, 3]);
  });

  test('plain has acceptance rows without a plan or work summaries', () => {
    const pane = paneOf('plain');

    expect(section(pane, 'Acceptance').kids.slice(1)).toHaveLength(2);
    expect(numbers(heading(pane, 'Acceptance'))).toEqual([0, 2]);
    expect(targets(pane)).toContain(ticketView('plain').item.identifier);

    for (const absent of ['Now', 'Next', 'Whole plan', 'Relations', 'Activity']) {
      expect(drawnTexts(pane)).not.toContain(absent);
    }

    expect(descendants(pane).some((part) => part.kids.length >= 7)).toBe(false);
  });

  test('tikk translates every rendered identifier and dependency target', () => {
    const pane = paneOf('tikk');
    const plan = section(pane, 'Whole plan');

    expect(drawnTexts(pane).join('\n')).not.toMatch(/\b(?:ME|AI)-\d+/);
    expect(targets(plan)).toHaveLength(10);
    expect(drawnIcons(section(pane, 'Now'))).toContain('terminal');
    expect(track(pane).kids).toHaveLength(7);
  });

  test('long keeps every plan target and full titles in tooltips after summaries', () => {
    const pane = paneOf('long');
    const plan = section(pane, 'Whole plan');

    expect(track(pane).kids).toHaveLength(14);

    for (const slice of ticketView('long').slices) {
      expect(targets(plan)).toContain(slice.identifier);
      expect(drawnTooltips(plan)).toContain(slice.title);
    }

    expect(drawnTexts(pane).indexOf('Next')).toBeLessThan(drawnTexts(pane).indexOf('Whole plan'));
  });

  test('normal preserves content and changes both the focused border and header fill', () => {
    const pane = paneOf('normal');

    expect(drawnTexts(pane)).toEqual(drawnTexts(paneOf('container')));
    expect(pane.borderColors).toContain(kojaNormal.pane.focusedBorder);

    expect(
      descendants(pane).some((part) =>
        part.backgroundColors.includes(kojaNormal.pane.focusedHeaderFill),
      ),
    ).toBe(true);
  });

  test('rail items share title metadata PR and agent order with indivisible facts', () => {
    const pane = paneOf('wide');
    const now = section(pane, 'Now');
    const next = section(pane, 'Next');
    const fixture = ticketView('wide');

    const slices = fixture.slices.filter(
      (slice) => slice.readiness !== 'merged' && slice.readiness !== 'blocked',
    );

    for (const slice of slices) {
      const parent = slice.readiness === 'ready' ? next : now;
      const item = required(parent.kids, (part) => drawnTexts(part).includes(slice.title));
      const meta = item.kids[1] ?? drawn();

      expect(drawnTexts(item.kids[0] ?? drawn())).toEqual([slice.title]);
      expect(attribute(meta, 'layout')).toBe('column');
      const factCount = 'detail' in slice ? slice.detail.split(' · ').length : 2;
      expect(meta.kids).toHaveLength(factCount);
      expect(meta.kids[0]?.kids[0]?.texts).toEqual([slice.identifier]);
      expect(meta.kids[0]?.kids[1]?.texts.map((text) => text.trim())).toEqual(['·']);
      expect(meta.kids[0]?.kids).toHaveLength(3);
      expect(meta.kids[1]?.kids).toHaveLength(1);
      expect(targets(meta)).toEqual([slice.identifier]);

      for (const line of meta.kids) {
        expect(drawnTexts(line)[0]?.startsWith('·')).toBe(false);
        expect(attribute(line, 'gap')).toBe(line === meta.kids[0] ? 0 : spacing.small);
      }

      for (const fact of meta.kids.flatMap((line) => line.kids)) {
        expect(hasStyle(fact, 'flex_none')).toBe(true);
        expect(hasStyle(fact, 'whitespace_normal')).toBe(false);

        if (!hasStyle(fact, 'underline')) {
          expect(fact.textColors).toEqual([koja.ink.dim]);
        }

        expect(attribute(fact, 'line_height')).toBe(`${koja.rows.height}px`);
      }

      if ('pull' in slice) {
        expect(targets(item.kids[2] ?? drawn())).toEqual([`koja ${slice.pull}`]);
        expect(item.kids).toHaveLength(slice.agent === null ? 3 : 4);

        if (slice.agent !== null) {
          expect(targets(item.kids[3] ?? drawn())).toEqual([slice.agent]);
        }
      } else {
        expect(item.kids).toHaveLength(2);

        expect(
          drawnTexts(meta.kids[1] ?? drawn()).some(
            (text) => text.includes('#58') && text.includes('ME-1283'),
          ),
        ).toBe(true);
      }
    }
  });

  test.each([
    'container',
    'single',
    'sync-failed',
    'nothing-ready',
    'tikk',
    'long',
    'normal',
    'wide',
  ] satisfies TicketState[])(
    '%s keeps at least the container ID column and title gap in every plan row',
    (state) => {
      const container = section(paneOf('container'), 'Whole plan');
      const reference = identifierCellOf(rowFor(container, 'ME-1281'), 'ME-1281');

      const referenceParent = required(descendants(container), (part) =>
        part.kids.includes(reference),
      );

      const planName = state === 'single' ? parentName : 'Whole plan';
      const plan = section(paneOf(state), planName);

      for (const slice of ticketView(state).slices) {
        const cell = identifierCellOf(rowFor(plan, slice.identifier), slice.identifier);
        const parent = required(descendants(plan), (part) => part.kids.includes(cell));

        expect(Number(attribute(cell, 'w'))).toBeGreaterThanOrEqual(
          Number(attribute(reference, 'w')),
        );

        expect(attribute(parent, 'gap')).toBe(attribute(referenceParent, 'gap'));
      }
    },
  );

  test('nothing-ready uses the normal Next mark and ID columns', () => {
    const waiting = rowFor(section(paneOf('nothing-ready'), 'Next'), 'ME-1285');
    const ready = rowFor(section(paneOf('container'), 'Next'), 'ME-1285');
    const waitingCell = identifierCellOf(waiting, 'ME-1285');
    const readyCell = identifierCellOf(ready, 'ME-1285');

    const waitingColumns = required(descendants(waiting), (part) =>
      part.kids.includes(waitingCell),
    );

    const readyColumns = required(descendants(ready), (part) => part.kids.includes(readyCell));

    expect(attribute(waitingCell, 'w')).toBe(attribute(readyCell, 'w'));
    expect(attribute(waitingColumns, 'pl')).toBe(attribute(readyColumns, 'pl'));
    expect(attribute(waitingColumns, 'gap')).toBe(attribute(readyColumns, 'gap'));

    expect(
      descendants(waiting.kids[0] ?? drawn()).some((part) =>
        part.backgroundColors.includes(koja.marks.blocked),
      ),
    ).toBe(true);

    const fixture = ticketView('nothing-ready').slices.find(
      (slice) => slice.identifier === 'ME-1285',
    );

    const next = section(paneOf('nothing-ready'), 'Next');
    const detail = next.kids[2] ?? drawn();

    expect(hasStyle(waitingCell.kids[0] ?? drawn(), 'underline')).toBe(true);
    expect(drawnTexts(waiting)).toContain(fixture?.title ?? '');
    const waitingStatus = waiting.kids.at(-1) ?? drawn();

    const planStatus =
      rowFor(section(paneOf('nothing-ready'), 'Whole plan'), 'ME-1285').kids.at(-1) ?? drawn();

    expect(hasStyle(waitingStatus, 'text_right')).toBe(true);
    expect(waitingStatus.texts).toHaveLength(1);
    expect(attribute(waitingStatus, 'w')).toBe(attribute(planStatus, 'w'));
    expect(links(waitingStatus)).toHaveLength(0);
    expect(targets(waiting)).toEqual(['ME-1285']);
    expect(targets(detail)).toEqual(['ME-1290']);
    expect(targets(detail.kids[0] ?? drawn())).toEqual([]);
    const title = detail.kids[1] ?? drawn();

    expect(targets(title)).toEqual([]);
    expect(title.texts).toHaveLength(1);
    expect(title.textColors).toEqual([koja.ink.text]);
    expect(hasStyle(title, 'underline')).toBe(false);
    expect(detail.kids).toHaveLength(3);
    const facts = detail.kids[2] ?? drawn();

    expect(targets(facts.kids[0] ?? drawn())).toEqual(['ME-1290']);
    expect(Number(attribute(detail, 'gap'))).toBeGreaterThan(0);
    expect(drawnTexts(title)).not.toContain(' · ');

    for (const fact of facts.kids.slice(1)) {
      expect(fact.textColors).toEqual((detail.kids[0] ?? drawn()).textColors);
    }
  });

  test('wide places both PRs and the agent only in the rail with wrapping and row rhythm', () => {
    const pane = paneOf('wide');

    const columns = required(
      descendants(pane),
      (part) =>
        part.kids.length === 2 &&
        drawnTexts(part.kids[0] ?? drawn()).includes('Whole plan') &&
        targets(part.kids[1] ?? drawn()).includes('ME-1090'),
    );

    const reading = columns.kids[0] ?? drawn();
    const rail = columns.kids[1] ?? drawn();
    const now = section(rail, 'Now');
    const next = section(rail, 'Next');

    expect(targets(rail).filter((target) => target.includes('#'))).toHaveLength(2);
    expect(targets(reading).filter((target) => target.includes('#'))).toHaveLength(0);
    expect(new Set(targets(pane))).toEqual(new Set(targets(paneOf('container'))));
    expect(drawnIcons(rail).filter((name) => name === 'terminal')).toHaveLength(1);
    expect(drawnIcons(reading)).not.toContain('terminal');
    expect(drawnTexts(reading)).not.toContain('Now');
    expect(drawnTexts(reading)).not.toContain('Next');
    expect(drawnTexts(reading)).toContain('Description');
    expect(track(reading).kids).toHaveLength(7);
    expect(next.kids).toHaveLength(2);

    for (const identifier of ['ME-1283', 'ME-1284', 'ME-1285']) {
      const fixture = ticketView('wide').slices.find((slice) => slice.identifier === identifier);

      if (fixture === undefined) {
        throw new Error('Missing wide fixture');
      }

      const title = textElement(rail, fixture.title);

      expect(hasStyle(title, 'whitespace_normal')).toBe(true);
      expect(attribute(title, 'line_height')).toBe(`${koja.rows.height}px`);
      expect(attribute(title, 'max_h')).toBe(koja.rows.height * 2);
    }

    const firstItem = now.kids[1] ?? drawn();

    expect(attribute(firstItem.kids[2] ?? drawn(), 'min_h')).toBe(koja.rows.height);
    expect(attribute(firstItem.kids[3] ?? drawn(), 'h')).toBe(koja.rows.height);
    expect(drawnIcons(firstItem.kids[3] ?? drawn())).toContain('terminal');
    expect(drawnIcons(now.kids[2] ?? drawn())).not.toContain('terminal');
  });

  test.each(states)(
    '%s reserves a quiet scrollbar only for an overflowing fixed scene',
    (state) => {
      const pane = paneOf(state);

      const overflowing = ['container', 'single', 'sync-failed', 'tikk', 'long', 'normal'].includes(
        state,
      );

      const bars = descendants(pane).filter((part) => part.path === 'scrollbar');

      expect(bars).toHaveLength(overflowing ? 1 : 0);

      for (const bar of bars) {
        const clip = required(descendants(pane), (part) => part.kids.includes(bar));

        expect(Number(attribute(clip, 'w'))).toBeLessThan(koja.rows.inset);
        expect(hasStyle(clip, 'overflow_hidden')).toBe(true);
        expect(attribute(bar, 'right')).toBe(-Number(attribute(clip, 'right')));
        expect(Number(attribute(bar, 'opacity'))).toBeLessThan(1);
      }
    },
  );

  test.each([
    ['container', 'Description'],
    ['tikk', 'Description'],
    ['normal', 'Description'],
    ['single', 'ME-1286'],
    ['sync-failed', 'ME-1287'],
    ['long', 'ME-1310'],
  ] satisfies [TicketState, string][])(
    '%s ends its initial fold after a complete row',
    (state, lastIdentity) => {
      const pane = paneOf(state);
      const scroll = required(descendants(pane), (part) => hasStyle(part, 'overflow_y_scroll'));
      const viewport = required(descendants(pane), (part) => part.kids.includes(scroll));
      const positions = flowPositions(pane);
      const scrollTop = positions.get(viewport) ?? 0;
      const visibleBottom = fixedPaneHeight - Number(attribute(viewport, 'mb')) - 1;
      const rows = descendants(scroll).filter((part) => attribute(part, 'h') === koja.rows.height);

      const boundaries = rows.map((part) => {
        const top = positions.get(part) ?? 0;
        const bottom = top + measuredHeight(part);

        expect(Math.round(top) < visibleBottom && Math.round(bottom) > visibleBottom).toBe(false);

        return Math.round(bottom);
      });

      expect(scrollTop).toBeGreaterThan(0);
      expect(boundaries).toContain(visibleBottom);

      const lastRow = rowFor(scroll, lastIdentity);
      const lastTop = positions.get(lastRow) ?? 0;

      expect(Math.round(lastTop + measuredHeight(lastRow))).toBe(visibleBottom);
    },
  );

  test.each([
    'container',
    'tikk',
    'normal',
    'single',
    'sync-failed',
    'long',
  ] satisfies TicketState[])('%s fold measurement detects added space above its rows', (state) => {
    const pane = paneOf(state);
    const scroll = required(descendants(pane), (part) => hasStyle(part, 'overflow_y_scroll'));
    const viewport = required(descendants(pane), (part) => part.kids.includes(scroll));
    const sections = scroll.kids[0] ?? drawn();
    const padding = verticalEdge(sections, 'p', 't');

    attributes.set(sections, { ...attributes.get(sections), pt: [padding + spacing.medium] });

    const positions = flowPositions(pane);
    const bottom = fixedPaneHeight - Number(attribute(viewport, 'mb')) - 1;

    const cut = descendants(scroll).filter((part) => {
      const top = positions.get(part) ?? 0;

      return (
        attribute(part, 'h') === koja.rows.height &&
        top < bottom &&
        top + measuredHeight(part) > bottom
      );
    });

    expect(cut.length).toBeGreaterThan(0);
  });

  test('mixed detail separators use the same text spacing without extra layout gaps', () => {
    const waiting = section(paneOf('nothing-ready'), 'Next').kids[2] ?? drawn();
    const facts = waiting.kids.at(-1) ?? drawn();
    const wide = section(paneOf('wide'), 'Now');
    const lines = [facts];

    for (const item of wide.kids.slice(1)) {
      lines.push(item.kids[1]?.kids[0] ?? drawn(), item.kids[2] ?? drawn());
    }

    for (const line of lines) {
      const separators = line.kids.filter((part) => part.texts[0]?.trim() === '·');

      expect(separators.length).toBeGreaterThan(0);
      expect(attribute(line, 'gap')).toBe(0);

      for (const separator of separators) {
        expect(separator.texts[0]?.split('·').map((side) => side.length)).toEqual([1, 1]);
        expect(attribute(separator, 'text_size')).toBe(koja.text.detail.size);
        expect(Number(attribute(separator, 'ml') ?? 0)).toBe(0);
        expect(Number(attribute(separator, 'mr') ?? 0)).toBe(0);
      }
    }
  });

  test('single leaves less bottom space so its next row remains whole', () => {
    const statesToCompare = ['single', 'container'] satisfies TicketState[];

    const margins = statesToCompare.map((state) => {
      const pane = paneOf(state);
      const scroll = required(descendants(pane), (part) => hasStyle(part, 'overflow_y_scroll'));
      const viewport = required(descendants(pane), (part) => part.kids.includes(scroll));

      return Number(attribute(viewport, 'mb'));
    });

    expect(margins[0]).toBeLessThan(margins[1] ?? 0);
  });

  test.each(['container', 'single', 'long'] satisfies TicketState[])(
    '%s separates its header from the scroll gutter',
    (state) => {
      const pane = paneOf(state);
      const scroll = required(descendants(pane), (part) => hasStyle(part, 'overflow_y_scroll'));

      expect(drawnIcons(pane)).toContain('scrollbar');
      expect(targets(scroll)).not.toContain(ticketView(state).item.identifier);
      expect(targets(scroll)).not.toContain('ME-1090');
      expect(Number(attribute(scroll, 'pr'))).toBeGreaterThanOrEqual(koja.rows.inset);
      const viewport = required(descendants(pane), (part) => part.kids.includes(scroll));

      expect(Number(attribute(viewport, 'mb'))).toBeGreaterThan(0);
    },
  );
});
