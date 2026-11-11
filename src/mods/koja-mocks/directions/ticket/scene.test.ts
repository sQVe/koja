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
import { overlaySize } from '../../../../kit/size.ts';
import type { SceneName } from '../../catalog.ts';
import { findScene } from '../../catalog.ts';

type TicketState =
  Extract<SceneName, `ticket-view-${string}`> extends `ticket-view-${infer State}` ? State : never;

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
    state: string | null;
    readAge: string | null;
    facts: { name: string; value: string }[];
  };
  slices: FixtureSlice[];
  agents: Record<string, { identifier: string; title: string; state: string }[]>;
  criteria: { title: string; state: string }[];
}

interface Tokens {
  ink: { dim: string; muted: string };
  marks: { done: string; working: string; idle: string; blocked: string };
  rows: { height: number; inset: number; selectedFill: string };
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
    h_flex: () => rendered(),
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

const parentName = 'ME-1280 Build the sidebar';

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
        expect(hasStyle(summaryStatus, 'text_right')).toBe(true);

        const item =
          state === 'single'
            ? now
            : required(
                descendants(now),
                (part) =>
                  attribute(part, 'layout') === 'column' &&
                  drawnTexts(part.kids[0] ?? drawn()).includes(slice.identifier),
              );

        const detail = state === 'single' ? item.kids[2] : item.kids.at(-1);
        const detailText = drawnTexts(detail ?? drawn())[0] ?? '';

        if (state === 'sync-failed') {
          expect(detailText.endsWith(slice.detail)).toBe(true);
        } else {
          expect(detailText).toBe(slice.detail);
        }
      }
    }
  });

  test('sync failure keeps the item read age beside the state chip', () => {
    const pane = paneOf('sync-failed');
    const fixture = ticketView('sync-failed');
    const chip = stateChip(pane, fixture);

    const stateRow = required(descendants(itemHeader(pane, fixture)), (part) =>
      part.kids.includes(chip),
    );

    const age = stateRow.kids[1] ?? drawn();

    expect(stateRow.kids).toHaveLength(2);
    expect(fixture.item.readAge).not.toBeNull();
    expect(age.texts).toHaveLength(1);
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
  test('all registered views keep the shell size', () => {
    for (const state of states) {
      const name: SceneName = `ticket-view-${state}`;

      expect(findScene(name)).toEqual({
        scene: { name, width: overlaySize.shellWidth, height: overlaySize.shellHeight },
      });
    }
  });

  test.each(states)('%s links every target at most once', (state) => {
    const pane = paneOf(state);
    const destinations = targets(pane);

    expect(destinations.length).toBeGreaterThan(0);
    expect(new Set(destinations).size).toBe(destinations.length);
    expect(drawnIcons(pane)).not.toContain('refresh-cw');
  });

  test('container summaries identify slices but leave their links in the plan', () => {
    const pane = paneOf('container');
    const now = section(pane, 'Now');
    const next = section(pane, 'Next');
    const plan = section(pane, 'Whole plan');

    for (const identifier of ['ME-1283', 'ME-1284']) {
      expect(drawnTexts(now)).toContain(identifier);
      expect(targets(now)).not.toContain(identifier);
      expect(targets(plan)).toContain(identifier);

      expect(textElement(now, identifier).textColors).toEqual(
        textElement(plan, identifier).textColors,
      );
    }

    expect(drawnTexts(next)).toContain('ME-1285');
    expect(targets(next)).toHaveLength(0);
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
    expect(targets(now)).not.toContain('AI-413');
    expect(targets(plan)).toContain('AI-413');
    expect(targets(plan)).not.toContain('ME-1283');
    expect(heading(pane, parentName).kids).toHaveLength(2);

    expect(
      drawnTexts(heading(pane, parentName)).some((text) =>
        text.includes(ticketView('single').item.source),
      ),
    ).toBe(false);
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

    expect(
      attribute(
        required(segments, (part) => part.backgroundColors.includes(koja.marks.blocked)),
        'opacity',
      ),
    ).toBeLessThan(1);

    expect(countGroups(pane).map(numbers)).toEqual([[2], [2], [1], [2]]);
    const groups = countGroups(pane);

    const parent = required(descendants(pane), (part) =>
      groups.every((group) => part.kids.includes(group)),
    );

    expect(parent.kids).toHaveLength(groups.length * 2 - 1);
    expect(parent.kids[0]).toBe(groups[0]);
    expect(parent.kids.at(-1)).toBe(groups.at(-1));
    expect(countGroups(paneOf('nothing-ready')).map(numbers)).toEqual([[4], [3]]);

    expect(
      track(paneOf('nothing-ready'))
        .kids.slice(0, 4)
        .every((part) => part.backgroundColors.includes(koja.marks.done)),
    ).toBe(true);
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

    expect(rowFor(plan, 'ME-1285').kids.at(-1)?.texts).toEqual(next.kids.at(-1)?.texts);
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

    expect(hasStyle(reason, 'flex_none')).toBe(true);
    expect(attribute(status ?? drawn(), 'w')).toBe(attribute(active.kids.at(-1) ?? drawn(), 'w'));
    expect(hasStyle(status ?? drawn(), 'text_right')).toBe(true);
    expect(Number(attribute(status ?? drawn(), 'w'))).toBeGreaterThan(0);
  });

  test('sync failure precedes the track and dims freshness on both summaries', () => {
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

      expect(staleText.length).toBeGreaterThan(freshText.length);
      expect(staleText.endsWith(freshText)).toBe(true);
      expect(staleDetail.kids[0]?.textColors).toContain(koja.ink.dim);
    }

    expect(drawnTexts(section(pane, 'Next')).at(-1)?.length).toBeGreaterThan(
      drawnTexts(section(paneOf('container'), 'Next')).at(-1)?.length ?? 0,
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
    expect(targets(next)).toEqual(['ME-1290']);
    expect(drawnTexts(section(pane, 'Now')).some((text) => text.includes('ME-1290'))).toBe(true);
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

    expect(countGroups(pane).map(numbers)).toEqual([[7]]);
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
    expect(next.kids).toHaveLength(3);

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
    const detail = firstItem.kids[2] ?? drawn();

    expect(attribute(firstItem.kids[1] ?? drawn(), 'min_h')).toBe(koja.rows.height);
    expect(attribute(detail.kids[0] ?? drawn(), 'line_height')).toBe(`${koja.rows.height}px`);
    expect(attribute(detail.kids[0] ?? drawn(), 'max_h')).toBe(koja.rows.height * 2);
    expect(attribute(detail.kids[1] ?? drawn(), 'h')).toBe(koja.rows.height);
    expect(drawnIcons(detail)).toContain('terminal');
    expect(drawnIcons(now.kids[2] ?? drawn())).not.toContain('terminal');

    expect(attribute(next.kids[2]?.kids[0] ?? drawn(), 'line_height')).toBe(
      `${koja.rows.height}px`,
    );
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
