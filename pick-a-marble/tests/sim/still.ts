import { initPhysics, PhysicsWorld } from '../../src/physics/PhysicsWorld';
import { newTrack } from '../../src/track/Track';
import { TrackChain } from '../../src/track/TrackChain';
import * as THREE from 'three';
await initPhysics();
const t = newTrack('x');
const c = new TrackChain(t);
c.start(0, 30, 0);
c.place('drop'); c.place('spiral'); c.place('half_pipe'); c.place('finish');
const w = new PhysicsWorld(t.pieces);
const b = w.addMarble(new THREE.Vector3(Number(process.argv[2]), Number(process.argv[3]), Number(process.argv[4])));
for (let i = 0; i < 240; i++) { w.step(); if (i % 30 === 0) { const p = b.translation(); const v = b.linvel(); const a = b.angvel(); console.log(i, p.x.toFixed(2), p.y.toFixed(2), p.z.toFixed(2), 'v', Math.hypot(v.x,v.y,v.z).toFixed(2), 'w', Math.hypot(a.x,a.y,a.z).toFixed(2)); } }
