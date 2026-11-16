# Freternity Roadmap

Ideas and open points for later. Nothing here is committed to or ordered by date. The
priority section at the end is a suggestion.

State as of November 2026, branch `feat/rhythm` (CAGED chord-shape finder, Rhythm Lab
prototype, Scale-in-time drill v1). Neither `feat/caged-finder` nor `feat/rhythm` is merged
into `main` yet.

---

## 1. App structure and settings

### One place for input and latency
Today, guitar input and timing settings are spread over five places:

| Where | What it offers |
|---|---|
| Tuner bar (header) | Answer by click / guitar, sensitivity, input device |
| Practice setup, "Answer with" | Answer by click / guitar, level meter, sensitivity, input device |
| Practice HUD, Options menu | Answer by click / guitar (and click volume in the rhythm drill) |
| Scale-in-time setup, "Your guitar" | Input device, sensitivity, calibration status with a link to the Rhythm Lab |
| Rhythm Lab | Input device, sensitivity, latency calibration, click volume |

Goal: one "Guitar & audio" place that owns input device, sensitivity, level meter, tuner,
latency calibration (per device) and click volume. Everything else only shows status
("Guitar: Focusrite · calibrated 84 ms") and links to it. The tuner bar is the natural
candidate, since it's already reachable from everywhere.

### What to do with the Rhythm Lab
The Rhythm Lab feels lost: it was a prototype to prove that timing works, and that question
is answered. What it still does that nothing else does:
- latency calibration (play along, or loopback test),
- free play against a metronome with timing stats.

Options:
1. **Fold calibration into the "Guitar & audio" place** (see above) and drop the tab.
   Free play could become a mode of the Scale-in-time drill ("just the click, no scale").
2. **Keep it as a "Metronome" tool**: a plain metronome with optional timing feedback,
   no longer called a lab, calibration moved out.
3. Keep it as a hidden diagnostics page for troubleshooting a setup.

Leaning: option 1, unless a standalone metronome turns out to be wanted.

### Remember the last used settings (localStorage)
Today only input device, sensitivity, latency, click volume and the "Customize" toggle are
remembered. Drill settings reset to the defaults on every reload, and Explore relies on the
URL alone.

Remember:
- **Practice:** last drill type, key and mode, flats/sharps, string sets, inversions, CAGED
  shapes/positions, tempo and grid, think time, reveal time, auto-advance, sound toggles,
  answer mode.
- **Explore:** last scale, highlighted chord, inversion, CAGED shape, lens, strings, zoom.
  A shared link (URL parameters) should still win over the remembered state.

Notes: one versioned key per area (e.g. `freternity.practiceConfig.v1`), validate on load
(a stored shape or scale that no longer exists falls back to the default), and wrap every
access in try/catch so private mode still works.

### Explore: remove the strip under the fretboard
The chord-shape strip under the fretboard (the string-by-string note / chord tone / scale
degree breakdown that appears with a CAGED chord shape) repeats what the fretboard and the
label lens already show. Remove it.

---

## 2. Rhythm drill (Scale in time)

### v2
- **Rhythm patterns:** rests and mixed note lengths ("eighth-eighth-quarter", dotted,
  gallop), shown as simple blocks on a grid rather than standard notation.
- **Tempo ladder:** +5 bpm after a passed take, back down after a failed one. Plus a loop
  mode that keeps going without stopping between takes.
- **"Where you rush" analysis:** early/late by string, at string changes, and up vs. down.
  The per-note data is already collected; this is mostly presentation.
- **Scrolling strip while playing:** the planned notes on a timeline with a playhead, your
  plucks landing on it.

### v3
- Triplets (as a visible, countable pattern this time) and swing.
- Scale sequences: in 3rds, in 4ths, groups of three/four.
- Other scales: major and minor pentatonic, blues.

### Polish (known rough edges)
- Changing the input device only takes effect from the next take.
- "Clean take!" also appears with a few mistakes as long as the thresholds are met (90% right
  notes, 80% within ±50 ms). Reword it, or make the thresholds a setting.
- The Rhythm Lab has its own copy of the results display; share one component (or drop the
  lab, see above).
- General visual polish of the take and results view.

---

## 3. More exercises

Both are named in `SAD.md` and in `ExerciseType` (`src/core/models.ts`) but not built yet.

- **Scale degree finder:** "Find the ♭6 of A minor in the D shape." Builds directly on the
  CAGED work and the scale positions from the rhythm drill (`src/core/scalePositions.ts`),
  and brings the original "focus on scale degrees" into practice mode. Click or play the
  note; only the position inside the named shape counts.
- **CAGED arpeggio link:** play a chord's arpeggio in one CAGED shape and connect it to the
  next shape up the neck.

---

## 4. Small leftovers

- No-repeat only prevents the same question twice in a row. It could also avoid the last
  few questions.
- The 🖱 emoji on "Click Fretboard" may not render on every system (🎚 didn't); replace it
  with an inline SVG like the tuning fork.
- Merge `feat/caged-finder` and `feat/rhythm` into `main`.

---

## Suggested order

1. Remember last used settings (small, noticeable every day).
2. One place for input and latency, and decide the Rhythm Lab's fate along with it.
3. Remove the Explore strip (trivial, can go with any of the above).
4. Scale degree finder.
5. Rhythm v2: tempo ladder and "where you rush" first, then patterns and the scrolling strip.
