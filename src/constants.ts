import { ModuleId } from './store/progressStore';

/**
 * 「がい数ランド」のモジュール一覧。
 * 単元「がい数の表し方と使い方」で身につける知識・技能を段階的に網羅する。
 */
export interface ModuleMeta {
  id: ModuleId;
  title: string;
  description: string;
  /** lucide-react のアイコン名 */
  icon: string;
  /** Tailwind の色トークン（カードのアクセント） */
  accent: string;
  status: 'ready' | 'soon';
}

export const MODULES: ModuleMeta[] = [
  {
    id: 'meaning',
    title: 'がい数の いみ',
    description: '約何万・約何千、がい数を つかう場面は？',
    icon: 'Milestone',
    accent: 'amber',
    status: 'ready',
  },
  {
    id: 'round',
    title: '四捨五入で がい数に',
    description: '指定の位・上から1けた／2けたの がい数',
    icon: 'ArrowRightLeft',
    accent: 'blue',
    status: 'ready',
  },
  {
    id: 'range',
    title: 'もとの数の はんい',
    description: '以上・未満で、もとの数の はんいを 表そう',
    icon: 'MoveHorizontal',
    accent: 'violet',
    status: 'ready',
  },
  {
    id: 'sumdiff',
    title: 'たし算・ひき算の 見積もり',
    description: '百の位までの がい数にして 計算しよう',
    icon: 'Plus',
    accent: 'emerald',
    status: 'ready',
  },
  {
    id: 'prodquot',
    title: 'かけ算・わり算の 見積もり',
    description: '上から1けたの がい数にして 計算しよう',
    icon: 'Divide',
    accent: 'cyan',
    status: 'ready',
  },
  {
    id: 'roundjudge',
    title: '切り上げ・切り捨てで 考えよう',
    description: '場面に あわせて 見積もり方を えらぼう',
    icon: 'Scale',
    accent: 'teal',
    status: 'ready',
  },
  {
    id: 'error-hunter',
    title: 'エラーハンター',
    description: 'まちがいを 見つけて なおそう',
    icon: 'Search',
    accent: 'rose',
    status: 'ready',
  },
];
