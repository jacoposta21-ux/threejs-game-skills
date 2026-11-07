import Peer, { type DataConnection, type PeerOptions } from 'peerjs';
import type { GameManager } from '../game/GameManager';
import { createSeededRandom } from '../core/random';
import type { RaceMarble } from '../marbles/MarbleManager';
import { getSkin, SKINS } from '../marbles/MarbleSkins';
import { BUILTIN_TRACKS } from '../modes/builtinTracks';
import type { RaceResult } from '../race/RaceManager';
import { sanitizeTrack } from '../track/Track';
import type { TrackData } from '../track/types';

/**
 * Private online rooms over WebRTC (PeerJS). No game server: the host's
 * browser runs the authoritative race and streams compact snapshots; guests
 * simulate locally for smooth motion and snap to the host state.
 *
 * Signalling uses the free public PeerJS broker by default. Override with
 * ?peerhost=…&peerport=…&peerpath=…&peersecure=0 (used by the local tests).
 */

export interface NetPlayer {
  id: string;
  name: string;
  skin: string;
  score: number;
  host: boolean;
  wins: number;
}

export interface RoomSettings {
  track: string;
  count: number;
}

type Msg =
  | { t: 'hello'; name: string; skin: string; v: number }
  | { t: 'skin'; skin: string }
  | { t: 'lobby'; players: NetPlayer[]; settings: RoomSettings; round: number; racing: boolean }
  | { t: 'start'; track: TrackData; marbles: RaceMarble[]; seed: number; owners: Record<string, number>; round: number }
  | { t: 'snap'; s: { t: number; m: number[] } }
  | { t: 'done'; result: RaceResult; players: NetPlayer[] }
  | { t: 'closed'; reason: string }
  | { t: 'full' };

const PROTOCOL = 1;
const PREFIX = 'pickamarble-v1-';
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const MAX_PLAYERS = 12;
const POINTS = [10, 7, 5, 3, 2];

export type OnlineState = 'idle' | 'connecting' | 'lobby' | 'racing';

export class OnlineManager {
  state: OnlineState = 'idle';
  role: 'host' | 'guest' | null = null;
  code = '';
  selfId = '';
  players: NetPlayer[] = [];
  settings: RoomSettings = { track: 'b_hills', count: 8 };
  round = 0;
  error = '';
  lastResult: RaceResult | null = null;
  owners: Record<string, number> = {};
  private peer: Peer | null = null;
  private conns = new Map<string, DataConnection>();
  private hostConn: DataConnection | null = null;
  private snapAcc = 0;
  private raceTrack: TrackData | null = null;

  constructor(private readonly game: GameManager) {}

  get active(): boolean {
    return this.state === 'lobby' || this.state === 'racing';
  }

  get isHost(): boolean {
    return this.role === 'host';
  }

  private peerOptions(): PeerOptions {
    const q = new URLSearchParams(location.search);
    const o: PeerOptions = { debug: 0 };
    if (q.get('peerhost')) {
      o.host = q.get('peerhost') as string;
      o.port = Number(q.get('peerport') ?? 9000);
      o.path = q.get('peerpath') ?? '/';
      o.secure = q.get('peersecure') !== '0';
    }
    return o;
  }

  private changed(): void {
    this.game.ui.onlineChanged();
  }

  private fail(msg: string): void {
    this.error = msg;
    this.teardown();
    this.changed();
  }

  /* ----------------------------------------------------------- hosting */

  createRoom(name: string, skin: string, attempt = 0): void {
    this.teardown();
    this.error = '';
    this.state = 'connecting';
    this.role = 'host';
    const rng = createSeededRandom((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    this.code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(rng() * CODE_CHARS.length)]).join('');
    this.changed();
    const peer = new Peer(PREFIX + this.code, this.peerOptions());
    this.peer = peer;
    peer.on('open', (id) => {
      this.selfId = id;
      this.players = [{ id, name, skin, score: 0, host: true, wins: 0 }];
      this.state = 'lobby';
      this.game.platform.showInviteButton(this.code);
      this.broadcastLobby();
    });
    peer.on('connection', (conn) => this.acceptGuest(conn));
    peer.on('error', (err) => {
      const type = (err as { type?: string }).type;
      if (type === 'unavailable-id' && attempt < 3) this.createRoom(name, skin, attempt + 1);
      else if (this.state === 'connecting') this.fail(this.describe(type));
      else this.game.ui.toast(this.describe(type), 'error');
    });
    peer.on('disconnected', () => {
      // lost the signalling server; existing peer links keep working
      if (!peer.destroyed) peer.reconnect();
    });
  }

  private acceptGuest(conn: DataConnection): void {
    conn.on('data', (raw) => {
      const msg = raw as Msg;
      if (msg.t === 'hello') {
        if (msg.v !== PROTOCOL) {
          conn.send({ t: 'closed', reason: 'Different game version — refresh the page.' } satisfies Msg);
          return;
        }
        if (this.players.length >= MAX_PLAYERS) {
          conn.send({ t: 'full' } satisfies Msg);
          setTimeout(() => conn.close(), 300);
          return;
        }
        this.conns.set(conn.peer, conn);
        this.players.push({ id: conn.peer, name: clean(msg.name), skin: validSkin(msg.skin), score: 0, host: false, wins: 0 });
        this.settings.count = Math.max(this.settings.count, this.players.length);
        this.game.audio.coin();
        this.game.ui.toast(`${clean(msg.name)} joined`, 'good');
        this.broadcastLobby();
      } else if (msg.t === 'skin') {
        const p = this.players.find((x) => x.id === conn.peer);
        if (p) p.skin = validSkin(msg.skin);
        this.broadcastLobby();
      }
    });
    conn.on('close', () => this.dropGuest(conn.peer));
    conn.on('error', () => this.dropGuest(conn.peer));
  }

  private dropGuest(id: string): void {
    if (!this.conns.has(id)) return;
    this.conns.delete(id);
    const p = this.players.find((x) => x.id === id);
    this.players = this.players.filter((x) => x.id !== id);
    if (p) this.game.ui.toast(`${p.name} left`, 'info');
    this.broadcastLobby();
  }

  private send(msg: Msg): void {
    for (const c of this.conns.values()) if (c.open) c.send(msg);
  }

  private broadcastLobby(): void {
    this.send({ t: 'lobby', players: this.players, settings: this.settings, round: this.round, racing: this.state === 'racing' });
    this.changed();
  }

  setTrack(id: string): void {
    if (!this.isHost) return;
    this.settings.track = id;
    this.broadcastLobby();
  }

  setCount(n: number): void {
    if (!this.isHost) return;
    this.settings.count = Math.max(Math.max(2, this.players.length), Math.min(12, n));
    this.broadcastLobby();
  }

  trackOptions(): { id: string; name: string }[] {
    return [
      ...BUILTIN_TRACKS.map((b) => ({ id: b.id, name: b.name })),
      { id: 'random:easy', name: 'Random (easy)' },
      { id: 'random:medium', name: 'Random (medium)' },
      { id: 'random:hard', name: 'Random (hard)' },
      ...this.game.saves
        .list()
        .filter((t) => t.pieces.some((p) => p.t === 'finish'))
        .map((t) => ({ id: `saved:${t.id}`, name: `★ ${t.name}` })),
    ];
  }

  private resolveTrack(seed: number): TrackData {
    const id = this.settings.track;
    if (id.startsWith('random:')) return this.game.generator.generate(seed, id.slice(7) as 'easy' | 'medium' | 'hard').track;
    if (id.startsWith('saved:')) {
      const t = this.game.saves.get(id.slice(6));
      if (t) return t;
    }
    return (BUILTIN_TRACKS.find((b) => b.id === id) ?? BUILTIN_TRACKS[0]).make();
  }

  /** Host: start a race for everyone. */
  startRace(): void {
    if (!this.isHost || this.state !== 'lobby') return;
    const seed = Math.floor(Math.random() * 1e9);
    const rng = createSeededRandom(seed);
    const track = this.resolveTrack(seed);
    const count = Math.max(this.players.length, this.settings.count);
    // random but fair start slots for the players
    const slots = Array.from({ length: count }, (_, i) => i).sort(() => rng() - 0.5);
    const marbles: RaceMarble[] = [];
    const owners: Record<string, number> = {};
    const used = new Set(this.players.map((p) => p.skin));
    const botSkins = SKINS.filter((s) => s.price === 0 && !s.challenge && !s.level && !used.has(s.id)).map((s) => s.id);
    let b = 0;
    for (let i = 0; i < count; i += 1) marbles.push({ index: i, skin: '', name: '' });
    this.players.forEach((p, k) => {
      const slot = slots[k];
      owners[p.id] = slot;
      marbles[slot] = { index: slot, skin: p.skin, name: p.name };
    });
    for (const m of marbles)
      if (!m.skin) {
        const skin = botSkins[b % botSkins.length] ?? 'ruby';
        b += 1;
        m.skin = skin;
        m.name = `${getSkin(skin).name} (bot)`;
      }
    this.round += 1;
    this.owners = owners;
    this.state = 'racing';
    this.raceTrack = track;
    const msg: Msg = { t: 'start', track, marbles, seed, owners, round: this.round };
    this.send(msg);
    this.game.startOnlineRace(track, marbles, owners[this.selfId], seed, 'host');
  }

  /** Host: race finished locally. Score players and tell everyone. */
  hostRaceDone(result: RaceResult): void {
    if (!this.isHost) return;
    for (const p of this.players) {
      const idx = this.owners[p.id];
      const row = result.rows.find((r) => r.index === idx);
      if (!row || row.dnf) continue;
      p.score += POINTS[row.place - 1] ?? 1;
      if (row.place === 1) p.wins += 1;
    }
    this.lastResult = result;
    this.state = 'lobby';
    this.send({ t: 'done', result, players: this.players });
    this.broadcastLobby();
  }

  /** Called every frame by the game loop. */
  update(dt: number): void {
    if (!this.isHost || this.state !== 'racing') return;
    const sim = this.game.race.sim;
    if (!sim || sim.phase !== 'running') return;
    this.snapAcc += dt;
    if (this.snapAcc < 0.1) return;
    this.snapAcc = 0;
    this.send({ t: 'snap', s: sim.snapshot() });
  }

  /* ----------------------------------------------------------- joining */

  joinRoom(code: string, name: string, skin: string): void {
    this.teardown();
    const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.length !== 5) {
      this.error = 'Room codes have 5 characters.';
      this.changed();
      return;
    }
    this.error = '';
    this.code = c;
    this.role = 'guest';
    this.state = 'connecting';
    this.changed();
    const peer = new Peer(this.peerOptions());
    this.peer = peer;
    const timeout = window.setTimeout(() => {
      if (this.state === 'connecting') this.fail('Could not reach the room. Check the code and try again.');
    }, 15000);
    peer.on('open', (id) => {
      this.selfId = id;
      const conn = peer.connect(PREFIX + c, { reliable: true });
      this.hostConn = conn;
      conn.on('open', () => {
        window.clearTimeout(timeout);
        conn.send({ t: 'hello', name, skin, v: PROTOCOL } satisfies Msg);
      });
      conn.on('data', (raw) => this.onHostMessage(raw as Msg));
      conn.on('close', () => this.hostGone());
      conn.on('error', () => this.hostGone());
    });
    peer.on('error', (err) => {
      window.clearTimeout(timeout);
      const type = (err as { type?: string }).type;
      if (this.state === 'connecting') this.fail(type === 'peer-unavailable' ? `Room ${c} not found.` : this.describe(type));
    });
  }

  private onHostMessage(msg: Msg): void {
    switch (msg.t) {
      case 'lobby':
        this.players = msg.players;
        this.settings = msg.settings;
        this.round = msg.round;
        if (this.state === 'connecting') {
          this.state = msg.racing ? 'racing' : 'lobby';
          this.game.audio.coin();
        }
        if (!msg.racing && this.state === 'racing' && this.game.screen !== 'race' && this.game.screen !== 'results') this.state = 'lobby';
        this.changed();
        break;
      case 'start':
        this.state = 'racing';
        this.round = msg.round;
        this.owners = msg.owners;
        this.raceTrack = sanitizeTrack(msg.track);
        this.game.startOnlineRace(this.raceTrack, msg.marbles, msg.owners[this.selfId] ?? -1, msg.seed, 'guest');
        break;
      case 'snap':
        if (this.game.screen === 'race') this.game.race.applyRemote(msg.s);
        break;
      case 'done':
        this.players = msg.players;
        this.lastResult = msg.result;
        this.state = 'lobby';
        if (this.game.screen === 'race') this.game.race.finishRemote(msg.result);
        this.changed();
        break;
      case 'full':
        this.fail('This room is full (12 players).');
        break;
      case 'closed':
        this.fail(msg.reason);
        break;
    }
  }

  private hostGone(): void {
    if (this.role !== 'guest' || this.state === 'idle') return;
    const wasRacing = this.game.screen === 'race' || this.game.screen === 'results';
    this.fail('The host closed the room.');
    if (wasRacing) this.game.openOnline();
  }

  setSkin(skin: string): void {
    const me = this.players.find((p) => p.id === this.selfId);
    if (me) me.skin = skin;
    if (this.isHost) this.broadcastLobby();
    else this.hostConn?.send({ t: 'skin', skin } satisfies Msg);
    this.changed();
  }

  /* -------------------------------------------------------------- misc */

  leave(): void {
    if (this.isHost) this.send({ t: 'closed', reason: 'The host closed the room.' });
    this.teardown();
    this.error = '';
    this.changed();
  }

  private teardown(): void {
    this.game.platform.hideInviteButton();
    for (const c of this.conns.values()) c.close();
    this.conns.clear();
    this.hostConn?.close();
    this.hostConn = null;
    this.peer?.destroy();
    this.peer = null;
    this.state = 'idle';
    this.role = null;
    this.players = [];
    this.round = 0;
  }

  inviteLink(): string {
    return this.game.platform.inviteLink(this.code);
  }

  myMarble(): number {
    return this.owners[this.selfId] ?? -1;
  }

  ownerName(marble: number): string | null {
    for (const [id, idx] of Object.entries(this.owners)) if (idx === marble) return this.players.find((p) => p.id === id)?.name ?? null;
    return null;
  }

  private describe(type?: string): string {
    switch (type) {
      case 'browser-incompatible':
        return 'This browser does not support online play (WebRTC).';
      case 'network':
      case 'server-error':
      case 'socket-error':
      case 'socket-closed':
        return "Can't reach the online service. Check your connection and try again.";
      case 'peer-unavailable':
        return 'Room not found.';
      default:
        return 'Connection problem. Please try again.';
    }
  }
}

function clean(name: string): string {
  return (String(name ?? '').replace(/[<>&"']/g, '').trim() || 'Player').slice(0, 14);
}

function validSkin(id: string): string {
  return SKINS.some((s) => s.id === id) ? id : 'ruby';
}
