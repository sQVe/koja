import { layout } from 'herdr';

import { listOf, numberOf, recordOf, stringOf } from './fields.ts';

export interface LayoutNode {
  id: string | null;
  hidden: boolean;
  active: string | null;
  sizePx: number | null;
  trafficLights: number | null;
  padding: number;
  children: LayoutNode[];
}

const paddingOf = (value: unknown): number => {
  const direct = numberOf(value);

  if (direct !== null) {
    return direct;
  }

  return numberOf(listOf(value)[0]) ?? 0;
};

const nodeOf = (value: unknown): LayoutNode => {
  const fields = recordOf(value);
  const size = recordOf(fields['size']);
  const children = listOf(fields['children']).map(nodeOf);

  return {
    id: stringOf(fields['id']),
    hidden: fields['hidden'] === true,
    active: stringOf(fields['active']),
    sizePx: numberOf(size['px']),
    trafficLights: numberOf(listOf(fields['traffic_lights'])[0]),
    padding: paddingOf(fields['padding']),
    children,
  };
};

export const layoutRoot = (): LayoutNode => nodeOf(layout());

const findNode = (id: string, node: LayoutNode): LayoutNode | null => {
  if (node.id === id) {
    return node;
  }

  for (const child of node.children) {
    const found = findNode(id, child);

    if (found !== null) {
      return found;
    }
  }

  return null;
};

export const findLayoutNode = (id: string, root: LayoutNode): LayoutNode | null =>
  findNode(id, root);
