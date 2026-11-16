/**
 * Miracle catalogue (data shared by HUD, pause menu and MiracleManager).
 */
/**
 * Where each gift is revealed: discovering the landmark unlocks the miracle.
 */
export const MIRACLE_REVEALS = {
  'landmark.workshop': 'miracle.divine-push',
  'landmark.market': 'miracle.multiplication',
  'landmark.town-well': 'miracle.water-to-wine',
  'landmark.synagogue': 'miracle.healing-touch',
  'landmark.lookout': 'miracle.holy-levitation',
  'landmark.galilee-shore': 'miracle.walk-on-water',
};

export const MIRACLES = [
  { id: 'miracle.divine-push', key: 1, name: 'Divine Push', cooldown: 1.4, revealAt: 'Joseph & Son Carpentry',
    description: 'A wave of holy force that sends people, soldiers and props tumbling (gently).' },
  { id: 'miracle.multiplication', key: 2, name: 'Multiplication', cooldown: 0.3, revealAt: 'Nazareth Market',
    description: 'Aim at bread or fish and make more. Then more. Then far too many.' },
  { id: 'miracle.water-to-wine', key: 3, name: 'Water to Wine', cooldown: 3, revealAt: 'The Town Well',
    description: 'Turn jars, troughs and wells into wine. The village will notice.' },
  { id: 'miracle.walk-on-water', key: 4, name: 'Walk on Water', cooldown: 6, revealAt: 'Shore of Galilee',
    description: 'Stroll across the lake. Roman soldiers, regrettably, cannot follow.' },
  { id: 'miracle.healing-touch', key: 5, name: 'Healing Touch', cooldown: 2.5, revealAt: 'The Synagogue',
    description: 'Heal the injured with golden light. Grateful people may follow you.' },
  { id: 'miracle.holy-levitation', key: 6, name: 'Holy Levitation', cooldown: 4, revealAt: 'Rooftop Lookout',
    description: 'Lift an object — or a very surprised soldier — into the air.' },
];
