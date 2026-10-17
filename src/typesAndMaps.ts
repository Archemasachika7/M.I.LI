export type MaskId = 'GAS_MASK' | 'VISOR' | 'SKULL' | 'NVG';
export type RoleId = 'MEDIC' | 'SURVIVOR' | 'RAIDER' | 'SCOUT';
export type MatchModeId =
  | 'SOLO_BOTS'
  | '1V1_SOLO'
  | '2V2_DUO'
  | '4V4_WITH_RULES'
  | '4V4_WITHOUT_RULES';

export interface RoleSpec {
  id: RoleId;
  title: string;
  baseHp: number;
  speed: number;
  fuelMax: number;
  startWeapon: number;
  startBombs: number;
  startMedkits: number;
  perkText: string;
  uniformColor: string;
}

export const ROLES: Record<RoleId, RoleSpec> = {
  MEDIC: {
    id: 'MEDIC',
    title: 'MEDIC',
    baseHp: 115,
    speed: 4.1,
    fuelMax: 110,
    startWeapon: 0,
    startBombs: 1,
    startMedkits: 3,
    perkText: 'MEDIC: Starts with 3 Bio-Medkits & passively regenerates nearby teammates (115 HP).',
    uniformColor: '#4d7c0f'
  },
  SURVIVOR: {
    id: 'SURVIVOR',
    title: 'SURVIVOR',
    baseHp: 160,
    speed: 3.5,
    fuelMax: 100,
    startWeapon: 3,
    startBombs: 1,
    startMedkits: 2,
    perkText: 'SURVIVOR: Heavy 160 HP Armor, Shotgun & reinforces Team Base Shield.',
    uniformColor: '#3f6212'
  },
  RAIDER: {
    id: 'RAIDER',
    title: 'RAIDER',
    baseHp: 125,
    speed: 3.9,
    fuelMax: 105,
    startWeapon: 2,
    startBombs: 3,
    startMedkits: 1,
    perkText: 'RAIDER: Starts with Heavy RPG + 3 Cluster Bombs for Base Breaching (125 HP).',
    uniformColor: '#5c4033'
  },
  SCOUT: {
    id: 'SCOUT',
    title: 'SCOUT',
    baseHp: 100,
    speed: 4.6,
    fuelMax: 145,
    startWeapon: 1,
    startBombs: 1,
    startMedkits: 1,
    perkText: 'SCOUT: High-Velocity Sniper + 145% Nitro Rocket Boots & Extended Sight.',
    uniformColor: '#365314'
  }
};

export interface WeaponSpec {
  name: string;
  fireRate: number; // ticks between shots
  speed: number;
  damage: number;
  spread: number;
  magSize: number;
  reserveMax: number;
  reloadTicks: number;
  recoil: number;
  laserColor: string;
  laserLen: number;
  explosive: boolean;
  pellets: number;
  color: string;
}

export const WEAPONS: WeaponSpec[] = [
  {
    name: 'AK-47 ASSAULT',
    fireRate: 7,
    speed: 19,
    damage: 15,
    spread: 0.05,
    magSize: 30,
    reserveMax: 150,
    reloadTicks: 65,
    recoil: 0.9,
    laserColor: 'rgba(239, 68, 68, 0.55)',
    laserLen: 380,
    explosive: false,
    pellets: 1,
    color: '#facc15'
  },
  {
    name: 'M93BA SNIPER',
    fireRate: 30,
    speed: 28,
    damage: 68,
    spread: 0.005,
    magSize: 6,
    reserveMax: 36,
    reloadTicks: 80,
    recoil: 2.8,
    laserColor: 'rgba(34, 197, 94, 0.75)',
    laserLen: 820,
    explosive: false,
    pellets: 1,
    color: '#38bdf8'
  },
  {
    name: 'SMAW ROCKET RPG',
    fireRate: 42,
    speed: 14,
    damage: 90,
    spread: 0.015,
    magSize: 4,
    reserveMax: 20,
    reloadTicks: 90,
    recoil: 4.8,
    laserColor: 'rgba(249, 115, 22, 0.65)',
    laserLen: 340,
    explosive: true,
    pellets: 1,
    color: '#f97316'
  },
  {
    name: 'SPAS-12 SHOTGUN',
    fireRate: 22,
    speed: 17,
    damage: 13,
    spread: 0.22,
    magSize: 10,
    reserveMax: 60,
    reloadTicks: 75,
    recoil: 3.4,
    laserColor: 'rgba(250, 204, 21, 0.5)',
    laserLen: 240,
    explosive: false,
    pellets: 6,
    color: '#fbbf24'
  }
];

export type PickupKind = 'MEDKIT' | 'EXTRA_HP' | 'GRENADE' | 'BOMB' | 'GUN_RPG' | 'GUN_SNIPER';

export interface MapPickupSpec {
  id: string;
  x: number;
  y: number;
  kind: PickupKind;
}

export interface PlatformSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  oneWay?: boolean;
  color: string;
  grassColor: string;
}

export interface BaseSpec {
  team: 'mili' | 'bandits';
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MountainMap {
  id: string;
  name: string;
  worldW: number;
  worldH: number;
  skyTop: string;
  skyBottom: string;
  mountainFar: string;
  mountainMid: string;
  peaks: Array<[number, number]>;
  platforms: PlatformSpec[];
  bases: BaseSpec[];
  pickups: MapPickupSpec[];
}

export const MAPS: Record<string, MountainMap> = {
  map_outpost: {
    id: 'map_outpost',
    name: '01. OUTPOST RIDGE',
    worldW: 1800,
    worldH: 960,
    skyTop: '#87a8b8',
    skyBottom: '#c9decb',
    mountainFar: '#6b847a',
    mountainMid: '#4f6852',
    peaks: [
      [0, 360], [160, 190], [340, 330], [540, 160], [760, 340],
      [960, 175], [1180, 320], [1420, 150], [1640, 290], [1800, 190]
    ],
    platforms: [
      // Ground & Fortress
      { x: 0, y: 880, w: 1800, h: 80, color: '#473321', grassColor: '#5c8236' },
      { x: 40, y: 650, w: 540, h: 42, color: '#5c4028', grassColor: '#65913a' },
      { x: 80, y: 420, w: 420, h: 38, color: '#5c4028', grassColor: '#65913a' },
      // Center Suspension Bridge (One-Way)
      { x: 640, y: 660, w: 520, h: 18, oneWay: true, color: '#7c4d25', grassColor: '#a3703c' },
      { x: 740, y: 450, w: 320, h: 32, color: '#5c4028', grassColor: '#65913a' },
      // Right Bandit Cliff & Sniper Nest
      { x: 1220, y: 650, w: 540, h: 42, color: '#5c4028', grassColor: '#65913a' },
      { x: 1300, y: 390, w: 440, h: 40, color: '#523e29', grassColor: '#65913a' }
    ],
    bases: [
      { team: 'mili', label: 'M.I.L.I. FORTRESS BASE', x: 60, y: 460, w: 420, h: 190 },
      { team: 'bandits', label: 'BANDIT CLIFF CITADEL', x: 1320, y: 210, w: 400, h: 180 }
    ],
    pickups: [
      { id: 'p1', x: 900, y: 620, kind: 'EXTRA_HP' },
      { id: 'p2', x: 900, y: 410, kind: 'GUN_RPG' },
      { id: 'p3', x: 280, y: 380, kind: 'MEDKIT' },
      { id: 'p4', x: 1500, y: 350, kind: 'GUN_SNIPER' },
      { id: 'p5', x: 620, y: 840, kind: 'BOMB' },
      { id: 'p6', x: 1180, y: 840, kind: 'GRENADE' }
    ]
  },

  map_highcliff: {
    id: 'map_highcliff',
    name: '02. HIGHCLIFF PEAKS',
    worldW: 1800,
    worldH: 960,
    skyTop: '#0f172a',
    skyBottom: '#475569',
    mountainFar: '#334155',
    mountainMid: '#1e293b',
    peaks: [
      [0, 320], [220, 120], [460, 340], [720, 110], [920, 290],
      [1160, 105], [1410, 310], [1620, 130], [1800, 260]
    ],
    platforms: [
      { x: 0, y: 880, w: 1800, h: 80, color: '#334155', grassColor: '#94a3b8' },
      { x: 60, y: 580, w: 480, h: 42, color: '#475569', grassColor: '#cbd5e1' },
      { x: 1260, y: 580, w: 480, h: 42, color: '#475569', grassColor: '#cbd5e1' },
      { x: 580, y: 710, w: 640, h: 20, oneWay: true, color: '#38bdf8', grassColor: '#bae6fd' },
      { x: 660, y: 440, w: 480, h: 38, color: '#475569', grassColor: '#e2e8f0' },
      { x: 200, y: 330, w: 340, h: 32, color: '#475569', grassColor: '#e2e8f0' },
      { x: 1260, y: 330, w: 340, h: 32, color: '#475569', grassColor: '#e2e8f0' }
    ],
    bases: [
      { team: 'mili', label: 'WEST GLACIER BASE', x: 80, y: 400, w: 380, h: 180 },
      { team: 'bandits', label: 'EAST SUMMIT BASE', x: 1340, y: 400, w: 380, h: 180 }
    ],
    pickups: [
      { id: 'h1', x: 900, y: 395, kind: 'EXTRA_HP' },
      { id: 'h2', x: 350, y: 290, kind: 'GUN_SNIPER' },
      { id: 'h3', x: 1450, y: 290, kind: 'GUN_RPG' },
      { id: 'h4', x: 900, y: 670, kind: 'MEDKIT' },
      { id: 'h5', x: 900, y: 840, kind: 'BOMB' }
    ]
  },

  map_catacombs: {
    id: 'map_catacombs',
    name: '03. RED ROCK CRAG',
    worldW: 1800,
    worldH: 960,
    skyTop: '#451a03',
    skyBottom: '#9a3412',
    mountainFar: '#7c2d12',
    mountainMid: '#431407',
    peaks: [
      [0, 290], [190, 140], [420, 320], [690, 130], [950, 310],
      [1210, 125], [1480, 290], [1690, 145], [1800, 250]
    ],
    platforms: [
      { x: 0, y: 880, w: 1800, h: 80, color: '#451a03', grassColor: '#b45309' },
      { x: 40, y: 620, w: 520, h: 45, color: '#78350f', grassColor: '#d97706' },
      { x: 1240, y: 620, w: 520, h: 45, color: '#78350f', grassColor: '#d97706' },
      { x: 420, y: 430, w: 960, h: 22, oneWay: true, color: '#57534e', grassColor: '#a8a29e' },
      { x: 720, y: 660, w: 360, h: 36, color: '#78350f', grassColor: '#f59e0b' }
    ],
    bases: [
      { team: 'mili', label: 'CANYON BUNKER ALPHA', x: 60, y: 440, w: 380, h: 180 },
      { team: 'bandits', label: 'CRAG OUTPOST OMEGA', x: 1360, y: 440, w: 380, h: 180 }
    ],
    pickups: [
      { id: 'c1', x: 900, y: 390, kind: 'GUN_RPG' },
      { id: 'c2', x: 900, y: 620, kind: 'EXTRA_HP' },
      { id: 'c3', x: 600, y: 390, kind: 'MEDKIT' },
      { id: 'c4', x: 1200, y: 390, kind: 'BOMB' },
      { id: 'c5', x: 900, y: 840, kind: 'GRENADE' }
    ]
  }
};
