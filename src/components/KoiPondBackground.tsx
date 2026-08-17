// "Koi Pond" premium theme — the second interactive background alongside
// Asteroids. Where Asteroids plays itself until you take the wheel, this one
// responds to you continuously: koi shy away from the cursor, your pointer
// drags a wake across the surface, and clicking anywhere drops food that the
// nearest fish race each other to.
//
// All input comes from window listeners, so the canvas keeps
// pointer-events: none and never intercepts a click meant for the UI.

import { useEffect, useRef } from 'react';
import { useThemeStore } from '../stores/themeStore';

interface Koi {
  x: number; y: number;
  angle: number;
  speed: number;
  baseSpeed: number;
  len: number;          // body length in px
  hue: number;          // 0 = classic white/red, 1 = golden, 2 = dark
  wobble: number;       // tail phase
  wobbleRate: number;
  turnBias: number;     // gentle individual drift so they don't move as one
}

interface Ripple { x: number; y: number; r: number; maxR: number; life: number; }
interface Food   { x: number; y: number; life: number; bob: number; }

interface PondState {
  koi: Koi[];
  ripples: Ripple[];
  food: Food[];
  mouse: { x: number; y: number; active: boolean; lastRippleAt: number };
  t: number;
}

const KOI_COUNT     = 9;
const FLEE_RADIUS   = 130;
const FOOD_RADIUS   = 460;
const FOOD_LIFE     = 620;
const MAX_FOOD      = 14;
const TURN_RATE     = 0.045;

const PALETTES = [
  { body: '255,255,255', spot: '255,96,66'  },  // kohaku — white with red
  { body: '255,204,110', spot: '255,132,48' },  // yamabuki — gold
  { body: '168,198,240', spot: '70,96,160'  },  // asagi — pale blue
];

function rand(a: number, b: number) { return a + Math.random() * (b - a); }

function makeKoi(W: number, H: number): Koi {
  const len = rand(34, 58);
  const baseSpeed = rand(0.28, 0.62);
  return {
    x: rand(0, W), y: rand(0, H),
    angle: rand(0, Math.PI * 2),
    speed: baseSpeed, baseSpeed,
    len,
    hue: Math.floor(rand(0, PALETTES.length)),
    wobble: rand(0, Math.PI * 2),
    wobbleRate: rand(0.11, 0.17),
    turnBias: rand(-0.004, 0.004),
  };
}

function initState(W: number, H: number): PondState {
  return {
    koi: Array.from({ length: KOI_COUNT }, () => makeKoi(W, H)),
    ripples: [],
    food: [],
    mouse: { x: -9999, y: -9999, active: false, lastRippleAt: 0 },
    t: 0,
  };
}

/** Shortest signed angle from a to b. */
function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function update(st: PondState, W: number, H: number) {
  st.t++;

  for (const k of st.koi) {
    let desired: number | null = null;
    let urgency = 1;

    // Nearest food wins — that's the whole game of a koi pond.
    let best: Food | null = null;
    let bestD = Infinity;
    for (const f of st.food) {
      const d = Math.hypot(f.x - k.x, f.y - k.y);
      if (d < FOOD_RADIUS && d < bestD) { bestD = d; best = f; }
    }
    if (best) {
      desired = Math.atan2(best.y - k.y, best.x - k.x);
      urgency = 2.1;
      if (bestD < 14) {
        best.life = 0;
        st.ripples.push({ x: best.x, y: best.y, r: 2, maxR: 34, life: 1 });
      }
    }

    // The cursor is a heron as far as they're concerned.
    if (st.mouse.active) {
      const dx = k.x - st.mouse.x;
      const dy = k.y - st.mouse.y;
      const d = Math.hypot(dx, dy);
      if (d < FLEE_RADIUS) {
        desired = Math.atan2(dy, dx);
        urgency = 2.6 * (1 - d / FLEE_RADIUS) + 1;
      }
    }

    // Steer away from the edges before they reach them.
    const margin = 70;
    if (k.x < margin)       desired = 0;
    else if (k.x > W - margin) desired = Math.PI;
    else if (k.y < margin)  desired = Math.PI / 2;
    else if (k.y > H - margin) desired = -Math.PI / 2;

    if (desired !== null) {
      k.angle += Math.max(-TURN_RATE * urgency, Math.min(TURN_RATE * urgency, angleDelta(k.angle, desired)));
      k.speed += (k.baseSpeed * urgency - k.speed) * 0.05;
    } else {
      // Idle drift: a slow meander rather than straight lines.
      k.angle += Math.sin(st.t * 0.006 + k.wobble) * 0.006 + k.turnBias;
      k.speed += (k.baseSpeed - k.speed) * 0.03;
    }

    k.x += Math.cos(k.angle) * k.speed;
    k.y += Math.sin(k.angle) * k.speed;
    k.wobble += k.wobbleRate * (0.6 + k.speed);

    // Occasional surface ripple from a fish near the top of the water.
    if (Math.random() < 0.0016) {
      st.ripples.push({ x: k.x, y: k.y, r: 1, maxR: rand(18, 40), life: 1 });
    }
  }

  for (const f of st.food) { f.life--; f.bob += 0.06; }
  st.food = st.food.filter(f => f.life > 0);

  for (const r of st.ripples) {
    r.r += (r.maxR - r.r) * 0.045;
    r.life -= 0.012;
  }
  st.ripples = st.ripples.filter(r => r.life > 0);
}

function drawKoi(ctx: CanvasRenderingContext2D, k: Koi) {
  const pal = PALETTES[k.hue];
  ctx.save();
  ctx.translate(k.x, k.y);
  ctx.rotate(k.angle);

  const L = k.len;
  const Wd = L * 0.34;
  const tail = Math.sin(k.wobble) * (L * 0.22);

  // Body — a teardrop that bends with the tail beat.
  ctx.beginPath();
  ctx.moveTo(L * 0.5, 0);
  ctx.quadraticCurveTo(L * 0.1, -Wd, -L * 0.28, -Wd * 0.5 + tail * 0.4);
  ctx.quadraticCurveTo(-L * 0.45, tail * 0.6, -L * 0.5, tail);
  ctx.quadraticCurveTo(-L * 0.45, tail * 0.6, -L * 0.28, Wd * 0.5 + tail * 0.4);
  ctx.quadraticCurveTo(L * 0.1, Wd, L * 0.5, 0);
  ctx.closePath();
  ctx.fillStyle = `rgba(${pal.body},0.92)`;
  ctx.fill();

  // Markings.
  ctx.beginPath();
  ctx.ellipse(L * 0.12, 0, L * 0.17, Wd * 0.52, 0, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${pal.spot},0.95)`;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-L * 0.16, -Wd * 0.16, L * 0.1, Wd * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Tail fin.
  ctx.beginPath();
  ctx.moveTo(-L * 0.46, tail * 0.9);
  ctx.lineTo(-L * 0.82, tail * 1.5 - Wd * 0.5);
  ctx.lineTo(-L * 0.72, tail * 1.2);
  ctx.lineTo(-L * 0.82, tail * 1.5 + Wd * 0.5);
  ctx.closePath();
  ctx.fillStyle = `rgba(${pal.body},0.5)`;
  ctx.fill();

  ctx.restore();
}

export default function KoiPondBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<PondState | null>(null);
  const rafRef = useRef<number>();
  const accentColor = useThemeStore(s => s.theme.accentColor);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const accentMap: Record<string, string> = {
      blue: '96,165,250', purple: '192,132,252', green: '74,222,128',
      rose: '251,113,133', amber: '251,191,36',  cyan: '34,211,238',
    };
    const accent = accentMap[accentColor] ?? accentMap.blue;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (!stateRef.current) stateRef.current = initState(canvas.width, canvas.height);
    };
    resize();

    const onMove = (e: MouseEvent) => {
      const st = stateRef.current;
      if (!st) return;
      st.mouse.x = e.clientX;
      st.mouse.y = e.clientY;
      st.mouse.active = true;
      // A wake behind the pointer, rate-limited so it stays a trail.
      if (st.t - st.mouse.lastRippleAt > 9) {
        st.mouse.lastRippleAt = st.t;
        st.ripples.push({ x: e.clientX, y: e.clientY, r: 1, maxR: 26, life: 0.55 });
      }
    };
    const onLeave = () => { if (stateRef.current) stateRef.current.mouse.active = false; };
    const onClick = (e: MouseEvent) => {
      const st = stateRef.current;
      if (!st) return;
      st.food.push({ x: e.clientX, y: e.clientY, life: FOOD_LIFE, bob: Math.random() * 6 });
      if (st.food.length > MAX_FOOD) st.food.shift();
      st.ripples.push({ x: e.clientX, y: e.clientY, r: 2, maxR: 70, life: 1 });
    };

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseout', onLeave);
    window.addEventListener('click', onClick);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const W = canvas.width, H = canvas.height;
      const st = stateRef.current;
      if (!st) return;

      update(st, W, H);
      ctx.clearRect(0, 0, W, H);

      // Water: slow accent-tinted caustics so the pond has depth.
      const drift = st.t * 0.0006;
      for (let i = 0; i < 3; i++) {
        const g = ctx.createRadialGradient(
          W * (0.3 + 0.4 * Math.sin(drift + i * 2.1)),
          H * (0.4 + 0.3 * Math.cos(drift * 1.3 + i)),
          0,
          W * (0.3 + 0.4 * Math.sin(drift + i * 2.1)),
          H * (0.4 + 0.3 * Math.cos(drift * 1.3 + i)),
          Math.max(W, H) * 0.45,
        );
        g.addColorStop(0, `rgba(${accent},0.09)`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }

      // Ripples.
      for (const r of st.ripples) {
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${(r.life * 0.42).toFixed(3)})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // Food pellets, bobbing on the surface.
      for (const f of st.food) {
        const fade = Math.min(1, f.life / 90);
        ctx.beginPath();
        const fy = f.y + Math.sin(f.bob) * 1.6;
        ctx.arc(f.x, fy, 3.1, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,222,150,${(0.95 * fade).toFixed(2)})`;
        ctx.shadowColor = 'rgba(255,200,110,0.9)';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Koi.
      for (const k of st.koi) drawKoi(ctx, k);
    };

    draw();
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseout', onLeave);
      window.removeEventListener('click', onClick);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [accentColor]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed', inset: 0, width: '100%', height: '100%',
        zIndex: 0, pointerEvents: 'none', mixBlendMode: 'screen', opacity: 0.62,
      }}
      aria-hidden="true"
    />
  );
}
