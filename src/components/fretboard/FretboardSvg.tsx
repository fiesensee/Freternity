import { useMemo, type FC } from 'react';
import {
  CagedShapeId,
  ComputedFretNode,
  FretPosition,
  InstrumentConfig,
  PitchClass,
} from '../../core/models';
import { GUITAR_6_STANDARD } from '../../core/constants';
import { getCagedFretWindows } from '../../core/cagedGeometry';
import { FretNode } from './FretNode';
import { CagedOverlaySvg } from './CagedOverlaySvg';

export interface ViewWindow {
  minFret: number; // e.g. 0 or 5
  maxFret: number; // e.g. 22 or 9
}

export interface FretboardSvgProps {
  matrix: ComputedFretNode[][];
  instrument?: InstrumentConfig;
  viewWindow?: ViewWindow;
  cagedOverlay?: {
    enabled: boolean;
    shape: CagedShapeId;
    referenceRoot: PitchClass;
  };
  userSelections?: readonly FretPosition[];
  comparisonMap?: Readonly<Record<string, 'CORRECT' | 'WRONG' | 'MISSED'>>;
  isInteractivePractice?: boolean;
  onNodeClick?: (node: ComputedFretNode) => void;
  className?: string;
}

export const FretboardSvg: FC<FretboardSvgProps> = ({
  matrix,
  instrument = GUITAR_6_STANDARD,
  viewWindow,
  cagedOverlay,
  userSelections,
  comparisonMap,
  isInteractivePractice = false,
  onNodeClick,
  className = '',
}) => {
  // SVG Canvas dimensions & Geometry
  const neckTopY = 35;
  const stringSpacing = 34;
  const stringCount = instrument.stringCount;
  const neckBottomY = neckTopY + (stringCount - 1) * stringSpacing;
  const neckHeight = neckBottomY - neckTopY;
  const totalSvgHeight = neckBottomY + 45; // space for fret numbers below

  const nutX = 65;
  const scaleLength = 2200; // Gives realistic tapering fret widths

  // Calculate fret wire X positions: x(f) = nutX + scaleLength * (1 - 2^(-f / 17.817))
  const fretXPositions = useMemo(() => {
    const positions: number[] = [nutX]; // fret 0 wire (nut)
    for (let f = 1; f <= instrument.fretCount; f++) {
      const dist = scaleLength * (1 - Math.pow(2, -f / 17.817));
      positions.push(Math.round(nutX + dist));
    }
    return positions;
  }, [instrument.fretCount, scaleLength, nutX]);

  // Note center X coordinate
  const getNoteX = (fret: number): number => {
    if (fret === 0) return nutX - 35;
    const prevFretX = fretXPositions[fret - 1];
    const currFretX = fretXPositions[fret];
    return (prevFretX + currFretX) / 2;
  };

  // String Y coordinate: string 1 (high E) at top, string 6 (low E) at bottom
  const getStringY = (stringIndex: number): number => {
    return neckTopY + (stringIndex - 1) * stringSpacing;
  };

  // String gauge thickness (string 1 is thin ~1.2px, string 6 is thick ~3.6px)
  const getStringThickness = (stringIndex: number): number => {
    return 1.2 + ((stringIndex - 1) / (stringCount - 1)) * 2.4;
  };

  // ViewBox bounds for zoom / mobile viewport locking
  const { viewBoxX, viewBoxWidth } = useMemo(() => {
    const minF = viewWindow?.minFret ?? 0;
    const maxF = viewWindow?.maxFret ?? instrument.fretCount;

    let startX = 0;
    if (minF === 0) {
      startX = 0;
    } else {
      startX = fretXPositions[minF - 1] - 10;
    }

    const endX = fretXPositions[Math.min(maxF, instrument.fretCount)] + 25;
    const width = Math.max(200, endX - startX);

    return { viewBoxX: startX, viewBoxWidth: width };
  }, [viewWindow, instrument.fretCount, fretXPositions]);

  // Inlay Dots
  const singleInlays = instrument.inlayFrets.filter((f) => f !== 12 && f !== 24);
  const doubleInlays = instrument.inlayFrets.filter((f) => f === 12 || f === 24);

  // CAGED Overlay windows
  const cagedWindows = useMemo(() => {
    if (!cagedOverlay || !cagedOverlay.enabled) return [];
    return getCagedFretWindows(
      cagedOverlay.shape,
      cagedOverlay.referenceRoot,
      instrument
    );
  }, [cagedOverlay, instrument]);

  return (
    <div className={`w-full overflow-x-auto ${className}`}>
      <svg
        viewBox={`${viewBoxX} 0 ${viewBoxWidth} ${totalSvgHeight}`}
        className="w-full h-auto select-none block drop-shadow-md"
        style={{ minWidth: viewWindow ? 'auto' : '850px' }}
      >
        {/* Neck Wood Background */}
        <rect
          x={nutX}
          y={neckTopY - 10}
          width={fretXPositions[instrument.fretCount] - nutX + 15}
          height={neckHeight + 20}
          rx={6}
          ry={6}
          fill="#1e1e24" // Dark rosewood fretboard color
          stroke="#2d2d38"
          strokeWidth={1.5}
        />

        {/* Headstock space for open strings (fret 0) */}
        <rect
          x={10}
          y={neckTopY - 10}
          width={nutX - 10}
          height={neckHeight + 20}
          rx={4}
          ry={4}
          fill="#141419"
        />

        {/* Inlays: Single Dots */}
        {singleInlays.map((fret) => {
          if (fret > instrument.fretCount) return null;
          const cx = getNoteX(fret);
          const cy = neckTopY + neckHeight / 2;
          return (
            <circle
              key={`inlay-single-${fret}`}
              cx={cx}
              cy={cy}
              r={6.5}
              fill="#4a4a5a"
              opacity={0.65}
            />
          );
        })}

        {/* Inlays: Double Dots (12th & 24th frets) */}
        {doubleInlays.map((fret) => {
          if (fret > instrument.fretCount) return null;
          const cx = getNoteX(fret);
          const cy1 = neckTopY + stringSpacing * 1.5;
          const cy2 = neckTopY + stringSpacing * 3.5;
          return (
            <g key={`inlay-double-${fret}`}>
              <circle cx={cx} cy={cy1} r={5.5} fill="#4a4a5a" opacity={0.65} />
              <circle cx={cx} cy={cy2} r={5.5} fill="#4a4a5a" opacity={0.65} />
            </g>
          );
        })}

        {/* Fret Wires */}
        {fretXPositions.map((fx, fretIdx) => {
          if (fretIdx === 0) return null; // Nut handled separately
          return (
            <line
              key={`fret-wire-${fretIdx}`}
              x1={fx}
              y1={neckTopY - 10}
              x2={fx}
              y2={neckBottomY + 10}
              stroke="#6b7280" // Fret wire silver
              strokeWidth={2}
              opacity={0.75}
            />
          );
        })}

        {/* The Nut (Thick bone/graphite separator at fret 0) */}
        <line
          x1={nutX}
          y1={neckTopY - 10}
          x2={nutX}
          y2={neckBottomY + 10}
          stroke="#e2e8f0" // Bone ivory
          strokeWidth={6}
          strokeLinecap="round"
        />

        {/* Fret Numbers along bottom */}
        {fretXPositions.map((_, fretIdx) => {
          const cx = getNoteX(fretIdx);
          const isMarkerFret =
            fretIdx === 0 ||
            instrument.inlayFrets.includes(fretIdx) ||
            fretIdx % 5 === 0;

          return (
            <text
              key={`fret-num-${fretIdx}`}
              x={cx}
              y={neckBottomY + 30}
              textAnchor="middle"
              fill={isMarkerFret ? '#cbd5e1' : '#64748b'}
              fontSize={isMarkerFret ? 12 : 10}
              fontWeight={isMarkerFret ? 'bold' : 'normal'}
              className="font-mono select-none"
            >
              {fretIdx}
            </text>
          );
        })}

        {/* CAGED Stencil Overlay */}
        {cagedOverlay && cagedOverlay.enabled && (
          <CagedOverlaySvg
            shape={cagedOverlay.shape}
            windows={cagedWindows}
            getFretX={(f) => fretXPositions[Math.min(f, instrument.fretCount)]}
            yTop={neckTopY - 8}
            height={neckHeight + 16}
          />
        )}

        {/* Guitar Strings */}
        {Array.from({ length: stringCount }, (_, idx) => {
          const stringNumber = idx + 1;
          const y = getStringY(stringNumber);
          const thickness = getStringThickness(stringNumber);

          // Check if this string is masked out in any node
          const stringRow = matrix[idx];
          const isStringMasked = stringRow ? stringRow[0]?.isMaskedOut : false;

          return (
            <line
              key={`string-${stringNumber}`}
              x1={10}
              y1={y}
              x2={fretXPositions[instrument.fretCount] + 15}
              y2={y}
              stroke="#94a3b8" // Nickel/Steel string
              strokeWidth={thickness}
              opacity={isStringMasked ? 0.15 : 0.85}
              className="transition-opacity duration-200"
            />
          );
        })}

        {/* Interactive Fretboard Nodes */}
        {matrix.map((row) =>
          row.map((node) => {
            const cx = getNoteX(node.position.fret);
            const cy = getStringY(node.position.stringIndex);
            const posKey = `${node.position.stringIndex}-${node.position.fret}`;
            const isUserSelected = userSelections?.some(
              (p) =>
                p.stringIndex === node.position.stringIndex && p.fret === node.position.fret
            );
            const comparisonStatus = comparisonMap?.[posKey] ?? 'NONE';
            const isClickablePracticeTarget = isInteractivePractice && !node.isMaskedOut;

            return (
              <FretNode
                key={`node-${node.position.stringIndex}-${node.position.fret}`}
                node={node}
                cx={cx}
                cy={cy}
                radius={13.5}
                isUserSelected={isUserSelected}
                comparisonStatus={comparisonStatus}
                isClickablePracticeTarget={isClickablePracticeTarget}
                onClick={onNodeClick}
              />
            );
          })
        )}
      </svg>
    </div>
  );
};
