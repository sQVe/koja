export interface DrawnElement {
  kids: DrawnElement[];
  path: string | null;
  spins: boolean;
  texts: string[];
  tooltipText: string | null;
  textColors: string[];
  backgroundColors: string[];
  borderColors: string[];
  isDisabled: boolean;
  clickHandlers: ((event: unknown, cx: unknown) => void)[];
  sizeHandlers: ((size: { width: number; height: number }, cx: unknown) => void)[];
  mouseHandlers: Record<string, ((event: unknown, cx: unknown) => void)[]>;
  hoverHandlers: ((hovered: boolean, cx: unknown) => void)[];
  styles: Record<string, unknown[]>;
}

const addChild = (parent: DrawnElement, child: unknown): void => {
  if (typeof child === 'string') {
    parent.texts.push(child);
  } else {
    parent.kids.push(child as DrawnElement);
  }
};

export const drawn = (path: string | null = null): DrawnElement => {
  const element: DrawnElement = {
    kids: [],
    path,
    spins: false,
    texts: [],
    tooltipText: null,
    textColors: [],
    backgroundColors: [],
    borderColors: [],
    isDisabled: false,
    clickHandlers: [],
    sizeHandlers: [],
    mouseHandlers: {},
    hoverHandlers: [],
    styles: {},
  };

  const handle: DrawnElement = new Proxy(element, {
    get: (target, key) => {
      if (key === 'then') {
        return undefined;
      }

      if (key in target) {
        return target[key as keyof DrawnElement];
      }

      return (...args: unknown[]) => {
        if (key === 'child') {
          addChild(target, args[0]);
        }

        if (key === 'children') {
          for (const child of (args[0] as unknown[] | undefined) ?? []) {
            addChild(target, child);
          }
        }

        if (key === 'tooltip') {
          target.tooltipText = String(args[0]);
        }

        if (key === 'text_color') {
          target.textColors.push(String(args[0]));
        }

        if (key === 'bg') {
          target.backgroundColors.push(String(args[0]));
        }

        if (key === 'border_color') {
          target.borderColors.push(String(args[0]));
        }

        if (key === 'disabled') {
          target.isDisabled = args[0] === true;
        }

        if (key === 'on_click') {
          target.clickHandlers.push(args[0] as (event: unknown, cx: unknown) => void);
        }

        if (key === 'on_size_change') {
          target.sizeHandlers.push(args[0] as DrawnElement['sizeHandlers'][number]);
        }

        if (key === 'on_mouse_down' || key === 'on_mouse_up') {
          const name = `${key}:${String(args[0])}`;
          const handlers = target.mouseHandlers[name] ?? [];

          handlers.push(args[1] as (event: unknown, cx: unknown) => void);
          target.mouseHandlers[name] = handlers;
        }

        if (key === 'on_hover') {
          target.hoverHandlers.push(args[0] as DrawnElement['hoverHandlers'][number]);
        }

        if (key === 'spin') {
          target.spins = true;
        }

        target.styles[String(key)] = args;

        return handle;
      };
    },
  });

  return handle;
};

export const drawnTree = (elements: DrawnElement[]): DrawnElement => {
  const root = drawn();

  root.kids.push(...elements);

  return root;
};

const descendants = (element: DrawnElement): DrawnElement[] => [
  element,
  ...element.kids.flatMap(descendants),
];

export const drawnTexts = (element: DrawnElement): string[] =>
  descendants(element).flatMap((part) => part.texts);

export const clickablesWithText = (element: DrawnElement, text: string): DrawnElement[] =>
  descendants(element).filter(
    (part) => part.clickHandlers.length > 0 && drawnTexts(part).includes(text),
  );

export const elementsWithBorder = (element: DrawnElement, color: string): DrawnElement[] =>
  descendants(element).filter((part) => part.borderColors.at(-1) === color);

export const elementsWithSizeHandler = (element: DrawnElement): DrawnElement[] =>
  descendants(element).filter((part) => part.sizeHandlers.length > 0);

export const drawnIcons = (element: DrawnElement): string[] =>
  descendants(element)
    .map((part) => part.path?.split('/').at(-1) ?? null)
    .filter((name): name is string => name !== null);

export const spinning = (element: DrawnElement): boolean =>
  descendants(element).some((part) => part.spins);

export const drawnTooltips = (element: DrawnElement): string[] =>
  descendants(element)
    .map((part) => part.tooltipText)
    .filter((tooltip): tooltip is string => tooltip !== null);

export const elementWithText = (element: DrawnElement, text: string): DrawnElement | null =>
  descendants(element).find((part) => part.texts.includes(text)) ?? null;

export const elementsWithStyle = (element: DrawnElement, style: string): DrawnElement[] =>
  descendants(element).filter((part) => part.styles[style] !== undefined);

export const elementWithIcon = (element: DrawnElement, name: string): DrawnElement | null =>
  descendants(element).find((part) => part.path?.split('/').at(-1) === name) ?? null;

export const click = (element: DrawnElement): void => {
  element.clickHandlers[0]?.({}, { stop_propagation: () => undefined });
};

// A left press and release on the element alone; the fake does not pass events to parents.
export const press = (element: DrawnElement, cx: unknown): void => {
  for (const handler of element.mouseHandlers['on_mouse_down:left'] ?? []) {
    handler({}, cx);
  }

  for (const handler of element.mouseHandlers['on_mouse_up:left'] ?? []) {
    handler({}, cx);
  }
};

export const elementsWithMouseHandlers = (element: DrawnElement): DrawnElement[] =>
  descendants(element).filter((part) => Object.keys(part.mouseHandlers).length > 0);
