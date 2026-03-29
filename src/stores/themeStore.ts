import { create } from 'zustand';
import type { UserStatus } from '../types/vrchat';

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

const accentColors: Record<string, { 500: string; 600: string; 400: string }> = {
  blue: { 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb' },
  purple: { 400: '#c084fc', 500: '#a855f7', 600: '#9333ea' },
  green: { 400: '#4ade80', 500: '#22c55e', 600: '#16a34a' },
  rose: { 400: '#fb7185', 500: '#f43f5e', 600: '#e11d48' },
  amber: { 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706' },
  cyan: { 400: '#22d3ee', 500: '#06b6d4', 600: '#0891b2' },
};

const modeStyles: Record<string, { bg: string; surface900: string; surface800: string; surface950: string }> = {
  dark: { bg: '#020617', surface900: '#0f172a', surface800: '#1e293b', surface950: '#020617' },
  light: { bg: '#f8fafc', surface900: '#ffffff', surface800: '#f1f5f9', surface950: '#f8fafc' },
  midnight: { bg: '#0a0a1a', surface900: '#111128', surface800: '#1a1a3e', surface950: '#0a0a1a' },
  oled: { bg: '#000000', surface900: '#0a0a0a', surface800: '#141414', surface950: '#000000' },
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
    const accent = accentColors[theme.accentColor] || accentColors.blue;
    const mode = modeStyles[theme.mode] || modeStyles.dark;

    root.style.setProperty('--accent-400', accent[400]);
    root.style.setProperty('--accent-500', accent[500]);
    root.style.setProperty('--accent-600', accent[600]);
    root.style.setProperty('--surface-bg', mode.bg);
    root.style.setProperty('--surface-900', mode.surface900);
    root.style.setProperty('--surface-800', mode.surface800);
    root.style.setProperty('--surface-950', mode.surface950);

    root.classList.remove('theme-dark', 'theme-light', 'theme-midnight', 'theme-oled');
    root.classList.add(`theme-${theme.mode}`);

    root.classList.remove('text-sm', 'text-base', 'text-lg');
    const fontClass = theme.fontSize === 'small' ? 'text-sm' : theme.fontSize === 'large' ? 'text-lg' : 'text-base';
    root.classList.add(fontClass);

    // Apply custom CSS
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
