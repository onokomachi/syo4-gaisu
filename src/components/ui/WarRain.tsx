/**
 * 戦争テーマ専用の背景：炎の戦場をかける騎士たちの動画（sensou）を最背面に流し、
 * その上に透明なcanvasで「火の粉（奥・中・手前の3層）」「たなびく煙」「足もとの炎の照り返し」
 * 「天から差す光条」「ときどき散る火花」を重ねて、動画だけでは出ない奥行きと熱気を足す。
 * theme === 'war' のときだけ描画し、それ以外のテーマでは動画を読み込みもしない。
 *
 * 軽さのための工夫:
 * - 動画は480p・音声なしに圧縮したWebM（約1MB）を優先し、非対応ブラウザだけMP4（約0.9MB）を読む。
 * - タブが裏に回ったら動画を止める。canvasは約30fpsに間引き、光の粒は事前に描いた画像を使い回す。
 * - 「視差効果を減らす」設定の端末では、静止画だけにしてアニメーションを止める。
 * - データセーバー／低速回線では、動画をやめて静止画＋canvas演出だけにする。
 */
import React, { useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { BgMode, ThemeVideo, VideoSources, detectBgMode } from './ThemeVideo';

const VIDEO: VideoSources = {
  webm: '/videos/war/sensou.webm',
  mp4: '/videos/war/sensou.mp4',
  poster: '/videos/war/sensou-poster.jpg',
};

/** 動画の明るい炎の上でも文字が読めるように暗く落とし、四隅をしぼって奥行きを出す。 */
const GRADE_OVERLAY = [
  'radial-gradient(ellipse at 50% 42%, rgba(20,6,0,0) 30%, rgba(8,2,0,0.72) 100%)',
  'linear-gradient(to bottom, rgba(18,6,0,0.74) 0%, rgba(18,6,0,0.48) 38%, rgba(18,6,0,0.5) 70%, rgba(12,4,0,0.82) 100%)',
].join(', ');

/** 中心が白熱し、外へやわらかく消える光の粒。毎フレームのグラデーション生成を避けるため一度だけ描く。 */
function makeGlowSprite(r: number, g: number, b: number): HTMLCanvasElement {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  if (x) {
    const grad = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255, 250, 225, 1)');
    grad.addColorStop(0.16, `rgba(${r}, ${g}, ${b}, 0.95)`);
    grad.addColorStop(0.42, `rgba(${r}, ${g}, ${b}, 0.32)`);
    grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    x.fillStyle = grad;
    x.fillRect(0, 0, size, size);
  }
  return c;
}

function makeSmokeSprite(): HTMLCanvasElement {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  if (x) {
    const grad = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(28, 14, 8, 0.9)');
    grad.addColorStop(0.5, 'rgba(28, 14, 8, 0.45)');
    grad.addColorStop(1, 'rgba(28, 14, 8, 0)');
    x.fillStyle = grad;
    x.fillRect(0, 0, size, size);
  }
  return c;
}

type Range = readonly [number, number];
const rand = ([a, b]: Range) => a + Math.random() * (b - a);

/** 火の粉の3層（奥＝小さく多く淡い／手前＝大きく少なくぼけた光）。 */
const LAYERS = [
  { share: 0.55, size: [3, 7], vy: [0.3, 0.8], drift: 0.25, swayAmp: 0.5, alpha: [0.35, 0.6], decay: [0.0015, 0.004] },
  { share: 0.35, size: [6, 12], vy: [0.8, 1.8], drift: 0.45, swayAmp: 0.9, alpha: [0.55, 0.85], decay: [0.002, 0.005] },
  { share: 0.1, size: [16, 30], vy: [1.5, 2.8], drift: 0.8, swayAmp: 1.4, alpha: [0.3, 0.55], decay: [0.003, 0.007] },
] as const;

interface Ember {
  layer: 0 | 1 | 2;
  x: number;
  y: number;
  size: number;
  vy: number;
  drift: number;
  sway: number;
  swaySpeed: number;
  swayAmp: number;
  alpha: number;
  life: number;
  decay: number;
  flicker: number;
  flickerSpeed: number;
  sprite: 0 | 1;
}

interface Smoke { x: number; y: number; r: number; vx: number; alpha: number; phase: number }

interface Spark { x: number; y: number; vx: number; vy: number; life: number; decay: number }

interface Burst { x: number; y: number; life: number }

export const WarRain: React.FC = () => {
  const theme = useSettingsStore((s) => s.theme);
  if (theme !== 'war') return null;
  return <WarBackground />;
};

const WarBackground: React.FC = () => {
  const [mode] = useState<BgMode>(detectBgMode);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  /* canvas：動画の上に重ねる炎の演出 */
  useEffect(() => {
    if (mode === 'still') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const emberSprites = [makeGlowSprite(255, 150, 50), makeGlowSprite(255, 85, 25)];
    const smokeSprite = makeSmokeSprite();

    let embers: Ember[] = [];
    let smoke: Smoke[] = [];
    let sparks: Spark[] = [];
    let bursts: Burst[] = [];
    let nextBurstAt = performance.now() + 1200;

    const spawnEmber = (layer: 0 | 1 | 2, anywhere: boolean): Ember => {
      const cfg = LAYERS[layer];
      return {
        layer,
        x: Math.random() * canvas.width,
        y: anywhere ? Math.random() * canvas.height : canvas.height + 20 + Math.random() * 40,
        size: rand(cfg.size),
        vy: rand(cfg.vy),
        drift: (Math.random() - 0.3) * cfg.drift, // ゆるい横風（少し右へ流れる）
        sway: Math.random() * Math.PI * 2,
        swaySpeed: 0.02 + Math.random() * 0.04,
        swayAmp: cfg.swayAmp * Math.random(),
        alpha: rand(cfg.alpha),
        life: anywhere ? Math.random() : 1,
        decay: rand(cfg.decay),
        flicker: Math.random() * Math.PI * 2,
        flickerSpeed: 0.08 + Math.random() * 0.15,
        sprite: Math.random() < 0.65 ? 0 : 1,
      };
    };

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const total = Math.min(160, Math.floor((canvas.width * canvas.height) / 8000));
      embers = [];
      LAYERS.forEach((cfg, i) => {
        const n = Math.round(total * cfg.share);
        for (let k = 0; k < n; k++) embers.push(spawnEmber(i as 0 | 1 | 2, true));
      });
      const big = Math.max(canvas.width, canvas.height);
      smoke = Array.from({ length: 6 }, (_, i) => ({
        x: Math.random() * canvas.width,
        y: canvas.height * (i < 3 ? 0.05 + Math.random() * 0.3 : 0.6 + Math.random() * 0.35),
        r: big * (0.25 + Math.random() * 0.2),
        vx: (Math.random() < 0.5 ? -1 : 1) * (0.15 + Math.random() * 0.25),
        alpha: 0.12 + Math.random() * 0.1,
        phase: Math.random() * Math.PI * 2,
      }));
    };
    resize();
    window.addEventListener('resize', resize);

    const spawnBurst = () => {
      const ox = canvas.width * (0.15 + Math.random() * 0.7);
      const oy = canvas.height * (0.55 + Math.random() * 0.3);
      const n = 16 + Math.floor(Math.random() * 14);
      for (let i = 0; i < n; i++) {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1; // ほぼ上向きに扇状
        const speed = 3 + Math.random() * 7;
        sparks.push({
          x: ox, y: oy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          decay: 0.03 + Math.random() * 0.03,
        });
      }
      bursts.push({ x: ox, y: oy, life: 1 });
    };

    let last = 0;
    const interval = 33; // 約30fps
    let raf = 0;

    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < interval) return;
      last = t;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // たなびく煙（通常合成で少しだけ暗くし、奥行きを出す）
      for (const s of smoke) {
        s.x += s.vx;
        if (s.x - s.r > w) s.x = -s.r;
        if (s.x + s.r < 0) s.x = w + s.r;
        ctx.globalAlpha = s.alpha * (0.8 + 0.2 * Math.sin(t * 0.0005 + s.phase));
        ctx.drawImage(smokeSprite, s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
      }
      ctx.globalAlpha = 1;

      ctx.globalCompositeOperation = 'lighter';

      // 足もとの炎の照り返し（ゆっくり脈打つ）
      const pulse = 0.12 + Math.sin(t * 0.0013) * 0.04 + Math.sin(t * 0.0029) * 0.02;
      const floor = ctx.createLinearGradient(0, h * 0.6, 0, h);
      floor.addColorStop(0, 'rgba(255, 90, 10, 0)');
      floor.addColorStop(1, `rgba(255, 110, 20, ${pulse})`);
      ctx.fillStyle = floor;
      ctx.fillRect(0, h * 0.6, w, h * 0.4);
      const big = Math.max(w, h);
      for (let i = 0; i < 2; i++) {
        const cx = w * (0.25 + 0.5 * i) + Math.sin(t * 0.0002 + i * 2) * w * 0.08;
        const cy = h * 1.02;
        const R = big * 0.45;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
        g.addColorStop(0, `rgba(255, 120, 30, ${pulse * 0.9})`);
        g.addColorStop(1, 'rgba(255, 120, 30, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
      }

      // 天から差す光条（動画が明るいので控えめに）
      for (let i = 0; i < 3; i++) {
        const cx = w * (0.15 + i * 0.35);
        const swing = Math.sin(t * 0.00025 + i * 2.1) * w * 0.04;
        const a = 0.02 + Math.max(0, Math.sin(t * 0.0005 + i * 1.3)) * 0.035;
        const rw = w * 0.06;
        const g = ctx.createLinearGradient(0, 0, 0, h * 0.8);
        g.addColorStop(0, `rgba(255, 200, 110, ${a})`);
        g.addColorStop(1, 'rgba(255, 160, 60, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(cx - rw * 0.3 + swing, 0);
        ctx.lineTo(cx + rw * 0.3 + swing, 0);
        ctx.lineTo(cx + rw + swing * 1.3, h * 0.8);
        ctx.lineTo(cx - rw + swing * 1.3, h * 0.8);
        ctx.closePath();
        ctx.fill();
      }

      // 火の粉（3層）
      for (const e of embers) {
        e.sway += e.swaySpeed;
        e.flicker += e.flickerSpeed;
        e.x += e.drift + Math.sin(e.sway) * e.swayAmp;
        e.y -= e.vy;
        e.life -= e.decay;
        if (e.life <= 0 || e.y < -40) {
          Object.assign(e, spawnEmber(e.layer, false));
          continue;
        }
        const fadeIn = Math.min(1, (1 - e.life) * 8);
        const fadeOut = e.life < 0.25 ? e.life / 0.25 : 1;
        ctx.globalAlpha = e.alpha * fadeIn * fadeOut * (0.75 + 0.25 * Math.sin(e.flicker));
        ctx.drawImage(emberSprites[e.sprite], e.x - e.size / 2, e.y - e.size / 2, e.size, e.size);
      }

      // ときどき散る火花（剣がぶつかったような一瞬のきらめき）
      if (t >= nextBurstAt) {
        spawnBurst();
        nextBurstAt = t + 2200 + Math.random() * 2600;
      }
      for (const b of bursts) {
        b.life -= 0.12;
        if (b.life <= 0) continue;
        const R = 70 * b.life + 30;
        ctx.globalAlpha = b.life * 0.6;
        ctx.drawImage(emberSprites[0], b.x - R, b.y - R, R * 2, R * 2);
      }
      bursts = bursts.filter((b) => b.life > 0);
      ctx.globalAlpha = 1;
      ctx.lineCap = 'round';
      for (const s of sparks) {
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.18;
        s.vx *= 0.98;
        s.life -= s.decay;
        if (s.life <= 0) continue;
        ctx.strokeStyle = `rgba(255, 220, 150, ${s.life})`;
        ctx.lineWidth = 1.2 + s.life;
        ctx.beginPath();
        ctx.moveTo(s.x - s.vx * 1.6, s.y - s.vy * 1.6);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
      }
      sparks = sparks.filter((s) => s.life > 0);

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [mode]);

  return (
    <div aria-hidden className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
      <ThemeVideo src={VIDEO} mode={mode} />
      <div className="absolute inset-0" style={{ background: GRADE_OVERLAY }} />
      {mode !== 'still' && <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />}
    </div>
  );
};
