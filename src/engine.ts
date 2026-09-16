// 纯函数引擎：分束编排、横杆几何、挂钩可行性、左右交替与载荷差判定
import type {
  AppState,
  Batch,
  Bundle,
  DefectKind,
  FeasibilityResult,
  HookSlot,
  Params,
  Side,
  Structure,
} from './types';

export const STAGE_ORDER: Bundle['stage'][] = [
  'planned',
  'labeled',
  'bound',
  'weighed',
  'hung',
  'dry',
  'cut',
];

export const STAGE_LABEL: Record<Bundle['stage'], string> = {
  planned: '待挂牌',
  labeled: '已挂牌',
  bound: '已分束',
  weighed: '已复称',
  hung: '阴干中',
  dry: '颈干待剪',
  cut: '已收束',
};

export const DEFECT_LABEL: Record<DefectKind, string> = {
  none: '完好',
  brokenSkin: '破皮',
  mold: '霉斑',
};

/** 霉斑整束隔离后不再参与作业与占钩 */
export function isActive(b: Bundle): boolean {
  return b.flag !== 'moldQuarantined';
}

export function bundleWeight(b: Bundle): number {
  return b.actualKg ?? b.estimatedKg;
}

export function otherSide(side: Side): Side {
  return side === 'left' ? 'right' : 'left';
}

// ---------- 分束编排 ----------

/** 同一畦号束号计数（仅在制束），用于追加束号 */
export function bedSeqNumbers(bundles: Bundle[], bedId: string): number[] {
  return bundles
    .filter((b) => b.bedId === bedId)
    .map((b) => {
      const suffix = b.seq.split('-').pop() ?? '';
      const n = parseInt(suffix, 10);
      return Number.isFinite(n) ? n : 0;
    });
}

export function makeSeq(bedId: string, index: number): string {
  return `${bedId}-${String(index).padStart(2, '0')}`;
}

interface PlanChunk {
  bulbs: number;
  estimatedKg: number;
  short: boolean;
}

/** 把一个完好畦批按单束枚数切块；末束不足时仍成束并加 shortCount 标记 */
function chunkBatch(batch: Batch, params: Params): PlanChunk[] {
  if (batch.defect !== 'none' || batch.bulbs <= 0) return [];
  const chunks: PlanChunk[] = [];
  let remaining = batch.bulbs;
  while (remaining > 0) {
    const take = Math.min(params.bulbsPerBundle, remaining);
    chunks.push({
      bulbs: take,
      estimatedKg: (batch.weightKg * take) / batch.bulbs,
      short: take < params.bulbsPerBundle,
    });
    remaining -= take;
  }
  return chunks;
}

let bundleOrdinal = 0;
export function newBundleId(): string {
  bundleOrdinal += 1;
  return `b-${Date.now().toString(36)}-${bundleOrdinal}-${Math.random().toString(36).slice(2, 5)}`;
}

function toBundle(batch: Batch, chunk: PlanChunk, seq: string): Bundle {
  return {
    id: newBundleId(),
    seq,
    bedId: batch.bedId,
    batchId: batch.id,
    bulbs: chunk.bulbs,
    estimatedKg: round1(chunk.estimatedKg),
    stage: 'planned',
    flag: chunk.short ? 'shortCount' : 'none',
  };
}

/** 首次（或清空后）全量编排：只处理完好畦批，不同畦号绝不混束 */
export function planAllBundles(batches: Batch[], params: Params): Bundle[] {
  const bundles: Bundle[] = [];
  const clean = batches
    .filter((b) => b.defect === 'none')
    .sort((a, b) => a.createdAt - b.createdAt);
  for (const batch of clean) {
    let next =
      bedSeqNumbers(bundles, batch.bedId).reduce((m, n) => Math.max(m, n), 0) + 1;
    for (const chunk of chunkBatch(batch, params)) {
      bundles.push(toBundle(batch, chunk, makeSeq(batch.bedId, next)));
      next += 1;
    }
  }
  return bundles;
}

/**
 * 增量补排：统计每个完好畦批已在制束占用的枚数，把余量继续切块补束。
 * 用于霉斑整束隔离、重排未挂部分之后。
 */
export function appendPlannedBundles(
  batches: Batch[],
  bundles: Bundle[],
  params: Params,
): Bundle[] {
  const added: Bundle[] = [];
  const clean = batches.filter((b) => b.defect === 'none');
  for (const batch of clean) {
    const used = bundles
      .filter((b) => isActive(b) && b.batchId === batch.id)
      .reduce((sum, b) => sum + b.bulbs, 0);
    if (used >= batch.bulbs) continue;
    const restBatch: Batch = {
      ...batch,
      bulbs: batch.bulbs - used,
      weightKg: batch.weightKg * ((batch.bulbs - used) / batch.bulbs),
    };
    let next =
      bedSeqNumbers(bundles, batch.bedId).reduce((m, n) => Math.max(m, n), 0) + 1;
    for (const chunk of chunkBatch(restBatch, params)) {
      const b = toBundle(batch, chunk, makeSeq(batch.bedId, next));
      added.push(b);
      bundles = [...bundles, b];
      next += 1;
    }
  }
  return added;
}

// ---------- 横杆几何（俯视，单位厘米） ----------

export function barStartX(s: Structure): number {
  return (s.roomWidthCm - s.barLengthCm) / 2;
}

/** 挂位 i 沿横杆方向的 x 坐标：按相邻挂位间距等距布置并居中 */
export function stationX(s: Structure, i: number): number {
  const inner = (s.stationCount - 1) * s.stationGapCm;
  const first = barStartX(s) + (s.barLengthCm - inner) / 2;
  return first + i * s.stationGapCm;
}

export function barYcm(s: Structure): number {
  return (s.barY / 100) * s.roomDepthCm;
}

/** 双面挂钩侧面的蒜束中心相对横杆中线的进深偏移 */
export function sideReach(p: Params): number {
  return p.bundleRadiusCm + p.clearGapCm / 2;
}

export interface Point {
  x: number;
  y: number;
}

export function hookPosition(s: Structure, p: Params, slot: HookSlot): Point {
  const x = stationX(s, slot.stationIndex);
  const y = barYcm(s) + (slot.side === 'left' ? -sideReach(p) : sideReach(p));
  return { x, y };
}

export function floorClearance(s: Structure): number {
  return s.barHeightCm - s.ropeDropCm - s.bundleHeightCm;
}

export interface Occupancy {
  bundle: Bundle;
  slot: HookSlot;
  pos: Point;
}

export function hungOccupancies(state: AppState): Occupancy[] {
  return state.bundles
    .filter((b) => isActive(b) && (b.stage === 'hung' || b.stage === 'dry') && b.side && b.stationIndex !== undefined)
    .map((b) => {
      const slot = { stationIndex: b.stationIndex!, side: b.side! };
      return { bundle: b, slot, pos: hookPosition(state.structure, state.params, slot) };
    });
}

function circlesClear(a: Point, b: Point, ra: number, rb: number, gap: number): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy) >= ra + rb + gap - 0.01;
}

/** 判断把 bundle 放到 slot 是否可行（超载 / 碰禁区 / 净距 / 成对载荷差） */
export function evaluateSlot(state: AppState, bundle: Bundle, slot: HookSlot): FeasibilityResult {
  const { structure: s, params: p } = state;
  const reasons: string[] = [];
  const weight = bundleWeight(bundle);

  if (weight > p.hookLoadKg + 0.001) {
    reasons.push(`束重 ${round1(weight)}kg 超过单钩载重 ${p.hookLoadKg}kg`);
  }

  // 同一挂钩已被占用（复核时候选束自身在杆上，需排除）
  const occupant = state.bundles.find(
    (b) =>
      b.id !== bundle.id &&
      isActive(b) &&
      (b.stage === 'hung' || b.stage === 'dry') &&
      b.stationIndex === slot.stationIndex &&
      b.side === slot.side,
  );
  if (occupant) reasons.push(`该挂钩已被束 ${occupant.seq} 占用`);

  const pos = hookPosition(s, p, slot);

  // 墙体禁碰区（左右山墙与南北墙俯视投影）
  if (pos.x - p.bundleRadiusCm < s.wallGapCm - 0.01) {
    reasons.push('蒜束外廓侵入左侧墙地禁碰区');
  }
  if (pos.x + p.bundleRadiusCm > s.roomWidthCm - s.wallGapCm + 0.01) {
    reasons.push('蒜束外廓侵入右侧墙地禁碰区');
  }
  if (slot.side === 'left' && pos.y - p.bundleRadiusCm < s.wallGapCm - 0.01) {
    reasons.push('蒜束外廓侵入北侧墙地禁碰区');
  }
  if (slot.side === 'right' && pos.y + p.bundleRadiusCm > s.roomDepthCm - s.wallGapCm + 0.01) {
    reasons.push('蒜束外廓侵入南侧墙地禁碰区');
  }

  // 与所有在杆蒜束的外廓净距
  for (const occ of hungOccupancies(state)) {
    if (occ.bundle.id === bundle.id) continue;
    if (
      !circlesClear(pos, occ.pos, p.bundleRadiusCm, p.bundleRadiusCm, p.clearGapCm)
    ) {
      reasons.push(`外廓净距不足：与束 ${occ.bundle.seq} 重叠或净距小于 ${p.clearGapCm}cm`);
    }
  }

  // 成对挂钩左右载荷差
  const pairMate = state.bundles.find(
    (b) =>
      isActive(b) &&
      (b.stage === 'hung' || b.stage === 'dry') &&
      b.stationIndex === slot.stationIndex &&
      b.side !== slot.side,
  );
  if (pairMate) {
    const diff = Math.abs(bundleWeight(pairMate) - weight);
    if (diff > p.pairDiffKg + 0.001) {
      reasons.push(
        `与对侧束 ${pairMate.seq} 载荷差 ${round1(diff)}kg，超过上限 ${p.pairDiffKg}kg`,
      );
    }
  }

  return { ok: reasons.length === 0, reasons };
}

export interface SlotChoice {
  slot: HookSlot;
  feasibility: FeasibilityResult;
}

/**
 * 左右交替上杆：严格从指定面（本次手持方向）由近及远寻找可行钩位。
 * 该面无可行钩位时不允许自行翻面——需先处理障碍或整束隔离后重排。
 */
export function chooseAlternatingSlot(state: AppState, bundle: Bundle, side: Side): SlotChoice | null {
  let firstFailure: SlotChoice | null = null;
  for (let i = 0; i < state.structure.stationCount; i += 1) {
    const slot = { stationIndex: i, side };
    const feasibility = evaluateSlot(state, bundle, slot);
    if (feasibility.ok) return { slot, feasibility };
    if (!firstFailure) firstFailure = { slot, feasibility };
  }
  return firstFailure;
}

/** 设计期校核：棚杆资料本身是否能满足间距与离地要求 */
export function structureWarnings(s: Structure, p: Params): string[] {
  const warnings: string[] = [];
  if (s.barLengthCm > s.roomWidthCm - 2 * s.wallGapCm + 0.01) {
    warnings.push('横杆长度加上墙地禁碰区后超过棚内可用宽度');
  }
  if ((s.stationCount - 1) * s.stationGapCm > s.barLengthCm + 0.01) {
    warnings.push('挂位间距与挂位数所需长度超过横杆长度');
  }
  if (s.stationGapCm < 2 * p.bundleRadiusCm + p.clearGapCm - 0.01) {
    warnings.push(
      `同面相邻挂位净距不足：间距需 ≥ ${2 * p.bundleRadiusCm + p.clearGapCm}cm`,
    );
  }
  const reach = sideReach(p);
  if (barYcm(s) - reach - p.bundleRadiusCm < s.wallGapCm - 0.01) {
    warnings.push('左（北）面蒜束外廓进入墙地禁碰区，请下调横杆位置或减小外廓');
  }
  if (s.roomDepthCm - (barYcm(s) + reach + p.bundleRadiusCm) < s.wallGapCm - 0.01) {
    warnings.push('右（南）面蒜束外廓进入墙地禁碰区，请上调横杆位置或减小外廓');
  }
  const clearance = floorClearance(s);
  if (clearance < s.floorGapCm - 0.01) {
    warnings.push(
      `蒜束底部离地仅 ${round1(Math.max(clearance, 0))}cm，不足 ${s.floorGapCm}cm（墙地禁碰）`,
    );
  }
  return warnings;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** 每站左右在杆载荷（千克） */
export function stationLoads(state: AppState): { left?: number; right?: number }[] {
  const loads: { left?: number; right?: number }[] = Array.from(
    { length: state.structure.stationCount },
    () => ({}),
  );
  for (const b of state.bundles) {
    if (!isActive(b)) continue;
    if ((b.stage === 'hung' || b.stage === 'dry') && b.side && b.stationIndex !== undefined) {
      loads[b.stationIndex][b.side] = round1(bundleWeight(b));
    }
  }
  return loads;
}
