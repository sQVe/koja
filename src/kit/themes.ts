import { themes } from 'herdr';

export interface ThemeChoice {
  name: string;
  label: string;
}

// Every theme `app.theme` accepts, in Herdr's order: presets first, then `themes/*.json`.
// Koja's own theme file is included, so its default theme is never missing.
export const themeChoices = (): ThemeChoice[] =>
  themes().map((theme) => ({
    name: theme.name,
    label: `Theme: ${theme.name.replaceAll('-', ' ')}`,
  }));
