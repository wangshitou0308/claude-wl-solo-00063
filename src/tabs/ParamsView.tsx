// 引导参数页：单束枚数、钩载、相邻净距、左右载荷差上限
import { useStore } from '../store';
import type { Params } from '../types';

export default function ParamsView() {
  const { state, dispatch } = useStore();
  const p = state.params;
  const update = (patch: Partial<Params>) => dispatch({ type: 'UPDATE_PARAMS', patch });

  return (
    <div className="panel">
      <h2>③ 引导参数</h2>
      <p className="hint">
        这些参数是上杆校验依据：挂钩不得超载、相邻蒜束外廓不得重叠或净距不足、成对挂钩左右载荷差不得越限。
        修改参数后，尚未上杆的在制蒜束将标记失效，请在作业台“重排未挂部分”。
      </p>
      <div className="grid cols-2">
        <label className="field">
          单束枚数（枚/束）
          <input type="number" min={1} value={p.bulbsPerBundle} onChange={(e) => update({ bulbsPerBundle: Math.max(1, Number(e.target.value)) })} />
        </label>
        <label className="field">
          单个挂钩最大载重（kg）
          <input type="number" min={0.1} step="0.1" value={p.hookLoadKg} onChange={(e) => update({ hookLoadKg: Math.max(0.1, Number(e.target.value)) })} />
        </label>
        <label className="field">
          蒜束外廓半径（cm）
          <input type="number" min={1} value={p.bundleRadiusCm} onChange={(e) => update({ bundleRadiusCm: Math.max(1, Number(e.target.value)) })} />
        </label>
        <label className="field">
          相邻蒜束最小净距（cm）
          <input type="number" min={0} value={p.clearGapCm} onChange={(e) => update({ clearGapCm: Math.max(0, Number(e.target.value)) })} />
        </label>
        <label className="field">
          成对挂钩左右载荷差上限（kg）
          <input type="number" min={0} step="0.1" value={p.pairDiffKg} onChange={(e) => update({ pairDiffKg: Math.max(0, Number(e.target.value)) })} />
        </label>
      </div>
      <div className="alert info" style={{ marginTop: 14 }}>
        同面相邻挂位所需中心距 = 2×外廓半径 + 净距 = {2 * p.bundleRadiusCm + p.clearGapCm}cm；
        当前挂位间距 {state.structure.stationGapCm}cm
        {state.structure.stationGapCm >= 2 * p.bundleRadiusCm + p.clearGapCm ? '（满足）' : '（不足，请在结构页调整）'}。
      </div>
    </div>
  );
}
