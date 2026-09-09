import type { RivalSignatureId } from '../../market/types.js';
import type { RivalSignature } from '../types.js';
import { membershipLockIn } from './membership-lock-in.js';
import { neverCloses } from './never-closes.js';
import { oneRegister } from './one-register.js';

const REGISTRY: Readonly<Record<RivalSignatureId, RivalSignature>> = Object.freeze({
  oneRegister,
  neverCloses,
  membershipLockIn,
});

export function signatureFor(id: RivalSignatureId): RivalSignature {
  const sig = REGISTRY[id];
  if (!sig) throw new Error(`Unknown rival signature id: ${id}`);
  return sig;
}
