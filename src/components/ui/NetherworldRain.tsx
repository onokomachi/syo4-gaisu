/**
 * 冥界神テーマ専用の背景：闇の玉座に鎮座する冥界の王のイメージ。
 * 紫紅の深淵に、ゆっくり回転する巨大な魔法陣（ルーン刻印つき）、
 * 画面全体を高頻度で走る紫電の稲妻、漂う暗い残り火。過度に不気味にならないよう、
 * 骸骨・幽霊などの直接的なホラーモチーフは使わず「かっこいい魔王」路線でまとめる。
 * theme === 'netherworld' のときだけ描画する。
 *
 * 光過敏への配慮（WCAG 2.3.1「3回の閃光」）:
 * 稲妻は1回ごとに「光って→消える」だけで、1本の中で点滅させない。稲妻が落ちる間隔は
 * MIN_STRIKE_GAP_MS より詰めないので、明滅は最大でも約2.4回/秒。画面全体を光らせる
 * フラッシュはその一部でだけ起こし、さらに間隔をあける。「視差効果を減らす」設定では稲妻を大きく減らし、
 * 画面全体のフラッシュは出さない。
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

type Pt = { x: number; y: number };

interface Bolt {
  main: Pt[];
  branches: Pt[][];
  age: number; // 経過ms
  duration: number; // 光っている時間(ms)
}

/** 稲妻が落ちる（1〜3本同時）間隔。下限があるので明滅は最大 1000/420 ≒ 2.4回/秒。 */
const MIN_STRIKE_GAP_MS = 420;
const MAX_STRIKE_GAP_MS = 1000;
/** 画面全体を光らせるフラッシュどうしの最短間隔（稲妻よりさらに間引く）。 */
const MIN_SCREEN_FLASH_GAP_MS = 700;

/** 始点→終点を、線分に垂直な方向へランダムにずらしながら分割していく（中点変位法）。横向きの稲妻にも使える。 */
function buildBoltPath(x0: number, y0: number, x1: number, y1: number, depth: number): Pt[] {
  if (depth <= 0) return [{ x: x0, y: y0 }, { x: x1, y: y1 }];
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const off = (Math.random() - 0.5) * len * 0.35;
  const mx = (x0 + x1) / 2 + (-dy / len) * off;
  const my = (y0 + y1) / 2 + (dx / len) * off;
  const left = buildBoltPath(x0, y0, mx, my, depth - 1);
  const right = buildBoltPath(mx, my, x1, y1, depth - 1);
  return [...left, ...right.slice(1)];
}

function randomEdgePoint(w: number, h: number): Pt {
  const side = Math.floor(Math.random() * 4);
  if (side === 0) return { x: Math.random() * w, y: -h * 0.05 };
  if (side === 1) return { x: w * 1.05, y: Math.random() * h };
  if (side === 2) return { x: Math.random() * w, y: h * 1.05 };
  return { x: -w * 0.05, y: Math.random() * h };
}

/** 画面全体を使う1本の稲妻（本線＋枝＋小枝）。天から地へ／魔法陣から四方へ／画面を横切る、の3種類。 */
function spawnBolt(w: number, h: number, cx: number, cy: number): Bolt {
  const kind = Math.random();
  let x0: number, y0: number, x1: number, y1: number;
  if (kind < 0.6) {
    x0 = w * (-0.05 + Math.random() * 1.1);
    y0 = -h * 0.05;
    x1 = x0 + (Math.random() - 0.5) * w * 1.2;
    y1 = h * (0.9 + Math.random() * 0.2);
  } else if (kind < 0.85) {
    x0 = cx;
    y0 = cy;
    ({ x: x1, y: y1 } = randomEdgePoint(w, h));
  } else {
    const fromLeft = Math.random() < 0.5;
    x0 = fromLeft ? -w * 0.05 : w * 1.05;
    y0 = h * (0.1 + Math.random() * 0.5);
    x1 = fromLeft ? w * 1.05 : -w * 0.05;
    y1 = y0 + (Math.random() - 0.5) * h * 0.6;
  }
  const main = buildBoltPath(x0, y0, x1, y1, 6);

  const dir = Math.atan2(y1 - y0, x1 - x0);
  const len = Math.hypot(x1 - x0, y1 - y0);
  const branches: Pt[][] = [];
  const branchCount = 2 + Math.floor(Math.random() * 4);
  for (let i = 0; i < branchCount; i++) {
    const s = main[Math.floor(main.length * (0.12 + Math.random() * 0.6))];
    const ang = dir + (Math.random() - 0.5) * 1.4;
    const bl = len * (0.15 + Math.random() * 0.3);
    const branch = buildBoltPath(s.x, s.y, s.x + Math.cos(ang) * bl, s.y + Math.sin(ang) * bl, 4);
    branches.push(branch);
    if (Math.random() < 0.5 && branch.length > 2) {
      const ss = branch[Math.floor(branch.length * (0.3 + Math.random() * 0.4))];
      const a2 = ang + (Math.random() - 0.5) * 1.2;
      const l2 = bl * (0.3 + Math.random() * 0.3);
      branches.push(buildBoltPath(ss.x, ss.y, ss.x + Math.cos(a2) * l2, ss.y + Math.sin(a2) * l2, 3));
    }
  }
  return { main, branches, age: 0, duration: 260 + Math.random() * 200 };
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

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let embers: Ember[] = [];
    let bolts: Bolt[] = [];
    let nextStrikeAt = performance.now() + 600;
    let lastScreenFlashAt = -Infinity;
    let screenFlash = 0; // 画面全体フラッシュの強さ（1→0へ減衰するだけで、ぶり返さない）
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
      const dt = Math.min(100, t - last);
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

      // 画面全体を走る紫電の稲妻（1回に1〜3本。間隔は MIN_STRIKE_GAP_MS 以上）
      if (t >= nextStrikeAt) {
        const count = reduceMotion ? 1 : Math.random() < 0.55 ? 1 : Math.random() < 0.67 ? 2 : 3;
        for (let i = 0; i < count; i++) bolts.push(spawnBolt(canvas.width, canvas.height, cx, cy));
        nextStrikeAt = t + (reduceMotion
          ? 3000 + Math.random() * 3000
          : MIN_STRIKE_GAP_MS + Math.random() * (MAX_STRIKE_GAP_MS - MIN_STRIKE_GAP_MS));
        if (!reduceMotion && t - lastScreenFlashAt >= MIN_SCREEN_FLASH_GAP_MS && Math.random() < 0.6) {
          screenFlash = 1;
          lastScreenFlashAt = t;
        }
      }
      for (const b of bolts) b.age += dt;
      bolts = bolts.filter((b) => b.age <= b.duration);

      ctx.globalCompositeOperation = 'lighter';
      if (screenFlash > 0) {
        ctx.fillStyle = `rgba(170, 110, 255, ${screenFlash * 0.2})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        screenFlash = Math.max(0, screenFlash - dt / 180);
      }
      // 画面サイズに応じて太さ・グローをスケール（スマホでも大画面でも見映えを保つ）
      const scale = Math.max(0.6, Math.min(2.2, Math.max(canvas.width, canvas.height) / 1100));
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      const strokePath = (path: Pt[], width: number, color: string) => {
        if (path.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.stroke();
      };
      for (const b of bolts) {
        const t01 = b.age / b.duration;
        const a = Math.max(0, 1 - t01 * t01); // 光って→なめらかに消えるだけ（1本の中で点滅させない）

        // 稲妻の先端に光の炸裂
        const tip = b.main[b.main.length - 1];
        const burstR = 180 * scale * (0.6 + 0.4 * a);
        const burst = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, burstR);
        burst.addColorStop(0, `rgba(235, 210, 255, ${a * 0.45})`);
        burst.addColorStop(0.35, `rgba(170, 90, 255, ${a * 0.22})`);
        burst.addColorStop(1, 'rgba(170, 90, 255, 0)');
        ctx.fillStyle = burst;
        ctx.fillRect(tip.x - burstR, tip.y - burstR, burstR * 2, burstR * 2);

        // 外側の大きなグロー → 中間グロー → 白い芯、の順に重ねる
        strokePath(b.main, 40 * scale, `rgba(140, 50, 220, ${a * 0.1})`);
        strokePath(b.main, 18 * scale, `rgba(160, 70, 240, ${a * 0.18})`);
        strokePath(b.main, 7 * scale, `rgba(190, 110, 255, ${a * 0.45})`);
        strokePath(b.main, 2.6 * scale, `rgba(245, 225, 255, ${a * 0.95})`);
        for (const br of b.branches) {
          strokePath(br, 14 * scale, `rgba(150, 60, 230, ${a * 0.12})`);
          strokePath(br, 5 * scale, `rgba(185, 110, 255, ${a * 0.38})`);
          strokePath(br, 1.8 * scale, `rgba(235, 210, 255, ${a * 0.75})`);
        }
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
