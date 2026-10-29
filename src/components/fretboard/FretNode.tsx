import type { FC } from 'react';
import { ComputedFretNode } from '../../core/models';

export interface FretNodeProps {
  node: ComputedFretNode;
  cx: number;
  cy: number;
  radius?: number;
  isUserSelected?: boolean;
  comparisonStatus?: 'CORRECT' | 'WRONG' | 'MISSED' | 'NONE';
  isClickablePracticeTarget?: boolean;
  onClick?: (node: ComputedFretNode) => void;
}

export const FretNode: FC<FretNodeProps> = ({
  node,
  cx,
  cy,
  radius = 15,
  isUserSelected = false,
  comparisonStatus = 'NONE',
  isClickablePracticeTarget = false,
  onClick,
}) => {
  const isHidden = node.visualPriority === 'HIDDEN';
  const isCorrect = comparisonStatus === 'CORRECT';
  const isWrong = comparisonStatus === 'WRONG';
  const isMissed = comparisonStatus === 'MISSED';

  // If node is normally hidden but on an active string in practice mode, allow clicking
  if (isHidden && !isUserSelected && !isWrong) {
    if (isClickablePracticeTarget) {
      return (
        <circle
          cx={cx}
          cy={cy}
          r={radius + 3}
          fill="transparent"
          className="hover:fill-sky-500/25 cursor-pointer transition-colors duration-150"
          onClick={() => onClick?.(node)}
        />
      );
    }
    return null;
  }

  const isGhost = node.visualPriority === 'GHOST';
  const isTargetRoot = node.visualPriority === 'TARGET_ROOT';
  const isTargetTone = node.visualPriority === 'TARGET_TONE';
  const isContextScale = node.visualPriority === 'CONTEXT_SCALE';

  // Styling based on visual priority, user selection, and comparison status
  let fillColor = '#334155';
  let strokeColor = '#64748b';
  let strokeWidth = 1.5;
  let textColor = '#f8fafc';
  let opacity = 1.0;
  let labelText = node.displayLabel;

  if (isWrong) {
    // User picked this note, but it is NOT in the solution
    fillColor = '#dc2626'; // red-600
    strokeColor = '#fca5a5'; // red-300
    strokeWidth = 2.5;
    textColor = '#ffffff';
    labelText = '✕';
    opacity = 1.0;
  } else if (isCorrect) {
    // User picked this note, and it IS in the solution
    fillColor = '#059669'; // emerald-600
    strokeColor = '#6ee7b7'; // emerald-300
    strokeWidth = 3;
    textColor = '#ffffff';
    labelText = node.displayLabel || '✓';
    opacity = 1.0;
  } else if (isMissed) {
    // In solution, but user did not pick it
    fillColor = '#e11d48';
    strokeColor = '#fbbf24'; // amber-400 dashed
    strokeWidth = 2.5;
    textColor = '#ffffff';
    opacity = 0.95;
  } else if (isUserSelected) {
    // User selected this node during PROMPTING
    fillColor = '#0284c7'; // sky-600
    strokeColor = '#7dd3fc'; // sky-300
    strokeWidth = 2.5;
    textColor = '#ffffff';
    labelText = '●';
    opacity = 1.0;
  } else if (isGhost) {
    opacity = 0.15;
    fillColor = '#1e293b';
    strokeColor = '#475569';
    textColor = '#94a3b8';
  } else if (isTargetRoot) {
    fillColor = '#e11d48'; // rose-600
    strokeColor = '#ffe4e6'; // rose-100 ring
    strokeWidth = 2.5;
    textColor = '#ffffff';
    opacity = 1.0;
  } else if (isTargetTone) {
    const interval = node.targetInterval;
    if (interval === '3' || interval === 'b3') {
      fillColor = '#0284c7'; // sky-600
      strokeColor = '#e0f2fe';
    } else if (interval === '5' || interval === 'b5' || interval === '#5') {
      fillColor = '#d97706'; // amber-600
      strokeColor = '#fef3c7';
    } else {
      fillColor = '#4f46e5'; // indigo-600
      strokeColor = '#e0e7ff';
    }
    strokeWidth = 2;
    textColor = '#ffffff';
    opacity = 1.0;
  } else if (isContextScale) {
    if (node.isScaleRoot) {
      fillColor = '#475569';
      strokeColor = '#f43f5e';
      strokeWidth = 2;
    } else {
      fillColor = '#1e293b';
      strokeColor = '#475569';
      strokeWidth = 1.5;
    }
    textColor = '#cbd5e1';
    opacity = 0.45;
  }

  // Active isolated triad voicing highlighting
  const showVoicingGlow = (node.isActiveTriadVoicing && !isGhost) || isCorrect;

  return (
    <g
      className={`fret-node cursor-pointer select-none transition-opacity duration-200 ${
        showVoicingGlow ? 'active-triad-node' : ''
      }`}
      opacity={opacity}
      onClick={() => onClick?.(node)}
    >
      {/* Outer Glow / Halo for Active Triad Voicing or Correct Pick */}
      {showVoicingGlow && (
        <circle
          cx={cx}
          cy={cy}
          r={radius + 5}
          fill="none"
          stroke={isCorrect ? '#34d399' : isTargetRoot ? '#f43f5e' : '#38bdf8'}
          strokeWidth={2}
          strokeDasharray="4 2"
          className="animate-pulse"
          opacity={0.85}
        />
      )}

      {/* Main Node Circle */}
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={isMissed ? '3 2' : undefined}
      />

      {/* Dynamic Label Text */}
      {labelText && (
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fill={textColor}
          fontSize={labelText.length > 2 ? radius * 0.75 : radius * 0.9}
          fontWeight={isTargetRoot || isTargetTone || isCorrect || isWrong ? '700' : '500'}
          className="pointer-events-none font-mono"
        >
          {labelText}
        </text>
      )}

      {/* Small Checkmark Badge for Correct Pick */}
      {isCorrect && (
        <g transform={`translate(${cx + radius * 0.5}, ${cy - radius * 0.5})`}>
          <circle cx={0} cy={0} r={5.5} fill="#10b981" stroke="#ffffff" strokeWidth={1} />
          <text
            x={0}
            y={0.5}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#ffffff"
            fontSize={7}
            fontWeight="bold"
          >
            ✓
          </text>
        </g>
      )}
    </g>
  );
};
