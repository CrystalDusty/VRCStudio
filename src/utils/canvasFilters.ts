/**
 * Canvas-based image filtering functions
 * Used by the photo editor to apply effects in real-time
 */

export interface CanvasEditState {
  brightness: number; // 0-200 (100 = normal)
  contrast: number; // 0-200 (100 = normal)
  saturation: number; // 0-200 (100 = normal)
  filters: {
    grayscale: number; // 0-100
    sepia: number; // 0-100
    blur: number; // 0-20 (pixels)
    temperature: number; // -50 to 50 (cool to warm)
  };
  borderStyle: {
    width: number;
    color: string;
    style: 'solid' | 'dashed' | 'double' | 'rounded';
    radius: number;
  };
}

export const DEFAULT_EDIT_STATE: CanvasEditState = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  filters: {
    grayscale: 0,
    sepia: 0,
    blur: 0,
    temperature: 0,
  },
  borderStyle: {
    width: 0,
    color: '#ffffff',
    style: 'solid',
    radius: 0,
  },
};

/**
 * Apply image adjustments to canvas
 */
export function applyAdjustments(
  ctx: CanvasRenderingContext2D,
  brightness: number,
  contrast: number,
  saturation: number,
  width: number,
  height: number
) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Brightness & contrast adjustment
  const brightnessValue = (brightness - 100) / 100;
  const contrastValue = (contrast - 100) * 2.55;
  const saturationValue = (saturation - 100) / 100;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // Apply brightness
    r += brightnessValue * 100;
    g += brightnessValue * 100;
    b += brightnessValue * 100;

    // Apply contrast
    r = (r - 128) * (contrastValue / 255) + 128;
    g = (g - 128) * (contrastValue / 255) + 128;
    b = (b - 128) * (contrastValue / 255) + 128;

    // Apply saturation
    const gray = r * 0.299 + g * 0.587 + b * 0.114;
    r = Math.round(gray + (r - gray) * (1 + saturationValue));
    g = Math.round(gray + (g - gray) * (1 + saturationValue));
    b = Math.round(gray + (b - gray) * (1 + saturationValue));

    data[i] = Math.max(0, Math.min(255, r));
    data[i + 1] = Math.max(0, Math.min(255, g));
    data[i + 2] = Math.max(0, Math.min(255, b));
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Apply filter effects using CSS filters or imageData
 */
export function applyFilters(
  ctx: CanvasRenderingContext2D,
  grayscale: number,
  sepia: number,
  blur: number,
  temperature: number,
  width: number,
  height: number
) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // Apply grayscale
    if (grayscale > 0) {
      const gray = r * 0.299 + g * 0.587 + b * 0.114;
      const factor = grayscale / 100;
      r = Math.round(r * (1 - factor) + gray * factor);
      g = Math.round(g * (1 - factor) + gray * factor);
      b = Math.round(b * (1 - factor) + gray * factor);
    }

    // Apply sepia
    if (sepia > 0) {
      const factor = sepia / 100;
      const sr = Math.round((r * 0.393 + g * 0.769 + b * 0.189) * factor + r * (1 - factor));
      const sg = Math.round((r * 0.349 + g * 0.686 + b * 0.168) * factor + g * (1 - factor));
      const sb = Math.round((r * 0.272 + g * 0.534 + b * 0.131) * factor + b * (1 - factor));
      r = sr;
      g = sg;
      b = sb;
    }

    // Apply temperature (cool to warm)
    if (temperature !== 0) {
      const tempFactor = temperature / 100;
      if (temperature > 0) {
        // Warm: increase red, decrease blue
        r = Math.min(255, r + tempFactor * 50);
        b = Math.max(0, b - tempFactor * 50);
      } else {
        // Cool: decrease red, increase blue
        r = Math.max(0, r + tempFactor * 50);
        b = Math.min(255, b - tempFactor * 50);
      }
    }

    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }

  ctx.putImageData(imageData, 0, 0);

  // Apply blur as a canvas filter (more efficient)
  if (blur > 0) {
    ctx.filter = `blur(${blur}px)`;
  }
}

/**
 * Draw border/frame on canvas
 */
export function drawBorder(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  borderWidth: number,
  borderColor: string,
  borderStyle: 'solid' | 'dashed' | 'double' | 'rounded',
  radius: number
) {
  if (borderWidth === 0) return;

  ctx.strokeStyle = borderColor;
  ctx.lineWidth = borderWidth;

  if (borderStyle === 'dashed') {
    ctx.setLineDash([5, 5]);
  } else if (borderStyle === 'double') {
    ctx.lineWidth = borderWidth / 3;
  }

  const r = radius;
  const x = borderWidth / 2;
  const y = borderWidth / 2;
  const w = width - borderWidth;
  const h = height - borderWidth;

  // Draw rounded rectangle
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.stroke();

  if (borderStyle === 'double') {
    ctx.lineWidth = borderWidth / 3;
    ctx.beginPath();
    ctx.moveTo(x + borderWidth / 1.5 + r, y + borderWidth / 1.5);
    ctx.lineTo(x + w - borderWidth / 1.5 - r, y + borderWidth / 1.5);
    ctx.quadraticCurveTo(
      x + w - borderWidth / 1.5,
      y + borderWidth / 1.5,
      x + w - borderWidth / 1.5,
      y + borderWidth / 1.5 + r
    );
    ctx.stroke();
  }

  ctx.setLineDash([]);
}

/**
 * Preset filters for quick application
 */
export const PRESET_FILTERS = {
  grayscale: { name: 'Grayscale', state: { grayscale: 100, sepia: 0, blur: 0, temperature: 0 } },
  sepia: { name: 'Sepia', state: { grayscale: 0, sepia: 100, blur: 0, temperature: 0 } },
  cool: { name: 'Cool', state: { grayscale: 0, sepia: 0, blur: 0, temperature: -30 } },
  warm: { name: 'Warm', state: { grayscale: 0, sepia: 0, blur: 0, temperature: 30 } },
  vintage: {
    name: 'Vintage',
    state: { grayscale: 0, sepia: 50, blur: 0, temperature: 20 },
  },
  noir: { name: 'Noir', state: { grayscale: 100, sepia: 0, blur: 0, temperature: -50 } },
  neon: { name: 'Neon', state: { grayscale: 0, sepia: 0, blur: 0, temperature: 50 } },
  vibrant: { name: 'Vibrant', state: { grayscale: 0, sepia: 0, blur: 0, temperature: 0 } },
  soft: { name: 'Soft', state: { grayscale: 0, sepia: 0, blur: 2, temperature: 10 } },
  highcontrast: {
    name: 'High Contrast',
    state: { grayscale: 0, sepia: 0, blur: 0, temperature: 0 },
  },
} as const;
