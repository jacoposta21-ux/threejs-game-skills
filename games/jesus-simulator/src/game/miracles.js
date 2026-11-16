/**
 * Miracle catalogue. Phase 1 ships the data and the HUD slots; the gameplay
 * implementations arrive with the MiracleManager in Phase 3, so every entry
 * is `revealed: false` and the HUD shows it as locked.
 */
export const MIRACLES = [
  { id: 'miracle.divine-push', key: 1, name: 'Divine Push', cooldown: 1.2,
    description: 'A wave of holy force that sends people, soldiers and props tumbling (gently).' },
  { id: 'miracle.multiplication', key: 2, name: 'Multiplication', cooldown: 0.35,
    description: 'Aim at bread or fish and make more. Then more. Then far too many.' },
  { id: 'miracle.water-to-wine', key: 3, name: 'Water to Wine', cooldown: 4,
    description: 'Turn jars, troughs and wells into wine. The village will notice.' },
  { id: 'miracle.walk-on-water', key: 4, name: 'Walk on Water', cooldown: 2,
    description: 'Stroll across the lake. Roman soldiers, regrettably, cannot follow.' },
  { id: 'miracle.healing-touch', key: 5, name: 'Healing Touch', cooldown: 3,
    description: 'Heal the injured with golden light. Grateful people may follow you.' },
  { id: 'miracle.holy-levitation', key: 6, name: 'Holy Levitation', cooldown: 5,
    description: 'Lift an object — or a very surprised soldier — into the air.' },
];
