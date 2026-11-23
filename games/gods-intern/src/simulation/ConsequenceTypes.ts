import type { GameEventName, GameEvents, NotifyKind } from '../core/EventBus';
import type { Simulation } from './SimulationManager';

export type ConsequenceTrigger = GameEventName | 'TICK';
type PayloadOf<K extends ConsequenceTrigger> = K extends GameEventName ? GameEvents[K] : null;

/**
 * A data-driven consequence: when its trigger fires and its condition holds
 * against real simulation state, it rolls its probability, applies effects,
 * and optionally speaks through a notification or a message from God.
 */
export interface ConsequenceRule<K extends ConsequenceTrigger = ConsequenceTrigger> {
  id: string;
  title: string;
  trigger: K;
  cooldown: number;
  probability?: number;
  condition: (sim: Simulation, payload: PayloadOf<K>) => boolean;
  effects?: (sim: Simulation, payload: PayloadOf<K>) => void;
  notify?: { text: string; kind: NotifyKind; sub?: string };
  god?: { text: string; priority?: number };
}

export function rule<K extends ConsequenceTrigger>(r: ConsequenceRule<K>): ConsequenceRule {
  return r as unknown as ConsequenceRule;
}

