import { DIALOGUES, resolveText } from '../npc/dialogue.js';

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

/**
 * Runs a conversation with one NPC: renders nodes through the UI, applies
 * option effects and emits npc:interact / dialogue:* events.
 */
export class DialogueController {
  constructor({ bus, ui, rng, getContext }) {
    this.bus = bus;
    this.ui = ui;
    this.rng = rng;
    this.getContext = getContext;
    this.npc = null;
    this.node = null;
    this.options = [];
  }

  get active() {
    return !!this.npc;
  }

  open(npc) {
    const tree = DIALOGUES[npc.def.dialogue] || DIALOGUES.villager;
    this.npc = npc;
    this.tree = tree;
    this.bus.emit('npc:interact', { entityId: 'player.local', targetId: npc.id });
    this.show('root');
  }

  context() {
    const base = this.getContext();
    const ctx = { ...base, npc: this.npc, rng: this.rng };
    if (base.next) {
      const l = base.next.landmark;
      const ang = Math.atan2(l.x - this.npc.pos.x, -(l.z - this.npc.pos.z)); // 0 = north (-z)
      const idx = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
      ctx.hint = { name: l.name, distance: Math.hypot(l.x - this.npc.pos.x, l.z - this.npc.pos.z), direction: `Head ${COMPASS[idx]}` };
    }
    return ctx;
  }

  show(id) {
    const node = this.tree[id];
    if (!node) return this.close();
    this.node = node;
    const ctx = this.context();
    const text = resolveText(ctx, node.text);
    this.options = (node.options || []).filter((o) => !o.if || o.if(ctx));
    this.ui.showConversation({ name: this.npc.name, role: this.npc.role, text, options: this.options.map((o) => o.label) });
    this.npc.speaking = true;
    this.speakTimer = Math.min(3.5, 0.6 + text.length * 0.035);
    this.bus.emit('npc:bark', { entityId: this.npc.id, voice: this.npc.def.voice || 1, x: this.npc.pos.x, z: this.npc.pos.z, length: text.length, dialogue: true });
  }

  choose(index) {
    const opt = this.options[index];
    if (!opt) return;
    this.bus.emit('dialogue:choice', { entityId: 'player.local', targetId: this.npc.id, label: opt.label });
    if (opt.effect) this.bus.emit('dialogue:effect', { npcId: this.npc.id, ...opt.effect });
    if (opt.end) this.close();
    else this.show(opt.next);
  }

  /** E / Space: pick the only option, or close if there are none. */
  advance() {
    if (this.options.length === 1) this.choose(0);
    else if (this.options.length === 0) this.close();
  }

  tick(dt) {
    if (!this.npc) return;
    this.speakTimer -= dt;
    if (this.speakTimer <= 0) this.npc.speaking = false;
  }

  close() {
    const npc = this.npc;
    this.npc = null;
    this.node = null;
    this.options = [];
    this.ui.hideConversation();
    if (npc) this.bus.emit('dialogue:end', { entityId: 'player.local', targetId: npc.id, npc });
  }
}
