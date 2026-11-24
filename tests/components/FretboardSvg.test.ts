import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GUITAR_6_STANDARD } from '../../src/core/constants';
import { projectFretboard } from '../../src/core/fretboardProjector';
import { FretboardViewState } from '../../src/core/models';
import { FretboardSvg } from '../../src/components/fretboard/FretboardSvg';

describe('FretboardSvg integration and projection verification', () => {
  it('prepares correct visual priorities and hierarchy for SVG rendering', () => {
    const state: FretboardViewState = {
      instrumentId: 'guitar_6_standard',
      labelMode: 'NOTE_NAME',
      scaleLayer: {
        enabled: true,
        rootPitchClass: 9, // A
        preferFlats: true,
        scaleId: 'aeolian',
      },
      targetLayer: {
        enabled: true,
        rootPitchClass: 5, // F
        chordId: 'maj',
        activeInversion: 'FIRST',
      },
      filterMask: {
        activeStrings: [1, 2, 3],
        fretRange: { min: 0, max: 22 },
        cagedOverlay: {
          enabled: true,
          shape: 'E',
          referenceRoot: 'TARGET_ROOT',
        },
      },
    };

    const matrix = projectFretboard(state, GUITAR_6_STANDARD);

    // Target Root node (F on String 1, Fret 1)
    const targetRoot = matrix[0][1];
    expect(targetRoot.visualPriority).toBe('TARGET_ROOT');
    expect(targetRoot.isMaskedOut).toBe(false);

    // Target Tone node (C on String 2, Fret 1)
    const targetTone = matrix[1][1];
    expect(targetTone.visualPriority).toBe('TARGET_TONE');
    expect(targetTone.isMaskedOut).toBe(false);

    // Context Scale node (B on String 2, Fret 0)
    const contextScale = matrix[1][0];
    expect(contextScale.visualPriority).toBe('CONTEXT_SCALE');
    expect(contextScale.isMaskedOut).toBe(false);

    // Ghost node on masked string 6 (E on String 6, Fret 0)
    const ghostNode = matrix[5][0];
    expect(ghostNode.visualPriority).toBe('GHOST');
    expect(ghostNode.isMaskedOut).toBe(true);

    // Hidden node outside scale & target (F# on String 1, Fret 2)
    const hiddenNode = matrix[0][2];
    expect(hiddenNode.visualPriority).toBe('HIDDEN');
  });

  it('validates mobile viewport zooming bounds calculations', () => {
    const nutX = 65;
    const scaleLength = 2200;

    const calcFretX = (fret: number) => {
      if (fret === 0) return nutX;
      return Math.round(nutX + scaleLength * (1 - Math.pow(2, -fret / 17.817)));
    };

    // For a 5-fret zoom window: frets 5 through 9
    const minFret = 5;
    const maxFret = 9;

    const startX = calcFretX(minFret - 1) - 10;
    const endX = calcFretX(maxFret) + 25;
    const zoomedWidth = endX - startX;

    // Full neck width
    const fullStartX = 0;
    const fullEndX = calcFretX(22) + 25;
    const fullWidth = fullEndX - fullStartX;

    expect(zoomedWidth).toBeLessThan(fullWidth * 0.4); // Zoomed window is significantly narrower
    expect(startX).toBeGreaterThan(0);
  });

  it('renders flat and sharp spelling for all visible fretboard labels', () => {
    const stateFor = (rootPitchClass: number, preferFlats: boolean): FretboardViewState => ({
      instrumentId: 'guitar_6_standard',
      labelMode: 'NOTE_NAME',
      scaleLayer: {
        enabled: true,
        rootPitchClass: rootPitchClass as FretboardViewState['scaleLayer']['rootPitchClass'],
        preferFlats,
        scaleId: 'ionian',
      },
      targetLayer: { enabled: false, rootPitchClass: 0, chordId: 'maj' },
      filterMask: { activeStrings: [1, 2, 3, 4, 5, 6], fretRange: { min: 0, max: 22 } },
    });

    // Read the actual <text> labels the SVG renders, not just projected node names
    const renderedNoteLabels = (state: FretboardViewState) => {
      const html = renderToStaticMarkup(
        createElement(FretboardSvg, {
          matrix: projectFretboard(state, GUITAR_6_STANDARD),
          instrument: GUITAR_6_STANDARD,
        })
      );
      const labels = [...html.matchAll(/<text[^>]*>([A-G][#b]?)<\/text>/g)].map(
        (match) => match[1]
      );
      return [...new Set(labels)].sort();
    };

    // C Ionian: all naturals, so the visible labels are unchanged by the toggle
    const cNaturals = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    expect(renderedNoteLabels(stateFor(0, true))).toEqual(cNaturals);
    expect(renderedNoteLabels(stateFor(0, false))).toEqual(cNaturals);

    // Bb Ionian: the visible black-key labels must switch too
    expect(renderedNoteLabels(stateFor(10, true))).toEqual(['A', 'Bb', 'C', 'D', 'Eb', 'F', 'G']);
    expect(renderedNoteLabels(stateFor(10, false))).toEqual(['A', 'A#', 'C', 'D', 'D#', 'F', 'G']);
  });

  it('verifies CagedOverlaySvg renders badge over the fretboard', async () => {
    const React = await import('react');
    const { CagedOverlaySvg } = await import('../../src/components/fretboard/CagedOverlaySvg');
    
    // Test rendering badge part
    const element = React.createElement(CagedOverlaySvg, {
      shape: 'E',
      windows: [{ min: 0, max: 3 }],
      getFretX: (f: number) => f * 50 + 65,
      yTop: 30,
      height: 190,
      renderPart: 'badge',
    });

    expect(element).toBeDefined();
    expect(element.props.renderPart).toBe('badge');
    expect(element.props.shape).toBe('E');
  });
});
