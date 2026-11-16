import { FretPosition, MidiNote } from '../models';
import { RhythmGrid, gridInterval, matchToGrid, timingStats, TimingStats } from './rhythmMath';

/**
 * Scores one take of a rhythm drill: which planned notes were played, on time, with the
 * right pitch. Timing and notes are judged separately, so "right note, late" and "on time,
 * wrong note" are both visible.
 */

export interface ExpectedNote extends FretPosition {
  /** Grid slot (0 = first slot after the count-in) */
  slot: number;
  midi: MidiNote;
}

export interface PlayedNote {
  /** Audio-clock time of the pluck */
  time: number;
  midi: MidiNote | null;
}

export type NoteOutcome =
  | { status: 'RIGHT'; offsetMs: number; playedMidi: MidiNote }
  | { status: 'WRONG_NOTE'; offsetMs: number; playedMidi: MidiNote | null }
  | { status: 'MISSED' };

export interface TakeScore {
  /** One outcome per expected note, in order */
  outcomes: readonly NoteOutcome[];
  /** Plucks that didn't belong to any planned note (doubled, or outside the take) */
  extras: number;
  rightNotes: number;
  wrongNotes: number;
  missed: number;
  /** Timing of every planned note that was played, right pitch or not */
  timing: TimingStats | null;
  /** Share of planned notes played with the right pitch */
  noteAccuracy: number;
  passed: boolean;
}

/** A take passes with ≥ 90% right notes and ≥ 80% of the played notes within ±50 ms. */
export const PASS_NOTE_ACCURACY = 0.9;
export const PASS_WITHIN_50 = 0.8;

export function scoreTake(
  expected: readonly ExpectedNote[],
  played: readonly PlayedNote[],
  grid: RhythmGrid,
  latencyMs: number,
  /** Only judge planned notes up to this slot (live scoring during the take) */
  uptoSlot = Infinity
): TakeScore {
  const bySlot = new Map<number, number>(expected.map((e, i) => [e.slot, i]));
  const candidates = new Map<number, { offsetMs: number; midi: MidiNote | null }[]>();
  let extras = 0;

  for (const p of played) {
    const hit = matchToGrid(p.time, grid, latencyMs);
    const index = hit ? bySlot.get(hit.slot) : undefined;
    if (!hit || index === undefined) {
      extras++;
      continue;
    }
    const list = candidates.get(index) ?? [];
    list.push({ offsetMs: hit.offsetMs, midi: p.midi });
    candidates.set(index, list);
  }

  const outcomes: NoteOutcome[] = expected.map((e, i) => {
    const list = candidates.get(i);
    if (!list || list.length === 0) return { status: 'MISSED' };
    // Prefer the right pitch, then the pluck closest to the slot; the rest are extras
    const best = [...list].sort(
      (a, b) =>
        Number(b.midi === e.midi) - Number(a.midi === e.midi) ||
        Math.abs(a.offsetMs) - Math.abs(b.offsetMs)
    )[0];
    extras += list.length - 1;
    return best.midi === e.midi
      ? { status: 'RIGHT', offsetMs: best.offsetMs, playedMidi: best.midi }
      : { status: 'WRONG_NOTE', offsetMs: best.offsetMs, playedMidi: best.midi };
  });

  const judged = outcomes.filter((_, i) => expected[i].slot <= uptoSlot);
  const rightNotes = judged.filter((o) => o.status === 'RIGHT').length;
  const wrongNotes = judged.filter((o) => o.status === 'WRONG_NOTE').length;
  const missed = judged.filter((o) => o.status === 'MISSED').length;
  const timing = timingStats(
    judged.flatMap((o) => (o.status === 'MISSED' ? [] : [o.offsetMs]))
  );
  const noteAccuracy = judged.length > 0 ? rightNotes / judged.length : 0;

  return {
    outcomes,
    extras,
    rightNotes,
    wrongNotes,
    missed,
    timing,
    noteAccuracy,
    passed:
      judged.length > 0 &&
      noteAccuracy >= PASS_NOTE_ACCURACY &&
      (timing?.within50 ?? 0) >= PASS_WITHIN_50,
  };
}

/** How long a take lasts in ms: count-in, the notes, and a short tail for the last one. */
export function takeDurationMs(
  grid: Pick<RhythmGrid, 'bpm' | 'subdivision'>,
  noteCount: number,
  countInBeats: number
): number {
  const interval = gridInterval(grid);
  const countIn = countInBeats * (60 / grid.bpm);
  return Math.round((countIn + noteCount * interval + 0.8) * 1000);
}
