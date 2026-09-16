// SVG 棚杆俯视示意图：横杆、双面挂钩、墙地禁碰区、挂位与手持方向高亮
import type { AppState, Bundle } from './types';
import {
  barStartX,
  barYcm,
  bundleWeight,
  hookPosition,
  isActive,
  round1,
  sideReach,
  stationLoads,
  stationX,
  type SlotChoice,
} from './engine';

interface Props {
  state: AppState;
  focus?: { bundle: Bundle; candidate: SlotChoice | null } | null;
}

const M = 14;

export default function BarSvg({ state, focus }: Props) {
  const { structure: s, params: p } = state;
  const W = s.roomWidthCm;
  const D = s.roomDepthCm;
  const vw = W + M * 2;
  const vh = D + M * 2;
  const X = (x: number) => x + M;
  const Y = (y: number) => y + M;
  const r = p.bundleRadiusCm;
  const loads = stationLoads(state);

  const startX = barStartX(s);
  const barY = barYcm(s);
  const reach = sideReach(p);
  const hatch = `${M},${M} ${X(W - s.wallGapCm)},${M} ${X(W - s.wallGapCm)},${Y(
    D - s.wallGapCm,
  )} ${M},${Y(D - s.wallGapCm)}`;

  const focusPos =
    focus?.candidate && focus.candidate.feasibility.ok
      ? hookPosition(s, p, focus.candidate.slot)
      : null;
  const focusSide = focus?.candidate?.slot.side;

  const handFrom = focusPos
    ? {
        x: focusPos.x,
        y: focusPos.y + (focusSide === 'left' ? -r - 34 : r + 34),
      }
    : null;

  return (
    <div className="svg-wrap">
      <svg viewBox={`0 0 ${vw} ${vh}`} width="100%" role="img" aria-label="横杆与挂钩俯视示意图">
        <defs>
          <pattern id="hatch" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
            <rect width="8" height="8" fill="#f3e9e6" />
            <line x1="0" y1="0" x2="0" y2="8" stroke="#d8a7a0" strokeWidth="1.4" />
          </pattern>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#b4771f" />
          </marker>
        </defs>

        {/* 棚内地面 */}
        <rect x={M} y={M} width={W} height={D} fill="#f1ecdd" stroke="#b9ae94" />

        {/* 墙地禁碰区：用外环减去内安全区 */}
        <path
          d={`M${M},${M} H${X(W)} V${Y(D)} H${M} Z M${hatch} Z`}
          fill="url(#hatch)"
          fillRule="evenodd"
        />
        <text x={X(4)} y={Y(s.wallGapCm / 2)} fontSize="9" fill="#9c5b53">
          墙地禁碰区 {s.wallGapCm}cm
        </text>

        {/* 垫席 */}
        {state.mats.map((m, i) => {
          const mx = X(W * (0.12 + 0.26 * i));
          const my = Y((s.matY / 100) * D) - 9;
          return (
            <g key={m.id}>
              <rect
                x={mx}
                y={my}
                width={62}
                height={18}
                rx={3}
                fill={m.occupiedBy ? '#f7d9a8' : '#e7e2cf'}
                stroke="#a89a78"
                strokeDasharray="4 3"
              />
              <text x={mx + 31} y={my + 12} textAnchor="middle" fontSize="8.5" fill="#5f5640">
                {m.occupiedBy ? `占用：${m.occupiedBy}` : m.name}
              </text>
            </g>
          );
        })}

        {/* 横杆 */}
        <line x1={X(startX)} y1={Y(barY)} x2={X(startX + s.barLengthCm)} y2={Y(barY)} stroke="#6b5b36" strokeWidth="7" strokeLinecap="round" />
        <text x={X(startX)} y={Y(barY) - 8} fontSize="9.5" fill="#6b5b36">
          横杆 {s.barLengthCm}cm · 离地 {s.barHeightCm}cm · 底净空 {round1(Math.max(s.barHeightCm - s.ropeDropCm - s.bundleHeightCm, 0))}cm
        </text>

        {/* 挂位与双面挂钩 */}
        {Array.from({ length: s.stationCount }, (_, i) => {
          const x = stationX(s, i);
          return (
            <g key={i}>
              <line x1={X(x)} y1={Y(barY - reach)} x2={X(x)} y2={Y(barY + reach)} stroke="#8a7b52" strokeWidth="1.6" />
              {(['left', 'right'] as const).map((side) => {
                const pos = hookPosition(s, p, { stationIndex: i, side });
                const b = state.bundles.find(
                  (bb) =>
                    isActive(bb) &&
                    (bb.stage === 'hung' || bb.stage === 'dry') &&
                    bb.stationIndex === i &&
                    bb.side === side,
                );
                const isFocus =
                  focus?.candidate?.slot.stationIndex === i &&
                  focus.candidate.slot.side === side;
                const occupied = !!b;
                return (
                  <g key={side}>
                    {/* 空挂钩 */}
                    {!occupied && (
                      <path
                        d={`M${X(x)},${Y(barY)} q${side === 'left' ? -6 : 6},6 0,12`}
                        fill="none"
                        stroke="#9a8d68"
                        strokeWidth="1.4"
                      />
                    )}
                    <circle
                      cx={X(pos.x)}
                      cy={Y(pos.y)}
                      r={r}
                      fill={occupied ? (b!.stage === 'dry' ? '#bcd99f' : '#cfe0b0') : 'transparent'}
                      fillOpacity={occupied ? 0.85 : 1}
                      stroke={isFocus ? '#b4771f' : occupied ? '#5f8147' : '#b3a884'}
                      strokeWidth={isFocus ? 2.6 : occupied ? 1.6 : 1.2}
                      strokeDasharray={occupied ? undefined : '4 3'}
                      className={isFocus ? 'focus-slot' : undefined}
                    />
                    {occupied && (
                      <text x={X(pos.x)} y={Y(pos.y) + 1} textAnchor="middle" fontSize="9" fontWeight="600" fill="#33431f">
                        {b!.seq}
                      </text>
                    )}
                    {occupied && (
                      <text x={X(pos.x)} y={Y(pos.y) + r + 9} textAnchor="middle" fontSize="7.5" fill="#5f5640">
                        {round1(bundleWeight(b!))}kg
                      </text>
                    )}
                  </g>
                );
              })}
              {/* 挂位编号 */}
              <text x={X(x)} y={Y(barY) + 3.2} textAnchor="middle" fontSize="7.5" fill="#fffdf6">
                {i + 1}
              </text>
              {/* 左右载荷 */}
              <text x={X(x)} y={Y(barY + reach + r + 20)} textAnchor="middle" fontSize="7.5" fill="#7a7263">
                {loads[i].left !== undefined ? `左${loads[i].left}` : '左·空'}｜{loads[i].right !== undefined ? `右${loads[i].right}` : '右·空'}
              </text>
            </g>
          );
        })}

        {/* 手持方向：从手持侧伸向目标挂钩的束 */}
        {focusPos && handFrom && (
          <g>
            <line
              x1={X(handFrom.x)}
              y1={Y(handFrom.y)}
              x2={X(focusPos.x)}
              y2={Y(focusPos.y + (focusSide === 'left' ? r + 2 : -r - 2))}
              stroke="#b4771f"
              strokeWidth="2"
              strokeDasharray="6 4"
              markerEnd="url(#arrow)"
            />
            <circle cx={X(handFrom.x)} cy={Y(handFrom.y)} r={7} fill="#f0c979" stroke="#b4771f" />
            <text x={X(handFrom.x)} y={Y(handFrom.y) + 2.6} textAnchor="middle" fontSize="8.5">
              手
            </text>
            <text x={X(handFrom.x)} y={Y(handFrom.y) + (focusSide === 'left' ? -12 : 20)} textAnchor="middle" fontSize="8.5" fill="#b4771f">
              {focusSide === 'left' ? '左（北）面持束上杆' : '右（南）面持束上杆'}
            </text>
          </g>
        )}

        {/* 图例 */}
        <g transform={`translate(${X(6)}, ${Y(D) - 26})`}>
          <rect width="150" height="22" rx="4" fill="#fffdf6" stroke="#d8d0bd" opacity="0.92" />
          <circle cx="12" cy="11" r="6" fill="none" stroke="#b3a884" strokeDasharray="3 2" />
          <text x="23" y="14" fontSize="8.5" fill="#5f5640">空钩位</text>
          <circle cx="62" cy="11" r="6" fill="#cfe0b0" stroke="#5f8147" />
          <text x="72" y="14" fontSize="8.5" fill="#5f5640">在杆蒜束</text>
          <circle cx="118" cy="11" r="6" fill="none" stroke="#b4771f" strokeWidth="2" />
          <text x="128" y="14" fontSize="8.5" fill="#5f5640">本次钩位</text>
        </g>
      </svg>
    </div>
  );
}
