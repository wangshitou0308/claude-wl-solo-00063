// 作业台：挂牌—分束—复称—左右交替上杆—颈干复核—剪秧收束
import { useMemo, useState } from 'react';
import { useStore, candidateForHang } from '../store';
import BarSvg from '../BarSvg';
import {
  STAGE_LABEL,
  bundleWeight,
  chooseAlternatingSlot,
  floorClearance,
  isActive,
  structureWarnings,
} from '../engine';
import type { Bundle } from '../types';

const FLOW: { key: Bundle['stage']; label: string }[] = [
  { key: 'planned', label: '固定标签' },
  { key: 'labeled', label: '分束扎绳' },
  { key: 'bound', label: '复称核对' },
  { key: 'weighed', label: '交替上杆' },
  { key: 'hung', label: '颈干复核' },
  { key: 'dry', label: '剪秧收束' },
];

function flagTag(b: Bundle): { text: string; cls: string } | null {
  switch (b.flag) {
    case 'shortCount':
      return { text: '末束不足数', cls: 'amber' };
    case 'looseAtMat':
      return { text: '垫席重绑中', cls: 'amber' };
    case 'staleBatch':
      return { text: '批次变更·步骤失效', cls: 'red' };
    case 'staleStructure':
      return { text: '结构变更·挂位待复核', cls: 'red' };
    case 'moldQuarantined':
      return { text: '霉斑整束隔离', cls: 'red' };
    default:
      return null;
  }
}

function WeighForm({ bundle }: { bundle: Bundle }) {
  const { state, dispatch } = useStore();
  const [kg, setKg] = useState(String(bundle.estimatedKg));
  const [bulbs, setBulbs] = useState(String(bundle.bulbs));
  const over = Number(kg) > state.params.hookLoadKg;
  return (
    <div className="inline-form">
      <label className="field">
        实重 kg
        <input type="number" min={0} step="0.1" value={kg} onChange={(e) => setKg(e.target.value)} style={{ width: 90 }} />
      </label>
      <label className="field">
        枚数
        <input type="number" min={1} value={bulbs} onChange={(e) => setBulbs(e.target.value)} style={{ width: 80 }} />
      </label>
      <button
        className="btn"
        disabled={!(Number(kg) > 0) || Number(bulbs) <= 0 || over}
        onClick={() =>
          dispatch({ type: 'WEIGH_BUNDLE', bundleId: bundle.id, actualKg: Number(kg), checkedBulbs: Number(bulbs) })
        }
      >
        确认复称
      </button>
      {over && <span className="tag red">超钩载，先拆束</span>}
    </div>
  );
}

function MatLoose({ bundle }: { bundle: Bundle }) {
  const { state, dispatch } = useStore();
  const freeMats = state.mats.filter((m) => !m.occupiedBy);
  const [matId, setMatId] = useState(freeMats[0]?.id ?? '');
  return (
    <div className="inline-form">
      <select value={matId} onChange={(e) => setMatId(e.target.value)}>
        {freeMats.length === 0 && <option value="">无空置垫席</option>}
        {freeMats.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
      <button
        className="btn warn"
        disabled={!matId}
        onClick={() => dispatch({ type: 'LOOSE_TO_MAT', bundleId: bundle.id, matId })}
      >
        绳结松动：落垫席重绑
      </button>
    </div>
  );
}

function BundleActions({ bundle }: { bundle: Bundle }) {
  const { state, dispatch } = useStore();

  if (bundle.flag === 'staleBatch') {
    return <span className="tag red">批次/参数已改：请重排未挂部分（顶部按钮）</span>;
  }
  if (bundle.flag === 'staleStructure' && bundle.stage !== 'hung' && bundle.stage !== 'dry') {
    return <span className="tag red">结构已改：请重排未挂部分</span>;
  }

  switch (bundle.stage) {
    case 'planned':
      return (
        <button className="btn" onClick={() => dispatch({ type: 'FIX_LABEL', bundleId: bundle.id })}>
          ① 标签已在分拣席固定
        </button>
      );
    case 'labeled':
      return (
        <button className="btn" onClick={() => dispatch({ type: 'BIND_BUNDLE', bundleId: bundle.id })}>
          ② 已按束枚数分束扎绳
        </button>
      );
    case 'bound':
      return <WeighForm bundle={bundle} />;
    case 'weighed': {
      if (bundle.flag === 'looseAtMat') {
        return (
          <div className="inline-form">
            <button className="btn" onClick={() => dispatch({ type: 'RETIE_DONE', bundleId: bundle.id })}>
              重绑完成，确认继续
            </button>
            <MatLoose bundle={bundle} />
          </div>
        );
      }
      const candidate = chooseAlternatingSlot(state, bundle, state.nextSide);
      if (!candidate) {
        return <span className="tag red">该面暂无钩位可评估</span>;
      }
      const { slot, feasibility } = candidate;
      return feasibility.ok ? (
        <div className="inline-form">
          <button
            className="btn"
            onClick={() => dispatch({ type: 'CONFIRM_HANG', bundleId: bundle.id, slot })}
          >
            ④ 确认上杆：{slot.side === 'left' ? '左（北）' : '右（南）'}面第 {slot.stationIndex + 1} 位
          </button>
          <span className="tag blue">
            本次手持方向：{slot.side === 'left' ? '自北侧' : '自南侧'}，重 {bundleWeight(bundle)}kg
          </span>
          <button className="btn ghost" onClick={() => dispatch({ type: 'MARK_MOLD', bundleId: bundle.id })}>
            发现霉斑：隔离整束
          </button>
        </div>
      ) : (
        <div>
          <div className="alert error" style={{ margin: '4px 0' }}>
            {slot.side === 'left' ? '左（北）' : '右（南）'}面第 {slot.stationIndex + 1} 位不可用（已按由近及远顺序探测）：
            {feasibility.reasons.join('；')}
          </div>
          <div className="row-actions">
            <button className="btn ghost" onClick={() => dispatch({ type: 'MARK_MOLD', bundleId: bundle.id })}>
              若是霉斑障碍：隔离整束并重排
            </button>
            <span className="hint">其余障碍请调整挂位（结构页复核）或先处理在杆蒜束，不得自行翻面。</span>
          </div>
        </div>
      );
    }
    case 'hung':
    case 'dry': {
      if (bundle.flag === 'staleStructure') {
        return (
          <div className="inline-form">
            <span className="tag red">结构变更：挂位待复核</span>
            <button className="btn secondary" onClick={() => dispatch({ type: 'RECHECK_POSITIONS' })}>
              立即复核挂位
            </button>
            <button className="btn ghost" onClick={() => dispatch({ type: 'TAKE_DOWN', bundleId: bundle.id })}>
              下杆移出
            </button>
          </div>
        );
      }
      return (
        <div className="row-actions">
          {bundle.stage === 'hung' && !bundle.neckSoft && (
            <>
              <button className="btn" onClick={() => dispatch({ type: 'NECK_DRY', bundleId: bundle.id })}>
                ⑤ 颈部已干
              </button>
              <button className="btn warn" onClick={() => dispatch({ type: 'NECK_SOFT', bundleId: bundle.id })}>
                颈部仍软：延后剪秧（不释放挂位）
              </button>
            </>
          )}
          {bundle.stage === 'hung' && bundle.neckSoft && (
            <button className="btn secondary" onClick={() => dispatch({ type: 'NECK_DRY', bundleId: bundle.id })}>
              再次复核：颈部已干
            </button>
          )}
          {bundle.stage === 'dry' && (
            <button className="btn" onClick={() => dispatch({ type: 'CUT_BUNDLE', bundleId: bundle.id })}>
              ⑥ 剪秧收束，空出挂位
            </button>
          )}
          <MatLoose bundle={bundle} />
          <button className="btn ghost" onClick={() => dispatch({ type: 'MARK_MOLD', bundleId: bundle.id })}>
            发现霉斑：隔离整束并重排
          </button>
        </div>
      );
    }
    case 'cut':
      return <span className="tag green">已剪秧收束</span>;
    default:
      return null;
  }
}

export default function BenchView() {
  const { state, dispatch } = useStore();
  const [showAll, setShowAll] = useState(false);

  const active = state.bundles.filter(isActive);
  const current = useMemo(
    () =>
      active.find((b) => b.stage === 'weighed') ??
      active.find((b) => b.stage === 'planned') ??
      active.find((b) => b.stage === 'labeled') ??
      active.find((b) => b.stage === 'bound') ??
      active.find((b) => b.stage === 'hung' && !b.neckSoft) ??
      active.find((b) => b.stage === 'dry') ??
      active.find((b) => b.stage === 'hung'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.bundles],
  );

  const focusCandidate = current ? candidateForHang(state, current) : null;
  const focus = current && current.stage === 'weighed' ? { bundle: current, candidate: focusCandidate } : null;

  const counts = {
    planned: active.filter((b) => b.stage === 'planned' || b.stage === 'labeled' || b.stage === 'bound').length,
    weighed: active.filter((b) => b.stage === 'weighed').length,
    hung: active.filter((b) => b.stage === 'hung').length,
    dry: active.filter((b) => b.stage === 'dry').length,
    cut: active.filter((b) => b.stage === 'cut').length,
    quarantine: state.quarantine.filter((q) => !q.resolved).length,
  };

  const warnings = structureWarnings(state.structure, state.params);
  const visible = showAll ? active : active.filter((b) => b.stage !== 'cut');
  const currentStepIndex = current
    ? FLOW.findIndex((f) => f.key === current.stage)
    : -1;

  return (
    <div>
      <div className="panel no-print">
        <h2>④ 作业引导</h2>
        <div className="workflow">
          {FLOW.map((f, i) => (
            <div
              key={f.key}
              className={`step ${i === currentStepIndex ? 'active' : ''} ${
                currentStepIndex >= 0 && i < currentStepIndex ? 'done' : ''
              }`}
            >
              <span className="n">{i + 1}</span>
              {f.label}
            </div>
          ))}
        </div>
        <div className="stat-row">
          <div className="stat">席上待处理 <b>{counts.planned}</b></div>
          <div className="stat">待上杆 <b>{counts.weighed}</b></div>
          <div className="stat">阴干中 <b>{counts.hung}</b></div>
          <div className="stat">待剪秧 <b>{counts.dry}</b></div>
          <div className="stat">已收束 <b>{counts.cut}</b></div>
          <div className="stat">隔离待处理 <b>{counts.quarantine}</b></div>
          <div className="stat">下一持束面 <b>{state.nextSide === 'left' ? '左（北）' : '右（南）'}</b></div>
        </div>
        <div className="row-actions">
          <button
            className="btn secondary"
            disabled={active.length > 0 && !active.some((b) => b.flag === 'staleBatch' || b.flag === 'staleStructure')}
            onClick={() => dispatch({ type: 'REPLAN_UNHUNG' })}
            title="丢弃未上杆的旧排程，按当前畦批与参数重排；霉斑束与在杆束保留"
          >
            重排未挂部分
          </button>
          {active.length === 0 && (
            <button className="btn" onClick={() => dispatch({ type: 'PLAN_ALL' })}>
              按畦批全量编排蒜束
            </button>
          )}
        </div>
        {warnings.length > 0 && (
          <div className="alert error">棚杆结构校核未通过（{warnings.length} 项），上杆可能全部受阻，请先到“横杆结构”页调整。</div>
        )}
        {floorClearance(state.structure) < state.structure.floorGapCm && (
          <div className="alert error">
            底部离地净距不足：当前 {floorClearance(state.structure).toFixed(1)}cm &lt; {state.structure.floorGapCm}cm，触碰地面禁碰区。
          </div>
        )}
      </div>

      <div className="bench-layout">
        <div className="panel">
          <h2>横杆实况（本次蒜束与手持方向已高亮）</h2>
          <BarSvg state={state} focus={focus} />
          <div className="hint" style={{ marginTop: 6 }}>
            橙色脉冲圆 = 本次蒜束建议钩位；橙色虚线箭头 = 手持送束方向。左右严格交替，任一可行钩位通过校验后才允许确认上杆。
          </div>
          {state.mats.some((m) => m.occupiedBy) && (
            <div className="alert warn">
              垫席占用：{state.mats.filter((m) => m.occupiedBy).map((m) => `${m.name}→${m.occupiedBy}`).join('；')}
              。重绑确认前相关束不得继续上杆。
            </div>
          )}
        </div>

        <div className="panel">
          <h2>本次蒜束</h2>
          {current ? (
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--green-dark)' }}>
                {current.seq}
                <span className="tag gray" style={{ marginLeft: 8 }}>畦号 {current.bedId}</span>
                {flagTag(current) && (
                  <span className={`tag ${flagTag(current)!.cls}`} style={{ marginLeft: 6 }}>
                    {flagTag(current)!.text}
                  </span>
                )}
              </div>
              <table className="data" style={{ margin: '10px 0' }}>
                <tbody>
                  <tr><th>枚数</th><td>{current.checkedBulbs ?? current.bulbs} 枚{current.bulbs < state.params.bulbsPerBundle ? '（末束不足数，已标记）' : ''}</td></tr>
                  <tr><th>重量</th><td>{current.actualKg !== undefined ? `${current.actualKg}kg（复称）` : `${current.estimatedKg}kg（按畦批估算，待复称）`}</td></tr>
                  <tr><th>当前工序</th><td>{STAGE_LABEL[current.stage]}{current.neckSoft ? '，颈部仍软，继续阴干' : ''}</td></tr>
                  {current.side && current.stationIndex !== undefined && (
                    <tr><th>挂位</th><td>{current.side === 'left' ? '左（北）' : '右（南）'}面第 {current.stationIndex + 1} 位</td></tr>
                  )}
                  {current.retieCount ? <tr><th>重绑次数</th><td>{current.retieCount}</td></tr> : null}
                </tbody>
              </table>
              <BundleActions bundle={current} />
              <p className="hint" style={{ marginTop: 10 }}>
                规则提醒：标签必须在离开分拣席前固定；挂钩不得超载；外廓不得重叠或碰禁区；
                成对挂钩左右载荷差上限 {state.params.pairDiffKg}kg。
              </p>
            </div>
          ) : (
            <p className="hint">暂无可推进的蒜束。先录入畦批并编排，或在标签页打印挂杆标签。</p>
          )}
        </div>
      </div>

      <div className="panel">
        <h2>全部蒜束</h2>
        <table className="data">
          <thead>
            <tr>
              <th>束号</th>
              <th>畦号</th>
              <th>枚数</th>
              <th>重量</th>
              <th>工序</th>
              <th>挂位</th>
              <th>标记</th>
              <th style={{ width: 280 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((b) => {
              const tag = flagTag(b);
              return (
                <tr key={b.id} style={current?.id === b.id ? { background: '#f2f8ea' } : undefined}>
                  <td><b>{b.seq}</b></td>
                  <td>{b.bedId}</td>
                  <td>{b.checkedBulbs ?? b.bulbs}</td>
                  <td>{bundleWeight(b)}</td>
                  <td>{STAGE_LABEL[b.stage]}{b.neckSoft ? '·仍软' : ''}</td>
                  <td>
                    {b.side && b.stationIndex !== undefined
                      ? `${b.side === 'left' ? '左' : '右'}${b.stationIndex + 1}`
                      : '—'}
                  </td>
                  <td>{tag ? <span className={`tag ${tag.cls}`}>{tag.text}</span> : '—'}</td>
                  <td>
                    {current?.id === b.id ? (
                      <span className="tag green">本次进行中</span>
                    ) : (
                      <BundleActions bundle={b} />
                    )}
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="hint">尚无在制蒜束。</td>
              </tr>
            )}
          </tbody>
        </table>
        <div style={{ marginTop: 8 }}>
          <button className="btn ghost" onClick={() => setShowAll((v) => !v)}>
            {showAll ? '隐藏已收束' : `显示已收束（${counts.cut}）`}
          </button>
        </div>
      </div>

      <div className="panel no-print">
        <h2>作业日志</h2>
        <div className="log-list">
          {state.logs.map((l, i) => (
            <div key={i}>
              <span className="time">
                {new Date(l.at).toLocaleString('zh-CN', { hour12: false })}
              </span>
              {l.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
