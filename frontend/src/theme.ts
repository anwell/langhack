/**
 * LingoFlow Design System
 *
 * "Confidence through Clarity" — Modern Corporate with a Friendly Humanist twist.
 * Based on Material Design 3 tonal palette with custom brand colors.
 */

export const palette = {
  // Primary (Sky Blue) — "Flow"
  primary: '#0058be',
  onPrimary: '#ffffff',
  primaryContainer: '#2170e4',
  onPrimaryContainer: '#fefcff',
  primaryFixed: '#d8e2ff',
  primaryFixedDim: '#adc6ff',

  // Secondary (Mint Green) — "Success"
  secondary: '#006c49',
  onSecondary: '#ffffff',
  secondaryContainer: '#6cf8bb',
  onSecondaryContainer: '#00714d',

  // Tertiary (Amber) — "Energy"
  tertiary: '#825100',
  onTertiary: '#ffffff',
  tertiaryContainer: '#a36700',
  onTertiaryContainer: '#fffbff',
  tertiaryFixed: '#ffddb8',
  tertiaryFixedDim: '#ffb95f',

  // Error
  error: '#ba1a1a',
  onError: '#ffffff',
  errorContainer: '#ffdad6',
  onErrorContainer: '#93000a',

  // Surfaces
  background: '#f8f9ff',
  onBackground: '#0b1c30',
  surface: '#f8f9ff',
  surfaceDim: '#cbdbf5',
  surfaceBright: '#f8f9ff',
  surfaceContainerLowest: '#ffffff',
  surfaceContainer: '#e5eeff',
  surfaceContainerLow: '#eff4ff',
  surfaceContainerHigh: '#dce9ff',
  surfaceContainerHighest: '#d3e4fe',
  surfaceVariant: '#d3e4fe',

  // On-surface
  onSurface: '#0b1c30',
  onSurfaceVariant: '#424754',
  inverseSurface: '#213145',
  inverseOnSurface: '#eaf1ff',

  // Outline
  outline: '#727785',
  outlineVariant: '#c2c6d6',

  // Legacy aliases (for backward compat in tests)
  ink: '#0b1c30',
  muted: '#424754',
  paper: '#f8f9ff',
  line: '#c2c6d6',
  coral: '#0058be',       // mapped to primary for legacy refs
  teal: '#006c49',        // mapped to secondary
  lemon: '#ffb95f',       // mapped to tertiary-fixed-dim
  indigo: '#004395',
  lilac: '#d8e2ff',
  mint: '#6cf8bb',
  rose: '#ffdad6',
  sky: '#e5eeff',
  amber: '#ffddb8',
  cyan: '#2170e4',
  danger: '#ba1a1a',
  success: '#006c49',
};

export const shadow = {
  shadowColor: '#0058be',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 12,
  elevation: 3,
};

export const tightShadow = {
  shadowColor: '#0058be',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 2,
};
