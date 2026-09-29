// Unit catalogue. Land units are recruitable now; naval and air units arrive in a later phase.
'use strict';
const UNIT_TYPES = {
  infantry:     { name: 'Infantry',          short: 'INF', atk: 6,  def: 22, speed: 4,  org: 60, supply: 1.0, mp: 10000, eq: 100, days: 30, symbol: 'inf' },
  motorized:    { name: 'Motorized',         short: 'MOT', atk: 7,  def: 21, speed: 10, org: 55, supply: 1.4, mp: 10000, eq: 180, days: 40, symbol: 'mot' },
  mechanized:   { name: 'Mechanized Inf.',   short: 'MEC', atk: 10, def: 32, speed: 9,  org: 60, supply: 1.6, mp: 10000, eq: 260, days: 50, symbol: 'mec' },
  tanks:        { name: 'Tanks',             short: 'ARM', atk: 30, def: 12, speed: 8,  org: 40, supply: 1.8, mp: 6000,  eq: 400, days: 60, symbol: 'arm', armor: true },
  artillery:    { name: 'Artillery',         short: 'ART', atk: 22, def: 8,  speed: 4,  org: 30, supply: 1.2, mp: 6000,  eq: 220, days: 40, symbol: 'art' },
  marines:      { name: 'Marines',           short: 'MAR', atk: 7,  def: 20, speed: 4,  org: 65, supply: 1.0, mp: 8000,  eq: 150, days: 45, symbol: 'mar' },
  paratroopers: { name: 'Paratroopers',      short: 'PAR', atk: 7,  def: 18, speed: 4,  org: 65, supply: 1.0, mp: 8000,  eq: 170, days: 50, symbol: 'par' },
  recon:        { name: 'Recon',             short: 'REC', atk: 5,  def: 12, speed: 12, org: 50, supply: 0.8, mp: 4000,  eq: 120, days: 25, symbol: 'rec' }
};
const LAND_TYPES = Object.keys(UNIT_TYPES);

const GOV_BASE = {
  Democratic:    { stab: 0.70, ws: 0.20 },
  Authoritarian: { stab: 0.60, ws: 0.45 },
  Communist:     { stab: 0.55, ws: 0.40 },
  Neutral:       { stab: 0.55, ws: 0.25 }
};
