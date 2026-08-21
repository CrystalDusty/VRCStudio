import { create } from 'zustand';
import { savePersistentData, loadPersistentData } from '../utils/persistentStorage';

export interface VisualizerConfig {
  enabled: boolean;
  style: 'bars' | 'blocks' | 'wave' | 'radial' | 'dots' | 'aurora';
  sensitivity: number;          // 0.5 – 3
  barCount: number;             // 16 – 128
  focus: 'all' | 'bass' | 'mids' | 'treble';
  color: 'white' | 'accent' | 'rainbow';
  smoothing: number;            // 0 – 0.95
}

export type BorderStyle =
  | 'default'
  | 'rainbow'
  | 'neon'
  | 'pulse'
  | 'holographic'
  | 'flame'
  | 'shimmer'
  | 'cyber';

export interface LivelinessConfig {
  particles: boolean;     // floating dots in background
  cursorGlow: boolean;    // soft light follows the pointer
  hoverLift: boolean;     // panels/cards lift on hover
  statusPulse: boolean;   // online status dots breathe
  ambientHaze: boolean;   // very slow accent-color gradient drift
}

export interface ThemeConfig {
  mode: 'dark' | 'light' | 'midnight' | 'oled';
  accentColor: 'blue' | 'purple' | 'green' | 'rose' | 'amber' | 'cyan';
  /**
   * `guardian` is the VR mode theme. It is only offered while VR mode is on and
   * only renders while VR mode is on — turn VR off and the app looks ordinary,
   * turn it back on and it returns. The selection persists either way, so it
   * isn't lost, it just doesn't exist outside the headset.
   */
  premiumTheme: 'none' | 'iridescent' | 'holographic' | 'aurora' | 'cosmic' | 'synthwave' | 'asteroids' | 'koi' | 'hacker' | 'guardian';
  customCSS: string;
  fontSize: 'small' | 'medium' | 'large';
  sidebarWidth: 'compact' | 'normal' | 'wide';
  borderRadius: 'sharp' | 'rounded' | 'pill';
  borderStyle: BorderStyle;
  animationSpeed: 'none' | 'subtle' | 'normal';
  glassEffect: 'none' | 'light' | 'medium';
  visualizer: VisualizerConfig;
  liveliness: LivelinessConfig;

  /**
   * VR mode.
   *
   * The app is used in VR through a desktop overlay, which means it's read at
   * low angular resolution from a distance and pointed at with a laser rather
   * than a mouse. Three things follow, and VR mode does all three: scale
   * everything up, make every affordance permanently visible instead of
   * hover-revealed, and drop the decorative layers that cost frames in a
   * headset for no benefit at that distance.
   */
  vrMode: boolean;
  /** Interface scale used while VR mode is on. */
  vrZoom: number;
}

/**
 * Which premium theme should actually be drawn right now.
 *
 * Guardian is the VR mode theme: offered only in VR mode and drawn only in VR
 * mode. The selection is kept either way, so leaving VR doesn't lose it — the
 * theme simply doesn't exist outside the headset.
 *
 * Exported because both the stylesheet class and the overlay element need this
 * answer, and two copies of the rule is one copy too many.
 */
export function visiblePremiumTheme(
  premiumTheme: ThemeConfig['premiumTheme'] | undefined,
  vrMode: boolean | undefined,
): ThemeConfig['premiumTheme'] {
  if (!premiumTheme) return 'none';
  if (premiumTheme === 'guardian' && !vrMode) return 'none';
  return premiumTheme;
}

const THEME_KEY = 'vrcstudio_theme';

const defaultVisualizer: VisualizerConfig = {
  enabled: false,
  style: 'bars',
  sensitivity: 1.4,
  barCount: 64,
  focus: 'all',
  color: 'white',
  smoothing: 0.7,
};

const defaultLiveliness: LivelinessConfig = {
  particles: false,
  cursorGlow: false,
  hoverLift: true,
  statusPulse: true,
  ambientHaze: false,
};

const defaultTheme: ThemeConfig = {
  mode: 'dark',
  accentColor: 'blue',
  premiumTheme: 'none',
  customCSS: '',
  fontSize: 'medium',
  sidebarWidth: 'normal',
  borderRadius: 'rounded',
  borderStyle: 'default',
  animationSpeed: 'normal',
  glassEffect: 'medium',
  vrMode: false,
  vrZoom: 1.4,
  visualizer: defaultVisualizer,
  liveliness: defaultLiveliness,
};

function mergeTheme(saved: Partial<ThemeConfig>): ThemeConfig {
  const rawStyle = saved.visualizer?.style ?? defaultVisualizer.style;
  // Migrate retired 'plasma' → 'aurora'
  const migrated = rawStyle === ('plasma' as any) ? 'aurora' : rawStyle;
  const valid: VisualizerConfig['style'][] = ['bars','blocks','wave','radial','dots','aurora'];
  const safeStyle: VisualizerConfig['style'] = valid.includes(migrated as any) ? migrated as VisualizerConfig['style'] : 'bars';
  const validBorder: BorderStyle[] = ['default','rainbow','neon','pulse','holographic','flame','shimmer','cyber'];
  // Migrate retired 'glow' → 'pulse' (glow was visually too close to neon)
  const rawBorder = saved.borderStyle === ('glow' as any) ? 'pulse' : saved.borderStyle;
  const safeBorderStyle: BorderStyle = validBorder.includes(rawBorder as any)
    ? (rawBorder as BorderStyle)
    : 'default';
  return {
    ...defaultTheme,
    ...saved,
    borderStyle: safeBorderStyle,
    visualizer: { ...defaultVisualizer, ...(saved.visualizer ?? {}), style: safeStyle },
    liveliness: { ...defaultLiveliness, ...(saved.liveliness ?? {}) },
  };
}

function loadTheme(): ThemeConfig {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (!raw) return defaultTheme;
    return mergeTheme(JSON.parse(raw));
  } catch {
    return defaultTheme;
  }
}

export async function restoreThemeFromDisk() {
  const persisted = await loadPersistentData<Partial<ThemeConfig>>('app_theme');
  if (!persisted) return;
  if (localStorage.getItem(THEME_KEY)) return; // localStorage already has data
  const theme = mergeTheme(persisted);
  localStorage.setItem(THEME_KEY, JSON.stringify(theme));
  useThemeStore.setState({ theme });
  useThemeStore.getState().applyTheme();
}

function saveTheme(theme: ThemeConfig) {
  localStorage.setItem(THEME_KEY, JSON.stringify(theme));
  savePersistentData('app_theme', theme).catch(() => {});
}

// RGB triplet values for each accent color (all 10 shades)
const accentPalettes: Record<string, Record<string, string>> = {
  blue: {
    50: '239 246 255', 100: '219 234 254', 200: '191 219 254', 300: '147 197 253',
    400: '96 165 250', 500: '59 130 246', 600: '37 99 235', 700: '29 78 216',
    800: '30 64 175', 900: '30 58 138',
  },
  purple: {
    50: '250 245 255', 100: '243 232 255', 200: '233 213 255', 300: '216 180 254',
    400: '192 132 252', 500: '168 85 247', 600: '147 51 234', 700: '126 34 206',
    800: '107 33 168', 900: '88 28 135',
  },
  green: {
    50: '240 253 244', 100: '220 252 231', 200: '187 247 208', 300: '134 239 172',
    400: '74 222 128', 500: '34 197 94', 600: '22 163 74', 700: '21 128 61',
    800: '22 101 52', 900: '20 83 45',
  },
  rose: {
    50: '255 241 242', 100: '255 228 230', 200: '254 205 211', 300: '253 164 175',
    400: '251 113 133', 500: '244 63 94', 600: '225 29 72', 700: '190 18 60',
    800: '159 18 57', 900: '136 19 55',
  },
  amber: {
    50: '255 251 235', 100: '254 243 199', 200: '253 230 138', 300: '252 211 77',
    400: '251 191 36', 500: '245 158 11', 600: '217 119 6', 700: '180 83 9',
    800: '146 64 14', 900: '120 53 15',
  },
  cyan: {
    50: '236 254 255', 100: '207 250 254', 200: '165 243 252', 300: '103 232 249',
    400: '34 211 238', 500: '6 182 212', 600: '8 145 178', 700: '14 116 144',
    800: '21 94 117', 900: '22 78 99',
  },
};

// Surface palettes for each theme mode (RGB triplets)
const surfacePalettes: Record<string, Record<string, string>> = {
  dark: {
    50: '248 250 252', 100: '241 245 249', 200: '226 232 240', 300: '203 213 225',
    400: '148 163 184', 500: '100 116 139', 600: '71 85 105', 700: '51 65 85',
    800: '30 41 59', 850: '23 32 51', 900: '15 23 42', 950: '2 6 23',
  },
  midnight: {
    50: '240 240 255', 100: '224 224 250', 200: '200 200 240', 300: '170 170 220',
    400: '140 140 190', 500: '100 100 150', 600: '70 70 120', 700: '45 45 90',
    800: '30 30 70', 850: '20 20 55', 900: '17 17 40', 950: '10 10 26',
  },
  oled: {
    50: '245 245 245', 100: '235 235 235', 200: '210 210 210', 300: '180 180 180',
    400: '140 140 140', 500: '100 100 100', 600: '70 70 70', 700: '40 40 40',
    800: '22 22 22', 850: '15 15 15', 900: '10 10 10', 950: '0 0 0',
  },
  light: {
    50: '2 6 23', 100: '15 23 42', 200: '30 41 59', 300: '51 65 85',
    400: '71 85 105', 500: '100 116 139', 600: '148 163 184', 700: '203 213 225',
    800: '226 232 240', 850: '234 239 245', 900: '241 245 249', 950: '248 250 252',
  },
};

interface ThemeState {
  theme: ThemeConfig;
  setMode: (mode: ThemeConfig['mode']) => void;
  setAccentColor: (color: ThemeConfig['accentColor']) => void;
  setCustomCSS: (css: string) => void;
  setFontSize: (size: ThemeConfig['fontSize']) => void;
  setSidebarWidth: (width: ThemeConfig['sidebarWidth']) => void;
  setBorderRadius: (radius: ThemeConfig['borderRadius']) => void;
  setBorderStyle: (style: ThemeConfig['borderStyle']) => void;
  setLiveliness: (patch: Partial<LivelinessConfig>) => void;
  setAnimationSpeed: (speed: ThemeConfig['animationSpeed']) => void;
  setVrMode: (on: boolean) => void;
  setVrZoom: (zoom: number) => void;
  setGlassEffect: (effect: ThemeConfig['glassEffect']) => void;
  setPremiumTheme: (theme: ThemeConfig['premiumTheme']) => void;
  setVisualizer: (patch: Partial<VisualizerConfig>) => void;
  applyTheme: () => void;
  resetTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: loadTheme(),

  setMode: (mode) => {
    const theme = { ...get().theme, mode };
    saveTheme(theme);
    set({ theme });
    get().applyTheme();
  },

  setAccentColor: (accentColor) => {
    const theme = { ...get().theme, accentColor };
    saveTheme(theme);
    set({ theme });
    get().applyTheme();
  },

  setCustomCSS: (customCSS) => {
    const theme = { ...get().theme, customCSS };
    saveTheme(theme);
    set({ theme });
    get().applyTheme();
  },

  setFontSize: (fontSize) => {
    const theme = { ...get().theme, fontSize };
    saveTheme(theme);
    set({ theme });
    get().applyTheme();
  },

  setSidebarWidth: (sidebarWidth) => {
    const theme = { ...get().theme, sidebarWidth };
    saveTheme(theme);
    set({ theme });
    get().applyTheme();
  },

  setBorderRadius: (borderRadius) => {
    const theme = { ...get().theme, borderRadius };
    saveTheme(theme);
    set({ theme });
    get().applyTheme();
  },

  setBorderStyle: (borderStyle) => {
    const theme = { ...get().theme, borderStyle };
    saveTheme(theme);
    set({ theme });
    get().applyTheme();
  },

  setLiveliness: (patch) => {
    const theme = { ...get().theme, liveliness: { ...get().theme.liveliness, ...patch } };
    saveTheme(theme);
    set({ theme });
    get().applyTheme();
  },

  setVrMode: (vrMode) => {
    const theme = { ...get().theme, vrMode };
    saveTheme(theme);
    set({ theme });
    get().applyTheme();
  },

  setVrZoom: (zoom) => {
    const vrZoom = Math.max(1, Math.min(2.2, Math.round(zoom * 20) / 20));
    const theme = { ...get().theme, vrZoom };
    saveTheme(theme);
    set({ theme });
    get().applyTheme();
  },

  setAnimationSpeed: (animationSpeed) => {
    const theme = { ...get().theme, animationSpeed };
    saveTheme(theme);
    set({ theme });
    get().applyTheme();
  },

  setGlassEffect: (glassEffect) => {
    const theme = { ...get().theme, glassEffect };
    saveTheme(theme);
    set({ theme });
    get().applyTheme();
  },

  setPremiumTheme: (premiumTheme) => {
    const theme = { ...get().theme, premiumTheme };
    saveTheme(theme);
    set({ theme });
    get().applyTheme();
  },

  setVisualizer: (patch) => {
    const theme = { ...get().theme, visualizer: { ...get().theme.visualizer, ...patch } };
    saveTheme(theme);
    set({ theme });
  },

  applyTheme: () => {
    const { theme } = get();
    const root = document.documentElement;

    // Apply accent color palette
    const accent = accentPalettes[theme.accentColor] || accentPalettes.blue;
    for (const [shade, rgb] of Object.entries(accent)) {
      root.style.setProperty(`--accent-${shade}`, rgb);
    }

    // Apply surface color palette based on mode
    const surface = surfacePalettes[theme.mode] || surfacePalettes.dark;
    for (const [shade, rgb] of Object.entries(surface)) {
      root.style.setProperty(`--surface-${shade}`, rgb);
    }

    // Font size
    root.classList.remove('text-sm', 'text-base', 'text-lg');
    const fontClass = theme.fontSize === 'small' ? 'text-sm' : theme.fontSize === 'large' ? 'text-lg' : 'text-base';
    root.classList.add(fontClass);

    // Border radius
    const radiusMap: Record<string, string> = { sharp: '0px', rounded: '8px', pill: '16px' };
    root.style.setProperty('--radius-base', radiusMap[theme.borderRadius ?? 'rounded']);

    // Border style (animated border themes)
    const allBorderStyles: BorderStyle[] = [
      'default', 'rainbow', 'neon', 'pulse', 'holographic', 'flame', 'shimmer', 'cyber',
    ];
    for (const s of allBorderStyles) root.classList.remove(`border-theme-${s}`);
    const bs: BorderStyle = (theme.borderStyle ?? 'default');
    if (bs !== 'default') root.classList.add(`border-theme-${bs}`);

    // VR mode. The zoom is Chromium's own, applied in the main process,
    // because it reflows the layout and scales absolute pixel sizes — the app
    // has a few hundred hard-coded 10 and 11 pixel labels that a rem-based
    // scale would leave unreadable at VR distance. The class carries
    // everything else: contrast, hit targets, always-visible controls.
    const vr = !!theme.vrMode;
    root.classList.toggle('vr-mode', vr);
    const zoom = vr ? (theme.vrZoom ?? 1.4) : 1;
    window.electronAPI?.setZoom?.(zoom).catch(() => { /* browser dev mode */ });

    // Liveliness toggles — each maps to a single class on <html>
    const live = theme.liveliness ?? defaultLiveliness;
    // particles + ambientHaze are rendered as real elements by
    // <LivelinessEffects />; the rest are pure-CSS classes on <html>.
    root.classList.toggle('live-cursor-glow', !!live.cursorGlow);
    root.classList.toggle('live-hover-lift',  !!live.hoverLift);
    root.classList.toggle('live-status-pulse', !!live.statusPulse);

    // Animation speed
    const durationMap: Record<string, string> = { none: '0ms', subtle: '100ms', normal: '200ms' };
    root.style.setProperty('--transition-duration', durationMap[theme.animationSpeed ?? 'normal']);

    // Glass effect opacity
    const glassMap: Record<string, string> = { none: '1', light: '0.85', medium: '0.7' };
    const glassSolidMap: Record<string, string> = { none: '1', light: '0.93', medium: '0.85' };
    root.style.setProperty('--glass-opacity', glassMap[theme.glassEffect ?? 'medium']);
    root.style.setProperty('--glass-opacity-solid', glassSolidMap[theme.glassEffect ?? 'medium']);

    // Premium theme — CSS class only for CSS-based overlays (not canvas-based ones like asteroids)
    root.classList.remove(
      'premium-iridescent', 'premium-holographic', 'premium-aurora',
      'premium-cosmic', 'premium-synthwave', 'premium-hacker', 'premium-guardian',
    );
    const cssPremiums = ['iridescent', 'holographic', 'aurora', 'cosmic', 'synthwave', 'hacker', 'guardian'];
    const premium = visiblePremiumTheme(theme.premiumTheme, vr);
    if (premium && cssPremiums.includes(premium)) {
      root.classList.add(`premium-${premium}`);
    }

    // Light mode: adjust body text color
    if (theme.mode === 'light') {
      document.body.style.color = '#1e293b';
    } else {
      document.body.style.color = '';
    }

    // Custom CSS
    let customStyle = document.getElementById('vrcstudio-custom-css');
    if (!customStyle) {
      customStyle = document.createElement('style');
      customStyle.id = 'vrcstudio-custom-css';
      document.head.appendChild(customStyle);
    }
    customStyle.textContent = theme.customCSS;
  },

  resetTheme: () => {
    saveTheme(defaultTheme);
    set({ theme: defaultTheme });
    get().applyTheme();
  },
}));
