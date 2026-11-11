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

        if (key === 'spin') {
          target.spins = true;
        }

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

export const elementWithTooltip = (element: DrawnElement, text: string): DrawnElement | null =>
  descendants(element).find((part) => part.tooltipText === text) ?? null;

export const elementWithIcon = (element: DrawnElement, name: string): DrawnElement | null =>
  descendants(element).find((part) => part.path?.split('/').at(-1) === name) ?? null;

export const click = (element: DrawnElement): void => {
  element.clickHandlers[0]?.({}, { stop_propagation: () => undefined });
};
