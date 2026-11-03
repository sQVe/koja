type DiffKind = '@' | '+' | '-' | ' ' | '';

export interface DiffRow {
  kind: DiffKind;
  number?: number;
  text: string;
}

export const diffRows = (lines: string[]): DiffRow[] => {
  let old = 0;
  let current = 0;

  return lines.map((line) => {
    const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);

    if (match !== null) {
      old = Number(match[1]);
      current = Number(match[2]);

      return { kind: '@', text: line };
    }

    const kind = line[0];

    if (kind === '-') {
      return { kind, number: old++, text: line.slice(1) || ' ' };
    }

    if (kind === '+') {
      return { kind, number: current++, text: line.slice(1) || ' ' };
    }

    if (kind === ' ') {
      const number = current++;

      old += 1;

      return { kind, number, text: line.slice(1) || ' ' };
    }

    return { kind: '', text: line };
  });
};
