/**
 * 神域の試練の層。
 *
 * いまは本番テストの設問から**仮に**組んでいる（設問の順＝やさしい順、同じモジュールはまとめる）。
 * 実際の紙のテストに合わせるときは、ここを手で書きかえる
 * （floors と reqs を直接書く。倍の見方の trialConfig.ts が見本）。
 */
import { floorsFromTestSteps } from 'learning-app-kit/trial';
import { TEST_STEPS, type TestProblem } from './testConfig';

export const TRIAL = floorsFromTestSteps(TEST_STEPS);
export const FLOOR_COUNT = TRIAL.floors.length;

/** その項目の本番テストの設問を1つ選んで作る（同じ項目の設問が複数あれば、ばらばらに出す） */
export function trialProblem(skillId: string): TestProblem {
  const pool = TEST_STEPS.filter((s) => s.skillId === skillId);
  const step = pool[Math.floor(Math.random() * pool.length)] ?? TEST_STEPS[0]!;
  return step.gen();
}
