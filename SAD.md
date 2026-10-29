# Software Architecture & Design Document: Freternity (Fretboard Theory & Practice Engine)

## 1. System Overview & Core Philosophy

**Freternity** is a client-side web application designed to bridge the gap between static fretboard visualizers and active, time-based practice trainers. 

### Architectural Goals
1. **Relational Over Memorization:** Never render isolated shapes. Always compute and offer to display how a **Base Layer** (Parent Scale/Mode), a **Target Layer** (Triad/Arpeggio), and a **Geometric Stencil** (CAGED Position) intersect on the fretboard.
2. **Pure Domain Core:** All music theory, interval math, CAGED geometry, and fretboard projection logic must live in a zero-dependency, pure TypeScript domain module (`src/core/`), completely decoupled from the UI framework.
3. **Extensibility for Hardware & Audio (v2+ Ready):** The practice state machine and input interfaces are designed around an abstract `PracticeEventBus`. In v1.0, exercises advance via a timer or manual trigger; in v2.0, a Web Audio API pitch-detection adapter or WebMIDI adapter can emit `NOTE_DETECTED` events into the exact same state machine without refactoring the UI or drill logic.
4. **Zero-Backend & URL-Addressable State:** Application state is serializable into URL search parameters and `localStorage`, allowing users to bookmark specific lessons or drills.

---

## 2. MVP Scope & Use Cases (v1.0)

### Use Case 1: Layered Fretboard & Modal Visualizer ("Explore Mode")
The user explores how scales, modes, chords, triads, and CAGED shapes overlap on a 6-string guitar neck.

* **UC-1.1: Base Scale & Relative Mode Pivoting**
  * User selects a Parent Scale (e.g., `C Major`) or directly picks a Root + Mode (e.g., `A Aeolian`).
  * A **Modal Pivot Slider** displays the 7 diatonic notes of the active parent key (`C - D - E - F - G - A - B`). Clicking another degree shifts the active Root and recalculates all interval degrees across the board without moving the physical fret positions.
* **UC-1.2: Target Overlay (Arpeggio / Triad Layer)**
  * User toggles a Target Chord overlay (either selected from the diatonic chords of the active scale, e.g., `i - Am`, `IV - Dm`, `V - Em`, or any arbitrary chord).
  * Fretboard nodes belonging to the Target Chord render at 100% opacity with high-contrast interval rings (`R`, `3`/`b3`, `5`), while remaining Base Scale notes drop to 30% opacity as contextual "stepping stones."
* **UC-1.3: String-Set Masking & Fret-Zone Constraints**
  * User can toggle individual strings on/off or select quick presets (e.g., `Strings 1-2-3 (High Triads)`, `Strings 2-3-4`, `All Strings`). Masked strings render at 10% opacity and ignore target highlights.
  * User can constrain the active fret window (e.g., `Frets 5-9`) or select one of the **5 CAGED Stencils** (`C`, `A`, `G`, `E`, `D` shape relative to either the Scale Root or Target Chord Root) to highlight the geometric box.
* **UC-1.4: Dynamic Node Label Switcher ("Lens")**
  * Instant toggle (via UI or keyboard shortcuts `1-4`) changing the text inside rendered fretboard nodes:
    1. `NOTE_NAME` (`A`, `C`, `E`)
    2. `SCALE_DEGREE` (`1`, `2`, `b3`, `4`, `5`, `b6`, `b7` — relative to Base Scale Root)
    3. `CHORD_INTERVAL` (`R`, `b3`, `5` — relative to Target Chord Root)
    4. `BLIND_COLOR` (No text; color-coded by function, e.g., Root = Red, 3rd = Blue, 5th = Amber, Scale tone = Slate)

### Use Case 2: Timed Prompt-and-Reveal Trainer ("Practice Mode" — Exercise 1)
A hands-free, timed flashcard trainer for practicing **Top-3-String Triad Inversions & Arpeggios inside a Parent Scale** without requiring audio pitch detection in v1.0.

* **UC-2.1: Drill Configuration**
  * **Drill Type:** *Triad Inversion Hunter (Strings 1-2-3)* (expandable to other drills via the `ExerciseGenerator` interface).
  * **Parameters:**
    * *Key / Scale Context:* e.g., `A Aeolian` (or random diatonic chords within `A Aeolian`).
    * *String Set:* Default `Strings 1-2-3 (G, B, E)`.
    * *Target Scope:* Specific inversion (`Root Pos`, `1st Inv`, `2nd Inv`, or `All 3 Inversions`) OR a specific CAGED zone (`Frets 5-8`).
    * *Timing:* `Think/Play Time` (e.g., 8 seconds) and `Reveal Time` (e.g., 4 seconds).
    * *Audio Assist:* Toggleable Web Audio API **Root Drone** (plays a warm ambient synth pad on the current root note) and **Metronome Click**.
* **UC-2.2: The Execution Loop (Hands-Free State Machine)**
  1. **`PROMPTING` (Fretboard Hidden/Masked):** The screen displays a large, readable callout card: *"Play **D Minor Triad (iv)** — **1st Inversion (F in bass)** — **Strings 1-2-3**"*. The fretboard either stays completely blank or shows only the single Root reference dot so the player must locate the triad on their physical guitar.
  2. **`COUNTDOWN`:** A visual progress bar ticks down the `Think/Play Time`.
  3. **`REVEALING` (Visual + Audio Verification):** When the timer hits zero (or the user presses `Spacebar` / taps the screen), the fretboard lights up the exact target triad nodes (and faintly shows the surrounding parent scale/CAGED box). Optionally, the browser strums the target triad pitches (`F4 -> A4 -> D5`) via Web Audio synth so the player can verify by ear.
  4. **`EVALUATION / ADVANCE`:** In *Auto-Loop Mode*, after `Reveal Time` expires, it automatically advances to the next prompt. In *Self-Grade Mode*, the user taps `Got It (Space)` or `Missed (R)` to track session accuracy.

---

## 3. Domain Data Model (TypeScript Specification)

Coding agents must implement these exact interfaces in `src/core/models.ts` to guarantee strict type safety across theory calculations, UI rendering, and practice state.

```typescript
// ============================================================================
// 1. PRIMITIVES & MUSIC THEORY TYPES
// ============================================================================

/** Semitone pitch class from 0 (C) to 11 (B) */
export type PitchClass = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

/** Standard MIDI note number (e.g., E2 = 40, A4 = 69) */
export type MidiNote = number;

/** Canonical interval labels relative to a root */
export type IntervalDegree =
  | '1' | 'b2' | '2' | '#2' | 'b3' | '3' | '4' | '#4' | 'b5'
  | '5' | '#5' | 'b6' | '6' | 'bb7' | 'b7' | '7';

export type CagedShapeId = 'C' | 'A' | 'G' | 'E' | 'D';

export type TriadInversion = 'ROOT' | 'FIRST' | 'SECOND';

export type NodeLabelMode = 'NOTE_NAME' | 'SCALE_DEGREE' | 'CHORD_INTERVAL' | 'BLIND_COLOR';

export interface ScaleDefinition {
  id: string;                      // e.g., "aeolian", "ionian", "dorian", "minor_pentatonic"
  name: string;                    // e.g., "Natural Minor (Aeolian)"
  semitones: readonly number[];    // e.g., [0, 2, 3, 5, 7, 8, 10]
  degrees: readonly IntervalDegree[]; // e.g., ['1', '2', 'b3', '4', '5', 'b6', 'b7']
  parentMajorOffset?: number;      // Semitone offset to relative Ionian (e.g., +3 for Aeolian)
}

export interface ChordDefinition {
  id: string;                      // e.g., "maj", "min", "dim", "maj7", "min7", "dom7"
  name: string;                    // e.g., "Minor Triad"
  symbolSuffix: string;            // e.g., "m", "", "dim", "m7"
  semitones: readonly number[];    // e.g., [0, 3, 7]
  degrees: readonly IntervalDegree[]; // e.g., ['1', 'b3', '5']
}

// ============================================================================
// 2. INSTRUMENT & FRETBOARD TOPOLOGY
// ============================================================================

export interface InstrumentConfig {
  id: string;                      // e.g., "guitar_6_standard"
  name: string;
  stringCount: number;             // 6
  fretCount: number;               // Typically 15, 22, or 24
  /** Tuning ordered from String 1 (highest pitch, e.g., E4=64) to String 6 (lowest, E2=40) */
  tuningMidi: readonly MidiNote[];
  inlayFrets: readonly number[];   // [3, 5, 7, 9, 12, 15, 17, 19, 21, 24]
}

export interface FretPosition {
  stringIndex: number;             // 1-based index: 1 = High E, 6 = Low E
  fret: number;                    // 0 = Open nut, 1..N = Frets
}

// ============================================================================
// 3. LAYERED FRETBOARD STATE & COMPUTED RENDER MATRIX
// ============================================================================

export interface ScaleLayerConfig {
  enabled: boolean;
  rootPitchClass: PitchClass;
  preferFlats: boolean;            // Enharmonic spelling preference (e.g., Bb vs A#)
  scaleId: string;
}

export interface TargetLayerConfig {
  enabled: boolean;
  rootPitchClass: PitchClass;
  chordId: string;                 // e.g., "min", "maj"
  diatonicRomanNumeral?: string;   // Optional context badge, e.g., "iv", "V"
  activeInversion?: TriadInversion | 'ANY';
}

export interface FilterMaskConfig {
  /** Set of active string numbers (1..6). Strings omitted are visually dimmed. */
  activeStrings: readonly number[];
  fretRange: { min: number; max: number };
  cagedOverlay?: {
    enabled: boolean;
    shape: CagedShapeId;
    referenceRoot: 'SCALE_ROOT' | 'TARGET_ROOT';
  };
}

/**
 * The complete declarative state of the Fretboard Visualizer.
 * Must be 100% serializable to JSON / URL query parameters.
 */
export interface FretboardViewState {
  instrumentId: string;
  labelMode: NodeLabelMode;
  scaleLayer: ScaleLayerConfig;
  targetLayer: TargetLayerConfig;
  filterMask: FilterMaskConfig;
}

/**
 * Computed output for a single (string, fret) intersection.
 * Produced by the pure FretboardProjector function and consumed by the SVG UI.
 */
export interface ComputedFretNode {
  position: FretPosition;
  midiNote: MidiNote;
  pitchClass: PitchClass;
  noteName: string;                // Enharmonically spelled note name, e.g., "F#" or "Gb"
  octave: number;
  frequencyHz: number;             // Precomputed for WebAudio playback & v2 pitch detection

  // Layer Membership Flags
  inScaleLayer: boolean;
  scaleDegree?: IntervalDegree;    // Relative to Scale Root
  isScaleRoot: boolean;

  inTargetLayer: boolean;
  targetInterval?: IntervalDegree; // Relative to Target Chord Root (e.g., '1', 'b3', '5')
  isTargetRoot: boolean;
  isActiveTriadVoicing: boolean;   // True if part of the specifically isolated inversion shape

  // Geometric / Filter Metadata
  inCagedStencil: boolean;
  isMaskedOut: boolean;            // True if dimmed by string mask or fret range
  visualPriority: 'HIDDEN' | 'GHOST' | 'CONTEXT_SCALE' | 'TARGET_TONE' | 'TARGET_ROOT';
  displayLabel: string;            // Resolved text to render inside the SVG circle
}

// ============================================================================
// 4. PRACTICE / DRILL ENGINE MODELS
// ============================================================================

export type DrillPhase = 'IDLE' | 'PROMPTING' | 'REVEALING' | 'PAUSED' | 'SUMMARY';

export interface DrillChallenge {
  id: string;
  headlinePrompt: string;          // e.g., "D Minor Triad — 1st Inversion"
  subPrompt: string;               // e.g., "Strings 1-2-3 | Parent Key: A Aeolian (iv)"
  targetPitchClasses: readonly PitchClass[];
  /** Specific (string, fret) coordinates that satisfy the drill */
  validVoicings: ReadonlyArray<ReadonlyArray<FretPosition>>;
  /** The FretboardViewState to apply during the PROMPTING phase (masked/blank) */
  promptBoardState: FretboardViewState;
  /** The FretboardViewState to apply during the REVEALING phase (solution highlighted) */
  revealBoardState: FretboardViewState;
}

export interface DrillConfig {
  exerciseType: 'TRIAD_INVERSION_HUNTER' | 'SCALE_DEGREE_FINDER' | 'CAGED_ARPEGGIO_LINK';
  scaleContext: ScaleLayerConfig;
  stringSets: ReadonlyArray<readonly number[]>; // e.g., [[1, 2, 3], [2, 3, 4]]
  inversions: readonly TriadInversion[];
  fretZone: { min: number; max: number };
  promptDurationMs: number;        // e.g., 8000
  revealDurationMs: number;        // e.g., 4000
  autoAdvance: boolean;
  playDrone: boolean;
  playSolutionAudioOnReveal: boolean;
}
```

---

## 4. Core Algorithms & Theory Rules (`src/core/`)

To keep the coding agent from hallucinating guitar geometry, the following deterministic algorithms must be implemented in `src/core/`:

### 4.1 Enharmonic Note Spelling (`musicTheory.ts`)
* Never use a static `['C', 'C#', 'D', ...]` array for all keys.
* Given a `rootPitchClass` and `scaleId`, resolve whether the key signature uses sharps or flats (or respect `preferFlats`). For example, `F Major` / `D Aeolian` must spell pitch class `10` as `Bb`, whereas `B Major` spells pitch class `10` as `A#`.

### 4.2 Closed-Position Triad Inversion Solver (`triadVoicings.ts`)
Given a 3-string set $(S_a, S_b, S_c)$ ordered from lowest-pitched string to highest-pitched string (e.g., String 3 = G, String 2 = B, String 1 = E) and a Target Triad with pitch classes $(R, T, F)$ (Root, Third, Fifth):
1. Map the required pitch class to each string based on the requested `TriadInversion`:
   * **`ROOT` Position:** Lowest string $S_a = R$, Middle string $S_b = T$, Highest string $S_c = F$
   * **`FIRST` Inversion:** Lowest string $S_a = T$, Middle string $S_b = F$, Highest string $S_c = R$
   * **`SECOND` Inversion:** Lowest string $S_a = F$, Middle string $S_b = R$, Highest string $S_c = T$
2. Scan frets $0 \dots 	ext{fretCount}$ on $S_a, S_b, S_c$ and collect combinations where the fret span $(\max(	ext{fret}) - \min(	ext{fret})) \le 4$.
3. Return each valid 3-node tuple as a playable closed triad voicing.

### 4.3 CAGED Stencil Anchor Calculation (`cagedGeometry.ts`)
Each of the 5 CAGED shapes (`C`, `A`, `G`, `E`, `D`) is defined by a canonical fret-offset window relative to its lowest Root note on either String 6 (`E`, `G` shapes), String 5 (`C`, `A` shapes), or String 4 (`D` shape):
* Given a `referenceRoot` pitch class, locate the anchor fret $f_{	ext{anchor}}$ on the shape's anchor string.
* Compute the active fret window $[f_{	ext{anchor}} + \Delta_{	ext{min}}, f_{	ext{anchor}} + \Delta_{	ext{max}}]$ (wrapping around +12 frets for higher octave occurrences).
* Mark any `ComputedFretNode` falling inside that window as `inCagedStencil = true`.

---

## 5. System Architecture & Extensibility Blueprint

### 5.1 Layered Architecture Diagram

```
+-----------------------------------------------------------------------+
|                        PRESENTATION LAYER (UI)                        |
|  +-----------------------------+   +-------------------------------+  |
|  |   Explore / Layer Controls  |   |   Practice HUD & Prompt Card  |  |
|  +-----------------------------+   +-------------------------------+  |
|  +-----------------------------------------------------------------+  |
|  |         Responsive SVG Fretboard Canvas (Desktop / Mobile)      |  |
|  +-----------------------------------------------------------------+  |
+-----------------------------------+-----------------------------------+
                                    | Reads State / Dispatches Intents
                                    v
+-----------------------------------------------------------------------+
|                    APPLICATION / STATE LAYER (Store)                  |
|  +-----------------------------+   +-------------------------------+  |
|  |  VisualizerStore (URL Sync) |   |  DrillSessionMachine (Timer)  |  |
|  +-----------------------------+   +-------------------------------+  |
|  +-----------------------------------------------------------------+  |
|  |            PracticeEventBus (Pub/Sub Input Abstraction)         |  |
|  +-----------------------------------------------------------------+  |
+-----------------+-----------------------------------+-----------------+
                  | Pure Calls                        | Audio / I/O Ports
                  v                                   v
+---------------------------------+ +-----------------------------------+
|      PURE DOMAIN CORE (TS)      | |    INFRASTRUCTURE / ADAPTERS      |
|  - musicTheory.ts               | |  - WebAudioSynthAdapter (v1)      |
|  - fretboardProjector.ts        | |    (Drone Pad, Triad Playback)    |
|  - triadVoicings.ts             | |  - WakeLockAdapter (v1)           |
|  - cagedGeometry.ts             | |  - PitchDetectorAdapter (v2 Stub) |
|  - drillGenerator.ts            | |    (AudioWorklet / YIN / MPM)     |
+---------------------------------+ +-----------------------------------+
```

### 5.2 Recommended Tech Stack for Coding Agent Execution
* **Build & Framework:** **Vite + React 19 + TypeScript** (strict mode enabled).
* **State Management:** **Zustand** (lightweight, supports transient updates for high-frequency audio/timer ticks, and trivial middleware for URL query-string synchronization).
* **Exhaustive State Logic:** **`ts-pattern`** for clean, compile-time exhaustive matching across `NodeLabelMode`, `DrillPhase`, and `VisualPriority`.
* **Styling:** **Tailwind CSS** + **SVG** (Fretboard rendered as a single declarative `<svg viewBox="...">` component—zero Canvas/WebGL overhead, crisp scaling on mobile and 4K displays, easy CSS transitions on node opacity).
* **Testing:** **Vitest** for unit-testing `src/core/` (music theory, triad inversion coordinates, and CAGED stencil windows are 100% deterministic and fast to test).

### 5.3 Future-Proofing: The `InputAdapter` Seam for v2.0 Audio Recognition
To ensure adding electric guitar audio-interface recognition in v2.0 requires **zero changes** to the drill engine or UI components, `DrillSessionMachine` listens to a unified `PracticeInputEvent` stream:

```typescript
export type PracticeInputEvent =
  | { type: 'TIMER_EXPIRED' }
  | { type: 'USER_MANUAL_REVEAL' }
  | { type: 'USER_SELF_GRADE'; passed: boolean }
  // v2.0 Audio Interface / MIDI Events:
  | { type: 'PITCH_DETECTED'; midiNote: MidiNote; frequencyHz: number; clarity: number }
  | { type: 'VOICING_MATCHED'; positions: readonly FretPosition[] };

export interface PracticeInputAdapter {
  id: string;
  start(): Promise<void>;
  stop(): void;
  onEvent(callback: (event: PracticeInputEvent) => void): () => void;
}
```
* **In v1.0:** `TimerAndKeyboardAdapter` implements `PracticeInputAdapter`, emitting `TIMER_EXPIRED` and `USER_MANUAL_REVEAL`.
* **In v2.0:** `WebAudioGuitarInputAdapter` implements the exact same `PracticeInputAdapter` interface. It opens the `MediaStream` (with `echoCancellation: false`, `noiseSuppression: false`, `autoGainControl: false`), runs pitch detection (e.g., via `pitchy` / MPM), compares detected MIDI notes against `DrillChallenge.validVoicings`, and emits `VOICING_MATCHED` to immediately trigger the reveal/success transition.

---

## 6. Recommended Project Directory Structure

```text
freternity/
├── src/
│   ├── core/                        # PURE TYPESCRIPT — Zero React/DOM imports
│   │   ├── models.ts                # Core interfaces & types (Section 3)
│   │   ├── constants.ts             # Scale/Chord dictionaries, standard tunings
│   │   ├── musicTheory.ts           # PitchClass math, intervals, enharmonic spelling
│   │   ├── triadVoicings.ts         # Closed-position triad & inversion solver
│   │   ├── cagedGeometry.ts         # CAGED bounding boxes & anchor resolvers
│   │   ├── fretboardProjector.ts    # (FretboardViewState) => ComputedFretNode[][]
│   │   └── drills/
│   │       ├── triadInversionGenerator.ts
│   │       └── drillEngine.ts       # Pure state transitions for DrillPhase
│   ├── adapters/                    # Side-effectful browser APIs
│   │   ├── audioSynth.ts            # Web Audio API root drone & triad arpeggiator
│   │   ├── wakeLock.ts              # navigator.wakeLock wrapper for mobile practice
│   │   ├── urlStateSync.ts          # Serialize/deserialize FretboardViewState to URL
│   │   └── pitchInputStub.ts        # v2.0 PracticeInputAdapter interface & stub
│   ├── store/
│   │   ├── useFretboardStore.ts     # Zustand store for Explore/Visualizer state
│   │   └── usePracticeStore.ts      # Zustand store for Practice Mode & timer loop
│   ├── components/
│   │   ├── fretboard/
│   │   │   ├── FretboardSvg.tsx     # Responsive SVG neck, frets, inlays, string masks
│   │   │   ├── FretNode.tsx         # Individual note circle, ring, and dynamic label
│   │   │   └── CagedOverlaySvg.tsx  # Translucent geometric bounding stencil
│   │   ├── controls/
│   │   │   ├── LayerControlPanel.tsx
│   │   │   ├── ModalPivotSlider.tsx # Diatonic 7-note relative mode switcher
│   │   │   ├── StringMaskToggle.tsx # Quick 1-2-3 / 2-3-4 / individual string toggles
│   │   │   └── LensSwitcher.tsx     # Note / Degree / Interval / Blind toggle
│   │   └── practice/
│   │       ├── PracticeHud.tsx      # Prompt banner, countdown bar, transport controls
│   │       └── DrillConfigModal.tsx
│   └── App.tsx
└── tests/
    └── core/                        # Vitest unit suites for theory & triad solver
```

---

## 7. Implementation Milestones for the Coding Agent

When handing this document to your coding agent, instruct it to execute in four discrete, verifiable steps:

1. **Milestone 1: Domain Core & Unit Tests (`src/core/`)**
   * Implement `models.ts`, `constants.ts`, `musicTheory.ts`, `triadVoicings.ts`, `cagedGeometry.ts`, and `fretboardProjector.ts`.
   * Write Vitest unit tests verifying that `projectFretboard()` accurately computes `A Aeolian` with an `F Major` triad overlay (`1st Inversion` on strings `1-2-3`) and that relative mode shifting preserves physical fret coordinates while rotating interval degrees.
2. **Milestone 2: Responsive Layered SVG Fretboard (`src/components/fretboard/`)**
   * Build `FretboardSvg.tsx` consuming `ComputedFretNode[][]`.
   * Support visual hierarchy (`TARGET_ROOT` > `TARGET_TONE` > `CONTEXT_SCALE` > `GHOST`), string dimming (`opacity: 0.15` on masked strings), and the CAGED translucent stencil.
   * Implement mobile-friendly viewport zooming (ability to lock the SVG `viewBox` to a 5–7 fret window on narrow screens).
3. **Milestone 3: Interactive Explore Controls & URL Sync (`src/components/controls/`)**
   * Wire up the `ModalPivotSlider`, `LayerControlPanel` (Base Scale + Target Chord selector), `StringMaskToggle`, and `LensSwitcher` with keyboard shortcuts.
   * Synchronize `FretboardViewState` to URL query parameters.
4. **Milestone 4: Practice Mode Engine & Web Audio Drone (`src/components/practice/` & `src/adapters/`)**
   * Implement the `TRIAD_INVERSION_HUNTER` generator and timed `PROMPTING -> REVEALING` state machine.
   * Add the Web Audio API synthesized Root Drone pad and optional triad verification playback on reveal, plus `navigator.wakeLock` so mobile screens stay awake during hands-free practice.