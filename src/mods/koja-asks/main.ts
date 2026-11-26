import type { AsyncContext, Element } from 'gpui-kit';
import { div, View } from 'gpui-kit';
import type { OverlaySpec } from 'herdr';
import {
  agents,
  appHome,
  checking,
  focused,
  openOverlay,
  props,
  readTextFile,
  run,
  setShared,
  settings,
  shared,
  terminals,
} from 'herdr';

import {
  closeOverlay as closeCurrentOverlay,
  currentWindow,
  findLayoutNode,
  layoutRoot,
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
import type { Ask } from './askFacts.ts';
import { asksOf, unseenAsks } from './askFacts.ts';
import type { CardBox, CardGeometry, CardGeometrySources, CardMore, CardWindow } from './card.ts';
import { cardGeometry, cardSignature, cardTextOf, windowBoundsOf } from './card.ts';
import type { CardPlan, OpenCard } from './host.ts';
import { planCard } from './host.ts';
import type { CardActions } from './view.ts';
import { cardElement } from './view.ts';

interface CardProps {
  ask: Ask;
  more: CardMore | null;
}

interface CardContent {
  more: CardMore | null;
  geometry: CardGeometry;
  signature: string;
}

interface Snapshot {
  asks: Ask[];
  live: Ask[];
  visible: Ask[];
  handled: string[];
  open: OpenCard | null;
}

const handledKey = 'koja-asks.handled';

const openKey = 'koja-asks.open';

const tickMilliseconds = 500;

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
    address: stringOf(record['address']) ?? '',
    spaceId: stringOf(record['spaceId']) ?? '',
    spaceName: stringOf(record['spaceName']) ?? '',
    tabId: stringOf(record['tabId']) ?? '',
    paneId: stringOf(record['paneId']) ?? '',
    agent: stringOf(record['agent']) ?? '',
    kind,
    question: stringOf(record['question']) ?? '',
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

const readCardProps = (value: unknown): CardProps | null => {
  const record = recordOf(value);
  const ask = readAsk(record['ask']);

  return ask === null ? null : { ask, more: readMore(record['more']) };
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

const contentOf = (ask: Ask, more: CardMore | null, sources: CardGeometrySources): CardContent => {
  const text = cardTextOf(ask, more);
  const geometry = cardGeometry(sources, text);

  return { more, geometry, signature: cardSignature(ask, text, geometry) };
};

export default class KojaAsks extends View {
  private card: CardProps | null = null;

  private busy = false;

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

    return cardElement(this.card.ask, this.card.more, this.actions());
  }

  private actions(): CardActions {
    return {
      goToAsk: () => {
        this.goToAsk();
      },
      dismiss: () => {
        this.dismiss();
      },
    };
  }

  private goToAsk(): void {
    const card = this.card;

    if (card === null) {
      return;
    }

    markHandled(card.ask.identity);
    this.clearOpen();
    run('space.select', { id: card.ask.spaceId });
    run('tab.select', { id: card.ask.tabId });
    run('pane.focus', { pane: card.ask.paneId });
    closeCurrentOverlay();
  }

  private dismiss(): void {
    const card = this.card;

    if (card === null) {
      return;
    }

    markHandled(card.ask.identity);
    this.clearOpen();
    closeCurrentOverlay();
  }

  private clearOpen(): void {
    const open = openStateOf(shared(openKey));
    const id = overlayId();

    if (open !== null && id !== null && open.id === id) {
      setShared(openKey, null);
    }
  }

  private snapshot(): Snapshot {
    const view = {
      focusedTab: focused()?.tab ?? null,
      windowActive: currentWindow()?.active === true,
    };

    const live = asksOf({ terminals: terminals(), agents: agents() });
    const asks = unseenAsks(live, view);
    const visible = live.filter((ask) => !asks.includes(ask));

    return {
      asks,
      live,
      visible,
      handled: stringListOf(shared(handledKey)),
      open: openStateOf(shared(openKey)),
    };
  }

  private planOf(snapshot: Snapshot, signatures: ReadonlyMap<string, string>): CardPlan {
    return planCard({
      asks: snapshot.asks,
      live: snapshot.live,
      handled: snapshot.handled,
      visible: snapshot.visible.map((ask) => ask.identity),
      open: snapshot.open,
      signatures,
    });
  }

  private applyPlan(plan: CardPlan, contents: ReadonlyMap<string, CardContent>): void {
    if (plan.handledChanged) {
      setShared(handledKey, plan.handled);
    }

    if (plan.close !== null) {
      closeCurrentOverlay(plan.close);
      setShared(openKey, null);
    }

    if (plan.open !== null) {
      const content = contents.get(plan.open.identity);

      if (content !== undefined) {
        this.openCard(plan.open, content);
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

      for (const ask of unhandled) {
        contents.set(ask.identity, contentOf(ask, moreOf(unhandled, ask), sources));
      }

      const signatures = new Map(
        [...contents].map(([identity, content]) => [identity, content.signature]),
      );

      this.applyPlan(this.planOf(current, signatures), contents);
    } finally {
      this.busy = false;
    }
  }

  private openCard(ask: Ask, content: CardContent): void {
    const spec: OverlaySpec = {
      mod: modName,
      kind: 'window',
      frame: 'none',
      width: content.geometry.width,
      height: content.geometry.height,
      props: { ask, more: content.more },
    };

    if (content.geometry.at !== null) {
      spec.at = content.geometry.at;
    }

    const id = openOverlay(spec);

    setShared(openKey, { id, identity: ask.identity, signature: content.signature });
  }
}
