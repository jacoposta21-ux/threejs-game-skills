// Handling specs per vehicle class. Speeds in m/s, accelerations in m/s².
export const VEHICLE_TYPES = {
  sports: {
    label: 'Vapor GT', asset: 'sports', width: 1.95, maxSpeed: 60, accel: 9.5, brake: 26, reverse: 9, drag: 0.08,
    steer: 0.6, grip: 9, driftGrip: 1.6, wheelbase: 2.5, mass: 1300, gears: 6, colorTint: null,
  },
  speedster: {
    label: 'Vista Speedster', asset: 'race', width: 1.9, maxSpeed: 72, accel: 13, brake: 30, reverse: 9, drag: 0.07,
    steer: 0.58, grip: 10.5, driftGrip: 1.7, wheelbase: 2.6, mass: 950, gears: 7,
  },
  sedan: {
    label: 'Coastline Sedan', asset: 'sedan', width: 1.95, maxSpeed: 48, accel: 7, brake: 22, reverse: 8, drag: 0.1,
    steer: 0.62, grip: 8, driftGrip: 1.5, wheelbase: 2.6, mass: 1450, gears: 5,
  },
  suv: {
    label: 'Ranger SUV', asset: 'suv', width: 2.05, maxSpeed: 44, accel: 6.5, brake: 20, reverse: 8, drag: 0.12,
    steer: 0.55, grip: 7, driftGrip: 1.7, wheelbase: 2.8, mass: 2100, gears: 5,
  },
  police: {
    label: 'VMPD Interceptor', asset: 'police', width: 2.0, maxSpeed: 55, accel: 8.5, brake: 25, reverse: 9, drag: 0.09,
    steer: 0.6, grip: 8.5, driftGrip: 1.6, wheelbase: 2.7, mass: 1700, gears: 6, siren: true,
  },
  taxi: {
    label: 'Sunshine Cab', asset: 'taxi', width: 1.95, maxSpeed: 46, accel: 7, brake: 22, reverse: 8, drag: 0.1,
    steer: 0.62, grip: 8, driftGrip: 1.5, wheelbase: 2.6, mass: 1500, gears: 5,
  },
  delivery: {
    label: 'Box Delivery Truck', asset: 'delivery', width: 2.3, maxSpeed: 32, accel: 4.2, brake: 15, reverse: 6, drag: 0.15,
    steer: 0.5, grip: 6, driftGrip: 2.5, wheelbase: 3.4, mass: 4200, gears: 4,
  },
};

// Spawn points: x, z, heading (radians; 0 = +z/south, PI/2 = +x/east, PI = north).
export const VEHICLE_SPAWNS = [
  { type: 'sports', x: 40, z: -11.4, h: Math.PI / 2 },
  { type: 'sedan', x: -22, z: -11.4, h: Math.PI / 2 },
  { type: 'police', x: 105.4, z: -60, h: Math.PI },
  { type: 'suv', x: -195.3, z: 150, h: 0 },
  { type: 'delivery', x: -305, z: -240, h: Math.PI },
  { type: 'sports', x: 394.5, z: 60, h: Math.PI },
  { type: 'taxi', x: 305, z: -40, h: Math.PI },
  { type: 'suv', x: 150, z: -260, h: Math.PI / 2 },
  { type: 'sedan', x: -95, z: 250, h: 0 },
  { type: 'police', x: 205, z: 120, h: 0 },
  { type: 'speedster', x: 394.5, z: -40, h: Math.PI },
  { type: 'speedster', x: 296, z: 150, h: 0 },
];
