import { DrillChallenge, DrillConfig, InstrumentConfig } from '../models';
import { GUITAR_6_STANDARD } from '../constants';
import { generateTriadInversionChallenge } from './triadInversionGenerator';
import { generateCagedChordShapeChallenge } from './cagedChordShapeGenerator';
import { generateScaleRhythmChallenge } from './scaleRhythmGenerator';

/**
 * Re-rolls this often before giving up on avoiding a repeat. Only matters when the settings
 * allow a single question (then a repeat is unavoidable); with two or more possible questions
 * the chance of still repeating is negligible.
 */
const MAX_REPEAT_REROLLS = 50;

function generateOnce(config: DrillConfig, instrument: InstrumentConfig): DrillChallenge {
  switch (config.exerciseType) {
    case 'CAGED_CHORD_SHAPE':
      return generateCagedChordShapeChallenge(config, instrument);
    case 'SCALE_RHYTHM':
      return generateScaleRhythmChallenge(config, instrument);
    default:
      return generateTriadInversionChallenge(config, instrument);
  }
}

/**
 * Picks the generator for the configured drill. Never asks the same question as
 * `previous` twice in a row, unless the settings leave no other question to ask.
 */
export function generateChallenge(
  config: DrillConfig,
  instrument: InstrumentConfig = GUITAR_6_STANDARD,
  previous?: Pick<DrillChallenge, 'questionKey'> | null
): DrillChallenge {
  let challenge = generateOnce(config, instrument);
  for (
    let attempt = 0;
    previous && challenge.questionKey === previous.questionKey && attempt < MAX_REPEAT_REROLLS;
    attempt++
  ) {
    challenge = generateOnce(config, instrument);
  }
  return challenge;
}
