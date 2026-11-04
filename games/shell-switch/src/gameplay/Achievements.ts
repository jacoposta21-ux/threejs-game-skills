export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  hidden: boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_ride', name: 'First Ride', desc: 'Possess your first host.', hidden: false },
  { id: 'wardrobe', name: 'Full Wardrobe', desc: 'Possess every host in Fizzwick.', hidden: false },
  { id: 'bits_all', name: 'Twinkle Hoarder', desc: 'Collect every Star Bit.', hidden: false },
  { id: 'postcards_all', name: 'Postmaster General', desc: 'Find every hidden postcard.', hidden: false },
  { id: 'homeward', name: 'Homeward Bound', desc: 'Repair the saucer.', hidden: false },
  { id: 'busted', name: 'Busted!', desc: 'Get caught by a guard.', hidden: true },
  { id: 'panic', name: 'Mass Hysteria', desc: 'Send five townsfolk screaming at once.', hidden: true },
  { id: 'shock', name: 'Shock Therapy', desc: 'Zap an innocent bystander.', hidden: true },
  { id: 'boo10', name: 'Professional Haunter', desc: 'Scare ten people as the ghost.', hidden: true },
  { id: 'encore', name: 'Encore!', desc: 'Draw six watchers to one clown show.', hidden: true },
  { id: 'sticky', name: 'Sticky Fingers', desc: 'Pick five pockets.', hidden: true },
  { id: 'heavy', name: 'Heavy Lifting', desc: 'Throw ten heavy things.', hidden: true },
  { id: 'cannon_brick', name: 'Human Cannonball (XL)', desc: 'Fire Brick out of the circus cannon.', hidden: true },
  { id: 'fashion', name: 'Fashion Police', desc: 'Blow the whistle at the Mayor.', hidden: true },
  { id: 'striker', name: 'Ding Ding Ding', desc: 'Ring the high striker bell.', hidden: true },
  { id: 'miss', name: 'Haystack Landing', desc: 'Fire the cannon at the wrong target.', hidden: true },
];
