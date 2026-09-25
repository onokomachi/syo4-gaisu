/**
 * テーマ背景の動画レイヤー（戦争・冥界神で共用）。
 * - 無音でくり返し再生する。ミュートを確実にかけてから play() する（Reactのmuted属性だけだとiOSで自動再生されないことがある）。
 * - タブが裏に回ったら止め、戻ったら再開する。
 * - 「視差効果を減らす」設定では静止画（poster）だけにし、データセーバー／低速回線では動画を読み込まない。
 */
import React, { useEffect, useRef } from 'react';

export type BgMode = 'full' | 'lite' | 'still';

type NetworkInfoLike = { saveData?: boolean; effectiveType?: string };

/** full=動画＋演出 / lite=静止画＋演出（データ節約） / still=静止画のみ（視差効果を減らす） */
export function detectBgMode(): BgMode {
  if (typeof window === 'undefined') return 'full';
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 'still';
  const conn = (navigator as Navigator & { connection?: NetworkInfoLike }).connection;
  if (conn?.saveData || conn?.effectiveType === 'slow-2g' || conn?.effectiveType === '2g') return 'lite';
  return 'full';
}

/**
 * <source> の type に codecs まで書いておくと、再生できない形式はダウンロードせずに飛ばしてくれる
 * （codecs なしだと、H.264 を再生できないブラウザでも MP4 を読みに行ってから WebM に切り替える）。
 */
export const VIDEO_TYPE = {
  mp4: 'video/mp4; codecs="avc1.64001F"',
  webm: 'video/webm; codecs="vp9"',
  mp4WithAudio: 'video/mp4; codecs="avc1.64001F, mp4a.40.2"',
  webmWithAudio: 'video/webm; codecs="vp9, opus"',
} as const;

export interface VideoSources {
  webm: string;
  mp4: string;
  poster: string;
  /** 同じ画質で MP4 のほうが小さい動画は MP4 を先に候補にする */
  preferMp4?: boolean;
}

export const ThemeVideo: React.FC<{ src: VideoSources; mode: BgMode; className?: string }> = ({ src, mode, className = '' }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (mode !== 'full') return;
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.defaultMuted = true;
    const play = () => { v.play().catch(() => { /* 自動再生が拒否されても静止画（poster）が残る */ }); };
    const onVisibility = () => { if (document.hidden) v.pause(); else play(); };
    play();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      v.pause();
    };
  }, [mode]);

  const cls = `absolute inset-0 w-full h-full object-cover ${className}`;
  if (mode !== 'full') return <img src={src.poster} alt="" className={cls} />;

  const webm = <source key="webm" src={src.webm} type={VIDEO_TYPE.webm} />;
  const mp4 = <source key="mp4" src={src.mp4} type={VIDEO_TYPE.mp4} />;
  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      poster={src.poster}
      disablePictureInPicture
      disableRemotePlayback
      tabIndex={-1}
      className={cls}
    >
      {src.preferMp4 ? [mp4, webm] : [webm, mp4]}
    </video>
  );
};
