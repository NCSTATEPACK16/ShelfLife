#!/usr/bin/env node
/**
 * Gentle-surface tell check (PLAN.md §12.1, docs/design/gentle-surface.md §0).
 *
 * "Every term in the satisfaction formula (§5.3) and the impulse formula (§5.4) has a
 * declared visual tell. A term without a tell fails content validation in CI." This
 * check reads content/design/gentle-surface.json5 and fails if any required term is
 * missing, or present but incomplete.
 */

import { readFileSync } from 'node:fs';
import JSON5 from 'json5';

const REQUIRED_SATISFACTION_TERMS = [
  'fillRateMiss',
  'priceSurpriseNegative',
  'priceSurprisePositive',
  'queuePenaltyRising',
  'queuePenaltyBalk',
  'spoiledEncounters',
  'cleanlinessLow',
  'staffInteractionGood',
  'staffInteractionAbsent',
  'discovery',
];

const REQUIRED_IMPULSE_TERMS = ['impulsePurchase', 'visibility', 'adjacencyBonus', 'promoLift', 'needState'];

const FILE = 'content/design/gentle-surface.json5';

function validateTell(term, tell, problems) {
  const label = `${FILE}: "${term}"`;
  if (!tell) {
    problems.push(`${label} is missing entirely — every satisfaction/impulse term needs a tell.`);
    return;
  }
  for (const field of ['bubble', 'animation', 'particle']) {
    if (!(field in tell)) {
      problems.push(`${label} is missing "${field}" (string or null required).`);
    }
  }
  if (typeof tell.worldMark !== 'boolean') {
    problems.push(`${label} "worldMark" must be a boolean.`);
  }
  if (typeof tell.threshold !== 'number') {
    problems.push(`${label} "threshold" must be a number.`);
  }
  if (tell.bubble === null && tell.animation === null && tell.particle === null && !tell.worldMark) {
    problems.push(`${label} has no bubble, animation, particle, or world mark — the term is invisible.`);
  }
}

const raw = readFileSync(FILE, 'utf8');
const doc = JSON5.parse(raw);
const problems = [];

const bySatisfactionTerm = new Map((doc.satisfaction ?? []).map((t) => [t.term, t]));
for (const term of REQUIRED_SATISFACTION_TERMS) {
  validateTell(term, bySatisfactionTerm.get(term), problems);
}

const byImpulseTerm = new Map((doc.impulse ?? []).map((t) => [t.term, t]));
for (const term of REQUIRED_IMPULSE_TERMS) {
  validateTell(term, byImpulseTerm.get(term), problems);
}

if (problems.length > 0) {
  console.error(`\nGentle-surface check failed — ${problems.length} problem(s):\n`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

console.log(
  `Gentle surface consistent. ${REQUIRED_SATISFACTION_TERMS.length} satisfaction terms, ` +
    `${REQUIRED_IMPULSE_TERMS.length} impulse terms, all with declared tells.`,
);
