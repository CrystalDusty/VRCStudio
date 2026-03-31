import { create } from 'zustand';

export interface ThemeConfig {
  mode: 'dark' | 'light' | 'midnight' | 'oled';
  accentColor: 'blue' | 'purple' | 'green' | 'rose' | 'amber' | 'cyan';
  customCSS: string;
  fontSize: 'small' | 'medium' | 'large';
  sidebarWidth: 'compact' | 'normal' | 'wide';
}

const THEME_KEY = 'vrcstudio_theme';

const defaultTheme: ThemeConfig = {
  mode: 'dark',
  accentColor: 'blue',
  customCSS: '',
  fontSize: 'medium',
  sidebarWidth: 'normal',
};

function loadTheme(): ThemeConfig {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    return raw ? { ...defaultTheme, ...JSON.parse(raw) } : defaultTheme;
  } catch {
    return defaultTheme;
  }
}

function saveTheme(theme: ThemeConfig) {
  localStorage.setItem(THEME_KEY, JSON.stringify(theme));
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
