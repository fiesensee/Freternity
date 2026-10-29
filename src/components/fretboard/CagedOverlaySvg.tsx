import type { FC } from 'react';
import { CagedShapeId } from '../../core/models';
import { FretWindow } from '../../core/cagedGeometry';

export interface CagedOverlaySvgProps {
  shape: CagedShapeId;
  windows: readonly FretWindow[];
  getFretX: (fret: number) => number; // X-coordinate of fret wire
  yTop: number;
  height: number;
  renderPart?: 'box' | 'badge' | 'all';
}

export const CagedOverlaySvg: FC<CagedOverlaySvgProps> = ({
  shape,
  windows,
  getFretX,
  yTop,
  height,
  renderPart = 'all',
}) => {
  if (windows.length === 0) return null;

  const showBox = renderPart === 'box' || renderPart === 'all';
  const showBadge = renderPart === 'badge' || renderPart === 'all';

  return (
    <g className="caged-overlay-layer pointer-events-none select-none">
      {windows.map((win, idx) => {
        // Start X: if win.min is 0 (open strings), start slightly before nut
        const startX = win.min === 0 ? getFretX(0) - 35 : getFretX(win.min - 1);
        const endX = getFretX(win.max);
        const width = Math.max(0, endX - startX);

        if (width <= 0) return null;

        const badgeWidth = 76;
        const badgeHeight = 20;
        const badgeX = Math.max(10, startX + (width - badgeWidth) / 2);
        const badgeY = 6;

        return (
          <g key={`caged-window-${idx}`}>
            {/* Translucent bounding box around active CAGED frets */}
            {showBox && (
              <rect
                x={startX}
                y={yTop}
                width={width}
                height={height}
                rx={8}
                ry={8}
                fill="rgba(56, 189, 248, 0.08)"
                stroke="rgba(56, 189, 248, 0.45)"
                strokeWidth={1.5}
                strokeDasharray="6 4"
              />
            )}

            {/* Shape Badge Tag placed OVER (above) the fretboard in the graphic */}
            {showBadge && (
              <g
                transform={`translate(${badgeX}, ${badgeY})`}
                className="caged-badge drop-shadow-md"
              >
                <rect
                  x={0}
                  y={0}
                  width={badgeWidth}
                  height={badgeHeight}
                  rx={5}
                  fill="#0f172a"
                  stroke="#38bdf8"
                  strokeWidth={1.5}
                />
                <circle cx={12} cy={badgeHeight / 2} r={3} fill="#38bdf8" />
                <text
                  x={44}
                  y={badgeHeight / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#f0f9ff"
                  fontSize={10.5}
                  fontWeight="bold"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
                  letterSpacing="0.05em"
                >
                  {shape} SHAPE
                </text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
};
