const wideGlyph =
  /[\p{Ideographic}\p{Emoji_Presentation}\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\ufe10-\ufe19\ufe30-\ufe6f\uff01-\uff60\uffe0-\uffe6]/u;

const zeroWidthGlyph = /[\p{Mn}\p{Me}]/u;

const tabStops = 4;

export const displayColumns = (text: string): number => {
  let columns = 0;

  for (const glyph of text) {
    if (zeroWidthGlyph.test(glyph)) {
      continue;
    }

    columns += wideGlyph.test(glyph) ? 2 : 1;
  }

  return columns;
};

// Text draws a tab as nothing, so pad each to the next stop.
export const untab = (text: string): string =>
  text.replace(/[^\t]*\t/g, (run) => {
    const kept = run.slice(0, -1);
    const width = displayColumns(kept);
    const stop = width - (width % tabStops) + tabStops;

    return kept.padEnd(kept.length + stop - width);
  });
