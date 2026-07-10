/**
 * インフェルノテーマ専用の背景：黒曜石の闇の底から 深紅の炎がゆらめき、
 * 火の粉が立ちのぼる。theme === 'inferno' のときだけ描画する。
 */
import React, { useEffect, useRef } from 'react';
import { useSettingsStore } from '../../store/settingsStore';

interface Ember {
  x: number;
  y: number;
  r: number;       // 火の粉の大きさ
  vy: number;      // 上昇速度
  sway: number;
  swaySpeed: number;
  life: number;    // 0..1（上へ行くほど消える）
  decay: number;
  heat: number;    // 0=深紅 1=白熱
}

export const InfernoRain: React.FC = () => {
  const theme = useSettingsStore((s) => s.theme);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (theme !== 'inferno') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let embers: Ember[] = [];

    const spawn = (): Ember => ({
      x: Math.random() * canvas.width,
      y: canvas.height + 10 + Math.random() * 60,
      r: 1 + Math.random() * 2.6,
      vy: 0.8 + Math.random() * 2.2,
      sway: Math.random() * Math.PI * 2,
      swaySpeed: 0.02 + Math.random() * 0.05,
      life: 1,
      decay: 0.002 + Math.random() * 0.005,
      heat: Math.random(),
    });

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const count = Math.min(220, Math.floor((canvas.width * canvas.height) / 6500));
      embers = Array.from({ length: count }, () => {
        const e = spawn();
        e.y = Math.random() * canvas.height; // 初期は画面全体にばらまく
        e.life = Math.random();
        return e;
      });
    };
    resize();
    window.addEventListener('resize', resize);

    let last = 0;
    const interval = 33; // ~30fps

    const draw = (t: number) => {
      rafRef.current = requestAnimationFrame(draw);
      if (t - last < interval) return;
      last = t;

      // 闇
      ctx.fillStyle = '#0a0100';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 底に脈動する溶岩の光
      const pulse = 0.10 + Math.sin(t * 0.0012) * 0.04;
      const lava = ctx.createLinearGradient(0, canvas.height * 0.55, 0, canvas.height);
      lava.addColorStop(0, 'rgba(0,0,0,0)');
      lava.addColorStop(0.7, `rgba(200, 40, 0, ${pulse})`);
      lava.addColorStop(1, `rgba(255, 90, 10, ${pulse * 2.2})`);
      ctx.fillStyle = lava;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // ゆらめく炎の舌（sin波の重ね）
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const baseY = canvas.height * (0.92 - i * 0.02);
        const amp = 26 + i * 14;
        ctx.beginPath();
        ctx.moveTo(0, canvas.height);
        for (let x = 0; x <= canvas.width; x += 16) {
          const y =
            baseY -
            Math.abs(Math.sin(x * 0.012 + t * 0.0016 * (i + 1)) * amp) -
            Math.abs(Math.sin(x * 0.03 - t * 0.001 * (i + 1)) * amp * 0.45);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(canvas.width, canvas.height);
        ctx.closePath();
        ctx.fillStyle = `rgba(${255 - i * 40}, ${70 - i * 15}, 0, ${0.05 + i * 0.015})`;
        ctx.fill();
      }

      // 火の粉（上昇して消える）
      for (const e of embers) {
        e.sway += e.swaySpeed;
        e.x += Math.sin(e.sway) * 0.8;
        e.y -= e.vy;
        e.life -= e.decay;
        if (e.life <= 0 || e.y < -10) Object.assign(e, spawn());
        const a = Math.max(0, e.life) * 0.9;
        const r = Math.round(255);
        const g = Math.round(90 + e.heat * 130);
        const b = Math.round(e.heat * 80);
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
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

  if (theme !== 'inferno') return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="fixed inset-0 pointer-events-none z-0 opacity-80"
      style={{ willChange: 'transform', transform: 'translateZ(0)' }}
    />
  );
};
