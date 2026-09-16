// 标签打印页：挂杆标签（束号、畦号、枚数、重量、挂位）
import { useState } from 'react';
import { useStore } from '../store';
import { STAGE_LABEL, bundleWeight, isActive } from '../engine';
import type { BundleStage } from '../types';

type Filter = 'all' | 'onBar' | 'labeled';

export default function PrintView() {
  const { state } = useStore();
  const [filter, setFilter] = useState<Filter>('all');

  const labels = state.bundles.filter((b) => {
    if (!isActive(b) || b.stage === 'planned') return false;
    if (filter === 'onBar') return b.stage === 'hung' || b.stage === 'dry';
    if (filter === 'labeled') return b.stage !== 'cut';
    return true;
  });

  const now = new Date().toLocaleDateString('zh-CN');

  return (
    <div>
      <div className="panel no-print">
        <h2>⑤ 挂杆标签打印</h2>
        <p className="hint">
          标签在分拣席固定后即可打印备份；刷新页面资料仍保留在本机浏览器。打印只输出标签区域。
        </p>
        <div className="inline-form">
          <label className="field">
            范围
            <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
              <option value="all">全部已挂牌束（含已收束）</option>
              <option value="onBar">仅当前在杆束</option>
              <option value="labeled">未收束的蒜束</option>
            </select>
          </label>
          <button className="btn" onClick={() => window.print()}>
            打印标签
          </button>
          <span className="hint">共 {labels.length} 张</span>
        </div>
      </div>

      <div className="panel">
        <h2 className="no-print">标签预览</h2>
        {labels.length === 0 ? (
          <p className="hint">没有可打印的标签：蒜束须先在作业台固定标签。</p>
        ) : (
          <div className="label-sheet">
            {labels.map((b) => (
              <div className="print-label" key={b.id}>
                <h4>蒜种束 {b.seq}</h4>
                <div className="line"><span>畦号</span><b>{b.bedId}</b></div>
                <div className="line"><span>枚数</span><b>{b.checkedBulbs ?? b.bulbs} 枚</b></div>
                <div className="line">
                  <span>重量</span>
                  <b>{bundleWeight(b)} kg{b.actualKg === undefined ? '（估算）' : '（复称）'}</b>
                </div>
                <div className="line">
                  <span>挂位</span>
                  <b>
                    {b.side && b.stationIndex !== undefined
                      ? `${b.side === 'left' ? '左' : '右'}面第 ${b.stationIndex + 1} 位`
                      : '未上杆 / 已收束'}
                  </b>
                </div>
                <div className="line">
                  <span>工序</span>
                  <b>{STAGE_LABEL[b.stage as BundleStage]}</b>
                </div>
                <div className="line"><span>日期</span><span>{now}</span></div>
                {b.neckSoft && <div className="line" style={{ color: 'var(--amber)' }}><span>颈部</span><b>仍软·延后剪秧</b></div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
