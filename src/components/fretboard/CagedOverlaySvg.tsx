import type { FC } from 'react';
import { CagedShapeId } from '../../core/models';
import { FretWindow } from '../../core/cagedGeometry';

export interface CagedOverlaySvgProps {
  shape: CagedShapeId;
  windows: readonly FretWindow[];
  getFretX: (fret: number) => number; // X-coordinate of fret wire
  yTop: number;
  height: number;
}

export const CagedOverlaySvg: FC<CagedOverlaySvgProps> = ({
  shape,
  windows,
  getFretX,
  yTop,
  height,
}) => {
  if (windows.length === 0) return null;

  return (
    <g className="caged-overlay-layer pointer-events-none">
      {windows.map((win, idx) => {
        // Start X: if win.min is 0 (open strings), start slightly before nut
        const startX = win.min === 0 ? getFretX(0) - 35 : getFretX(win.min - 1);
        const endX = getFretX(win.max);
        const width = Math.max(0, endX - startX);

        if (width <= 0) return null;

        return (
          <g key={`caged-window-${idx}`}>
            {/* Translucent bounding box */}
            <rect
              x={startX}
              y={yTop}
              width={width}
              height={height}
              rx={8}
              ry={8}
              fill="rgba(56, 189, 248, 0.08)"
              stroke="rgba(56, 189, 248, 0.4)"
              strokeWidth={1.5}
              strokeDasharray="6 4"
            />

            {/* Shape Badge Tag */}
            <g transform={`translate(${startX + 10}, ${yTop + 18})`}>
              <rect
                x={0}
                y={-12}
                width={70}
                height={16}
                rx={4}
                fill="rgba(15, 23, 42, 0.85)"
                stroke="rgba(56, 189, 248, 0.6)"
                strokeWidth={1}
              />
              <text
                x={35}
                y={-4}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#38bdf8"
                fontSize={10}
                fontWeight="bold"
                fontFamily="sans-serif"
              >
                {shape} SHAPE
              </text>
            </g>
          </g>
        );
      })}
    </g>
  );
};
