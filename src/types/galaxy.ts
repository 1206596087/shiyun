export type ViewMode = 'universe' | 'knowledge' | 'focus'
export type QualityPreset = 'default' | 'high' | 'low'

export interface GalaxyConfig {
  density: number
  armCount: number
  tightness: number
  rotationSpeed: number
  dustBrightness: number
  coreBrightness: number
  bloomIntensity: number
  showBackgroundStars: boolean
  quality: QualityPreset
}

export const DEFAULT_GALAXY_CONFIG: GalaxyConfig = {
  density: 1,
  armCount: 4,
  tightness: 1.18,
  rotationSpeed: 0.018,
  dustBrightness: 0.82,
  coreBrightness: 0.9,
  bloomIntensity: 0.72,
  showBackgroundStars: true,
  quality: 'default',
}

export const GALAXY_PRESETS: Record<QualityPreset, GalaxyConfig> = {
  default: DEFAULT_GALAXY_CONFIG,
  high: {
    ...DEFAULT_GALAXY_CONFIG,
    density: 1.35,
    dustBrightness: 0.94,
    bloomIntensity: 0.86,
    quality: 'high',
  },
  low: {
    ...DEFAULT_GALAXY_CONFIG,
    density: 0.52,
    dustBrightness: 0.66,
    bloomIntensity: 0.38,
    quality: 'low',
  },
}
