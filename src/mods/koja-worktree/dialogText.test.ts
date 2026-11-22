import { describe, expect, test } from 'bun:test';

import { closeRiskText, refusedText, riskText } from './dialogText.ts';

describe('risk text', () => {
  test('each risk kind maps to its own non-empty text', () => {
    const kinds = Object.keys(riskText).toSorted();
    const texts = Object.values(riskText);
    const unique = new Set(texts);

    expect(kinds).toEqual(['agent', 'changes']);
    expect(texts.every((text) => text.length > 0)).toBe(true);
    expect(unique.size).toBe(2);
  });

  test('the close question has its own text, apart from the remove warning', () => {
    expect(closeRiskText.agent.length).toBeGreaterThan(0);
    expect(closeRiskText.agent).not.toBe(riskText.agent);
  });

  test('a refusal names the value and its role', () => {
    const branch = refusedText({ kind: 'refused', name: '-x', role: 'branch' });
    const worktree = refusedText({ kind: 'refused', name: '-x', role: 'worktree' });

    expect(branch).toContain('-x');
    expect(worktree).toContain('-x');
    expect(branch).not.toBe(worktree);
  });
});
