import { describe, expect, test } from 'bun:test';

import { spacing, trafficLightsWidth } from './size.ts';
import { trafficLightsPadding } from './trafficLights.ts';

const macos = {
  platform: 'macos' as const,
  titlebar: 'none' as const,
  fullscreen: false,
  lights: 12,
  zoom: 1,
  offset: 0,
  base: spacing.large,
};

describe('trafficLightsPadding', () => {
  test('clears the traffic lights on macOS without a system title bar', () => {
    expect(trafficLightsPadding(macos)).toBe(12 + trafficLightsWidth);
  });

  test('subtracts the offset of the element inside the window', () => {
    expect(trafficLightsPadding({ ...macos, offset: 268 })).toBe(spacing.large);
  });

  test('scales the needed room by the zoom factor', () => {
    expect(trafficLightsPadding({ ...macos, zoom: 2 })).toBe((12 + trafficLightsWidth) / 2);
  });

  test('uses the given base padding where no traffic lights need room', () => {
    expect(trafficLightsPadding({ ...macos, platform: 'linux', base: spacing.none })).toBe(
      spacing.none,
    );

    expect(trafficLightsPadding({ ...macos, offset: 268, base: spacing.none })).toBe(spacing.none);
  });

  test('keeps the base padding on other systems', () => {
    expect(trafficLightsPadding({ ...macos, platform: 'linux' })).toBe(spacing.large);
  });

  test('keeps the base padding with a system title bar', () => {
    expect(trafficLightsPadding({ ...macos, titlebar: 'system' })).toBe(spacing.large);
  });

  test('keeps the base padding in fullscreen', () => {
    expect(trafficLightsPadding({ ...macos, fullscreen: true })).toBe(spacing.large);
  });

  test('keeps the base padding without a traffic light position', () => {
    expect(trafficLightsPadding({ ...macos, lights: null })).toBe(spacing.large);
  });
});
