/**
 * 冥界神テーマ専用の背景：ボス戦に登場する「冥界神」そのものを背景にする。
 * ボス戦の待機動画（銀髪の冥界神が両手に闇の宝珠を浮かべる）を最背面で無音ループし、その上に透明なcanvasで
 * 動画の意匠をなぞった演出を重ねる。
 *   - 冥界神の背後の金の輪をなぞった、ゆっくり回るルーン刻印の金環（2重）
 *   - 足もとに浮かぶ紫の召喚陣（遠近をつけて楕円に倒す）
 *   - 両手の宝珠に見立てた2つの「闇の宝珠」（渦巻く気流・表面を這う紫電・吸いこまれる光の粒）
 *   - 宙に浮かんで漂う岩のかけら（奥・手前の2層）と、立ちのぼる霊火、流れる瘴気
 *   - 画面全体を高頻度で走る紫電の稲妻（宝珠から放たれるものもある）
 * theme === 'netherworld' のときだけ描画し、それ以外のテーマでは動画を読み込みもしない。
 * 動画はボス戦と同じファイルなので、どちらかで一度読めばもう一方はキャッシュから出る。
 *
 * 軽さのための工夫:
 * - 動画は540p・音声なし（約1.2MB）。タブが裏に回ったら止める。
 * - 金環・召喚陣は大きさが変わったときだけ別のcanvasに1回描き、毎フレームは回して貼るだけにする。
 *   光の粒・瘴気も事前に描いた画像を使い回す。canvasは約30fpsに間引く。
 * - 「視差効果を減らす」設定では静止画だけ、データセーバー／低速回線では静止画＋canvas演出にする。
 *
 * 光過敏への配慮（WCAG 2.3.1「3回の閃光」）:
 * 稲妻は1回ごとに「光って→消える」だけで、1本の中で点滅させない。稲妻が落ちる間隔は
 * MIN_STRIKE_GAP_MS より詰めないので、明滅は最大でも約2.4回/秒。画面全体を光らせる
 * フラッシュはその一部でだけ起こし、さらに間隔をあける。宝珠の紫電は小さく、なめらかに消えるだけにする。
 */
import React, { useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { BgMode, ThemeVideo, VideoSources, detectBgMode } from './ThemeVideo';

const VIDEO: VideoSources = {
  webm: '/videos/boss/idle.webm',
  mp4: '/videos/boss/idle.mp4',
  poster: '/videos/boss/idle-poster.jpg',
  preferMp4: true,
};

/** 動画の明るい紫電の上でも文字が読めるように暗く落とし、四隅をしぼって冥界の奥行きを出す。 */
const GRADE_OVERLAY = [
  'radial-gradient(ellipse at 50% 38%, rgba(10,0,22,0.2) 25%, rgba(6,0,14,0.8) 100%)',
  'linear-gradient(to bottom, rgba(8,0,18,0.62) 0%, rgba(8,0,18,0.42) 35%, rgba(8,0,18,0.5) 70%, rgba(5,0,10,0.86) 100%)',
].join(', ');

type Pt = { x: number; y: number };

interface Bolt {
  main: Pt[];
  branches: Pt[][];
  age: number; // 経過ms
  duration: number; // 光っている時間(ms)
}

interface Orb {
  fx: number; // 画面に対する位置（0..1）
  fy: number;
  size: number; // 画面の短い辺に対する半径の比
  x: number;
  y: number;
  r: number;
  spin: number;
  flare: number; // 稲妻を放った直後に強く光る（1→0へ減衰）
  arcs: { path: Pt[]; age: number; duration: number }[];
  nextArcAt: number;
  motes: { a: number; d: number; speed: number; size: number }[];
}

interface Shard {
  near: boolean;
  x: number;
  y: number;
  size: number;
  vy: number;
  sway: number;
  swaySpeed: number;
  rot: number;
  vr: number;
  pts: number[]; // 多角形の頂点（単位円上の半径の倍率、角度は等分）
  alpha: number;
}

interface Wisp { x: number; y: number; size: number; vy: number; sway: number; swaySpeed: number; life: number; decay: number; alpha: number }

interface Mist { x: number; y: number; r: number; vx: number; alpha: number; phase: number }

/** 稲妻が落ちる（1〜3本同時）間隔。下限があるので明滅は最大 1000/420 ≒ 2.4回/秒。 */
const MIN_STRIKE_GAP_MS = 420;
const MAX_STRIKE_GAP_MS = 1000;
/** 画面全体を光らせるフラッシュどうしの最短間隔（稲妻よりさらに間引く）。 */
const MIN_SCREEN_FLASH_GAP_MS = 700;

const GOLD = '235, 190, 100';

/** 始点→終点を、線分に垂直な方向へランダムにずらしながら分割していく（中点変位法）。横向きの稲妻にも使える。 */
function buildBoltPath(x0: number, y0: number, x1: number, y1: number, depth: number, jag = 0.35): Pt[] {
  if (depth <= 0) return [{ x: x0, y: y0 }, { x: x1, y: y1 }];
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const off = (Math.random() - 0.5) * len * jag;
  const mx = (x0 + x1) / 2 + (-dy / len) * off;
  const my = (y0 + y1) / 2 + (dx / len) * off;
  const left = buildBoltPath(x0, y0, mx, my, depth - 1, jag);
  const right = buildBoltPath(mx, my, x1, y1, depth - 1, jag);
  return [...left, ...right.slice(1)];
}

function randomEdgePoint(w: number, h: number): Pt {
  const side = Math.floor(Math.random() * 4);
  if (side === 0) return { x: Math.random() * w, y: -h * 0.05 };
  if (side === 1) return { x: w * 1.05, y: Math.random() * h };
  if (side === 2) return { x: Math.random() * w, y: h * 1.05 };
  return { x: -w * 0.05, y: Math.random() * h };
}

/** 画面全体を使う1本の稲妻（本線＋枝＋小枝）。天から地へ／宝珠から四方へ／画面を横切る、の3種類。 */
function spawnBolt(w: number, h: number, origin: Pt | null): Bolt {
  let x0: number, y0: number, x1: number, y1: number;
  const kind = Math.random();
  if (origin) {
    x0 = origin.x;
    y0 = origin.y;
    ({ x: x1, y: y1 } = randomEdgePoint(w, h));
  } else if (kind < 0.8) {
    x0 = w * (-0.05 + Math.random() * 1.1);
    y0 = -h * 0.05;
    x1 = x0 + (Math.random() - 0.5) * w * 1.2;
    y1 = h * (0.9 + Math.random() * 0.2);
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

/* ---------------- 事前描画（大きさが変わったときだけ作り直す） ---------------- */

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D | null] {
  const c = document.createElement('canvas');
  c.width = c.height = Math.max(2, Math.ceil(size));
  return [c, c.getContext('2d')];
}

/** 中心が白く、外へやわらかく消える光の粒。 */
function makeGlowSprite(r: number, g: number, b: number): HTMLCanvasElement {
  const size = 64;
  const [c, x] = makeCanvas(size);
  if (x) {
    const grad = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(250, 240, 255, 1)');
    grad.addColorStop(0.18, `rgba(${r}, ${g}, ${b}, 0.9)`);
    grad.addColorStop(0.45, `rgba(${r}, ${g}, ${b}, 0.28)`);
    grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    x.fillStyle = grad;
    x.fillRect(0, 0, size, size);
  }
  return c;
}

function makeMistSprite(): HTMLCanvasElement {
  const size = 128;
  const [c, x] = makeCanvas(size);
  if (x) {
    const grad = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(90, 35, 140, 0.8)');
    grad.addColorStop(0.5, 'rgba(60, 20, 100, 0.35)');
    grad.addColorStop(1, 'rgba(40, 10, 70, 0)');
    x.fillStyle = grad;
    x.fillRect(0, 0, size, size);
  }
  return c;
}

/** ルーン文字っぽい記号（単位正方形の中の線分の組）。 */
const GLYPHS: number[][][] = [
  [[0, 0, 0, 1], [0, 0.3, 0.8, 0], [0, 0.6, 0.8, 0.3]],
  [[0.4, 0, 0.4, 1], [0, 0.25, 0.8, 0.75], [0.8, 0.25, 0, 0.75]],
  [[0, 1, 0.4, 0], [0.4, 0, 0.8, 1], [0.15, 0.6, 0.65, 0.6]],
  [[0, 0, 0, 1], [0, 0, 0.8, 0.5], [0.8, 0.5, 0, 1]],
  [[0.4, 0, 0.4, 1], [0.4, 0.2, 0.8, 0], [0.4, 0.2, 0, 0]],
  [[0, 0, 0.8, 0], [0.4, 0, 0.4, 1], [0, 1, 0.8, 1]],
  [[0, 0.5, 0.4, 0], [0.4, 0, 0.8, 0.5], [0.8, 0.5, 0.4, 1], [0.4, 1, 0, 0.5]],
];

/** 冥界神の背後に浮かぶ金環をなぞった、ルーン刻印入りの輪。 */
function makeRuneRing(R: number, runeCount: number, seed: number): HTMLCanvasElement {
  const pad = 8;
  const [c, x] = makeCanvas(R * 2 + pad * 2);
  if (!x) return c;
  const o = R + pad;
  x.translate(o, o);
  x.lineCap = 'round';

  const ring = (r: number, width: number, alpha: number) => {
    x.beginPath();
    x.arc(0, 0, r, 0, Math.PI * 2);
    x.strokeStyle = `rgba(${GOLD}, ${alpha})`;
    x.lineWidth = width;
    x.stroke();
  };
  ring(R, 2.4, 0.75);
  ring(R * 0.9, 1.2, 0.5);
  ring(R * 0.74, 1, 0.35);

  // 輪の間にルーン文字
  const band = R * 0.075;
  for (let i = 0; i < runeCount; i++) {
    const a = (i / runeCount) * Math.PI * 2;
    const g = GLYPHS[(i * 5 + seed) % GLYPHS.length];
    x.save();
    x.rotate(a);
    x.translate(0, -R * 0.95 + band / 2);
    x.beginPath();
    for (const [x0, y0, x1, y1] of g) {
      x.moveTo((x0 - 0.4) * band, (y0 - 0.5) * band);
      x.lineTo((x1 - 0.4) * band, (y1 - 0.5) * band);
    }
    x.strokeStyle = `rgba(${GOLD}, 0.8)`;
    x.lineWidth = 1.3;
    x.stroke();
    x.restore();
  }

  // 内側の目盛り
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    const r0 = R * 0.74;
    const r1 = R * (i % 8 === 0 ? 0.84 : 0.78);
    x.beginPath();
    x.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    x.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    x.strokeStyle = `rgba(${GOLD}, ${i % 8 === 0 ? 0.6 : 0.3})`;
    x.lineWidth = i % 8 === 0 ? 1.6 : 1;
    x.stroke();
  }

  // 四方の宝石（紫）
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const px = Math.cos(a) * R;
    const py = Math.sin(a) * R;
    const gr = x.createRadialGradient(px, py, 0, px, py, R * 0.05);
    gr.addColorStop(0, 'rgba(240, 210, 255, 0.95)');
    gr.addColorStop(0.5, 'rgba(170, 90, 255, 0.8)');
    gr.addColorStop(1, 'rgba(120, 40, 220, 0)');
    x.fillStyle = gr;
    x.beginPath();
    x.arc(px, py, R * 0.05, 0, Math.PI * 2);
    x.fill();
    x.beginPath();
    x.arc(px, py, R * 0.03, 0, Math.PI * 2);
    x.strokeStyle = `rgba(${GOLD}, 0.9)`;
    x.lineWidth = 1.4;
    x.stroke();
  }
  return c;
}

/** 足もとの召喚陣（同心円＋刻み＋六芒星）。 */
function makeSigil(R: number): HTMLCanvasElement {
  const pad = 6;
  const [c, x] = makeCanvas(R * 2 + pad * 2);
  if (!x) return c;
  x.translate(R + pad, R + pad);
  for (const [ring, a] of [[1, 0.7], [0.86, 0.45], [0.62, 0.55]] as const) {
    x.beginPath();
    x.arc(0, 0, R * ring, 0, Math.PI * 2);
    x.strokeStyle = `rgba(200, 110, 255, ${a})`;
    x.lineWidth = 2.2;
    x.stroke();
  }
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const inner = R * 0.88;
    const outer = R * (i % 4 === 0 ? 1.0 : 0.94);
    x.beginPath();
    x.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    x.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
    x.strokeStyle = `rgba(225, 160, 255, ${i % 4 === 0 ? 0.75 : 0.35})`;
    x.lineWidth = i % 4 === 0 ? 2 : 1;
    x.stroke();
  }
  for (const rot of [0, Math.PI]) {
    x.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = rot - Math.PI / 2 + (i / 3) * Math.PI * 2;
      const px = Math.cos(a) * R * 0.62;
      const py = Math.sin(a) * R * 0.62;
      if (i === 0) x.moveTo(px, py);
      else x.lineTo(px, py);
    }
    x.closePath();
    x.strokeStyle = 'rgba(235, 180, 255, 0.7)';
    x.lineWidth = 2;
    x.stroke();
  }
  return c;
}

/* ---------------- コンポーネント ---------------- */

export const NetherworldRain: React.FC = () => {
  const theme = useSettingsStore((s) => s.theme);
  if (theme !== 'netherworld') return null;
  return <NetherworldBackground />;
};

const NetherworldBackground: React.FC = () => {
  const [mode] = useState<BgMode>(detectBgMode);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (mode === 'still') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const violet = makeGlowSprite(175, 95, 255);
    const pale = makeGlowSprite(215, 170, 255);
    const mistSprite = makeMistSprite();

    let w = 0, h = 0, scale = 1;
    let haloX = 0, haloY = 0, haloR = 0;
    let haloOuter: HTMLCanvasElement = violet;
    let haloInner: HTMLCanvasElement = violet;
    let sigil: HTMLCanvasElement = violet;
    let sigilR = 0;
    let orbs: Orb[] = [];
    let shards: Shard[] = [];
    let wisps: Wisp[] = [];
    let mist: Mist[] = [];
    let bolts: Bolt[] = [];
    let nextStrikeAt = performance.now() + 600;
    let lastScreenFlashAt = -Infinity;
    let screenFlash = 0; // 画面全体フラッシュの強さ（1→0へ減衰するだけで、ぶり返さない）

    const spawnShard = (near: boolean, anywhere: boolean): Shard => {
      const n = 5 + Math.floor(Math.random() * 3);
      return {
        near,
        x: Math.random() * w,
        y: anywhere ? Math.random() * h : h + 60 + Math.random() * 80,
        size: (near ? 26 + Math.random() * 30 : 7 + Math.random() * 12) * scale,
        vy: near ? 0.35 + Math.random() * 0.35 : 0.12 + Math.random() * 0.2,
        sway: Math.random() * Math.PI * 2,
        swaySpeed: 0.004 + Math.random() * 0.008,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * (near ? 0.012 : 0.02),
        pts: Array.from({ length: n }, () => 0.55 + Math.random() * 0.45),
        alpha: near ? 0.75 + Math.random() * 0.2 : 0.4 + Math.random() * 0.25,
      };
    };

    const spawnWisp = (anywhere: boolean): Wisp => ({
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : h + 10 + Math.random() * 40,
      size: (4 + Math.random() * 9) * scale,
      vy: 0.3 + Math.random() * 0.9,
      sway: Math.random() * Math.PI * 2,
      swaySpeed: 0.015 + Math.random() * 0.03,
      life: anywhere ? Math.random() : 1,
      decay: 0.0015 + Math.random() * 0.003,
      alpha: 0.35 + Math.random() * 0.45,
    });

    const makeOrb = (fx: number, fy: number, size: number): Orb => ({
      fx, fy, size, x: 0, y: 0, r: 0, spin: Math.random() * Math.PI * 2, flare: 0, arcs: [], nextArcAt: 0,
      motes: Array.from({ length: 14 }, () => ({ a: Math.random() * Math.PI * 2, d: 1.2 + Math.random() * 1.6, speed: 0.01 + Math.random() * 0.02, size: 3 + Math.random() * 5 })),
    });
    // 冥界神の両手の宝珠と同じく、左は低め・右は高めに置く
    orbs = [makeOrb(0.08, 0.74, 0.1), makeOrb(0.93, 0.26, 0.085)];

    const resize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      scale = Math.max(0.6, Math.min(2.2, Math.max(w, h) / 1100));
      const m = Math.min(w, h);

      haloX = w * 0.5;
      haloY = h * 0.36;
      haloR = m * 0.4;
      haloOuter = makeRuneRing(haloR, 40, 0);
      haloInner = makeRuneRing(haloR * 0.62, 28, 3);
      sigilR = Math.max(w * 0.42, 220);
      sigil = makeSigil(sigilR);

      orbs.forEach((o) => {
        o.x = w * o.fx;
        o.y = h * o.fy;
        o.r = Math.max(34, Math.min(120, m * o.size));
      });

      const area = w * h;
      shards = [
        ...Array.from({ length: Math.min(16, Math.floor(area / 70000) + 6) }, () => spawnShard(false, true)),
        ...Array.from({ length: Math.min(5, Math.floor(area / 300000) + 2) }, () => spawnShard(true, true)),
      ];
      wisps = Array.from({ length: Math.min(110, Math.floor(area / 11000)) }, () => spawnWisp(true));
      mist = Array.from({ length: 5 }, (_, i) => ({
        x: Math.random() * w,
        y: h * (i < 2 ? 0.1 + Math.random() * 0.25 : 0.55 + Math.random() * 0.4),
        r: Math.max(w, h) * (0.25 + Math.random() * 0.2),
        vx: (Math.random() < 0.5 ? -1 : 1) * (0.12 + Math.random() * 0.2),
        alpha: 0.18 + Math.random() * 0.12,
        phase: Math.random() * Math.PI * 2,
      }));
    };
    resize();
    window.addEventListener('resize', resize);

    const strokePath = (path: Pt[], width: number, color: string) => {
      if (path.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    };

    const drawRotated = (img: HTMLCanvasElement, x: number, y: number, rot: number, sy = 1) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, sy);
      ctx.rotate(rot);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();
    };

    const drawShard = (s: Shard) => {
      const n = s.pts.length;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const r = s.size * s.pts[i];
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.globalAlpha = s.alpha;
      ctx.fillStyle = s.near ? 'rgb(10, 4, 18)' : 'rgb(22, 10, 36)';
      ctx.fill();
      // 下から照らされた紫の縁取り
      ctx.strokeStyle = s.near ? 'rgba(170, 100, 255, 0.55)' : 'rgba(170, 100, 255, 0.35)';
      ctx.lineWidth = s.near ? 1.6 : 1;
      ctx.stroke();
      ctx.restore();
    };

    const drawOrb = (o: Orb, t: number, dt: number) => {
      const { x, y, r } = o;
      o.spin += 0.012;
      o.flare = Math.max(0, o.flare - dt / 600);
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.002 + o.fx * 7);

      // 外側のオーラ
      ctx.globalCompositeOperation = 'lighter';
      const auraR = r * (2.6 + pulse * 0.3 + o.flare * 0.8);
      ctx.globalAlpha = 0.45 + pulse * 0.15 + o.flare * 0.3;
      ctx.drawImage(violet, x - auraR, y - auraR, auraR * 2, auraR * 2);
      ctx.globalAlpha = 1;

      // 闇の球体（中心が黒く、縁が紫に光る）
      ctx.globalCompositeOperation = 'source-over';
      const body = ctx.createRadialGradient(x - r * 0.2, y - r * 0.25, r * 0.1, x, y, r);
      body.addColorStop(0, 'rgba(18, 4, 30, 0.97)');
      body.addColorStop(0.72, 'rgba(34, 8, 62, 0.95)');
      body.addColorStop(0.93, 'rgba(150, 80, 240, 0.9)');
      body.addColorStop(1, 'rgba(200, 150, 255, 0)');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalCompositeOperation = 'lighter';
      // 渦巻く気流（球の周りを回る弧）
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const rr = r * (1.05 + i * 0.16);
        const start = o.spin * (1 + i * 0.35) + i * 2.1;
        ctx.beginPath();
        ctx.arc(x, y, rr, start, start + 1.4 + i * 0.3);
        ctx.strokeStyle = `rgba(200, 140, 255, ${0.5 - i * 0.12})`;
        ctx.lineWidth = (3 - i * 0.7) * scale;
        ctx.stroke();
      }

      // 吸いこまれる光の粒
      for (const m of o.motes) {
        m.a += m.speed;
        m.d -= 0.006;
        if (m.d < 0.9) { m.d = 2.6 + Math.random() * 0.4; m.a = Math.random() * Math.PI * 2; }
        const px = x + Math.cos(m.a) * r * m.d;
        const py = y + Math.sin(m.a) * r * m.d;
        const s = m.size * scale;
        ctx.globalAlpha = Math.min(1, (2.9 - m.d) * 0.7) * 0.8;
        ctx.drawImage(pale, px - s, py - s, s * 2, s * 2);
      }
      ctx.globalAlpha = 1;

      // 表面を這う紫電（小さく、なめらかに消えるだけ）
      if (t >= o.nextArcAt) {
        o.nextArcAt = t + 140 + Math.random() * 220;
        const a0 = Math.random() * Math.PI * 2;
        const a1 = a0 + (Math.random() - 0.5) * 2.4;
        const r0 = r * (0.2 + Math.random() * 0.3);
        o.arcs.push({
          path: buildBoltPath(x + Math.cos(a0) * r0, y + Math.sin(a0) * r0, x + Math.cos(a1) * r * 0.95, y + Math.sin(a1) * r * 0.95, 3, 0.5),
          age: 0,
          duration: 380 + Math.random() * 240,
        });
      }
      for (const arc of o.arcs) {
        arc.age += dt;
        const a = Math.max(0, 1 - arc.age / arc.duration);
        strokePath(arc.path, 4 * scale, `rgba(160, 80, 255, ${a * 0.35})`);
        strokePath(arc.path, 1.3 * scale, `rgba(240, 220, 255, ${a * 0.85})`);
      }
      o.arcs = o.arcs.filter((arc) => arc.age < arc.duration);

      // 中心のきらめき
      const coreR = r * (0.28 + pulse * 0.08 + o.flare * 0.3);
      ctx.globalAlpha = 0.7 + o.flare * 0.3;
      ctx.drawImage(pale, x - coreR, y - coreR, coreR * 2, coreR * 2);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };

    let last = 0;
    const interval = 33; // 約30fps
    let raf = 0;

    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < interval) return;
      const dt = Math.min(100, t - last);
      last = t;
      ctx.clearRect(0, 0, w, h);

      // 流れる瘴気
      ctx.globalCompositeOperation = 'lighter';
      for (const m of mist) {
        m.x += m.vx;
        if (m.x - m.r > w) m.x = -m.r;
        if (m.x + m.r < 0) m.x = w + m.r;
        ctx.globalAlpha = m.alpha * (0.75 + 0.25 * Math.sin(t * 0.0004 + m.phase));
        ctx.drawImage(mistSprite, m.x - m.r, m.y - m.r, m.r * 2, m.r * 2);
      }

      // 足もとの召喚陣（遠近をつけて倒し、ゆっくり回す）
      const sigilPulse = 0.4 + Math.sin(t * 0.0015) * 0.12;
      ctx.globalAlpha = sigilPulse;
      drawRotated(sigil, w * 0.5, h * 0.98, t * 0.00008, 0.26);
      const floorGlow = ctx.createRadialGradient(w * 0.5, h, 0, w * 0.5, h, sigilR * 1.1);
      floorGlow.addColorStop(0, `rgba(170, 80, 255, ${0.22 * sigilPulse})`);
      floorGlow.addColorStop(1, 'rgba(170, 80, 255, 0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = floorGlow;
      ctx.fillRect(0, h - sigilR * 1.1, w, sigilR * 1.1);

      // 冥界神の背後の金環（外はゆっくり、内は逆向きに少し速く）
      const haloPulse = 0.3 + Math.sin(t * 0.0011) * 0.06;
      const glowR = haloR * 0.55;
      ctx.globalAlpha = haloPulse * 0.6;
      ctx.drawImage(violet, haloX - glowR, haloY - glowR, glowR * 2, glowR * 2);
      ctx.globalAlpha = haloPulse;
      drawRotated(haloOuter, haloX, haloY, t * 0.00005);
      ctx.globalAlpha = haloPulse * 1.1;
      drawRotated(haloInner, haloX, haloY, -t * 0.0001);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // 奥の岩のかけら
      for (const s of shards) {
        s.sway += s.swaySpeed;
        s.x += Math.sin(s.sway) * (s.near ? 0.35 : 0.15);
        s.y -= s.vy;
        s.rot += s.vr;
        if (s.y < -s.size * 2) Object.assign(s, spawnShard(s.near, false));
        if (!s.near) drawShard(s);
      }

      // 闇の宝珠
      for (const o of orbs) drawOrb(o, t, dt);

      // 手前の大きな岩のかけら
      for (const s of shards) if (s.near) drawShard(s);

      // 立ちのぼる霊火
      ctx.globalCompositeOperation = 'lighter';
      for (const e of wisps) {
        e.sway += e.swaySpeed;
        e.x += Math.sin(e.sway) * 0.5;
        e.y -= e.vy;
        e.life -= e.decay;
        if (e.life <= 0 || e.y < -20) { Object.assign(e, spawnWisp(false)); continue; }
        const fadeIn = Math.min(1, (1 - e.life) * 8);
        ctx.globalAlpha = e.alpha * fadeIn * Math.min(1, e.life / 0.25);
        ctx.drawImage(violet, e.x - e.size, e.y - e.size, e.size * 2, e.size * 2);
      }
      ctx.globalAlpha = 1;

      // 画面全体を走る紫電の稲妻（1回に1〜3本。間隔は MIN_STRIKE_GAP_MS 以上）。3割は宝珠から放たれる
      if (t >= nextStrikeAt) {
        const count = Math.random() < 0.55 ? 1 : Math.random() < 0.67 ? 2 : 3;
        for (let i = 0; i < count; i++) {
          let origin: Pt | null = null;
          if (Math.random() < 0.3) {
            const o = orbs[Math.floor(Math.random() * orbs.length)];
            o.flare = 1;
            origin = { x: o.x, y: o.y };
          }
          bolts.push(spawnBolt(w, h, origin));
        }
        nextStrikeAt = t + MIN_STRIKE_GAP_MS + Math.random() * (MAX_STRIKE_GAP_MS - MIN_STRIKE_GAP_MS);
        if (t - lastScreenFlashAt >= MIN_SCREEN_FLASH_GAP_MS && Math.random() < 0.6) {
          screenFlash = 1;
          lastScreenFlashAt = t;
        }
      }
      for (const b of bolts) b.age += dt;
      bolts = bolts.filter((b) => b.age <= b.duration);

      if (screenFlash > 0) {
        ctx.fillStyle = `rgba(170, 110, 255, ${screenFlash * 0.2})`;
        ctx.fillRect(0, 0, w, h);
        screenFlash = Math.max(0, screenFlash - dt / 180);
      }
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      for (const b of bolts) {
        const t01 = b.age / b.duration;
        const a = Math.max(0, 1 - t01 * t01); // 光って→なめらかに消えるだけ（1本の中で点滅させない）

        // 稲妻の先端に光の炸裂
        const tip = b.main[b.main.length - 1];
        const burstR = 180 * scale * (0.6 + 0.4 * a);
        ctx.globalAlpha = a * 0.5;
        ctx.drawImage(violet, tip.x - burstR, tip.y - burstR, burstR * 2, burstR * 2);
        ctx.globalAlpha = 1;

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
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [mode]);

  return (
    <div aria-hidden className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-[#08010f]">
      <ThemeVideo src={VIDEO} mode={mode} />
      <div className="absolute inset-0" style={{ background: GRADE_OVERLAY }} />
      {mode !== 'still' && <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />}
    </div>
  );
};
