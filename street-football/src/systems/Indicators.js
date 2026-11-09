import * as THREE from 'three';

/** Ground marker under the controlled player (team-coloured ring + facing arrow) and a pulse on the pass target. */
export class Indicators {
  constructor(scene) {
    const ring = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: '#f6c915', transparent: true, opacity: 0.9, depthWrite: false });
    const circle = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 40), mat);
    circle.rotation.x = -Math.PI / 2;
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 0.78);
    arrowShape.lineTo(0.16, 0.55);
    arrowShape.lineTo(-0.16, 0.55);
    arrowShape.closePath();
    const arrow = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape), mat);
    arrow.rotation.x = -Math.PI / 2;
    ring.add(circle, arrow);
    ring.position.y = 0.02;
    ring.renderOrder = 2;
    scene.add(ring);
    this.ring = ring;
    this.mat = mat;

    this.targetMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
    this.target = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.45, 32), this.targetMat);
    this.target.rotation.x = -Math.PI / 2;
    this.target.position.y = 0.021;
    scene.add(this.target);
    this.time = 0;
  }

  update(dt, human, passTarget, visible) {
    this.time += dt;
    this.ring.visible = visible && !!human;
    if (human) {
      const p = human.p.holder.position;
      this.ring.position.set(p.x, 0.02, p.z);
      this.ring.rotation.y = human.p.heading;
      const s = 1 + Math.sin(this.time * 6) * 0.04;
      this.ring.scale.set(s, 1, s);
      this.mat.color.set(human.possession ? '#ffffff' : '#f6c915');
    }
    if (passTarget && visible) {
      const p = passTarget.p.holder.position;
      this.target.position.set(p.x, 0.021, p.z);
      this.targetMat.opacity = 0.5 + Math.sin(this.time * 14) * 0.3;
    } else this.targetMat.opacity = 0;
  }
}
