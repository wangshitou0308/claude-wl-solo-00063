// 横杆结构页：横杆、双面挂钩、墙地禁碰区的尺寸与位置设置
import { useStore } from '../store';
import BarSvg from '../BarSvg';
import { structureWarnings } from '../engine';
import type { Structure } from '../types';

function NumField({
  label,
  value,
  unit,
  onChange,
  min = 0,
  step = 1,
}: {
  label: string;
  value: number;
  unit: string;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
}) {
  return (
    <label className="field">
      {label}（{unit}）
      <input type="number" min={min} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export default function StructureView() {
  const { state, dispatch } = useStore();
  const s = state.structure;
  const p = state.params;
  const warnings = structureWarnings(s, p);
  const update = (patch: Partial<Structure>) => dispatch({ type: 'UPDATE_STRUCTURE', patch });

  return (
    <div>
      <div className="panel">
        <h2>② 绘制横杆与禁碰区</h2>
        <p className="hint">
          俯视示意图随尺寸实时更新：深色长条为横杆，两侧虚线圆为双面挂钩挂位，红色斜纹为<b>墙地禁碰区</b>。
          横杆位置以进深百分比表示（0 北墙 → 100 南墙）。修改结构资料后，已上杆挂位将被标记为待复核。
        </p>
        <div className="grid cols-3">
          <NumField label="棚内宽度" unit="cm" value={s.roomWidthCm} onChange={(v) => update({ roomWidthCm: v })} />
          <NumField label="棚内进深" unit="cm" value={s.roomDepthCm} onChange={(v) => update({ roomDepthCm: v })} />
          <NumField label="横杆长度" unit="cm" value={s.barLengthCm} onChange={(v) => update({ barLengthCm: v })} />
          <NumField label="横杆离地高度" unit="cm" value={s.barHeightCm} onChange={(v) => update({ barHeightCm: v })} />
          <label className="field">
            横杆进深位置（%，自北墙）
            <input
              type="range"
              min={10}
              max={90}
              value={s.barY}
              onChange={(e) => update({ barY: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            空置垫席进深位置（%，自北墙）
            <input
              type="range"
              min={50}
              max={95}
              value={s.matY}
              onChange={(e) => update({ matY: Number(e.target.value) })}
            />
          </label>
          <NumField label="墙地禁碰净距" unit="cm" value={s.wallGapCm} onChange={(v) => update({ wallGapCm: v })} />
          <NumField label="蒜头底部离地净距" unit="cm" value={s.floorGapCm} onChange={(v) => update({ floorGapCm: v })} />
          <NumField label="相邻挂位间距" unit="cm" value={s.stationGapCm} onChange={(v) => update({ stationGapCm: v })} />
          <NumField label="挂钩绳长（钩至束顶）" unit="cm" value={s.ropeDropCm} onChange={(v) => update({ ropeDropCm: v })} />
          <NumField label="蒜束竖直高度" unit="cm" value={s.bundleHeightCm} onChange={(v) => update({ bundleHeightCm: v })} />
          <label className="field">
            挂位数量（成对挂钩数）
            <input
              type="number"
              min={1}
              max={20}
              value={s.stationCount}
              onChange={(e) => update({ stationCount: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
            />
          </label>
        </div>

        {warnings.length === 0 ? (
          <div className="alert ok">结构校核通过：横杆不出禁区、同面挂位净距与底部离地净距均满足要求。</div>
        ) : (
          warnings.map((w, i) => (
            <div className="alert error" key={i}>
              {w}
            </div>
          ))
        )}
      </div>

      <div className="panel">
        <h2>棚杆预览</h2>
        <BarSvg state={state} />
        <div style={{ marginTop: 10 }}>
          <button
            className="btn secondary"
            onClick={() => dispatch({ type: 'RECHECK_POSITIONS' })}
          >
            以当前结构复核全部在杆挂位
          </button>
          <span className="hint" style={{ marginLeft: 10 }}>
            资料改动并换位后使用；通过即清除“结构待复核”标记。
          </span>
        </div>
      </div>
    </div>
  );
}
