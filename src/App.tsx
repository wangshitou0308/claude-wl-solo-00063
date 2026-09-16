import { useState } from 'react';
import { StoreProvider, useStore } from './store';
import IntakeView from './tabs/IntakeView';
import StructureView from './tabs/StructureView';
import ParamsView from './tabs/ParamsView';
import BenchView from './tabs/BenchView';
import PrintView from './tabs/PrintView';
import type { TabKey } from './types';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'intake', label: '畦批录入' },
  { key: 'structure', label: '横杆结构' },
  { key: 'params', label: '引导参数' },
  { key: 'bench', label: '作业台' },
  { key: 'print', label: '标签打印' },
];

function Header() {
  const { undo, canUndo, resetAll } = useStore();
  return (
    <div className="app-header">
      <div>
        <h1>蒜种吊束阴干换位引导台</h1>
        <div className="sub">
          通风棚家庭作业引导 · 挂牌→分束→复称→左右交替上杆→颈干复核→剪秧收束 · 资料仅保存在本机浏览器（IndexedDB）
        </div>
      </div>
      <div className="header-actions no-print">
        <button className="btn secondary" onClick={undo} disabled={!canUndo}>
          ↩ 撤回误确认
        </button>
        <button
          className="btn ghost"
          onClick={() => {
            if (window.confirm('确定清空全部畦批、蒜束与设置？清空后仍可用“撤回误确认”恢复一次。')) {
              void resetAll();
            }
          }}
        >
          清空重来
        </button>
      </div>
    </div>
  );
}

function Shell() {
  const [tab, setTab] = useState<TabKey>('intake');
  return (
    <div className="app">
      <Header />
      <div className="tabs no-print">
        {TABS.map((t) => (
          <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'intake' && <IntakeView />}
      {tab === 'structure' && <StructureView />}
      {tab === 'params' && <ParamsView />}
      {tab === 'bench' && <BenchView />}
      {tab === 'print' && <PrintView />}
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
