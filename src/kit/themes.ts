import { themes } from 'herdr';

export interface ThemeChoice {
  name: string;
  label: string;
}

export const themeChoices = (): ThemeChoice[] =>
  themes().map((theme) => ({
    name: theme.name,
    label: `Theme: ${theme.name.replaceAll('-', ' ')}`,
  }));
