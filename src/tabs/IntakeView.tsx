// 录入页：畦号、枚数、带秧重量、颈部状态、破皮或霉斑；缺陷先隔离
import { useState } from 'react';
import { useStore } from '../store';
import { uid } from '../defaults';
import { DEFECT_LABEL } from '../engine';
import type { DefectKind, NeckState } from '../types';

const emptyForm = {
  bedId: '',
  bulbs: '40',
  weightKg: '8.5',
  neck: 'firm' as NeckState,
  defect: 'none' as DefectKind,
  note: '',
};

export default function IntakeView() {
  const { state, dispatch } = useStore();
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const submit = () => {
    const bedId = form.bedId.trim();
    const bulbs = Math.max(0, Math.floor(Number(form.bulbs)));
    const weightKg = Math.max(0, Number(form.weightKg));
    if (!bedId || !bulbs || !(weightKg > 0)) return;
    if (editingId) {
      dispatch({
        type: 'EDIT_BATCH',
        id: editingId,
        patch: { bedId, bulbs, weightKg, neck: form.neck, defect: form.defect, note: form.note },
      });
      setEditingId(null);
    } else {
      dispatch({
        type: 'ADD_BATCH',
        batch: {
          id: uid('batch'),
          bedId,
          bulbs,
          weightKg,
          neck: form.neck,
          defect: form.defect,
          note: form.note || undefined,
          createdAt: Date.now(),
        },
      });
    }
    setForm(emptyForm);
  };

  const edit = (id: string) => {
    const b = state.batches.find((x) => x.id === id);
    if (!b) return;
    setEditingId(id);
    setForm({
      bedId: b.bedId,
      bulbs: String(b.bulbs),
      weightKg: String(b.weightKg),
      neck: b.neck,
      defect: b.defect,
      note: b.note ?? '',
    });
  };

  return (
    <div>
      <div className="panel">
        <h2>① 畦批录入（分拣席）</h2>
        <p className="hint">
          连秧蒜头进通风棚后先在分拣席逐畦登记。检出<b>破皮或霉斑</b>的蒜头立即整批移入隔离席，不参与分束；
          不同畦号后续绝不并入同一束。
        </p>
        <div className="grid cols-3">
          <label className="field">
            畦号
            <input value={form.bedId} onChange={(e) => set({ bedId: e.target.value })} placeholder="如 东3" />
          </label>
          <label className="field">
            蒜头枚数
            <input type="number" min={1} value={form.bulbs} onChange={(e) => set({ bulbs: e.target.value })} />
          </label>
          <label className="field">
            带秧重量（kg）
            <input type="number" min={0} step="0.1" value={form.weightKg} onChange={(e) => set({ weightKg: e.target.value })} />
          </label>
          <label className="field">
            颈部状态（初判）
            <select value={form.neck} onChange={(e) => set({ neck: e.target.value as NeckState })}>
              <option value="firm">紧实</option>
              <option value="soft">仍软</option>
            </select>
          </label>
          <label className="field">
            破皮或霉斑
            <select value={form.defect} onChange={(e) => set({ defect: e.target.value as DefectKind })}>
              <option value="none">完好</option>
              <option value="brokenSkin">破皮（隔离）</option>
              <option value="mold">霉斑（隔离）</option>
            </select>
          </label>
          <label className="field">
            备注
            <input value={form.note} onChange={(e) => set({ note: e.target.value })} placeholder="可选" />
          </label>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button className="btn" onClick={submit} disabled={!form.bedId.trim()}>
            {editingId ? '保存修改（相关步骤将失效）' : '录入畦批'}
          </button>
          {editingId && (
            <button
              className="btn secondary"
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm);
              }}
            >
              取消修改
            </button>
          )}
        </div>
        {form.defect !== 'none' && (
          <div className="alert warn">该畦批录入后将直接进入隔离席，不计入分束与上杆编排。</div>
        )}
      </div>

      <div className="panel">
        <h2>畦批清单</h2>
        <table className="data">
          <thead>
            <tr>
              <th>畦号</th>
              <th>枚数</th>
              <th>带秧 kg</th>
              <th>颈部</th>
              <th>破皮/霉斑</th>
              <th>备注</th>
              <th style={{ width: 150 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {state.batches.map((b) => (
              <tr key={b.id}>
                <td><b>{b.bedId}</b></td>
                <td>{b.bulbs}</td>
                <td>{b.weightKg}</td>
                <td>{b.neck === 'firm' ? '紧实' : '仍软'}</td>
                <td>
                  <span className={`tag ${b.defect === 'none' ? 'green' : 'red'}`}>{DEFECT_LABEL[b.defect]}</span>
                </td>
                <td>{b.note ?? '—'}</td>
                <td>
                  <div className="row-actions">
                    <button className="btn ghost" onClick={() => edit(b.id)}>修改</button>
                    <button className="btn ghost" onClick={() => dispatch({ type: 'DELETE_BATCH', id: b.id })}>
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {state.batches.length === 0 && (
              <tr>
                <td colSpan={7} className="hint">尚无录入，先从分拣席登记第一个畦批。</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>隔离席</h2>
        <p className="hint">破皮/霉斑蒜头与上杆后发现霉斑的整束均在此登记，确认移出棚内后可标记处理。</p>
        <table className="data">
          <thead>
            <tr>
              <th>来源</th>
              <th>畦号</th>
              <th>束号</th>
              <th>枚数</th>
              <th>重量 kg</th>
              <th>原因</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {state.quarantine.map((q) => (
              <tr key={q.id}>
                <td>{q.reason === 'intakeDefect' ? '录入隔离' : '上杆复核'}</td>
                <td>{q.bedId}</td>
                <td>{q.bundleSeq ?? '—'}</td>
                <td>{q.bulbs}</td>
                <td>{q.weightKg}</td>
                <td>
                  <span className="tag red">{q.defect === 'mold' ? '霉斑' : '破皮'}</span>
                </td>
                <td>{q.resolved ? <span className="tag gray">已移出处理</span> : <span className="tag amber">待处理</span>}</td>
                <td>
                  {!q.resolved && (
                    <button className="btn ghost" onClick={() => dispatch({ type: 'RESOLVE_QUARANTINE', id: q.id })}>
                      已移出
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {state.quarantine.length === 0 && (
              <tr>
                <td colSpan={8} className="hint">隔离席暂无记录。</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
