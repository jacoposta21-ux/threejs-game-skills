import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COURT, TEAMS } from '../config.js';
import { createCrowdAtlas } from './ProceduralTextures.js';

const SKINS = ['#8d5524', '#c68642', '#e0ac69', '#5c3317', '#f1c27d', '#3d2314', '#a0663a'];
const HAIR = ['buzz', 'afro', 'parted', 'curly', 'buzz'];
const HAIR_F = ['long', 'buns', 'long', 'afro'];

/**
 * Spectators: a row of fully animated characters on the far sidewalk (same
 * rig and kit shader as the players, in casual colours), plus a cheap
 * billboard crowd on balconies and rooftops that bobs in a vertex shader.
 */
export class Crowd {
  constructor(scene, lib, rng, count) {
    this.fans = [];
    this.excitement = 0;
    this.time = 0;
    const casual = [
      { ...TEAMS.home, pattern: 1 },
      { ...TEAMS.home, jersey: '#1f8a4c', jersey2: '#f6c915', pattern: 1 },
      { ...TEAMS.away },
      { jersey: '#ffffff', jersey2: '#d9d9d9', shorts: '#2b3a55', socks: '#ffffff', sockStripe: '#ffffff', shoes: '#141414', pattern: 0 },
      { jersey: '#e8338b', jersey2: '#141414', shorts: '#3a3a3a', socks: '#141414', sockStripe: '#141414', shoes: '#ffffff', pattern: 0 },
      { jersey: '#1d9bf0', jersey2: '#ffffff', shorts: '#5c4a32', socks: '#ffffff', sockStripe: '#1d9bf0', shoes: '#f6c915', pattern: 0 },
    ];
    for (let i = 0; i < count; i += 1) {
      const female = i % 3 === 1;
      const look = {
        body: female ? 'female' : 'male',
        beard: !female && rng() < 0.3,
        team: casual[i % casual.length],
        skin: rng.pick(SKINS),
        hair: female ? rng.pick(HAIR_F) : rng.pick(HAIR),
        hairColor: rng() < 0.85 ? '#1b120c' : '#d6a45e',
        number: 1 + Math.floor(rng() * 23),
        height: female ? 1.58 + rng() * 0.14 : 1.66 + rng() * 0.2,
      };
      const ch = lib.createCharacter(look);
      ch.mesh.castShadow = false;
      // Spread along the far sidewalk, a few behind each end fence.
      let x;
      let z;
      let ry;
      if (i < count * 0.7) {
        x = -COURT.halfLength + 2 + ((i + rng() * 0.6) / (count * 0.7)) * (COURT.halfLength * 2 - 4);
        z = COURT.halfWidth + 1.4 + rng() * 0.9;
        ry = Math.PI + (rng() - 0.5) * 0.6;
      } else {
        const s = i % 2 ? 1 : -1;
        x = s * (COURT.halfLength + 2.0 + rng() * 0.8);
        z = (rng() < 0.5 ? -1 : 1) * (COURT.goalHalfWidth + 1.5 + rng() * 4);
        ry = s > 0 ? -Math.PI / 2 : Math.PI / 2;
        ry += (rng() - 0.5) * 0.5;
      }
      ch.holder.position.set(x, 0.16, z);
      ch.holder.rotation.y = ry;
      scene.add(ch.holder);
      const mixer = new THREE.AnimationMixer(ch.root);
      const idleName = rng.pick(['Idle_Loop', 'Idle_Talking_Loop', 'Idle_Loop']);
      const idle = mixer.clipAction(lib.clips.get(idleName));
      idle.play();
      idle.time = rng() * idle.getClip().duration;
      idle.timeScale = 0.85 + rng() * 0.3;
      const cheer = mixer.clipAction(lib.clips.get(rng() < 0.5 ? 'Dance_Loop' : 'Jump_Loop'));
      cheer.play();
      cheer.setEffectiveWeight(0);
      cheer.time = rng() * cheer.getClip().duration;
      // casual[0..1] are home colours, casual[2] away: recoloured when the teams change.
      const side = i % casual.length < 2 ? 'home' : i % casual.length === 2 ? 'away' : null;
      this.fans.push({ ch, mixer, idle, cheer, home: side === 'home', side, alt: i % casual.length === 1 });
    }

    this.billboards = this.buildBillboards(scene, rng);
  }

  /** Dress the supporters in the current teams' colours. */
  setTeamColors(home, away) {
    for (const f of this.fans) {
      const u = f.ch.material?.userData?.uniforms;
      if (!u || !f.side) continue;
      const k = f.side === 'home' ? home : away;
      u.uJersey.value.set(f.alt ? k.jersey2 : k.jersey);
      u.uJersey2.value.set(f.alt ? k.jersey : k.jersey2);
      u.uShorts.value.set(k.shorts);
      u.uSocks.value.set(k.socks);
      u.uSockStripe.value.set(k.sockStripe);
      u.uPattern.value = f.alt ? 1 : k.pattern;
    }
  }

  buildBillboards(scene, rng) {
    const atlas = createCrowdAtlas(rng);
    const geos = [];
    const spots = [];
    // Rooftop and balcony watchers along the far houses.
    for (let i = 0; i < 46; i += 1) {
      spots.push([-30 + rng() * 60, 6 + Math.floor(rng() * 3) * 3.05, COURT.halfWidth + 9.6 + rng() * 0.6]);
    }
    for (let i = 0; i < 18; i += 1) {
      const s = rng() < 0.5 ? -1 : 1;
      spots.push([s * (COURT.halfLength + 9.5), 6 + Math.floor(rng() * 2) * 3.05, -8 + rng() * 16]);
    }
    for (const [x, y, z] of spots) {
      const g = new THREE.PlaneGeometry(0.75, 1.5);
      const cell = Math.floor(rng() * 8);
      const uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k += 1) uv.setX(k, (cell + uv.getX(k)) / 8);
      // Face the court centre.
      g.rotateY(Math.atan2(-x, -z));
      g.translate(x, y + 0.75, z);
      const phase = new Float32Array(g.attributes.position.count).fill(rng() * Math.PI * 2);
      g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
      geos.push(g);
    }
    const mat = new THREE.MeshStandardMaterial({ map: atlas, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 });
    const uniforms = { uTime: { value: 0 }, uExcite: { value: 0 } };
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aPhase;\nuniform float uTime, uExcite;')
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\ntransformed.y += abs(sin(uTime * (2.0 + uExcite * 6.0) + aPhase)) * (0.03 + uExcite * 0.28);',
        );
    };
    const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
    mesh.name = 'billboardCrowd';
    scene.add(mesh);
    return { mesh, uniforms };
  }

  /** Crowd reaction: 0..1 excitement that decays (goal = 1, near miss = 0.5). */
  react(level) {
    this.excitement = Math.max(this.excitement, level);
  }

  update(dt) {
    this.time += dt;
    this.excitement = Math.max(0, this.excitement - dt * 0.22);
    const cheerW = THREE.MathUtils.smoothstep(this.excitement, 0.25, 0.7);
    for (const f of this.fans) {
      f.cheer.setEffectiveWeight(cheerW);
      f.idle.setEffectiveWeight(1 - cheerW);
      f.mixer.update(dt);
    }
    this.billboards.uniforms.uTime.value = this.time;
    this.billboards.uniforms.uExcite.value = this.excitement;
  }
}
