/**
 * 冥界神テーマ専用の背景：闇の玉座に鎮座する冥界の王のイメージ。
 * 紫紅の深淵に、ゆっくり回転する巨大な魔法陣（ルーン刻印つき）、
 * ときおり走る紫電の稲妻、漂う暗い残り火。過度に不気味にならないよう、
 * 骸骨・幽霊などの直接的なホラーモチーフは使わず「かっこいい魔王」路線でまとめる。
 * theme === 'netherworld' のときだけ描画する。
 */
import React, { useEffect, useRef } from 'react';
import { useSettingsStore } from '../../store/settingsStore';

interface Ember {
  x: number;
  y: number;
  r: number;
  vy: number;
  sway: number;
  swaySpeed: number;
  life: number;
  decay: number;
}

interface Bolt {
  path: { x: number; y: number }[];
  age: number;
  duration: number;
}

function buildBoltPath(x0: number, y0: number, x1: number, y1: number, depth: number): { x: number; y: number }[] {
  if (depth <= 0) return [{ x: x0, y: y0 }, { x: x1, y: y1 }];
  const mx = (x0 + x1) / 2 + (Math.random() - 0.5) * (y1 - y0) * 0.35;
  const my = (y0 + y1) / 2 + (Math.random() - 0.5) * (x1 - x0) * 0.15;
  const left = buildBoltPath(x0, y0, mx, my, depth - 1);
  const right = buildBoltPath(mx, my, x1, y1, depth - 1);
  return [...left, ...right.slice(1)];
}

export const NetherworldRain: React.FC = () => {
  const theme = useSettingsStore((s) => s.theme);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (theme !== 'netherworld') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let embers: Ember[] = [];
    let bolts: Bolt[] = [];
    let boltTimer = 2200 + Math.random() * 2600;
    let cx = 0, cy = 0, baseR = 0;

    const spawnEmber = (): Ember => ({
      x: Math.random() * canvas.width,
      y: canvas.height + 10 + Math.random() * 60,
      r: 1 + Math.random() * 2.2,
      vy: 0.3 + Math.random() * 1.0,
      sway: Math.random() * Math.PI * 2,
      swaySpeed: 0.012 + Math.random() * 0.03,
      life: 1,
      decay: 0.0012 + Math.random() * 0.003,
    });

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      cx = canvas.width * 0.5;
      cy = canvas.height * 0.44;
      baseR = Math.min(canvas.width, canvas.height) * 0.32;

      const emberCount = Math.min(140, Math.floor((canvas.width * canvas.height) / 9500));
      embers = Array.from({ length: emberCount }, () => {
        const e = spawnEmber();
        e.y = Math.random() * canvas.height;
        e.life = Math.random();
        return e;
      });
    };
    resize();
    window.addEventListener('resize', resize);

    /** 魔法陣を1つ描く（同心円＋ルーン風の刻み＋回転する内側の多角形の星） */
    const drawMagicCircle = (r: number, rotation: number, alpha: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation);

      // 同心円
      for (const ring of [1, 0.82, 0.62]) {
        ctx.beginPath();
        ctx.arc(0, 0, r * ring, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(190, 90, 255, ${alpha * 0.55})`;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }

      // ルーン風の刻み目（外周の短い放射線）
      const ticks = 32;
      for (let i = 0; i < ticks; i++) {
        const a = (i / ticks) * Math.PI * 2;
        const inner = r * 0.86;
        const outer = r * (i % 4 === 0 ? 1.0 : 0.92);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
        ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
        ctx.strokeStyle = `rgba(220, 150, 255, ${alpha * (i % 4 === 0 ? 0.65 : 0.3)})`;
        ctx.lineWidth = i % 4 === 0 ? 2 : 1;
        ctx.stroke();
      }

      // 内側の六芒星（2つの三角形）
      const star = (radius: number, rot: number) => {
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const a = rot + (i / 3) * Math.PI * 2;
          const px = Math.cos(a) * radius;
          const py = Math.sin(a) * radius;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(230, 170, 255, ${alpha * 0.7})`;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      };
      star(r * 0.62, 0);
      star(r * 0.62, Math.PI);

      ctx.restore();
    };

    let last = 0;
    const interval = 33; // ~30fps

    const draw = (t: number) => {
      rafRef.current = requestAnimationFrame(draw);
      if (t - last < interval) return;
      last = t;

      // 闇の深淵（紫紅のビネット）
      ctx.fillStyle = '#08010f';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const vignette = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(canvas.width, canvas.height) * 0.75);
      vignette.addColorStop(0, 'rgba(70, 15, 100, 0.22)');
      vignette.addColorStop(1, 'rgba(4, 0, 8, 0)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 鼓動する光（魔法陣の中心）
      const pulse = 0.14 + Math.sin(t * 0.0016) * 0.06;
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR * 0.5);
      core.addColorStop(0, `rgba(210, 130, 255, ${pulse})`);
      core.addColorStop(1, 'rgba(210, 130, 255, 0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = core;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 回転する魔法陣を2重に（外側はゆっくり逆回転、内側は少し速く）
      drawMagicCircle(baseR, t * 0.00007, 0.55);
      drawMagicCircle(baseR * 0.72, -t * 0.00012, 0.5);
      ctx.globalCompositeOperation = 'source-over';

      // ときおり走る紫電の稲妻
      boltTimer -= interval;
      if (bolts.length === 0 && boltTimer <= 0) {
        const x0 = Math.random() * canvas.width;
        const y0 = -20;
        const x1 = x0 + (Math.random() - 0.5) * canvas.width * 0.6;
        const y1 = canvas.height * (0.5 + Math.random() * 0.4);
        bolts = [{ path: buildBoltPath(x0, y0, x1, y1, 5), age: 0, duration: 260 + Math.random() * 140 }];
        boltTimer = 5000 + Math.random() * 6500;
      }
      if (bolts.length > 0) {
        for (const b of bolts) b.age += interval;
        bolts = bolts.filter((b) => b.age <= b.duration);
      }
      ctx.globalCompositeOperation = 'lighter';
      for (const b of bolts) {
        const t01 = b.age / b.duration;
        const a = Math.max(0, 1 - t01 * t01);
        const strokePath = (width: number, color: string) => {
          ctx.beginPath();
          ctx.moveTo(b.path[0].x, b.path[0].y);
          for (let i = 1; i < b.path.length; i++) ctx.lineTo(b.path[i].x, b.path[i].y);
          ctx.strokeStyle = color;
          ctx.lineWidth = width;
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          ctx.stroke();
        };
        strokePath(18, `rgba(160, 60, 230, ${a * 0.18})`);
        strokePath(7, `rgba(190, 100, 255, ${a * 0.45})`);
        strokePath(2.4, `rgba(240, 210, 255, ${a * 0.9})`);
      }
      ctx.globalCompositeOperation = 'source-over';

      // 漂う暗い残り火
      ctx.globalCompositeOperation = 'lighter';
      for (const e of embers) {
        e.sway += e.swaySpeed;
        e.x += Math.sin(e.sway) * 0.5;
        e.y -= e.vy;
        e.life -= e.decay;
        if (e.life <= 0 || e.y < -10) Object.assign(e, spawnEmber());
        const alpha = Math.max(0, e.life) * 0.7;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200, 90, 255, ${alpha})`;
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [theme]);

  if (theme !== 'netherworld') return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="fixed inset-0 pointer-events-none z-0 opacity-85"
      style={{ willChange: 'transform', transform: 'translateZ(0)' }}
    />
  );
};
