import { spacing, trafficLightsWidth } from './size.ts';

interface TrafficLightsContext {
  platform: 'linux' | 'macos' | 'windows';
  titlebar: 'system' | 'none';
  fullscreen: boolean;
  lights: number | null;
  zoom: number;
  offset: number;
}

export const trafficLightsPadding = (context: TrafficLightsContext): number => {
  const ownTitleBar = context.platform === 'macos' && context.titlebar === 'none';

  if (!ownTitleBar || context.fullscreen || context.lights === null) {
    return spacing.large;
  }

  const needed = (context.lights + trafficLightsWidth) / context.zoom - context.offset;

  return Math.max(spacing.large, needed);
};
