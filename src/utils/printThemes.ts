/**
 * Print theme definitions and utilities
 * Provides preset themes and custom theme management
 */

export interface TextStyle {
  fontFamily: 'sans-serif' | 'serif' | 'monospace' | 'handwriting';
  fontSize: number;
  fontWeight: 'light' | 'regular' | 'bold';
  color: string;
  alignment: 'left' | 'center' | 'right';
}

export interface PrintTheme {
  id: string;
  name: string;
  style: 'classic' | 'polaroid' | 'minimal' | 'strip' | 'custom';

  // Text styles
  usernameStyle: TextStyle;
  dateStyle: TextStyle;
  worldStyle: TextStyle;
  customStyle: TextStyle;

  // Background & Border
  backgroundColor: string;
  backgroundGradient?: {
    enabled: boolean;
    type: 'linear' | 'radial';
    angle: number;
    color1: string;
    color2: string;
  };
  borderWidth: number;
  borderColor: string;
  borderStyle: 'solid' | 'dashed' | 'double' | 'rounded';
  borderRadius: number;

  // Effects
  shadowEnabled: boolean;
  shadowBlur: number;
  shadowColor: string;
  shadowOffset: { x: number; y: number };
  vignette: number; // 0-100
  padding: number;
}

export const DEFAULT_PRINT_THEME: PrintTheme = {
  id: 'classic',
  name: 'Classic',
  style: 'classic',
  usernameStyle: { fontFamily: 'sans-serif', fontSize: 24, fontWeight: 'bold', color: '#ffffff', alignment: 'left' },
  dateStyle: { fontFamily: 'sans-serif', fontSize: 14, fontWeight: 'regular', color: '#cccccc', alignment: 'left' },
  worldStyle: { fontFamily: 'sans-serif', fontSize: 16, fontWeight: 'bold', color: '#ffffff', alignment: 'left' },
  customStyle: { fontFamily: 'sans-serif', fontSize: 18, fontWeight: 'regular', color: '#ffffff', alignment: 'left' },
  backgroundColor: 'transparent',
  borderWidth: 0,
  borderColor: '#ffffff',
  borderStyle: 'solid',
  borderRadius: 0,
  shadowEnabled: true,
  shadowBlur: 20,
  shadowColor: 'rgba(0,0,0,0.4)',
  shadowOffset: { x: 0, y: 5 },
  vignette: 0,
  padding: 16,
};

export const PRESET_THEMES: Record<string, PrintTheme> = {
  classic: {
    ...DEFAULT_PRINT_THEME,
    id: 'classic',
    name: 'Classic',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    shadowEnabled: true,
  },
  polaroid: {
    ...DEFAULT_PRINT_THEME,
    id: 'polaroid',
    name: 'Polaroid',
    style: 'polaroid',
    backgroundColor: '#ffffff',
    usernameStyle: { ...DEFAULT_PRINT_THEME.usernameStyle, color: '#333333', fontSize: 16 },
    dateStyle: { ...DEFAULT_PRINT_THEME.dateStyle, color: '#666666', fontSize: 12 },
    worldStyle: { ...DEFAULT_PRINT_THEME.worldStyle, color: '#333333', fontSize: 14 },
    shadowEnabled: true,
    shadowBlur: 20,
    padding: 40,
  },
  minimal: {
    ...DEFAULT_PRINT_THEME,
    id: 'minimal',
    name: 'Minimal',
    style: 'minimal',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    usernameStyle: { fontFamily: 'monospace', fontSize: 14, fontWeight: 'regular', color: '#ffffff', alignment: 'left' },
    dateStyle: { fontFamily: 'monospace', fontSize: 12, fontWeight: 'regular', color: '#ffffff', alignment: 'left' },
    shadowEnabled: false,
    padding: 8,
  },
  strip: {
    ...DEFAULT_PRINT_THEME,
    id: 'strip',
    name: 'Strip',
    style: 'strip',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    usernameStyle: { fontFamily: 'sans-serif', fontSize: 16, fontWeight: 'regular', color: '#ffffff', alignment: 'center' },
    dateStyle: { fontFamily: 'sans-serif', fontSize: 12, fontWeight: 'regular', color: '#ffffff', alignment: 'center' },
    shadowEnabled: false,
    padding: 20,
  },
  retro: {
    ...DEFAULT_PRINT_THEME,
    id: 'retro',
    name: 'Retro',
    style: 'custom',
    backgroundColor: '#f4a460',
    usernameStyle: { fontFamily: 'handwriting', fontSize: 28, fontWeight: 'bold', color: '#8B4513', alignment: 'center' },
    dateStyle: { fontFamily: 'serif', fontSize: 14, fontWeight: 'regular', color: '#654321', alignment: 'center' },
    worldStyle: { fontFamily: 'serif', fontSize: 18, fontWeight: 'bold', color: '#8B4513', alignment: 'center' },
    borderWidth: 4,
    borderColor: '#8B4513',
    borderStyle: 'solid',
    shadowEnabled: true,
    vignette: 20,
    padding: 20,
  },
  modern: {
    ...DEFAULT_PRINT_THEME,
    id: 'modern',
    name: 'Modern',
    style: 'custom',
    backgroundColor: '#1a1a2e',
    usernameStyle: { fontFamily: 'sans-serif', fontSize: 26, fontWeight: 'bold', color: '#00d4ff', alignment: 'left' },
    dateStyle: { fontFamily: 'sans-serif', fontSize: 12, fontWeight: 'regular', color: '#888888', alignment: 'left' },
    worldStyle: { fontFamily: 'sans-serif', fontSize: 16, fontWeight: 'bold', color: '#00d4ff', alignment: 'left' },
    borderWidth: 2,
    borderColor: '#00d4ff',
    borderStyle: 'solid',
    borderRadius: 8,
    shadowEnabled: false,
    padding: 16,
    backgroundGradient: {
      enabled: true,
      type: 'linear',
      angle: 45,
      color1: '#1a1a2e',
      color2: '#16213e',
    },
  },
  neon: {
    ...DEFAULT_PRINT_THEME,
    id: 'neon',
    name: 'Neon',
    style: 'custom',
    backgroundColor: '#0a0e27',
    usernameStyle: { fontFamily: 'sans-serif', fontSize: 28, fontWeight: 'bold', color: '#ff006e', alignment: 'center' },
    dateStyle: { fontFamily: 'sans-serif', fontSize: 12, fontWeight: 'regular', color: '#00f5ff', alignment: 'center' },
    worldStyle: { fontFamily: 'sans-serif', fontSize: 18, fontWeight: 'bold', color: '#ffbe0b', alignment: 'center' },
    borderWidth: 3,
    borderColor: '#ff006e',
    borderStyle: 'solid',
    borderRadius: 0,
    shadowEnabled: true,
    shadowBlur: 30,
    shadowColor: 'rgba(255, 0, 110, 0.5)',
    padding: 16,
  },
  gradient: {
    ...DEFAULT_PRINT_THEME,
    id: 'gradient',
    name: 'Gradient',
    style: 'custom',
    backgroundColor: '#667eea',
    usernameStyle: { fontFamily: 'sans-serif', fontSize: 26, fontWeight: 'bold', color: '#ffffff', alignment: 'left' },
    dateStyle: { fontFamily: 'sans-serif', fontSize: 12, fontWeight: 'regular', color: '#e0e0e0', alignment: 'left' },
    worldStyle: { fontFamily: 'sans-serif', fontSize: 16, fontWeight: 'bold', color: '#ffffff', alignment: 'left' },
    borderWidth: 0,
    shadowEnabled: false,
    padding: 24,
    backgroundGradient: {
      enabled: true,
      type: 'linear',
      angle: 135,
      color1: '#667eea',
      color2: '#764ba2',
    },
  },
};

/**
 * Get a theme by ID
 */
export function getTheme(themeId: string): PrintTheme {
  return PRESET_THEMES[themeId] || DEFAULT_PRINT_THEME;
}

/**
 * Get all available theme names
 */
export function getThemeNames(): Array<{ id: string; name: string }> {
  return Object.entries(PRESET_THEMES).map(([id, theme]) => ({
    id,
    name: theme.name,
  }));
}

/**
 * Apply theme settings to canvas context
 */
export function applyThemeToCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  theme: PrintTheme
) {
  // Apply background
  if (theme.backgroundGradient?.enabled) {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, theme.backgroundGradient.color1);
    gradient.addColorStop(1, theme.backgroundGradient.color2);
    ctx.fillStyle = gradient;
  } else {
    ctx.fillStyle = theme.backgroundColor;
  }
  ctx.fillRect(0, 0, width, height);

  // Apply vignette
  if (theme.vignette > 0) {
    const vignetteGradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height));
    vignetteGradient.addColorStop(0, 'rgba(0,0,0,0)');
    vignetteGradient.addColorStop(1, `rgba(0,0,0,${theme.vignette / 100})`);
    ctx.fillStyle = vignetteGradient;
    ctx.fillRect(0, 0, width, height);
  }

  // Apply shadow if enabled
  if (theme.shadowEnabled) {
    ctx.shadowColor = theme.shadowColor;
    ctx.shadowBlur = theme.shadowBlur;
    ctx.shadowOffsetX = theme.shadowOffset.x;
    ctx.shadowOffsetY = theme.shadowOffset.y;
  } else {
    ctx.shadowColor = 'transparent';
  }

  // Apply border
  if (theme.borderWidth > 0) {
    ctx.strokeStyle = theme.borderColor;
    ctx.lineWidth = theme.borderWidth;
    if (theme.borderStyle === 'dashed') {
      ctx.setLineDash([5, 5]);
    } else if (theme.borderStyle === 'double') {
      ctx.lineWidth = theme.borderWidth / 3;
    }

    const x = theme.borderWidth / 2;
    const y = theme.borderWidth / 2;
    const w = width - theme.borderWidth;
    const h = height - theme.borderWidth;
    const r = theme.borderRadius;

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    if (r > 0) {
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    }
    ctx.lineTo(x + w, y + h - r);
    if (r > 0) {
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    }
    ctx.lineTo(x + r, y + h);
    if (r > 0) {
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    }
    ctx.lineTo(x, y + r);
    if (r > 0) {
      ctx.quadraticCurveTo(x, y, x + r, y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/**
 * Get font string for canvas context
 */
export function getFontString(style: TextStyle): string {
  const weights: Record<string, string> = {
    light: '300',
    regular: '400',
    bold: '700',
  };
  const families: Record<string, string> = {
    'sans-serif': '"Segoe UI", sans-serif',
    serif: 'Georgia, serif',
    monospace: '"Courier New", monospace',
    handwriting: '"Comic Sans MS", cursive',
  };
  return `${weights[style.fontWeight]} ${style.fontSize}px ${families[style.fontFamily]}`;
}
