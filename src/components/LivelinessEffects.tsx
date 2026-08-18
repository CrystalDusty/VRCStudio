// Lightweight "make the app feel alive" effects.
//
// Two things to wire up from JS:
//   1. Floating particles — a tiny canvas behind the UI shell.
//   2. Cursor glow position — push pointer coords to a CSS variable so
//      the ::after on <html> can follow without re-rendering React.
//
// All other liveliness effects (hover lift, status pulse, ambient haze)
// are pure CSS, driven by `html.live-*` classes set in themeStore.

import { useEffect, useRef } from 'react';
import { useThemeStore } from '../stores/themeStore';

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  r: number;
  alpha: number;
}

export default function LivelinessEffects() {
  const liveliness = useThemeStore(s => s.theme.liveliness);
  const accentColor = useThemeStore(s => s.theme.accentColor);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);

  // ── Cursor-glow position tracker ──────────────────────────────────
  useEffect(() => {
    if (!liveliness.cursorGlow) return;
    const onMove = (e: PointerEvent) => {
      document.documentElement.style.setProperty('--cursor-x', `${e.clientX}px`);
      document.documentElement.style.setProperty('--cursor-y', `${e.clientY}px`);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.documentElement.style.removeProperty('--cursor-x');
      document.documentElement.style.removeProperty('--cursor-y');
    };
  }, [liveliness.cursorGlow]);

  // ── Particles canvas ─────────────────────────────────────────────
  useEffect(() => {
    if (!liveliness.particles) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0, height = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // Seed: ~40 dots, slow drift. Cheap enough to run on any GPU.
    const count = 42;
    particlesRef.current = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.18,
      r: 0.6 + Math.random() * 1.6,
      alpha: 0.18 + Math.random() * 0.38,
    }));

    // Pull the live accent shade out of CSS so particles match theme.
    const readAccent = () => {
      const rgb = getComputedStyle(document.documentElement)
        .getPropertyValue('--accent-400')
        .trim() || '96 165 250';
      return rgb;
    };
    let accentRgb = readAccent();

    let lastAccentCheck = 0;
    const tick = (t: number) => {
      // Re-read accent ~once per second in case the user changes it
      if (t - lastAccentCheck > 1000) {
        accentRgb = readAccent();
        lastAccentCheck = t;
      }

      ctx.clearRect(0, 0, width, height);

      for (const p of particlesRef.current) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -8) p.x = width + 8;
        if (p.x > width + 8) p.x = -8;
        if (p.y < -8) p.y = height + 8;
        if (p.y > height + 8) p.y = -8;

        ctx.beginPath();
        ctx.fillStyle = `rgba(${accentRgb.split(' ').join(',')}, ${p.alpha})`;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [liveliness.particles, accentColor]);

  return (
    <>
      {liveliness.ambientHaze && <div className="live-haze-layer" aria-hidden />}
      {liveliness.particles && (
        <canvas ref={canvasRef} className="live-particles-canvas" aria-hidden />
      )}
    </>
  );
}
