// 默认参数与初始状态
import type { AppState, Mat } from './types';

export const DEFAULT_MATS: Mat[] = [
  { id: 'mat-1', name: '垫席甲（杆下东侧）' },
  { id: 'mat-2', name: '垫席乙（杆下西侧）' },
];

export function initialState(): AppState {
  return {
    version: 1,
    batches: [],
    bundles: [],
    quarantine: [],
    mats: DEFAULT_MATS.map((m) => ({ ...m })),
    structure: {
      roomWidthCm: 360,
      roomDepthCm: 240,
      barLengthCm: 300,
      barHeightCm: 100,
      barY: 50,
      wallGapCm: 40,
      floorGapCm: 15,
      stationGapCm: 45,
      ropeDropCm: 30,
      bundleHeightCm: 40,
      matY: 78,
      stationCount: 6,
    },
    params: {
      bulbsPerBundle: 12,
      hookLoadKg: 5,
      pairDiffKg: 1,
      bundleRadiusCm: 14,
      clearGapCm: 5,
    },
    logs: [
      {
        at: Date.now(),
        text: '已建立新作业档：先录入畦批并绘制横杆，再依次完成挂牌—分束—复称—上杆—颈干复核—剪秧收束。',
      },
    ],
    nextSide: 'left',
  };
}

export function uid(prefix = 'id'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
