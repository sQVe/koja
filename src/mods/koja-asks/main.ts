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
  modName,
  numberOf,
  overlayId,
  recordOf,
  repeat,
  stringOf,
} from '../../kit/index.ts';
import { parsedJson } from '../../kit/parsedJson.ts';
import type { Ask } from './askFacts.ts';
import { asksOf, identityListOf, unseenAsks } from './askFacts.ts';
import type { CardBox, CardMore } from './card.ts';
import { cardGeometry, cardTextOf, windowBoundsOf } from './card.ts';
import type { CardMode, OpenCard } from './host.ts';
import { planCard } from './host.ts';
import type { CardActions } from './view.ts';
import { cardElement } from './view.ts';

interface CardProps {
  ask: Ask;
  more: CardMore | null;
  normal: boolean;
}

const handledKey = 'koja-asks.handled';

const openKey = 'koja-asks.open';

const normalModeKey = 'koja-modal';

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

  return { count: numberOf(record['count']) ?? 0, space: stringOf(record['space']) ?? '' };
};

const readCardProps = (value: unknown): CardProps | null => {
  const record = recordOf(value);
  const ask = readAsk(record['ask']);

  return ask === null
    ? null
    : { ask, more: readMore(record['more']), normal: record['normal'] === true };
};

const openStateOf = (value: unknown): OpenCard | null => {
  const record = recordOf(value);
  const id = stringOf(record['id']);
  const identity = stringOf(record['identity']);
  const mode = stringOf(record['mode']);
  const isCardMode = mode === 'insert' || mode === 'normal';

  if (id === null || identity === null || !isCardMode) {
    return null;
  }

  return { id, identity, mode };
};

const markHandled = (identity: string): void => {
  const handled = identityListOf(shared(handledKey));

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

const layoutBoxOf = (id: string): CardBox | null => {
  const node = findLayoutNode(id);

  return node === null ? null : { sizePx: node.sizePx, hidden: node.hidden };
};

const windowSize = async (): Promise<{ width: number; height: number } | null> => {
  const text = await readTextFile(`${appHome()}/window.json`).catch(() => null);
  const bounds = windowBoundsOf(parsedJson(text));

  if (bounds === null) {
    return null;
  }

  const zoom = numberOf(settings()['zoom']) ?? 1;

  return zoom > 0 ? { width: bounds.width / zoom, height: bounds.height / zoom } : null;
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
    this.clearOpen();
  }

  override render(): Element {
    if (this.card === null) {
      return div().id('koja-asks-host').size(0);
    }

    return cardElement(this.card.ask, this.card.more, this.card.normal, this.actions());
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

  private async tick(): Promise<void> {
    if (this.busy) {
      return;
    }

    this.busy = true;

    try {
      const normal = shared(normalModeKey) === true;
      const mode: CardMode = normal ? 'normal' : 'insert';

      const view = {
        focusedTab: focused()?.tab ?? null,
        windowActive: currentWindow()?.active === true,
      };

      const live = asksOf({ terminals: terminals(), agents: agents() });
      const asks = unseenAsks(live, view);
      const visible = live.filter((ask) => !asks.includes(ask));
      const handled = identityListOf(shared(handledKey));
      const handledWithVisible = [...new Set([...handled, ...visible.map((ask) => ask.identity)])];

      const plan = planCard({
        asks,
        live,
        handled: handledWithVisible,
        open: openStateOf(shared(openKey)),
        mode,
      });

      if (plan.handledChanged) {
        setShared(handledKey, plan.handled);
      }

      if (plan.close !== null) {
        closeCurrentOverlay(plan.close);
        setShared(openKey, null);
      }

      if (plan.open !== null) {
        await this.openCard(plan.open, moreOf(asks, plan.open), normal);
      }
    } finally {
      this.busy = false;
    }
  }

  private async openCard(ask: Ask, more: CardMore | null, normal: boolean): Promise<void> {
    const geometry = cardGeometry(
      {
        window: await windowSize(),
        sidebar: layoutBoxOf('sidebar'),
        panel: layoutBoxOf('panel'),
      },
      cardTextOf(ask, more),
      normal,
    );

    const spec: OverlaySpec = {
      mod: modName,
      kind: 'window',
      frame: 'none',
      width: geometry.width,
      height: geometry.height,
      props: { ask, more, normal },
    };

    if (geometry.at !== null) {
      spec.at = geometry.at;
    }

    const id = openOverlay(spec);
    const mode: CardMode = normal ? 'normal' : 'insert';

    setShared(openKey, { id, identity: ask.identity, mode });
  }
}
