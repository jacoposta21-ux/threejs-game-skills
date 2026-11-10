const $ = (id) => document.getElementById(id);

const DEFAULTS = { music: 0.6, weather: 'dynamic', station: 0, quality: 'medium', sensitivity: 1, invertY: false, cameraDistance: 4.6, fov: 68, volume: 0.8, dayMinutes: 16, showFps: false, drawDistance: 1, autoPerf: true };

export function loadSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('vistamar.settings') || '{}'); } catch { saved = {}; }
  const out = { ...DEFAULTS, ...saved };
  const q = new URLSearchParams(location.search).get('quality');
  if (q && ['low', 'medium', 'high'].includes(q)) out.quality = q;
  if (new URLSearchParams(location.search).get('autoperf') === '0') out.autoPerf = false;
  return out;
}

export function saveSettings(s) {
  try { localStorage.setItem('vistamar.settings', JSON.stringify(s)); } catch { /* storage unavailable */ }
}

// Start screen, pause menu (resume / settings / controls / restart) and map view.
export class Menus {
  constructor(game) {
    this.game = game;
    this.start = $('start');
    this.pause = $('pause');
    this.map = $('mapview');
    this.playBtn = $('play');
    this.page = 'home';

    this.playBtn.addEventListener('click', () => { game.audio.click(); game.begin(); });
    this.newBtn = $('newgame');
    // starting over erases the save, so it takes a second click
    this.newBtn.addEventListener('click', () => {
      game.audio.click();
      if (!this.newArmed) { this.newArmed = true; this.newBtn.textContent = 'Erase the save and start over?'; return; }
      game.begin(true);
    });
    this.pause.querySelectorAll('[data-action]').forEach((b) => b.addEventListener('click', () => {
      game.audio.click();
      const a = b.dataset.action;
      if (a === 'resume') game.resume();
      else if (a === 'restart') {
        if (!this.restartArmed) { this.restartArmed = true; b.textContent = 'Erase progress?'; setTimeout(() => { this.restartArmed = false; b.textContent = 'New game'; }, 3500); return; }
        this.restartArmed = false; b.textContent = 'New game';
        game.restart(); game.resume();
      }
      else this.showPage(this.page === a ? 'home' : a);
    }));
    this.bindSettings();
  }

  setLoading(frac, label) {
    $('load-fill').style.width = `${Math.round(frac * 100)}%`;
    $('load-text').textContent = label;
  }

  ready() {
    $('loading').classList.add('hidden');
    this.playBtn.classList.remove('hidden');
    if (this.game.hasSave()) { this.playBtn.textContent = 'Continue'; this.newBtn.classList.remove('hidden'); }
    this.playBtn.focus();
  }

  showStart(v) { this.start.classList.toggle('hidden', !v); }

  showPause(v) {
    this.pause.classList.toggle('hidden', !v);
    if (v) { this.showPage('home'); this.refreshStats(); }
  }

  showPage(name) {
    this.page = name;
    for (const p of ['home', 'settings', 'controls', 'stats']) $(`panel-${p}`).classList.toggle('hidden', p !== name);
    this.pause.querySelectorAll('.menu-btn').forEach((b) => b.classList.toggle('active', b.dataset.action === name));
    if (name === 'settings') this.syncSettings();
    if (name === 'stats') this.refreshFullStats();
  }

  refreshStats() {
    const g = this.game;
    const tapes = g.tapes;
    $('pause-stats').innerHTML = `
      <div class="pct"><span>Completion</span><b>${g.completion()}%</b><i><u style="width:${g.completion()}%"></u></i></div>
      <div>Cash <b>$${g.money.toLocaleString('en-US')}</b></div>
      <div>Lost tapes <b>${tapes.count} / ${tapes.tapes.length}</b></div>
      <div>Story missions <b>${g.story.done.size} / ${g.story.defs.length}</b></div>
      <div>Wanted level <b>${'★'.repeat(g.police.level) || 'none'}</b></div>
      <div>Time in Vista Mar <b>${Math.floor(g.playTime / 60)} min ${Math.floor(g.playTime % 60)} s</b></div>
      <div>Clock <b>${g.world.clockString}</b></div>
      <div>Graphics <b>${g.settings.quality} · auto level ${g.perfLevel || 0} · ${Math.round(g.measuredFps || 0)} fps</b></div>
      <div>GPU <b>${g.gpuName}</b></div>`;
  }

  refreshFullStats() {
    const g = this.game, st = g.stats, j = g.jobs.records;
    const km = (m) => `${(m / 1000).toFixed(1)} km`;
    const cash = (v) => `$${Math.round(v).toLocaleString('en-US')}`;
    const tm = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const rows = [
      ['Completion', `${g.completion()}%`],
      ['Story missions', `${g.story.done.size} / ${g.story.defs.length}`],
      ['Lost tapes', `${g.tapes.count} / ${g.tapes.tapes.length}`],
      ['Properties owned', `${g.economy.owned.size} / 5`],
      ...g.jobs.medals().map((m) => [`Time trial · ${m.course.name}`, m.best ? `${tm(m.best.time)} · ${m.best.medal}` : 'no medal yet']),
      ['Taxi fares delivered', `${j.fares} (best streak x${j.bestStreak}, ${cash(j.taxiEarned)})`],
      ['Money earned / spent', `${cash(st.earned)} / ${cash(st.spent)}`],
      ['On foot / driven / flown', `${km(st.walked)} / ${km(st.driven)} / ${km(st.flown)}`],
      ['Top speed', `${Math.round(st.topSpeed)} km/h`],
      ['Cars taken', String(st.stolen)],
      ['Missions passed / failed', `${st.passed} / ${st.failed}`],
      ['Busted / wasted', `${st.busted} / ${st.wasted}`],
      ['Time played', `${Math.floor(g.playTime / 3600)} h ${Math.floor((g.playTime % 3600) / 60)} min`],
    ];
    const box = $('stats-body');
    box.innerHTML = '';
    for (const [k, v] of rows) { const d = document.createElement('div'); const b = document.createElement('b'); d.textContent = k; b.textContent = v; d.appendChild(b); box.appendChild(d); }
  }

  showMap(v) {
    const g = this.game;
    const wasHidden = this.map.classList.contains('hidden');
    this.map.classList.toggle('hidden', !v);
    if (!v) return;
    g.minimap.waypoint = g.waypoint;
    g.minimap.route = g.waypoint ? g.waypointRoute : null;
    g.minimap.drawBig(g.player, g.markers());
    if (wasHidden || this.placesDirty) this.buildPlaces();
    if (!this.mapBound) {
      this.mapBound = true;
      const cv = $('bigmap');
      // the wheel and drag zoom/pan ONLY the map (and never the page or the game camera)
      cv.addEventListener('wheel', (e) => {
        e.preventDefault();
        const r = cv.getBoundingClientRect();
        g.minimap.zoomBig(e.deltaY < 0 ? 1.25 : 0.8, e.clientX - r.left, e.clientY - r.top);
        g.input.wheel = 0;
        this.showMap(true);
      }, { passive: false });
      document.addEventListener('wheel', (e) => { if (g.state === 'map' && e.ctrlKey) e.preventDefault(); }, { passive: false });
      window.addEventListener('keydown', (e) => {
        if (g.state !== 'map') return;
        if (e.code === 'Equal' || e.code === 'NumpadAdd') { g.minimap.zoomBig(1.25, cv.clientWidth / 2, cv.clientHeight / 2); this.showMap(true); }
        if (e.code === 'Minus' || e.code === 'NumpadSubtract') { g.minimap.zoomBig(0.8, cv.clientWidth / 2, cv.clientHeight / 2); this.showMap(true); }
      });
      let drag = null;
      cv.addEventListener('mousedown', (e) => { if (e.button === 0) drag = { x: e.clientX, y: e.clientY, moved: 0 }; });
      window.addEventListener('mousemove', (e) => {
        if (!drag || g.state !== 'map') return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY;
        if (drag.moved > 4) { g.minimap.panBig(dx, dy); this.showMap(true); }
      });
      window.addEventListener('mouseup', () => { setTimeout(() => { drag = null; }, 0); });
      cv.addEventListener('click', (e) => {
        if (drag && drag.moved > 4) return; // that was a pan
        const r = cv.getBoundingClientRect();
        const w = g.minimap.bigToWorld(e.clientX - r.left, e.clientY - r.top);
        // snap to a listed place when clicking close to its icon
        const sc = g.minimap.bigOrigin ? g.minimap.bigOrigin.sc : 1;
        let best = null, bd = 14 / sc;
        for (const pl of g.places()) { const d = Math.hypot(pl.x - w.x, pl.z - w.z); if (d < bd) { bd = d; best = pl; } }
        g.setWaypoint(best || { x: w.x, z: w.z, name: 'Map marker' });
        this.placesDirty = true;
        this.showMap(true);
      });
      cv.addEventListener('contextmenu', (e) => { e.preventDefault(); g.setWaypoint(null); this.placesDirty = true; this.showMap(true); });
    }
  }

  buildPlaces() {
    const g = this.game, box = $('map-places');
    this.placesDirty = false;
    box.innerHTML = '';
    let cat = '';
    const p = g.player.pos;
    for (const pl of g.places()) {
      if (pl.cat !== cat) { cat = pl.cat; const h = document.createElement('div'); h.className = 'cat'; h.textContent = cat; box.appendChild(h); }
      const b = document.createElement('button');
      const on = g.waypoint && g.waypoint.name === pl.name;
      b.className = on ? 'on' : '';
      b.innerHTML = '<b></b><span></span><small></small>';
      b.querySelector('b').textContent = pl.icon || '';
      b.querySelector('b').style.background = pl.color;
      b.querySelector('span').textContent = pl.name;
      b.querySelector('small').textContent = `${Math.round(Math.hypot(pl.x - p.x, pl.z - p.z))} m`;
      b.addEventListener('click', () => { g.setWaypoint(on ? null : pl); this.placesDirty = true; this.showMap(true); });
      box.appendChild(b);
    }
  }

  bindSettings() {
    const g = this.game, s = g.settings;
    const on = (id, ev, fn) => $(id).addEventListener(ev, (e) => { fn(e.target); saveSettings(s); this.syncSettings(); });
    on('set-quality', 'change', (t) => { s.quality = t.value; g.applyQuality(); });
    on('set-sens', 'input', (t) => { s.sensitivity = +t.value; });
    on('set-invert', 'change', (t) => { s.invertY = t.checked; });
    on('set-dist', 'input', (t) => { s.cameraDistance = +t.value; });
    on('set-fov', 'input', (t) => { s.fov = +t.value; });
    on('set-vol', 'input', (t) => { s.volume = +t.value; g.audio.setVolume(s.volume); });
    on('set-music', 'input', (t) => { s.music = +t.value; g.audio.radio.setVolume(s.music); });
    on('set-weather', 'change', (t) => { s.weather = t.value; });
    on('set-day', 'change', (t) => { s.dayMinutes = +t.value; g.applyDaySpeed(); });
    on('set-time', 'input', (t) => { g.world.setTime(+t.value); });
    on('set-fps', 'change', (t) => { s.showFps = t.checked; });
    on('set-draw', 'input', (t) => { s.drawDistance = +t.value; });
    on('set-autoperf', 'change', (t) => { s.autoPerf = t.checked; if (!t.checked) g.applyQuality(); });
  }

  syncSettings() {
    const s = this.game.settings;
    $('set-quality').value = s.quality;
    $('set-sens').value = s.sensitivity; $('val-sens').textContent = s.sensitivity.toFixed(2);
    $('set-invert').checked = s.invertY;
    $('set-dist').value = s.cameraDistance; $('val-dist').textContent = `${s.cameraDistance.toFixed(1)} m`;
    $('set-fov').value = s.fov; $('val-fov').textContent = `${s.fov}°`;
    $('set-vol').value = s.volume; $('val-vol').textContent = `${Math.round(s.volume * 100)}%`;
    $('set-music').value = s.music; $('val-music').textContent = `${Math.round(s.music * 100)}%`;
    $('set-weather').value = s.weather;
    $('set-day').value = String(s.dayMinutes);
    $('set-time').value = this.game.world.timeOfDay.toFixed(1); $('val-time').textContent = this.game.world.clockString;
    $('set-fps').checked = s.showFps;
    $('set-draw').value = s.drawDistance; $('val-draw').textContent = `${Math.round(s.drawDistance * 100)}%`;
    $('set-autoperf').checked = s.autoPerf;
  }
}
