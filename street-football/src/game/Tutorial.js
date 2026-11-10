import * as THREE from 'three';
import { BALL } from '../config.js';

/**
 * Playable tutorial: a real match with the clock stopped, walking the player
 * through each verb in order. Every step completes on the actual gameplay
 * event (not a timer), so the player has done the thing before moving on.
 */
const STEPS = [
  {
    id: 'move',
    title: 'MOVE',
    key: 'WASD',
    touchKey: 'STICK',
    text: 'Move with W A S D (or the arrow keys). Run around a bit.',
    touchText: 'Move with the stick on the left.',
    setup: (t) => t.freezeAway(true),
    check: (t) => t.moved > 8,
  },
  {
    id: 'dribble',
    title: 'DRIBBLE & SPRINT',
    key: 'SHIFT',
    touchKey: 'SPRINT',
    text: 'Get the ball. Each touch is a kick — keep running onto it. Hold SHIFT to sprint with it for two seconds.',
    touchText: 'Get the ball and hold SPRINT while you run with it.',
    setup: (t) => t.ballToHuman(),
    check: (t) => t.sprintWithBall > 2,
  },
  {
    id: 'pass',
    title: 'PASS',
    key: 'K',
    touchKey: 'PASS',
    text: 'Press K to pass to a teammate in the direction you are moving. Hold K for a lob.',
    touchText: 'Tap PASS to find a teammate. Hold it for a lob.',
    setup: (t) => t.ballToHuman(),
    check: (t) => t.passesReceived > 0,
  },
  {
    id: 'skill',
    title: 'SKILL MOVE',
    key: 'L',
    touchKey: 'SKILL',
    text: 'Press L for a skill. Add a direction for different moves: sideways a body feint, backwards a roulette.',
    touchText: 'Tap SKILL; push the stick for different moves.',
    setup: (t) => t.ballToHuman(),
    check: (t) => t.tricks.has('basic'),
  },
  {
    id: 'flair',
    title: 'FLAIR MOVE',
    key: 'I',
    touchKey: 'FLAIR',
    text: 'Press I for flair: an elastico. I + forward flicks a sombrero over a defender, I + back drags the ball back.',
    touchText: 'Tap FLAIR for an elastico; push the stick forward or back for more.',
    setup: (t) => t.ballToHuman(),
    check: (t) => t.tricks.has('flair'),
  },
  {
    id: 'shoot',
    title: 'SHOOT AND SCORE',
    key: 'J',
    touchKey: 'SHOOT',
    text: 'Run at the goal on the right. Hold J to power up, release to shoot. W / S while shooting aims for a post. Score!',
    touchText: 'Run at goal, hold SHOOT to power up and release. Score!',
    setup: (t) => t.ballToHuman(-8),
    check: (t) => t.homeGoals > 0,
  },
  {
    id: 'defend',
    title: 'WIN IT BACK',
    key: 'U',
    touchKey: 'TACKLE',
    text: 'They have the ball. Get goal-side and press U to tackle (SHIFT + U slides). O switches to the teammate nearest the ball.',
    touchText: 'They have the ball. Get close and tap TACKLE. SWITCH changes player.',
    setup: (t) => {
      t.freezeAway(false);
      t.ballToAway();
    },
    check: (t) => t.wonBack,
  },
  {
    id: 'gamebreaker',
    title: 'GAMEBREAKER',
    key: 'H',
    touchKey: 'GB',
    text: 'Style fills the Gamebreaker meter (bottom left). It is full now — press H to fire it, then go and score.',
    touchText: 'The Gamebreaker meter is full — tap GB to fire it.',
    setup: (t) => {
      t.freezeAway(true);
      t.ballToHuman();
      t.game.gb.meter = 1;
    },
    check: (t) => t.game.gb.active > 0,
  },
];

export class Tutorial {
  constructor(game) {
    this.game = game;
    this.el = {
      box: document.getElementById('tutorial-box'),
      step: document.getElementById('tut-step'),
      title: document.getElementById('tut-title'),
      key: document.getElementById('tut-key'),
      text: document.getElementById('tut-text'),
    };
    this.index = -1;
    this.awayFrozen = false;
    this.offs = [];
    const ev = game.events;
    const human = () => game.human?.p;
    this.offs.push(
      ev.on('kick', ({ type, player }) => {
        if (type === 'pass' && player === human()) this.passing = true;
      }),
      ev.on('control', ({ player }) => {
        if (this.passing && player.team === 'home' && player !== this.passFrom) this.passesReceived += 1;
        this.passing = false;
        if (player.team === 'home' && this.lastOwnerTeam === 'away') this.wonBack = true;
        this.lastOwnerTeam = player.team;
      }),
      ev.on('trick', ({ kind, outcome, player, byHuman }) => {
        if (!byHuman || outcome !== 'success' || player.team !== 'home') return;
        this.tricks.add(['elastico', 'sombrero', 'dragback'].includes(kind) ? 'flair' : 'basic');
      }),
      ev.on('goal', ({ team }) => {
        if (team === 'home') this.homeGoals += 1;
      }),
      ev.on('tackle', ({ tackler, success, victim }) => {
        if (success && victim && tackler.team === 'home') this.wonBack = true;
      }),
    );
    this.el.box.classList.remove('hidden');
    this.next();
  }

  resetCounters() {
    this.moved = 0;
    this.sprintWithBall = 0;
    this.passesReceived = 0;
    this.passing = false;
    this.passFrom = this.game.human?.p ?? null;
    this.tricks = new Set();
    this.homeGoals = 0;
    this.wonBack = false;
    this.lastOwnerTeam = this.game.match.owner?.team ?? null;
    this.lastPos = this.game.human?.p.position.clone() ?? new THREE.Vector3();
  }

  next() {
    this.index += 1;
    const step = STEPS[this.index];
    if (!step) {
      this.finish();
      return;
    }
    this.resetCounters();
    step.setup?.(this);
    this.done = 0;
    const touch = this.game.touchUi;
    this.el.step.textContent = `TUTORIAL ${this.index + 1} / ${STEPS.length}`;
    this.el.title.textContent = step.title;
    this.el.key.textContent = touch ? step.touchKey : step.key;
    this.el.text.textContent = touch ? step.touchText : step.text;
    this.el.box.classList.remove('done');
    this.game.retrigger('tutorial-box', 'pop');
  }

  freezeAway(on) {
    this.awayFrozen = on;
  }

  /** Put the ball at the human's feet (optionally move them to x first). */
  ballToHuman(x = null) {
    const g = this.game;
    const hk = g.human;
    if (!hk) return;
    if (x != null) hk.p.teleport(x, 0, -Math.PI / 2);
    const f = hk.p.facing(new THREE.Vector3());
    g.ball.placeAt(hk.p.position.x + f.x * 0.5, BALL.radius, hk.p.position.z + f.z * 0.5);
  }

  ballToAway() {
    const g = this.game;
    const c = g.match.teams.away.players[0];
    if (!c) return;
    const f = c.p.facing(new THREE.Vector3());
    g.ball.placeAt(c.p.position.x + f.x * 0.5, BALL.radius, c.p.position.z + f.z * 0.5);
    this.lastOwnerTeam = 'away';
  }

  /** Per fixed step while the match plays. */
  fixed(dt) {
    const g = this.game;
    g.timeLeft = Infinity;
    const hk = g.human;
    if (hk) {
      this.moved += hk.p.position.distanceTo(this.lastPos);
      this.lastPos.copy(hk.p.position);
      if (hk.possession && hk.sprinting) this.sprintWithBall += dt;
    }
    if (this.awayFrozen) {
      for (const c of g.match.teams.away.players) {
        c.tackleCooldown = 1;
        c.aiIntents = null;
      }
    }
    const step = STEPS[this.index];
    if (!step) return;
    if (this.done > 0) {
      this.done -= dt;
      if (this.done <= 0) this.next();
      return;
    }
    if (step.check(this)) {
      // A short beat on the tick before the next step.
      this.done = 1.1;
      this.el.box.classList.add('done');
      g.audio.play('combo', { group: 'ui', volume: 0.5, rate: 1.2, variance: 0 });
    }
  }

  finish() {
    const g = this.game;
    this.el.box.classList.add('hidden');
    g.progress.update((d) => {
      d.tutorialDone = true;
    });
    g.hud.banner('TUTORIAL COMPLETE', 'Pick a mode and play', { seconds: 2.5 });
    g.audio.play('cheer', { group: 'crowd', volume: 0.7 });
    this.finishedAt = g.time;
  }

  /** Back to the menu a moment after the last step. */
  update() {
    if (this.finishedAt != null && this.game.time - this.finishedAt > 3) {
      this.finishedAt = null;
      this.game.quitToMenu();
    }
  }

  stop() {
    for (const off of this.offs) off();
    this.offs = [];
    this.el.box.classList.add('hidden');
  }
}
