import type { AsyncContext, Element } from 'gpui-kit';
import { div, View } from 'gpui-kit';
import type { OverlaySpec } from 'herdr';
import {
  agents,
  appHome,
  checking,
  focused,
  openOverlay,
  playSound,
  panes,
  props,
  readTextFile,
  run,
  setShared,
  settings,
  shared,
  spaces,
  terminals,
} from 'herdr';

import { readDataState } from '../../data/consumer.ts';
import {
  closeOverlay as closeCurrentOverlay,
  currentWindow,
  findLayoutNode,
  layoutRoot,
  listOf,
  modName,
  numberOf,
  overlayId,
  recordOf,
  repeat,
  stringListOf,
  stringOf,
} from '../../kit/index.ts';
import type { LayoutNode } from '../../kit/layout.ts';
import { parsedJson } from '../../kit/parsedJson.ts';
import type { AskAges } from './askAges.ts';
import { askAgeOf, trackAskAges } from './askAges.ts';
import type { Ask } from './askFacts.ts';
import { asksOf, unseenAsks } from './askFacts.ts';
import { askProjects } from './askProjects.ts';
import type {
  AskRow,
  CardBox,
  CardGeometry,
  CardGeometrySources,
  CardMore,
  CardWindow,
} from './card.ts';
import {
  cardGeometry,
  cardHeight,
  cardSignature,
  cardTextOf,
  listHeight,
  windowBoundsOf,
} from './card.ts';
import type { CardPlan, OpenCard } from './host.ts';
import { planCard } from './host.ts';
import type { CardActions } from './view.ts';
import { cardElement, listElement } from './view.ts';

interface CardProps {
  ask: Ask;
  more: CardMore | null;
  rows: readonly AskRow[] | null;
}

interface CardContent {
  more: CardMore | null;
  rows: readonly AskRow[] | null;
  geometry: CardGeometry;
  signature: string;
}

interface Snapshot {
  asks: Ask[];
  live: Ask[];
  visible: Ask[];
  handled: string[];
  sounded: string[];
  ages: AskAges;
  listOpen: boolean;
  open: OpenCard | null;
}

const handledKey = 'koja-asks.handled';

const soundedKey = 'koja-asks.sounded';

const blockedSound = 'blocked';

const openKey = 'koja-asks.open';

const listKey = 'koja-asks.list';

const tickMilliseconds = 500;

const textOf = (record: Record<string, unknown>, key: string): string =>
  stringOf(record[key]) ?? '';

const readAsk = (value: unknown): Ask | null => {
  const record = recordOf(value);
  const identity = stringOf(record['identity']);
  const kind = stringOf(record['kind']);
  const isAskKind = kind === 'permission' || kind === 'question';

  if (identity === null || !isAskKind) {
    return null;
  }

  return {
    identity,
    address: textOf(record, 'address'),
    spaceId: textOf(record, 'spaceId'),
    spaceName: textOf(record, 'spaceName'),
    project: textOf(record, 'project'),
    tabId: textOf(record, 'tabId'),
    paneId: textOf(record, 'paneId'),
    agent: textOf(record, 'agent'),
    kind,
    question: textOf(record, 'question'),
    command: stringOf(record['command']),
    seq: numberOf(record['seq']) ?? 0,
  };
};

const readMore = (value: unknown): CardMore | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const record = recordOf(value);
  const count = numberOf(record['count']);
  const space = stringOf(record['space']);

  if (count === null || space === null) {
    return null;
  }

  if (count <= 0 || space === '') {
    return null;
  }

  return { count, space };
};

const readRow = (value: unknown): AskRow | null => {
  const record = recordOf(value);
  const ask = readAsk(record['ask']);
  const age = stringOf(record['age']);

  if (ask === null || age === null) {
    return null;
  }

  return { ask, age };
};

const readRows = (value: unknown): AskRow[] | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const rows = listOf(value)
    .map(readRow)
    .filter((row): row is AskRow => row !== null);

  return rows.length === 0 ? null : rows;
};

const readCardProps = (value: unknown): CardProps | null => {
  const record = recordOf(value);
  const ask = readAsk(record['ask']);

  return ask === null
    ? null
    : { ask, more: readMore(record['more']), rows: readRows(record['rows']) };
};

const openStateOf = (value: unknown): OpenCard | null => {
  const record = recordOf(value);
  const id = stringOf(record['id']);
  const identity = stringOf(record['identity']);
  const signature = stringOf(record['signature']);

  if (id === null || identity === null || signature === null) {
    return null;
  }

  return { id, identity, signature };
};

const markHandled = (identity: string): void => {
  const handled = stringListOf(shared(handledKey));

  if (!handled.includes(identity)) {
    setShared(handledKey, [...handled, identity]);
  }
};

const moreOf = (asks: readonly Ask[], shown: Ask): CardMore | null => {
  const others = asks.filter((ask) => ask.identity !== shown.identity);

  if (others.length === 0) {
    return null;
  }

  const index = asks.findIndex((ask) => ask.identity === shown.identity);
  const next = asks[index + 1] ?? others[0];

  return next === undefined ? null : { count: others.length, space: next.spaceName };
};

const layoutBoxOf = (id: string, root: LayoutNode): CardBox | null => {
  const node = findLayoutNode(id, root);

  return node === null ? null : { sizePx: node.sizePx, hidden: node.hidden };
};

const windowSize = async (): Promise<CardWindow | null> => {
  const text = await readTextFile(`${appHome()}/window.json`).catch(() => null);
  const bounds = windowBoundsOf(parsedJson(text));

  if (bounds === null) {
    return null;
  }

  const zoom = numberOf(settings()['zoom']) ?? 1;

  return { ...bounds, zoom: zoom > 0 ? zoom : 1 };
};

const contentOf = (
  ask: Ask,
  more: CardMore | null,
  rows: readonly AskRow[] | null,
  sources: CardGeometrySources,
): CardContent => {
  const text = cardTextOf(ask, more);

  const heightAt =
    rows === null
      ? (width: number): number => cardHeight(text, width)
      : (width: number): number => listHeight(rows, width);

  const geometry = cardGeometry(sources, heightAt);

  return { more, rows, geometry, signature: cardSignature(ask, { text, rows }, geometry) };
};

export default class KojaAsks extends View {
  private card: CardProps | null = null;

  private busy = false;

  private ages: AskAges = {};

  override init(_props: unknown, cx: AsyncContext): void {
    this.card = readCardProps(props());

    if (this.card !== null || checking()) {
      return;
    }

    repeat(cx, tickMilliseconds, () => {
      // A failed read retries on the next tick.
      void this.tick().catch(() => undefined);
    });
  }

  override close(): void {
    if (this.card !== null) {
      this.clearOpen();

      return;
    }

    if (!checking()) {
      setShared(openKey, null);
    }
  }

  override render(): Element {
    if (this.card === null) {
      return div().id('koja-asks-host').size(0);
    }

    const { ask, more, rows } = this.card;

    if (rows !== null) {
      return listElement(rows, this.actions());
    }

    return cardElement(ask, more, this.actions());
  }

  private actions(): CardActions {
    return {
      goToAsk: () => {
        this.goToAsk();
      },
      dismiss: () => {
        this.dismiss();
      },
      openList: () => {
        setShared(listKey, true);
      },
      goToRow: (ask) => {
        this.goTo(ask);
      },
      dismissList: () => {
        this.dismissList();
      },
    };
  }

  private goToAsk(): void {
    const card = this.card;

    if (card === null) {
      return;
    }

    this.goTo(card.ask);
  }

  private goTo(ask: Ask): void {
    markHandled(ask.identity);
    this.clearCard();
    run('space.select', { id: ask.spaceId });
    run('tab.select', { id: ask.tabId });
    run('pane.focus', { pane: ask.paneId });
    closeCurrentOverlay();
  }

  private dismiss(): void {
    const card = this.card;

    if (card === null) {
      return;
    }

    markHandled(card.ask.identity);
    this.clearCard();
    closeCurrentOverlay();
  }

  private dismissList(): void {
    const card = this.card;

    if (card === null) {
      return;
    }

    for (const row of card.rows ?? []) {
      markHandled(row.ask.identity);
    }

    this.clearCard();
    closeCurrentOverlay();
  }

  private clearCard(): void {
    this.clearOpen();
    setShared(listKey, null);
  }

  private clearOpen(): void {
    const open = openStateOf(shared(openKey));
    const id = overlayId();

    if (open !== null && id !== null && open.id === id) {
      setShared(openKey, null);
    }
  }

  private trackAges(live: readonly Ask[]): AskAges {
    this.ages = trackAskAges(
      this.ages,
      live.map((ask) => ask.identity),
      Date.now(),
    );

    return this.ages;
  }

  private snapshot(): Snapshot {
    const view = {
      focusedTab: focused()?.tab ?? null,
      windowActive: currentWindow()?.active === true,
    };

    const spaceList = spaces();
    const paneList = panes();
    const projects = askProjects(readDataState(shared, Date.now()), spaceList, paneList);
    const live = asksOf({ terminals: terminals(), agents: agents(), projects });

    const asks = unseenAsks(live, view);
    const visible = live.filter((ask) => !asks.includes(ask));

    return {
      asks,
      live,
      visible,
      handled: stringListOf(shared(handledKey)),
      sounded: stringListOf(shared(soundedKey)),
      ages: this.trackAges(live),
      listOpen: shared(listKey) === true,
      open: openStateOf(shared(openKey)),
    };
  }

  private syncListFlag(snapshot: Snapshot, unhandledCount: number): boolean {
    const listOpen = snapshot.listOpen && unhandledCount > 1;

    if (snapshot.listOpen && !listOpen) {
      setShared(listKey, null);
    }

    return listOpen;
  }

  private planOf(snapshot: Snapshot, signatures: ReadonlyMap<string, string>): CardPlan {
    return planCard({
      asks: snapshot.asks,
      live: snapshot.live,
      handled: snapshot.handled,
      sounded: snapshot.sounded,
      visible: snapshot.visible.map((ask) => ask.identity),
      open: snapshot.open,
      signatures,
    });
  }

  private applyPlan(plan: CardPlan, contents: ReadonlyMap<string, CardContent>): void {
    if (plan.handledChanged) {
      setShared(handledKey, plan.handled);
    }

    if (plan.soundedChanged) {
      setShared(soundedKey, plan.sounded);
    }

    if (plan.close !== null) {
      closeCurrentOverlay(plan.close);
      setShared(openKey, null);
    }

    if (plan.open !== null) {
      const content = contents.get(plan.open.identity);

      if (content !== undefined) {
        this.openCard(plan.open, content);

        if (plan.sound) {
          playSound(blockedSound);
        }
      }
    }
  }

  private async tick(): Promise<void> {
    if (this.busy) {
      return;
    }

    this.busy = true;

    try {
      const first = this.snapshot();

      if (first.asks.length === 0) {
        this.syncListFlag(first, 0);
        this.applyPlan(this.planOf(first, new Map()), new Map());

        return;
      }

      const window = await windowSize();

      // A dismissal or a new answer can land during the bounds read, so read the state again.
      const current = this.snapshot();

      const root = layoutRoot();

      const sources: CardGeometrySources = {
        window,
        sidebar: layoutBoxOf('sidebar', root),
        panel: layoutBoxOf('panel', root),
      };

      const contents = new Map<string, CardContent>();
      const unhandled = current.asks.filter((ask) => !current.handled.includes(ask.identity));
      const listOpen = this.syncListFlag(current, unhandled.length);
      const shown = unhandled[0];

      if (shown !== undefined) {
        const rows = listOpen ? this.rowsOf(unhandled, current.ages) : null;

        contents.set(shown.identity, contentOf(shown, moreOf(unhandled, shown), rows, sources));
      }

      const signatures = new Map(
        [...contents].map(([identity, content]) => [identity, content.signature]),
      );

      this.applyPlan(this.planOf(current, signatures), contents);
    } finally {
      this.busy = false;
    }
  }

  private rowsOf(asks: readonly Ask[], ages: AskAges): AskRow[] {
    const now = Date.now();

    return asks.map((ask) => ({
      ask,
      age: askAgeOf(ages, ask.identity, now),
    }));
  }

  private openCard(ask: Ask, content: CardContent): void {
    const spec: OverlaySpec = {
      mod: modName,
      kind: 'window',
      frame: 'none',
      width: content.geometry.width,
      height: content.geometry.height,
      props: { ask, more: content.more, rows: content.rows },
    };

    if (content.geometry.at !== null) {
      spec.at = content.geometry.at;
    }

    const id = openOverlay(spec);

    setShared(openKey, { id, identity: ask.identity, signature: content.signature });
  }
}
