/**
 * 実力の階段 ── この単元の中で、自分がどこまで確実にできるかを測る。
 *
 * 画面と決まり（極限・無限・セーブ・予想点・記録）は learning-app-kit の TrialScreen。
 * このアプリが決めるのは、段（trialConfig）と、1問の作り方・出し方だけ。
 * 問題は本番テストと同じ解答画面（TestActivity）で出す。
 */
import React from 'react';
import confetti from 'canvas-confetti';
import { TrialScreen } from 'learning-app-kit/react';
import { TRIAL, ENDLESS_FLOORS, EXTRA_SKILLS, trialProblem } from '../../lib/trialConfig';
import { practiceModuleOf, type TestProblem } from '../../lib/testConfig';
import type { ModuleId } from '../../store/progressStore';
import { playClear, playCorrect, playSoftTry } from '../../lib/sound';
import { TestActivity } from './MockTestModule';
import { MeaningRound } from './MeaningModule';
import { RangeRound } from './RangeModule';
import { RoundRound } from './RoundModule';
import { RoundJudgeRound } from './RoundJudgeModule';

/** 本番テストの設問か、テストに出ない項目（無限だけ）か */
type TrialQ = { tp: TestProblem } | { extra: string };

interface Props {
  onExit: () => void;
  /** 結果から「やるべき段」の練習へ飛ぶ */
  onPractice: (id: ModuleId) => void;
}

export const TrialModule: React.FC<Props> = ({ onExit, onPractice }) => (
  <TrialScreen<TrialQ>
    appId="gaisu"
    supabaseUrl={import.meta.env.VITE_SUPABASE_URL as string | undefined}
    supabaseKey={import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined}
    floors={TRIAL.floors}
    endlessFloors={ENDLESS_FLOORS}
    testReqs={TRIAL.reqs}
    testMax={TRIAL.max}
    generate={(skillId) => (EXTRA_SKILLS.includes(skillId) ? { extra: skillId } : { tp: trialProblem(skillId) })}
    render={(q, h) => (
      // 本番テストと同じ出題画面を、明るい面の上に置く（読みやすさを優先）
      <div className="rounded-[28px] bg-bg text-content p-2 sm:p-4 shadow-[0_0_60px_-20px_rgba(103,232,249,0.45)]">
        {'extra' in q
          ? <ExtraRound skillId={q.extra} onResult={h.onResult} onMiss={h.onMiss} />
          : <TestActivity tp={q.tp} onNext={() => {}} onResult={h.onResult} onMiss={h.onMiss} nextLabel="つぎへ" />}
      </div>
    )}
    onExit={onExit}
    exitLabel="もどる"
    onPractice={(skillId) => {
      const m = practiceModuleOf(skillId);
      if (m) onPractice(m);
    }}
    sound={{
      correct: playCorrect,
      miss: playSoftTry,
      clear: () => {
        playClear();
        confetti({ particleCount: 160, spread: 90, origin: { y: 0.4 }, colors: ['#67e8f9', '#f0abfc', '#fde68a'] });
      },
    }}
  />
);

interface ExtraProps {
  skillId: string;
  onResult: (perfect: boolean) => void;
  onMiss: () => void;
}

/**
 * 本番テストに出ない項目を、練習と同じ画面で出す（無限だけ）。
 * 練習の画面は level だけ渡せば自分で問題を作る。問題ごとに作り直される（TrialScreen が key を変える）。
 */
export const ExtraRound: React.FC<ExtraProps> = ({ skillId, onResult, onMiss }) => {
  const common = { onNext: () => {}, onResult, onMiss, nextLabel: 'つぎへ' };
  if (skillId.startsWith('meaning-')) return <MeaningRound {...common} level={skillId as React.ComponentProps<typeof MeaningRound>['level']} />;
  if (skillId.startsWith('range-')) return <RangeRound {...common} level={skillId as React.ComponentProps<typeof RangeRound>['level']} />;
  if (skillId.startsWith('roundjudge-')) return <RoundJudgeRound {...common} level={skillId as React.ComponentProps<typeof RoundJudgeRound>['level']} />;
  if (skillId.startsWith('round-')) return <RoundRound {...common} level={skillId as React.ComponentProps<typeof RoundRound>['level']} />;
  return null;
};
