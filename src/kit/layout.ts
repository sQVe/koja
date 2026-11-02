import { layout } from 'herdr';

import { listOf, numberOf, recordOf, stringOf } from './fields.ts';

export interface LayoutNode {
  id: string | null;
  hidden: boolean;
  active: string | null;
  sizePx: number | null;
  trafficLights: number | null;
  children: LayoutNode[];
}

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

export const findLayoutNode = (id: string): LayoutNode | null => findNode(id, layoutRoot());
