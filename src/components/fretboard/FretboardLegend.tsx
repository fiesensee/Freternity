import { type FC, type ReactNode } from 'react';
import { FretboardViewState } from '../../core/models';

export type LegendContext =
  | { kind: 'explore'; viewState: FretboardViewState }
  | { kind: 'prompt'; inputMode: 'POINTER' | 'GUITAR' }
  | {
      kind: 'reveal';
      viewState: FretboardViewState;
      hasCorrect: boolean;
      hasWrong: boolean;
      hasMissed: boolean;
    };

const Dot: FC<{ className: string; children?: ReactNode }> = ({ className, children }) => (
  <span
    className={`w-3.5 h-3.5 rounded-full inline-flex items-center justify-center text-[9px] text-white font-bold ${className}`}
  >
    {children}
  </span>
);

const Item: FC<{ dot: ReactNode; label: string }> = ({ dot, label }) => (
  <div className="flex items-center gap-1.5">
    {dot}
    <span>{label}</span>
  </div>
);

const chordToneItems = (viewState: FretboardViewState) =>
  viewState.targetLayer.enabled
    ? [
        <Item key="root" dot={<Dot className="bg-rose-600 border border-rose-200" />} label="Chord root" />,
        <Item key="3rd" dot={<Dot className="bg-sky-600 border border-sky-200" />} label="3rd" />,
        <Item key="5th" dot={<Dot className="bg-amber-600 border border-amber-200" />} label="5th" />,
      ]
    : [];

const scaleItem = (viewState: FretboardViewState) =>
  viewState.scaleLayer.enabled && !viewState.targetLayer.enabled
    ? [
        <Item key="sroot" dot={<Dot className="bg-rose-600 border border-rose-200" />} label="Scale root" />,
        <Item key="stone" dot={<Dot className="bg-slate-600 border border-slate-300" />} label="Scale note" />,
      ]
    : viewState.scaleLayer.enabled
    ? [
        <Item
          key="scale"
          dot={<Dot className="bg-slate-800 border border-slate-600 opacity-60" />}
          label="Other scale notes"
        />,
      ]
    : [];

/** Explains only the colours that are currently on the fretboard. */
export const FretboardLegend: FC<{ context: LegendContext }> = ({ context }) => {
  let items: ReactNode[] = [];

  if (context.kind === 'explore') {
    const { viewState } = context;
    const showsInversion =
      viewState.targetLayer.enabled &&
      !!viewState.targetLayer.activeInversion &&
      viewState.filterMask.activeStrings.length === 3;
    items = [
      ...chordToneItems(viewState),
      ...(showsInversion
        ? [
            <Item
              key="inv"
              dot={<Dot className="border-2 border-sky-400 border-dashed" />}
              label="Selected inversion"
            />,
          ]
        : []),
      ...scaleItem(viewState),
    ];
  } else if (context.kind === 'prompt') {
    items =
      context.inputMode === 'GUITAR'
        ? [
            <Item key="ok" dot={<Dot className="bg-emerald-600 border border-emerald-300">✓</Dot>} label="Right note" />,
            <Item key="bad" dot={<Dot className="bg-rose-600 border border-rose-300">✕</Dot>} label="Wrong note" />,
          ]
        : [<Item key="pick" dot={<Dot className="bg-sky-600 border border-sky-300" />} label="Your pick" />];
  } else {
    items = [
      ...(context.hasCorrect
        ? [<Item key="ok" dot={<Dot className="bg-emerald-600 border border-emerald-300">✓</Dot>} label="You got it" />]
        : []),
      ...(context.hasWrong
        ? [<Item key="bad" dot={<Dot className="bg-rose-600 border border-rose-300">✕</Dot>} label="Wrong" />]
        : []),
      ...(context.hasMissed
        ? [<Item key="miss" dot={<Dot className="bg-rose-600 border-2 border-amber-400" />} label="You missed it" />]
        : []),
      ...chordToneItems(context.viewState),
      ...scaleItem(context.viewState),
    ];
  }

  if (items.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-400">
      {items}
    </div>
  );
};
