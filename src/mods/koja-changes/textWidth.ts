const wideGlyph =
  /[\p{Ideographic}\p{Emoji_Presentation}\p{Extended_Pictographic}\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\ufe10-\ufe19\ufe30-\ufe6f\uff01-\uff60\uffe0-\uffe6]/gu;

const tabStops = 4;

// A wide glyph takes two columns, and a combining mark adds none of its own.
export const displayColumns = (text: string): number => {
  let columns = text.length;

  for (const glyph of text.match(wideGlyph) ?? []) {
    if (glyph.length === 1) {
      columns += 1;
    }
  }

  return columns;
};

// Text draws a tab as nothing, so pad each to the next stop.
export const untab = (text: string): string =>
  text.replace(/[^\t]*\t/g, (run) => {
    const kept = run.slice(0, -1);
    const stop = kept.length - (kept.length % tabStops) + tabStops;

    return kept.padEnd(stop);
  });
