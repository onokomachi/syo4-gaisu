/**
 * スピードワールドテーマ専用の背景：夜のサイバーハイウェイを光速で駆け抜ける。
 * 奥から手前へ:
 *   - 群青→紫の夜空と星、ときどき流れるデータの流星
 *   - 地平線に沈む横縞のシンセウェーブの太陽と、窓がまたたくネオン都市のシルエット（2層）、
 *     屋上の航空灯、夜空をなでるサーチライト
 *   - 遠近のついたネオングリッドの床と、その上をまっすぐ伸びるハイウェイ
 *     （マゼンタの路肩ライン・流れるセンターライン・奥へ去るテールランプと迫るヘッドライトの光跡）
 *   - 消失点から放射する光速ストリーク。数秒おきに「ブースト」で一気に加速し、衝撃波の輪が広がる
 *   - 画面の四隅のHUDブラケットと、ゆっくり下りる走査線
 * theme === 'speedworld' のときだけ描画する。
 *
 * 軽さのための工夫: 太陽・都市は大きさが変わったときだけ別のcanvasに1回描き、毎フレームは貼るだけ。
 * 光の粒は事前に描いた画像を使い回し、canvasは約30fpsに間引く。
 * 「視差効果を減らす」設定では1枚だけ描いて止める。ブーストでも画面全体は光らせない。
 */
import React, { useEffect, useRef } from 'react';
import { useSettingsStore } from '../../store/settingsStore';

const CYAN = '0, 225, 255';
const MAGENTA = '255, 60, 220';

interface Streak {
  angle: number; // 消失点からの放射方向
  dist: number; // 消失点からの現在距離(px)
  speed: number;
  len: number;
  width: number;
  hue: 'cyan' | 'magenta' | 'white';
}

interface Star { x: number; y: number; r: number; tw: number; twSpeed: number }

interface Car {
  z: number; // 0=地平線 … 1=画面下端
  lane: number; // -1..1（道路の左端〜右端）
  speed: number;
  incoming: boolean; // true=こちらへ迫るヘッドライト / false=奥へ去るテールランプ
}

interface Beacon { x: number; y: number; phase: number; speed: number }

interface Meteor { x: number; y: number; vx: number; vy: number; life: number }

interface Ring { r: number; life: number }

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D | null] {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.ceil(w));
  c.height = Math.max(2, Math.ceil(h));
  return [c, c.getContext('2d')];
}

function makeGlowSprite(rgb: string): HTMLCanvasElement {
  const size = 64;
  const [c, x] = makeCanvas(size, size);
  if (x) {
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255, 255, 255, 1)');
    g.addColorStop(0.2, `rgba(${rgb}, 0.9)`);
    g.addColorStop(0.5, `rgba(${rgb}, 0.25)`);
    g.addColorStop(1, `rgba(${rgb}, 0)`);
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
  }
  return c;
}

/** 地平線に沈む、下へいくほど切れ目が太くなる横縞の太陽。 */
function makeSun(R: number): HTMLCanvasElement {
  const [c, x] = makeCanvas(R * 2, R * 2);
  if (!x) return c;
  const g = x.createLinearGradient(0, 0, 0, R * 2);
  g.addColorStop(0, 'rgba(255, 230, 120, 1)');
  g.addColorStop(0.45, 'rgba(255, 90, 180, 1)');
  g.addColorStop(1, 'rgba(120, 40, 255, 1)');
  x.fillStyle = g;
  x.beginPath();
  x.arc(R, R, R, 0, Math.PI * 2);
  x.fill();
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 8; i++) {
    const y = R * (0.95 + i * 0.14);
    const gap = R * (0.018 + i * 0.012);
    x.fillRect(0, y, R * 2, gap);
  }
  return c;
}

/** ネオン都市のシルエット。窓は一部だけ点け、屋上に航空灯の位置を返す。 */
function makeSkyline(w: number, h: number, scale: number, near: boolean): [HTMLCanvasElement, Beacon[]] {
  const [c, x] = makeCanvas(w, h);
  const beacons: Beacon[] = [];
  if (!x) return [c, beacons];
  let px = -Math.random() * 30 * scale;
  while (px < w) {
    const bw = (near ? 26 + Math.random() * 50 : 16 + Math.random() * 38) * scale;
    const bh = h * (near ? 0.25 + Math.random() * 0.5 : 0.35 + Math.random() * 0.65);
    const top = h - bh;
    x.fillStyle = near ? 'rgb(5, 8, 22)' : 'rgb(14, 18, 48)';
    x.fillRect(px, top, bw, bh);
    // 屋上のネオンの縁
    x.fillStyle = near ? `rgba(${MAGENTA}, 0.55)` : `rgba(${CYAN}, 0.3)`;
    x.fillRect(px, top, bw, Math.max(1, 1.2 * scale));
    // 窓
    const cell = 5 * scale;
    for (let wy = top + cell; wy < h - cell; wy += cell * 1.6) {
      for (let wx = px + cell * 0.6; wx < px + bw - cell; wx += cell * 1.4) {
        if (Math.random() > (near ? 0.22 : 0.16)) continue;
        const hue = Math.random();
        x.fillStyle = hue < 0.5 ? `rgba(${CYAN}, 0.75)` : hue < 0.8 ? `rgba(${MAGENTA}, 0.7)` : 'rgba(255, 210, 120, 0.7)';
        x.fillRect(wx, wy, cell * 0.7, cell * 0.55);
      }
    }
    // 高いビルには尖塔と航空灯
    if (bh > h * 0.6 && Math.random() < 0.7) {
      const ax = px + bw / 2;
      const ah = 10 * scale + Math.random() * 18 * scale;
      x.strokeStyle = near ? 'rgb(5, 8, 22)' : 'rgb(14, 18, 48)';
      x.lineWidth = Math.max(1, 1.5 * scale);
      x.beginPath();
      x.moveTo(ax, top);
      x.lineTo(ax, top - ah);
      x.stroke();
      beacons.push({ x: ax, y: top - ah, phase: Math.random() * Math.PI * 2, speed: 0.002 + Math.random() * 0.002 });
    }
    px += bw + (Math.random() < 0.3 ? Math.random() * 8 * scale : 0);
  }
  return [c, beacons];
}

export const SpeedWorldRain: React.FC = () => {
  const theme = useSettingsStore((s) => s.theme);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (theme !== 'speedworld') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    const cyanGlow = makeGlowSprite(CYAN);
    const magentaGlow = makeGlowSprite(MAGENTA);
    const redGlow = makeGlowSprite('255, 40, 90');

    let w = 0, h = 0, scale = 1;
    let vpX = 0, vpY = 0; // 消失点（地平線の中央）
    let roadHalf = 0; // 画面下端での道路の半幅
    let sun: HTMLCanvasElement = cyanGlow;
    let sunR = 0;
    let farCity: HTMLCanvasElement = cyanGlow;
    let nearCity: HTMLCanvasElement = cyanGlow;
    let beacons: Beacon[] = [];
    let streaks: Streak[] = [];
    let stars: Star[] = [];
    let cars: Car[] = [];
    let meteors: Meteor[] = [];
    let rings: Ring[] = [];
    let gridOffset = 0;
    let dashOffset = 0;
    let boost = 0; // 0..1（ブーストの強さ）
    let boostStart = -Infinity;
    let nextBoostAt = performance.now() + 4000;
    let nextMeteorAt = performance.now() + 1500;

    const spawnStreak = (): Streak => ({
      angle: Math.random() * Math.PI * 2,
      dist: 10 + Math.random() * 40,
      speed: 5 + Math.random() * 11,
      len: 30 + Math.random() * 70,
      width: 1 + Math.random() * 2,
      hue: Math.random() < 0.45 ? 'cyan' : Math.random() < 0.8 ? 'magenta' : 'white',
    });

    const spawnCar = (anywhere: boolean): Car => {
      const incoming = Math.random() < 0.45;
      const lanes = incoming ? [0.3, 0.7] : [-0.7, -0.3];
      return {
        incoming,
        lane: lanes[Math.floor(Math.random() * 2)] + (Math.random() - 0.5) * 0.08,
        z: anywhere ? Math.random() : incoming ? 0.02 : 1.05,
        speed: 0.004 + Math.random() * 0.006,
      };
    };

    const resize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      scale = Math.max(0.6, Math.min(2, Math.max(w, h) / 1200));
      vpX = w * 0.5;
      vpY = h * 0.42;
      roadHalf = Math.max(w * 0.34, 160);

      sunR = Math.min(w * 0.16, h * 0.2);
      sun = makeSun(sunR);
      let b1: Beacon[], b2: Beacon[];
      [farCity, b1] = makeSkyline(w, h * 0.2, scale, false);
      [nearCity, b2] = makeSkyline(w, h * 0.13, scale, true);
      beacons = [
        ...b1.map((b) => ({ ...b, y: b.y + vpY - h * 0.2 })),
        ...b2.map((b) => ({ ...b, y: b.y + vpY - h * 0.13 })),
      ];

      const area = w * h;
      streaks = Array.from({ length: Math.min(80, Math.floor(area / 14000)) }, spawnStreak);
      stars = Array.from({ length: Math.min(120, Math.floor(w / 10)) }, () => ({
        x: Math.random() * w,
        y: Math.random() * vpY * 0.85,
        r: 0.5 + Math.random() * 1.4,
        tw: Math.random() * Math.PI * 2,
        twSpeed: 0.02 + Math.random() * 0.05,
      }));
      cars = Array.from({ length: 12 }, () => spawnCar(true));
    };
    resize();
    window.addEventListener('resize', resize);

    /** 道路上の点（lane: -1..1, z: 0..1）を画面座標へ */
    const road = (lane: number, z: number) => ({ x: vpX + lane * roadHalf * z, y: vpY + (h - vpY) * z });

    const line = (x0: number, y0: number, x1: number, y1: number, width: number, color: string | CanvasGradient) => {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    };

    let last = 0;
    const interval = 33; // 約30fps
    let raf = 0;

    const draw = (t: number) => {
      if (!reduceMotion) raf = requestAnimationFrame(draw);
      if (t - last < interval && !reduceMotion) return;
      const dt = Math.min(100, t - last);
      last = t;

      // ブースト：数秒おきに一気に加速して、なめらかに戻る
      if (!reduceMotion && t >= nextBoostAt) {
        boostStart = t;
        nextBoostAt = t + 7000 + Math.random() * 5000;
        rings.push({ r: 0, life: 1 });
      }
      const bt = (t - boostStart) / 1000;
      boost = bt < 0.4 ? bt / 0.4 : bt < 1.6 ? 1 : Math.max(0, 1 - (bt - 1.6) / 1.2);
      const speedMul = 1 + boost * 1.8;

      // 夜空
      const sky = ctx.createLinearGradient(0, 0, 0, vpY);
      sky.addColorStop(0, '#02030c');
      sky.addColorStop(0.65, '#0a0a2a');
      sky.addColorStop(1, '#2a0d45');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, vpY);
      ctx.fillStyle = '#02040c';
      ctx.fillRect(0, vpY, w, h - vpY);

      // 星
      for (const s of stars) {
        s.tw += s.twSpeed;
        ctx.globalAlpha = 0.25 + Math.max(0, Math.sin(s.tw)) * 0.6;
        ctx.fillStyle = 'rgb(170, 230, 255)';
        ctx.fillRect(s.x, s.y, s.r * 2, s.r * 2);
      }
      ctx.globalAlpha = 1;

      ctx.globalCompositeOperation = 'lighter';
      // データの流星
      if (!reduceMotion && t >= nextMeteorAt) {
        nextMeteorAt = t + 1800 + Math.random() * 3200;
        const fromLeft = Math.random() < 0.5;
        meteors.push({ x: fromLeft ? -20 : w + 20, y: Math.random() * vpY * 0.5, vx: (fromLeft ? 1 : -1) * (14 + Math.random() * 8) * scale, vy: (3 + Math.random() * 3) * scale, life: 1 });
      }
      for (const m of meteors) {
        m.x += m.vx;
        m.y += m.vy;
        m.life -= 0.02;
        const g = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * 8, m.y - m.vy * 8);
        g.addColorStop(0, `rgba(${CYAN}, ${0.9 * m.life})`);
        g.addColorStop(1, `rgba(${CYAN}, 0)`);
        line(m.x, m.y, m.x - m.vx * 8, m.y - m.vy * 8, 2 * scale, g);
      }
      meteors = meteors.filter((m) => m.life > 0 && m.y < vpY);

      // サーチライト（都市から夜空をなでる光）
      for (let i = 0; i < 2; i++) {
        const bx = w * (0.28 + i * 0.44);
        const ang = -Math.PI / 2 + Math.sin(t * 0.00035 + i * 2.4) * 0.55;
        const len = vpY * 1.1;
        const spread = 0.07;
        const g = ctx.createLinearGradient(bx, vpY, bx + Math.cos(ang) * len, vpY + Math.sin(ang) * len);
        g.addColorStop(0, `rgba(${i ? MAGENTA : CYAN}, 0.16)`);
        g.addColorStop(1, `rgba(${i ? MAGENTA : CYAN}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(bx, vpY - h * 0.05);
        ctx.lineTo(bx + Math.cos(ang - spread) * len, vpY + Math.sin(ang - spread) * len);
        ctx.lineTo(bx + Math.cos(ang + spread) * len, vpY + Math.sin(ang + spread) * len);
        ctx.closePath();
        ctx.fill();
      }

      // 太陽（うしろに大きな光のにじみ）
      const sunY = vpY - sunR * 0.55;
      ctx.globalAlpha = 0.35;
      ctx.drawImage(magentaGlow, vpX - sunR * 2.4, sunY - sunR * 2.4, sunR * 4.8, sunR * 4.8);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.65;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, vpY);
      ctx.clip();
      ctx.drawImage(sun, vpX - sunR, sunY - sunR);
      ctx.restore();
      ctx.globalAlpha = 1;

      // 都市（奥→手前）
      ctx.drawImage(farCity, 0, vpY - farCity.height);
      ctx.drawImage(nearCity, 0, vpY - nearCity.height);

      ctx.globalCompositeOperation = 'lighter';
      // 屋上の航空灯（ゆっくり明滅。小さいので光過敏の対象外の大きさ）
      for (const b of beacons) {
        const a = Math.max(0, Math.sin(t * b.speed + b.phase));
        const s = 7 * scale;
        ctx.globalAlpha = a * 0.9;
        ctx.drawImage(redGlow, b.x - s, b.y - s, s * 2, s * 2);
      }
      ctx.globalAlpha = 1;

      // 地平線の発光ライン
      const hg = ctx.createLinearGradient(0, vpY - 50 * scale, 0, vpY + 30 * scale);
      hg.addColorStop(0, `rgba(${CYAN}, 0)`);
      hg.addColorStop(0.62, `rgba(${CYAN}, 0.2)`);
      hg.addColorStop(1, `rgba(${MAGENTA}, 0)`);
      ctx.fillStyle = hg;
      ctx.fillRect(0, vpY - 50 * scale, w, 80 * scale);
      line(0, vpY, w, vpY, 1.5 * scale, `rgba(${CYAN}, 0.7)`);
      ctx.globalCompositeOperation = 'source-over';

      // 遠近グリッドの床（消失点へ収束する縦線＋速度で流れる横線）
      ctx.lineWidth = 1;
      const vLines = 22;
      for (let i = 0; i <= vLines; i++) {
        const lane = (i / vLines) * 2 - 1;
        const edgeX = vpX + lane * w * 1.3;
        line(vpX, vpY, edgeX, h, 1, `rgba(${CYAN}, 0.28)`);
      }
      gridOffset = (gridOffset + 2.6 * speedMul * (dt / 33)) % 60;
      for (let d = gridOffset; d < h * 1.4; d += 60) {
        const ratio = d / (h * 1.4);
        const y = vpY + (h - vpY) * Math.pow(ratio, 1.9);
        if (y > h) continue;
        line(0, y, w, y, 1, `rgba(${CYAN}, ${0.05 + ratio * 0.35})`);
      }

      // ハイウェイ（アスファルト→路肩のネオン→センターライン）
      ctx.fillStyle = 'rgba(3, 4, 14, 0.82)';
      ctx.beginPath();
      ctx.moveTo(vpX, vpY);
      ctx.lineTo(vpX + roadHalf, h);
      ctx.lineTo(vpX - roadHalf, h);
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      for (const side of [-1, 1]) {
        line(vpX, vpY, vpX + side * roadHalf, h, 10 * scale, `rgba(${MAGENTA}, 0.12)`);
        line(vpX, vpY, vpX + side * roadHalf, h, 2.2 * scale, `rgba(${MAGENTA}, 0.85)`);
      }
      dashOffset = (dashOffset + 0.012 * speedMul * (dt / 33)) % 0.2;
      for (let k = 0; k < 6; k++) {
        const z0 = Math.pow((k * 0.2 + dashOffset) / 1.2, 1.6);
        const z1 = Math.pow((k * 0.2 + dashOffset + 0.09) / 1.2, 1.6);
        const p0 = road(0, z0);
        const p1 = road(0, Math.min(1, z1));
        line(p0.x, p0.y, p1.x, p1.y, Math.max(1, 5 * scale * z1), `rgba(${CYAN}, ${0.25 + z1 * 0.55})`);
      }

      // 車の光跡（奥へ去る赤いテールランプ／迫る白いヘッドライト）
      ctx.lineCap = 'round';
      for (const c of cars) {
        const dz = c.speed * speedMul * (0.25 + c.z) * (dt / 33);
        c.z += c.incoming ? dz : -dz * 0.8;
        if (c.z > 1.08 || c.z < 0.015) { Object.assign(c, spawnCar(false)); continue; }
        const tail = c.incoming ? -0.12 : 0.12; // 光跡は進行方向の反対側に伸びる
        const zHead = c.z;
        const zTail = Math.max(0.01, Math.min(1.1, c.z + tail * (0.4 + c.z)));
        for (const off of [-0.035, 0.035]) {
          const a = road(c.lane + off, zHead);
          const b = road(c.lane + off, zTail);
          const color = c.incoming ? '220, 245, 255' : '255, 40, 90';
          const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
          g.addColorStop(0, `rgba(${color}, ${0.25 + zHead * 0.7})`);
          g.addColorStop(1, `rgba(${color}, 0)`);
          line(a.x, a.y, b.x, b.y, Math.max(1, 4 * scale * zHead), g);
          const s = (6 + 16 * zHead) * scale;
          ctx.globalAlpha = 0.3 + zHead * 0.6;
          ctx.drawImage(c.incoming ? cyanGlow : redGlow, a.x - s, a.y - s, s * 2, s * 2);
          ctx.globalAlpha = 1;
        }
      }

      // 消失点から放射する光速ストリーク
      const maxDist = Math.hypot(w, h) * 0.75;
      for (const s of streaks) {
        s.dist += s.speed * (1 + s.dist / maxDist) * 2.2 * speedMul * (dt / 33);
        if (s.dist > maxDist) Object.assign(s, spawnStreak());
        const len = s.len * (1 + boost * 2.5);
        const x0 = vpX + Math.cos(s.angle) * s.dist;
        const y0 = vpY + Math.sin(s.angle) * s.dist * 0.6; // 縦方向は少し圧縮して床っぽく見せる
        const x1 = vpX + Math.cos(s.angle) * (s.dist + len);
        const y1 = vpY + Math.sin(s.angle) * (s.dist + len) * 0.6;
        const alpha = Math.min(0.85, s.dist / (maxDist * 0.5));
        const color = s.hue === 'cyan' ? CYAN : s.hue === 'magenta' ? MAGENTA : '220, 245, 255';
        line(x0, y0, x1, y1, s.width * (0.5 + s.dist / maxDist), `rgba(${color}, ${alpha})`);
      }

      // ブーストの衝撃波（輪が広がって消えるだけで、画面全体は光らせない）
      for (const r of rings) {
        r.r += 28 * scale * (dt / 33);
        r.life -= 0.035 * (dt / 33);
        if (r.life <= 0) continue;
        ctx.beginPath();
        ctx.ellipse(vpX, vpY, r.r, r.r * 0.45, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${CYAN}, ${r.life * 0.55})`;
        ctx.lineWidth = 3 * scale * r.life + 1;
        ctx.stroke();
      }
      rings = rings.filter((r) => r.life > 0);

      // 消失点の光（ブースト中は強く）
      const vg = (90 + boost * 90) * scale;
      ctx.globalAlpha = 0.4 + boost * 0.3;
      ctx.drawImage(cyanGlow, vpX - vg, vpY - vg, vg * 2, vg * 2);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // HUD：四隅のブラケットと、ゆっくり下りる走査線
      const m = 14 * scale;
      const L = 36 * scale;
      ctx.lineWidth = 2;
      ctx.strokeStyle = `rgba(${CYAN}, 0.45)`;
      for (const [cx, cy, sx, sy] of [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]]) {
        ctx.beginPath();
        ctx.moveTo(cx, cy + sy * L);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx + sx * L, cy);
        ctx.stroke();
      }
      if (!reduceMotion) {
        const sy = ((t * 0.06) % (h + 200)) - 100;
        const sg = ctx.createLinearGradient(0, sy - 60, 0, sy);
        sg.addColorStop(0, `rgba(${CYAN}, 0)`);
        sg.addColorStop(1, `rgba(${CYAN}, 0.06)`);
        ctx.fillStyle = sg;
        ctx.fillRect(0, sy - 60, w, 60);
      }
    };

    if (reduceMotion) {
      // 視差効果を減らす設定：1枚だけ描いて止める（画面サイズが変わったら描き直す）
      const still = () => draw(performance.now());
      still();
      window.addEventListener('resize', still);
      return () => {
        window.removeEventListener('resize', resize);
        window.removeEventListener('resize', still);
      };
    }
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [theme]);

  if (theme !== 'speedworld') return null;

  return (
    <div aria-hidden className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-90" />
      {/* 走査線（静止したCSSの縞なので負荷はほぼない）と、文字を読みやすくする上下の暗幕 */}
      <div
        className="absolute inset-0"
        style={{
          background: [
            'repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.14) 3px)',
            'linear-gradient(to bottom, rgba(2,4,12,0.35) 0%, rgba(2,4,12,0) 30%, rgba(2,4,12,0) 70%, rgba(2,4,12,0.45) 100%)',
          ].join(', '),
        }}
      />
    </div>
  );
};
