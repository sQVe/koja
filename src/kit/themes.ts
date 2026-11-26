import { themes } from 'herdr';

export interface ThemeChoice {
  name: string;
  label: string;
  light: boolean;
}

export const themeChoices = (): ThemeChoice[] =>
  themes().map((theme) => ({
    name: theme.name,
    label: `Theme: ${theme.name.replaceAll('-', ' ')}`,
    light: theme.light,
  }));
