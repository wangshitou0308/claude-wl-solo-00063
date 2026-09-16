// 应用状态仓库：reducer、误确认撤回、资料变更失效、自动存档
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import { initialState, uid } from './defaults';
import {
  appendPlannedBundles,
  chooseAlternatingSlot,
  evaluateSlot,
  isActive,
  planAllBundles,
  round1,
} from './engine';
import { clearState, loadState, saveState } from './db';
import type {
  AppState,
  Batch,
  Bundle,
  HookSlot,
  Mat,
  Params,
  Structure,
} from './types';

export type Action =
  | { type: 'REPLACE_STATE'; state: AppState }
  | { type: 'ADD_BATCH'; batch: Batch }
  | { type: 'EDIT_BATCH'; id: string; patch: Partial<Batch> }
  | { type: 'DELETE_BATCH'; id: string }
  | { type: 'UPDATE_STRUCTURE'; patch: Partial<Structure> }
  | { type: 'UPDATE_PARAMS'; patch: Partial<Params> }
  | { type: 'ADD_MAT'; mat: Mat }
  | { type: 'PLAN_ALL' }
  | { type: 'REPLAN_UNHUNG' }
  | { type: 'FIX_LABEL'; bundleId: string }
  | { type: 'BIND_BUNDLE'; bundleId: string }
  | { type: 'WEIGH_BUNDLE'; bundleId: string; actualKg: number; checkedBulbs: number }
  | { type: 'CONFIRM_HANG'; bundleId: string; slot: HookSlot }
  | { type: 'LOOSE_TO_MAT'; bundleId: string; matId: string }
  | { type: 'RETIE_DONE'; bundleId: string }
  | { type: 'MARK_MOLD'; bundleId: string }
  | { type: 'NECK_SOFT'; bundleId: string }
  | { type: 'NECK_DRY'; bundleId: string }
  | { type: 'CUT_BUNDLE'; bundleId: string }
  | { type: 'TAKE_DOWN'; bundleId: string }
  | { type: 'RECHECK_POSITIONS' }
  | { type: 'RESOLVE_QUARANTINE'; id: string }
  | { type: 'RESET_ALL' };

const FORWARD_FLAGS = new Set(['none', 'shortCount']);

function withLog(state: AppState, text: string): AppState {
  return {
    ...state,
    logs: [{ at: Date.now(), text }, ...state.logs].slice(0, 200),
  };
}

/** 批次或结构改变后，使相关步骤失效 */
function markStale(state: AppState, kind: 'staleBatch' | 'staleStructure', batchId?: string): AppState {
  let changed = false;
  const bundles = state.bundles.map((b) => {
    if (!isActive(b)) return b;
    const relevant = kind === 'staleBatch' ? b.batchId === batchId : true;
    if (!relevant) return b;
    if (b.flag === 'none' || b.flag === 'shortCount' || b.flag === kind) {
      changed = true;
      // 已剪秧收束的成品不再因棚杆变动失效
      if (kind === 'staleStructure' && b.stage === 'cut') return b;
      return { ...b, flag: kind };
    }
    return b;
  });
  return changed ? { ...state, bundles, version: state.version + 1 } : state;
}

/** 霉斑隔离后释放挂位、登记隔离席，并补排未挂部分 */
function quarantineAndReplan(
  state: AppState,
  bundle: Bundle,
  textPrefix: string,
): AppState {
  const bundles = state.bundles.map((b) =>
    b.id === bundle.id
      ? {
          ...b,
          flag: 'moldQuarantined' as const,
          stationIndex: undefined,
          side: undefined,
          hungAt: undefined,
        }
      : b,
  );
  const quarantineItem = {
    id: uid('q'),
    reason: 'bundleMold' as const,
    defect: 'mold' as const,
    bedId: bundle.bedId,
    bulbs: bundle.bulbs,
    weightKg: round1(bundle.actualKg ?? bundle.estimatedKg),
    bundleSeq: bundle.seq,
    createdAt: Date.now(),
    resolved: false,
  };
  let next: AppState = {
    ...state,
    bundles,
    quarantine: [quarantineItem, ...state.quarantine],
  };
  next = withLog(
    next,
    `${textPrefix}束 ${bundle.seq}（畦号 ${bundle.bedId}，${bundle.bulbs} 枚）已整束移入隔离席${
      bundle.stage === 'hung' || bundle.stage === 'dry' ? '并释放挂位' : ''
    }，随即补排未挂部分。`,
  );
  const added = appendPlannedBundles(next.batches, next.bundles, next.params);
  if (added.length > 0) {
    next = { ...next, bundles: [...next.bundles, ...added] };
    next = withLog(next, `已补排 ${added.length} 束：${added.map((b) => b.seq).join('、')}。`);
  }
  return next;
}

function reducerImpl(prev: AppState, action: Action): AppState {
  switch (action.type) {
    case 'REPLACE_STATE':
      return action.state;

    case 'RESET_ALL':
      return withLog(initialState(), '已清空全部资料并恢复初始设置。');

    case 'ADD_BATCH': {
      let s: AppState = { ...prev, version: prev.version + 1, batches: [...prev.batches, action.batch] };
      if (action.batch.defect !== 'none') {
        s = {
          ...s,
          quarantine: [
            {
              id: uid('q'),
              reason: 'intakeDefect',
              defect: action.batch.defect,
              bedId: action.batch.bedId,
              bulbs: action.batch.bulbs,
              weightKg: action.batch.weightKg,
              createdAt: Date.now(),
              resolved: false,
            },
            ...s.quarantine,
          ],
        };
        s = withLog(
          s,
          `畦号 ${action.batch.bedId} 录入 ${action.batch.bulbs} 枚，检出${
            action.batch.defect === 'mold' ? '霉斑' : '破皮'
          }，已先隔离，不进入分束。`,
        );
      } else {
        s = withLog(s, `录入畦号 ${action.batch.bedId}：${action.batch.bulbs} 枚，带秧 ${action.batch.weightKg}kg。`);
      }
      return s;
    }

    case 'EDIT_BATCH': {
      const nextBatch = prev.batches.find((b) => b.id === action.id);
      if (!nextBatch) return prev;
      const merged: Batch = { ...nextBatch, ...action.patch };
      let s = {
        ...prev,
        batches: prev.batches.map((b) => (b.id === action.id ? merged : b)),
      };
      // 改判为破皮/霉斑：若隔离席尚无该畦批的未处理录入记录，则补登记
      if (
        merged.defect !== 'none' &&
        !s.quarantine.some(
          (q) => !q.resolved && q.reason === 'intakeDefect' && q.bedId === merged.bedId,
        )
      ) {
        s = {
          ...s,
          quarantine: [
            {
              id: uid('q'),
              reason: 'intakeDefect',
              defect: merged.defect,
              bedId: merged.bedId,
              bulbs: merged.bulbs,
              weightKg: merged.weightKg,
              createdAt: Date.now(),
              resolved: false,
            },
            ...s.quarantine,
          ],
        };
      }
      s = markStale(s, 'staleBatch', action.id);
      return withLog(s, `畦批资料已修改，相关在制蒜束步骤标记为失效，需复核或重排。`);
    }

    case 'DELETE_BATCH': {
      const batch = prev.batches.find((b) => b.id === action.id);
      let s = {
        ...prev,
        version: prev.version + 1,
        batches: prev.batches.filter((b) => b.id !== action.id),
      };
      s = markStale(s, 'staleBatch', action.id);
      return withLog(s, `畦号 ${batch?.bedId ?? ''} 的批次已删除，相关在制蒜束标记失效。`);
    }

    case 'UPDATE_STRUCTURE': {
      let s: AppState = {
        ...prev,
        version: prev.version + 1,
        structure: { ...prev.structure, ...action.patch },
      };
      s = markStale(s, 'staleStructure');
      return withLog(s, '横杆/棚内资料已修改，全部已上杆挂位标记为待复核。');
    }

    case 'UPDATE_PARAMS': {
      // 参数（束枚数、钩载、净距、载荷差）改变后，未挂步骤失效，需重排
      let s: AppState = { ...prev, params: { ...prev.params, ...action.patch } };
      s = {
        ...s,
        bundles: s.bundles.map((b) => {
          if (!isActive(b) || b.stage === 'cut') return b;
          if (b.stage === 'hung' || b.stage === 'dry') return b;
          if (b.flag === 'moldQuarantined' || b.flag === 'staleBatch' || b.flag === 'staleStructure') return b;
          return { ...b, flag: 'staleBatch' as const };
        }),
        version: s.version + 1,
      };
      return withLog(s, '引导参数已修改，未上杆的在制蒜束标记失效，请重排未挂部分。');
    }

    case 'ADD_MAT':
      return { ...prev, mats: [...prev.mats, action.mat] };

    case 'PLAN_ALL': {
      const bundles = planAllBundles(prev.batches, prev.params);
      if (bundles.length === 0) return prev;
      let s: AppState = { ...prev, bundles };
      s = withLog(s, `已按单束 ${prev.params.bulbsPerBundle} 枚编排 ${bundles.length} 束（不同畦号不同束）。`);
      return s;
    }

    case 'REPLAN_UNHUNG': {
      const kept = prev.bundles.filter(
        (b) =>
          b.flag === 'moldQuarantined' ||
          b.stage === 'hung' ||
          b.stage === 'dry' ||
          b.stage === 'cut',
      );
      // 霉斑隔离记录仅作登记，不再占束
      const keptActive = kept.filter(isActive);
      let s: AppState = { ...prev, bundles: keptActive };
      // 清空垫席占用（重绑中的束回到重排，垫席释放）
      s = { ...s, mats: s.mats.map((m) => ({ ...m, occupiedBy: undefined, occupiedAt: undefined })) };
      const added = appendPlannedBundles(s.batches, s.bundles, s.params);
      s = { ...s, bundles: [...s.bundles, ...added] };
      s = withLog(
        s,
        `已重排未挂部分：保留 ${keptActive.filter((b) => b.stage === 'hung' || b.stage === 'dry').length} 束在杆，新排 ${added.length} 束。`,
      );
      return s;
    }

    case 'FIX_LABEL': {
      const b = prev.bundles.find((x) => x.id === action.bundleId);
      if (!b || b.stage !== 'planned' || !FORWARD_FLAGS.has(b.flag)) return prev;
      let s = {
        ...prev,
        bundles: prev.bundles.map((x) =>
          x.id === b.id ? { ...x, stage: 'labeled' as const, labeledAt: Date.now() } : x,
        ),
      };
      return withLog(s, `束 ${b.seq} 标签已在分拣席固定（离开分拣席前完成）。`);
    }

    case 'BIND_BUNDLE': {
      const b = prev.bundles.find((x) => x.id === action.bundleId);
      if (!b || b.stage !== 'labeled' || !FORWARD_FLAGS.has(b.flag)) return prev;
      let s = {
        ...prev,
        bundles: prev.bundles.map((x) => (x.id === b.id ? { ...x, stage: 'bound' as const } : x)),
      };
      return withLog(s, `束 ${b.seq} 已按束枚数分束扎绳，请复称核对。`);
    }

    case 'WEIGH_BUNDLE': {
      const b = prev.bundles.find((x) => x.id === action.bundleId);
      if (!b || b.stage !== 'bound' || !FORWARD_FLAGS.has(b.flag)) return prev;
      if (!(action.actualKg > 0)) return prev;
      // 挂钩不得超载：超过单钩载重的束不允许进入待上杆
      if (action.actualKg > prev.params.hookLoadKg + 0.001) return prev;
      let flag = b.flag;
      if (action.checkedBulbs !== b.bulbs) flag = 'shortCount';
      let s: AppState = {
        ...prev,
        bundles: prev.bundles.map((x) =>
          x.id === b.id
            ? {
                ...x,
                stage: 'weighed' as const,
                actualKg: round1(action.actualKg),
                checkedBulbs: action.checkedBulbs,
                flag,
              }
            : x,
        ),
      };
      const over = action.actualKg > prev.params.hookLoadKg;
      s = withLog(
        s,
        `束 ${b.seq} 复称 ${round1(action.actualKg)}kg、${action.checkedBulbs} 枚${
          over ? `，超过单钩载重 ${prev.params.hookLoadKg}kg，不得上杆，请拆束调整` : ''
        }。`,
      );
      return s;
    }

    case 'CONFIRM_HANG': {
      const b = prev.bundles.find((x) => x.id === action.bundleId);
      if (!b || (b.stage !== 'weighed') || !FORWARD_FLAGS.has(b.flag)) return prev;
      const check = evaluateSlot(prev, b, action.slot);
      if (!check.ok) return prev;
      const side = action.slot.side;
      let s: AppState = {
        ...prev,
        nextSide: side === 'left' ? 'right' : 'left',
        bundles: prev.bundles.map((x) =>
          x.id === b.id
            ? {
                ...x,
                stage: 'hung' as const,
                stationIndex: action.slot.stationIndex,
                side,
                hungAt: Date.now(),
                neckSoft: undefined,
                neckSoftAt: undefined,
              }
            : x,
        ),
      };
      s = withLog(
        s,
        `束 ${b.seq} 自${side === 'left' ? '左（北）' : '右（南）'}面第 ${
          action.slot.stationIndex + 1
        } 位上杆；下一束请从${s.nextSide === 'left' ? '左' : '右'}面交替上杆。`,
      );
      return s;
    }

    case 'LOOSE_TO_MAT': {
      const b = prev.bundles.find((x) => x.id === action.bundleId);
      if (!b || (b.stage !== 'hung' && b.stage !== 'dry')) return prev;
      const mat = prev.mats.find((m) => m.id === action.matId);
      if (!mat || mat.occupiedBy) return prev;
      let s: AppState = {
        ...prev,
        mats: prev.mats.map((m) =>
          m.id === mat.id ? { ...m, occupiedBy: b.seq, occupiedAt: Date.now() } : m,
        ),
        bundles: prev.bundles.map((x) =>
          x.id === b.id
            ? {
                ...x,
                stage: 'weighed' as const,
                stationIndex: undefined,
                side: undefined,
                flag: 'looseAtMat' as const,
                retieCount: (x.retieCount ?? 0) + 1,
              }
            : x,
        ),
      };
      s = withLog(s, `束 ${b.seq} 绳结松动，已先落到${mat.name}重绑，挂位已空出；重绑确认前不得继续上杆。`);
      return s;
    }

    case 'RETIE_DONE': {
      const b = prev.bundles.find((x) => x.id === action.bundleId);
      if (!b || b.flag !== 'looseAtMat') return prev;
      let s: AppState = {
        ...prev,
        mats: prev.mats.map((m) =>
          m.occupiedBy === b.seq ? { ...m, occupiedBy: undefined, occupiedAt: undefined } : m,
        ),
        bundles: prev.bundles.map((x) =>
          x.id === b.id
            ? { ...x, flag: b.bulbs < prev.params.bulbsPerBundle ? ('shortCount' as const) : ('none' as const) }
            : x,
        ),
      };
      s = withLog(s, `束 ${b.seq} 重绑完成并确认，可重新按左右交替顺序上杆。`);
      return s;
    }

    case 'MARK_MOLD': {
      const b = prev.bundles.find((x) => x.id === action.bundleId);
      if (!b || !isActive(b) || b.stage === 'cut') return prev;
      return quarantineAndReplan(prev, b, '复核发现霉斑：');
    }

    case 'NECK_SOFT': {
      const b = prev.bundles.find((x) => x.id === action.bundleId);
      if (!b || b.stage !== 'hung') return prev;
      let s = {
        ...prev,
        bundles: prev.bundles.map((x) =>
          x.id === b.id ? { ...x, neckSoft: true, neckSoftAt: Date.now() } : x,
        ),
      };
      return withLog(s, `束 ${b.seq} 颈部仍软：只延后剪秧，继续阴干，挂位不释放。`);
    }

    case 'NECK_DRY': {
      const b = prev.bundles.find((x) => x.id === action.bundleId);
      if (!b || b.stage !== 'hung') return prev;
      let s = {
        ...prev,
        bundles: prev.bundles.map((x) =>
          x.id === b.id ? { ...x, stage: 'dry' as const, dryAt: Date.now(), neckSoft: undefined } : x,
        ),
      };
      return withLog(s, `束 ${b.seq} 颈干复核通过，可剪秧收束。`);
    }

    case 'CUT_BUNDLE': {
      const b = prev.bundles.find((x) => x.id === action.bundleId);
      if (!b || b.stage !== 'dry' || b.neckSoft) return prev;
      let s: AppState = {
        ...prev,
        bundles: prev.bundles.map((x) =>
          x.id === b.id
            ? { ...x, stage: 'cut' as const, cutAt: Date.now(), stationIndex: undefined, side: undefined }
            : x,
        ),
      };
      s = withLog(s, `束 ${b.seq} 已剪秧收束并下杆，挂位空出。`);
      return s;
    }

    case 'TAKE_DOWN': {
      const b = prev.bundles.find((x) => x.id === action.bundleId);
      if (!b) return prev;
      let s: AppState = {
        ...prev,
        bundles: prev.bundles.filter((x) => x.id !== b.id),
      };
      s = withLog(s, `束 ${b.seq} 已下杆并移出排程，可随后重排未挂部分补回枚数。`);
      return s;
    }

    case 'RECHECK_POSITIONS': {
      const failures: string[] = [];
      const bundles = prev.bundles.map((b) => {
        if (!isActive(b) || (b.stage !== 'hung' && b.stage !== 'dry')) return b;
        if (b.stationIndex === undefined || !b.side) return b;
        const check = evaluateSlot(prev, b, { stationIndex: b.stationIndex, side: b.side });
        if (check.ok) {
          return b.flag === 'staleStructure'
            ? { ...b, flag: (b.bulbs < prev.params.bulbsPerBundle ? 'shortCount' : 'none') as Bundle['flag'] }
            : b;
        }
        failures.push(`${b.seq}（${check.reasons.join('；')}）`);
        return b;
      });
      let s: AppState = { ...prev, bundles };
      s = failures.length === 0
        ? withLog(s, '结构变更后的挂位复核全部通过：无超载、无碰禁区、净距与载荷差均合规。')
        : withLog(s, `挂位复核未通过：${failures.join('；')}。请下杆调整后重排。`);
      return s;
    }

    case 'RESOLVE_QUARANTINE': {
      let s = {
        ...prev,
        quarantine: prev.quarantine.map((q) => (q.id === action.id ? { ...q, resolved: true } : q)),
      };
      const q = prev.quarantine.find((x) => x.id === action.id);
      return withLog(s, `隔离项（畦号 ${q?.bedId ?? ''}，${q?.bulbs ?? 0} 枚）已移出棚内另行处理。`);
    }

    default:
      return prev;
  }
}

// 供命令行规则验证使用
export const reducer = reducerImpl;

// 仅供 UI 读取候选钩位
export function candidateForHang(state: AppState, bundle: Bundle) {
  return chooseAlternatingSlot(state, bundle, state.nextSide);
}

interface Store {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  undo: () => void;
  canUndo: boolean;
  resetAll: () => Promise<void>;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducerImpl, undefined, initialState);
  const past = useRef<AppState[]>([]);
  const loaded = useRef(false);

  // 启动时读取本机存档（刷新续做）
  useEffect(() => {
    let alive = true;
    loadState().then((saved) => {
      if (!alive) return;
      if (saved) dispatch({ type: 'REPLACE_STATE', state: saved });
      loaded.current = true;
    });
    return () => {
      alive = false;
    };
  }, []);

  // 自动存档（含替换动作时也保存）
  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => void saveState(state), 150);
    return () => clearTimeout(t);
  }, [state]);

  const wrappedDispatch = (action: Action) => {
    if (action.type === 'REPLACE_STATE') {
      dispatch(action);
      return;
    }
    past.current = [...past.current, state].slice(-50);
    dispatch(action);
  };

  const undo = () => {
    const previous = past.current.pop();
    if (previous) dispatch({ type: 'REPLACE_STATE', state: previous });
  };

  const resetAll = async () => {
    past.current = [...past.current, state].slice(-50);
    await clearState();
    dispatch({ type: 'RESET_ALL' });
  };

  const value = useMemo(
    () => ({
      state,
      dispatch: wrappedDispatch,
      undo,
      canUndo: past.current.length > 0,
      resetAll,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore 必须在 StoreProvider 内使用');
  return ctx;
}
