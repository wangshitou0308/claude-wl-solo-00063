// 全局领域类型：畦批、棚杆结构、引导参数、蒜束、隔离项与应用状态

export type NeckState = 'firm' | 'soft'; // 颈部状态：紧实 / 仍软
export type DefectKind = 'none' | 'brokenSkin' | 'mold'; // 无 / 破皮 / 霉斑

/** 分拣席录入的一个畦号批次（同一畦号可多次录入） */
export interface Batch {
  id: string;
  bedId: string; // 畦号
  bulbs: number; // 蒜头枚数
  weightKg: number; // 带秧重量（千克）
  neck: NeckState; // 颈部状态（录入时初判）
  defect: DefectKind; // 破皮或霉斑：有缺陷则整批先进隔离席
  note?: string;
  createdAt: number;
}

/** 横杆与棚内布局（SVG 俯视示意） */
export interface Structure {
  roomWidthCm: number; // 棚内可用宽度
  roomDepthCm: number; // 棚内进深
  barLengthCm: number; // 横杆长度
  barHeightCm: number; // 横杆离地高度
  barY: number; // 横杆沿进深方向的位置（0 北墙 .. 100 南墙，百分比）
  wallGapCm: number; // 墙地禁碰区：距墙最小净距
  floorGapCm: number; // 蒜头底部离地最小净距（垂直校核）
  stationGapCm: number; // 相邻挂位间距（成对挂钩中心距）
  ropeDropCm: number; // 挂钩到蒜束顶部的绳长（决定底部离地）
  bundleHeightCm: number; // 蒜束外廓竖直高度（经验值）
  matY: number; // 空置垫席在俯视示意中的位置（百分比）
  stationCount: number; // 挂位数（按横杆长与间距复核）
}

/** 引导参数：单束枚数、钩载、净距、左右载荷差 */
export interface Params {
  bulbsPerBundle: number; // 单束枚数
  hookLoadKg: number; // 单个挂钩允许最大载重（千克）
  pairDiffKg: number; // 成对挂钩左右载荷差上限（千克）
  bundleRadiusCm: number; // 蒜头外廓俯视半径（决定相邻净距）
  clearGapCm: number; // 相邻蒜束间要求的最小净距
}

export type Side = 'left' | 'right';

/** 蒜束所处工序：挂牌—分束—复称—上杆—颈干复核—剪秧收束 */
export type BundleStage =
  | 'planned' // 已编排，待固定标签
  | 'labeled' // 标签已固定（离开分拣席前）
  | 'bound' // 已分束扎绳，待复称
  | 'weighed' // 已复称，待上杆
  | 'hung' // 已上杆阴干
  | 'dry' // 颈部已干，待剪秧
  | 'cut'; // 已剪秧收束

export type BundleFlag =
  | 'none'
  | 'moldQuarantined' // 霉斑整束隔离
  | 'looseAtMat' // 绳结松动，落垫席重绑
  | 'staleBatch' // 批次资料改变，步骤失效
  | 'staleStructure' // 棚杆资料改变，挂位失效
  | 'shortCount'; // 末束不足单束枚数

export interface Bundle {
  id: string;
  seq: string; // 束号，如 3-02（畦号-序）
  bedId: string; // 所属畦号（不同畦号不得同束）
  batchId: string; // 来源批次（主要来源）
  bulbs: number; // 本束枚数
  estimatedKg: number; // 分束时按比例估算重量
  actualKg?: number; // 复称实际重量
  stage: BundleStage;
  flag: BundleFlag;
  stationIndex?: number; // 挂位序号（0 起）
  side?: Side; // 左钩 / 右钩
  labeledAt?: number; // 标签固定时间（离开分拣席前）
  hungAt?: number;
  dryAt?: number;
  cutAt?: number;
  // 落垫席重绑的次数，用于引导与日志
  retieCount?: number;
  // 复称时确认的枚数（允许手工修正）
  checkedBulbs?: number;
  // 颈干复核仍软：只延后该束剪秧，不释放挂位
  neckSoft?: boolean;
  neckSoftAt?: number;
}

/** 隔离席记录：破皮/霉斑蒜头或霉斑整束 */
export type QuarantineReason = 'intakeDefect' | 'bundleMold';

export interface QuarantineItem {
  id: string;
  reason: QuarantineReason;
  defect?: DefectKind;
  bedId: string;
  bulbs: number;
  weightKg: number;
  bundleSeq?: string; // 若由整束隔离而来
  createdAt: number;
  resolved: boolean; // 已处理（移出棚内另作安排）
}

/** 垫席：绳结松动时先落到空置垫席重绑 */
export interface Mat {
  id: string;
  name: string;
  occupiedBy?: string; // 占用此垫席的束号
  occupiedAt?: number;
}

export interface LogEntry {
  at: number;
  text: string;
}

/**
 * 挂位方案中一个候选挂钩（挂位序号 + 左/右面）。
 * 坐标系（俯视，厘米）：x 沿横杆，0 在横杆左端；y 为进深，横杆处为 0，
 * 左面向 -y，右面向 +y，蒜束中心距横杆 ropeReach。
 */
export interface HookSlot {
  stationIndex: number;
  side: Side;
}

/** 挂位可行性校验结果 */
export interface FeasibilityResult {
  ok: boolean;
  reasons: string[]; // 不通过的原因（超载 / 碰禁区 / 净距不足 / 左右载荷差越限）
}

export interface AppState {
  version: number; // 结构或批次资料每变更一次即递增，相关步骤据此失效
  batches: Batch[];
  bundles: Bundle[];
  quarantine: QuarantineItem[];
  mats: Mat[];
  structure: Structure;
  params: Params;
  logs: LogEntry[];
  /** 上杆总侧序：左右交替，记录下一束应从哪一面开始 */
  nextSide: Side;
}

export type TabKey = 'intake' | 'structure' | 'params' | 'bench' | 'print';
