/**
 * 戦争テーマ専用の背景：中世ファンタジー戦記の黄昏の戦場。
 * 燃えるような茜色の空の下、城壁のシルエットと はためく旗印、
 * 立ちのぼる灰の粉、天から差す金色の光条。実写的な武器・暴力表現は使わない。
 * theme === 'war' のときだけ描画する。
 */
import React, { useEffect, useRef } from 'react';
import { useSettingsStore } from '../../store/settingsStore';

interface Ash {
  x: number;
  y: number;
  r: number;
  vy: number;
  sway: number;
  swaySpeed: number;
  life: number;
  decay: number;
  heat: number;
}

interface Banner {
  x: number;
  poleH: number;
  flagW: number;
  flagH: number;
  phase: number;
  speed: number;
  hue: 'crimson' | 'gold';
}

/** 城壁・尖塔のシルエットのシルエット輪郭を1本のパスとして作る（横幅ぶん繰り返す） */
function buildSkylinePath(width: number, baseY: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [{ x: 0, y: baseY }];
  let x = 0;
  let seed = 0;
  while (x < width) {
    seed++;
    const kind = seed % 3;
    if (kind === 0) {
      // 尖塔（三角の屋根つき塔）
      const w = 46 + Math.random() * 30;
      const towerH = 60 + Math.random() * 70;
      pts.push({ x, y: baseY - towerH * 0.55 });
      pts.push({ x: x + w * 0.5, y: baseY - towerH });
      pts.push({ x: x + w, y: baseY - towerH * 0.55 });
      x += w;
    } else if (kind === 1) {
      // 城壁（凹凸の胸壁）
      const segments = 3 + Math.floor(Math.random() * 3);
      const segW = 18;
      for (let i = 0; i < segments; i++) {
        pts.push({ x, y: baseY - 34 });
        pts.push({ x: x + segW * 0.55, y: baseY - 34 });
        pts.push({ x: x + segW * 0.55, y: baseY - 14 });
        pts.push({ x: x + segW, y: baseY - 14 });
        x += segW;
      }
    } else {
      // 低い建物
      const w = 40 + Math.random() * 50;
      const h = 20 + Math.random() * 30;
      pts.push({ x, y: baseY - h });
      pts.push({ x: x + w, y: baseY - h });
      x += w;
    }
  }
  pts.push({ x: width, y: baseY });
  return pts;
}

export const WarRain: React.FC = () => {
  const theme = useSettingsStore((s) => s.theme);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (theme !== 'war') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let ashes: Ash[] = [];
    let banners: Banner[] = [];
    let skyline: { x: number; y: number }[] = [];
    let skylineBaseY = 0;

    const spawnAsh = (): Ash => ({
      x: Math.random() * canvas.width,
      y: canvas.height + 10 + Math.random() * 60,
      r: 1 + Math.random() * 2.4,
      vy: 0.5 + Math.random() * 1.6,
      sway: Math.random() * Math.PI * 2,
      swaySpeed: 0.015 + Math.random() * 0.035,
      life: 1,
      decay: 0.0015 + Math.random() * 0.004,
      heat: Math.random(),
    });

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      skylineBaseY = canvas.height * 0.86;
      skyline = buildSkylinePath(canvas.width, skylineBaseY);

      const ashCount = Math.min(150, Math.floor((canvas.width * canvas.height) / 9000));
      ashes = Array.from({ length: ashCount }, () => {
        const a = spawnAsh();
        a.y = Math.random() * canvas.height;
        a.life = Math.random();
        return a;
      });

      const bannerCount = Math.max(3, Math.floor(canvas.width / 320));
      banners = Array.from({ length: bannerCount }, (_, i) => ({
        x: (canvas.width / bannerCount) * (i + 0.5) + (Math.random() - 0.5) * 100,
        poleH: 70 + Math.random() * 50,
        flagW: 40 + Math.random() * 20,
        flagH: 22 + Math.random() * 10,
        phase: Math.random() * Math.PI * 2,
        speed: 0.0016 + Math.random() * 0.0012,
        hue: Math.random() < 0.5 ? 'crimson' : 'gold',
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

      // 黄昏の戦場の空（上は暗い煙、下は燃えるような茜色）
      const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
      sky.addColorStop(0, '#0e0400');
      sky.addColorStop(0.55, '#3a1204');
      sky.addColorStop(0.82, '#7a2c08');
      sky.addColorStop(1, '#c4540f');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 天からの金色の光条（薄く・まばらに）
      ctx.globalCompositeOperation = 'lighter';
      const rayCount = 3;
      for (let i = 0; i < rayCount; i++) {
        const cx = canvas.width * (0.15 + (i / (rayCount - 1)) * 0.7);
        const swing = Math.sin(t * 0.00025 + i * 2.1) * canvas.width * 0.04;
        const a = 0.04 + Math.max(0, Math.sin(t * 0.0005 + i * 1.3)) * 0.05;
        const w = canvas.width * 0.06;
        const g = ctx.createLinearGradient(0, 0, 0, canvas.height * 0.8);
        g.addColorStop(0, `rgba(255, 200, 110, ${a})`);
        g.addColorStop(1, 'rgba(255, 160, 60, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.3 + swing, 0);
        ctx.lineTo(cx + w * 0.3 + swing, 0);
        ctx.lineTo(cx + w + swing * 1.3, canvas.height * 0.8);
        ctx.lineTo(cx - w + swing * 1.3, canvas.height * 0.8);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';

      // 遠くの城壁・尖塔のシルエット
      ctx.beginPath();
      ctx.moveTo(skyline[0].x, canvas.height);
      for (const p of skyline) ctx.lineTo(p.x, p.y);
      ctx.lineTo(canvas.width, canvas.height);
      ctx.closePath();
      const silhouette = ctx.createLinearGradient(0, skylineBaseY - 120, 0, skylineBaseY);
      silhouette.addColorStop(0, 'rgba(15, 5, 2, 0.96)');
      silhouette.addColorStop(1, 'rgba(30, 10, 3, 0.98)');
      ctx.fillStyle = silhouette;
      ctx.fill();

      // 旗印（はためく旗）
      for (const b of banners) {
        const baseY = skylineBaseY - 10;
        const topY = baseY - b.poleH;
        // 旗ざお
        ctx.strokeStyle = 'rgba(20, 8, 3, 0.9)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(b.x, baseY);
        ctx.lineTo(b.x, topY);
        ctx.stroke();
        // 旗（風になびく波形の右端）
        const wave = t * b.speed + b.phase;
        ctx.beginPath();
        ctx.moveTo(b.x, topY);
        ctx.lineTo(b.x, topY + b.flagH);
        const steps = 5;
        for (let i = steps; i >= 0; i--) {
          const fx = b.x + (b.flagW * i) / steps;
          const fy = topY + b.flagH * 0.5 + Math.sin(wave + i * 0.9) * (b.flagH * 0.35) * (i / steps);
          ctx.lineTo(fx, fy);
        }
        ctx.closePath();
        ctx.fillStyle = b.hue === 'crimson' ? 'rgba(180, 30, 20, 0.85)' : 'rgba(220, 160, 40, 0.85)';
        ctx.fill();
      }

      // 立ちのぼる灰・火の粉
      ctx.globalCompositeOperation = 'lighter';
      for (const a of ashes) {
        a.sway += a.swaySpeed;
        a.x += Math.sin(a.sway) * 0.6;
        a.y -= a.vy;
        a.life -= a.decay;
        if (a.life <= 0 || a.y < -10) Object.assign(a, spawnAsh());
        const alpha = Math.max(0, a.life) * 0.75;
        const r = 255;
        const g = Math.round(140 + a.heat * 90);
        const bch = Math.round(60 + a.heat * 60);
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${bch}, ${alpha})`;
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

  if (theme !== 'war') return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="fixed inset-0 pointer-events-none z-0 opacity-85"
      style={{ willChange: 'transform', transform: 'translateZ(0)' }}
    />
  );
};
