/**
 * スピードワールドテーマ専用の背景：近未来サイバーハイウェイ。
 * 漆黒の宙空に、シアン×マゼンタの地平線グロー、遠近感のあるネオングリッドの床、
 * 光速で流れ去るライトストリーク、浮遊するデジタル粒子。
 * theme === 'speedworld' のときだけ描画する。
 */
import React, { useEffect, useRef } from 'react';
import { useSettingsStore } from '../../store/settingsStore';

interface Streak {
  angle: number;   // 消失点からの放射方向
  dist: number;    // 消失点からの現在距離(px)
  speed: number;
  len: number;
  width: number;
  hue: 'cyan' | 'magenta' | 'white';
}

interface Particle {
  x: number;
  y: number;
  r: number;
  tw: number;
  twSpeed: number;
  vy: number;
}

export const SpeedWorldRain: React.FC = () => {
  const theme = useSettingsStore((s) => s.theme);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (theme !== 'speedworld') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let streaks: Streak[] = [];
    let particles: Particle[] = [];
    let vpX = 0, vpY = 0; // 消失点（地平線の中央）
    let gridOffset = 0;

    const spawnStreak = (): Streak => ({
      angle: Math.random() * Math.PI * 2,
      dist: 10 + Math.random() * 40,
      speed: 5 + Math.random() * 11,
      len: 30 + Math.random() * 70,
      width: 1 + Math.random() * 2,
      hue: Math.random() < 0.45 ? 'cyan' : Math.random() < 0.8 ? 'magenta' : 'white',
    });

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      vpX = canvas.width * 0.5;
      vpY = canvas.height * 0.42;

      const streakCount = Math.min(90, Math.floor((canvas.width * canvas.height) / 13000));
      streaks = Array.from({ length: streakCount }, spawnStreak);

      particles = Array.from({ length: Math.min(90, Math.floor(canvas.width / 16)) }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * vpY,
        r: 0.6 + Math.random() * 1.6,
        tw: Math.random() * Math.PI * 2,
        twSpeed: 0.02 + Math.random() * 0.05,
        vy: 0.1 + Math.random() * 0.3,
      }));
    };
    resize();
    window.addEventListener('resize', resize);

    let last = 0;
    const interval = 33; // ~30fps

    const draw = (t: number) => {
      rafRef.current = requestAnimationFrame(draw);
      if (t - last < interval) return;
      last = t;

      // 宙空
      ctx.fillStyle = '#02040c';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 地平線のシンセウェーブグロー（シアン→マゼンタ）
      const glow = ctx.createLinearGradient(0, vpY - 90, 0, vpY + 40);
      glow.addColorStop(0, 'rgba(0, 220, 255, 0)');
      glow.addColorStop(0.6, 'rgba(0, 220, 255, 0.16)');
      glow.addColorStop(1, 'rgba(255, 60, 220, 0.20)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, vpY - 90, canvas.width, 130);

      // 星の粒（上空）
      for (const p of particles) {
        p.tw += p.twSpeed;
        p.y += p.vy;
        if (p.y > vpY) p.y = 0;
        const a = 0.3 + Math.max(0, Math.sin(p.tw)) * 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(160, 230, 255, ${a})`;
        ctx.fill();
      }

      // 遠近グリッドの床（消失点へ収束する縦線＋速度で流れる横線）
      ctx.strokeStyle = 'rgba(0, 220, 255, 0.35)';
      ctx.lineWidth = 1;
      const vLines = 14;
      for (let i = 0; i <= vLines; i++) {
        const edgeX = (canvas.width / vLines) * i;
        ctx.beginPath();
        ctx.moveTo(vpX, vpY);
        ctx.lineTo(edgeX, canvas.height);
        ctx.stroke();
      }
      gridOffset = (gridOffset + 2.6) % 60;
      for (let d = gridOffset; d < canvas.height * 1.4; d += 60) {
        const ratio = d / (canvas.height * 1.4);
        const y = vpY + (canvas.height - vpY) * Math.pow(ratio, 1.9);
        if (y > canvas.height) continue;
        const alpha = 0.05 + ratio * 0.35;
        ctx.strokeStyle = `rgba(0, 220, 255, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // 消失点から放射する光速ストリーク
      ctx.globalCompositeOperation = 'lighter';
      const maxDist = Math.hypot(canvas.width, canvas.height) * 0.75;
      for (const s of streaks) {
        s.dist += s.speed * (1 + s.dist / maxDist) * 2.2;
        if (s.dist > maxDist) Object.assign(s, spawnStreak());
        const x0 = vpX + Math.cos(s.angle) * s.dist;
        const y0 = vpY + Math.sin(s.angle) * s.dist * 0.6; // 縦方向は少し圧縮して床っぽく見せる
        const x1 = vpX + Math.cos(s.angle) * (s.dist + s.len);
        const y1 = vpY + Math.sin(s.angle) * (s.dist + s.len) * 0.6;
        const alpha = Math.min(0.9, s.dist / (maxDist * 0.5));
        const color = s.hue === 'cyan' ? `0, 225, 255` : s.hue === 'magenta' ? `255, 60, 220` : `220, 245, 255`;
        ctx.strokeStyle = `rgba(${color}, ${alpha})`;
        ctx.lineWidth = s.width * (0.5 + s.dist / maxDist);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [theme]);

  if (theme !== 'speedworld') return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="fixed inset-0 pointer-events-none z-0 opacity-80"
      style={{ willChange: 'transform', transform: 'translateZ(0)' }}
    />
  );
};
