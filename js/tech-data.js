// Iron Meridian research data: era trees, national branches, culture branches and
// historical deposits for every era. Transcribed from rts-game-design/TECH-TREES.md and
// ECONOMY-AND-TRADE.md. Pure data: tech.js and economy.js read these globals.
'use strict';

// TECH_DATA[eraId] = { branches: [4 branches], national: { TAG: { name, techs: [...] } } }
// branch = { id: 'mil'|'ind'|'trade'|'state', name, tiers: [t1, t2, [t3a, t3b], t4] }
// national techs: an array of 4 tiers; a tier that is a national choice is an array of two techs
const TECH_DATA = {

  // ================================================================ 431 BC
  'greece-431bc': {
    branches: [
      { id: 'mil', name: 'Military', tiers: [
        { id: 'mil1', name: 'Phalanx Drill', desc: 'Infantry +10% defence.', fx: [{ mod: 'defence', value: 0.10, cls: 'infantry' }] },
        { id: 'mil2', name: 'Bronze Panoply', desc: 'Heavy infantry +10% attack.', fx: [{ mod: 'attack', value: 0.10, unit: ['hoplites', 'spartans', 'immortals'] }] },
        [
          { id: 'mil3a', name: 'Light Troops', desc: 'Peltasts, archers and slingers +15% attack and +1 km/h.', fx: [{ mod: 'attack', value: 0.15, unit: ['peltasts', 'archers'] }, { mod: 'speed', value: 0.20, unit: ['peltasts', 'archers'] }] },
          { id: 'mil3b', name: 'Deep Phalanx', desc: 'Heavy infantry +15% defence.', fx: [{ mod: 'defence', value: 0.15, unit: ['hoplites', 'spartans', 'immortals'] }] }
        ],
        { id: 'mil4', name: 'Siegecraft', desc: '+25% attack against cities and faster capture (in game: +25% attack in urban provinces).', fx: [{ mod: 'attack', value: 0.25, terrain: ['urban'] }] }
      ] },
      { id: 'ind', name: 'Industry', tiers: [
        { id: 'ind1', name: 'Iron Tools', desc: 'Farms +15%.', fx: [{ mod: 'farms', value: 0.15 }] },
        { id: 'ind2', name: 'Bronze Casting', desc: 'Arsenals use 20% less tin.', fx: [{ mod: 'arsenalInputs', value: -0.20, good: 'strategic' }] },
        [
          { id: 'ind3a', name: 'Silver Mining', desc: 'Mines on silver deposits also make Luxuries (in game: Luxuries +20%).', fx: [{ mod: 'luxuries', value: 0.20 }] },
          { id: 'ind3b', name: 'Charcoal Kilns', desc: 'Fuel works +30%.', fx: [{ mod: 'fuelworks', value: 0.30 }] }
        ],
        { id: 'ind4', name: 'Terracing', desc: 'Farms on hills and mountains +50%.', fx: [{ mod: 'farms', value: 0.50, terrain: ['hills', 'mountains'] }] }
      ] },
      { id: 'trade', name: 'Trade', tiers: [
        { id: 'trade1', name: 'Coinage', desc: 'Tax +10%.', fx: [{ mod: 'tax', value: 0.10 }] },
        { id: 'trade2', name: 'Emporia', desc: '+1 trade slot.', fx: [{ mod: 'tradeSlots', value: 1 }] },
        [
          { id: 'trade3a', name: 'Maritime League', desc: 'Sea deals +10% trade bonus (in game: +10% trade bonus).', fx: [{ mod: 'tradeBonus', value: 0.10 }] },
          { id: 'trade3b', name: 'Caravan Roads', desc: 'Land deals +10% trade bonus (in game: +10% trade bonus).', fx: [{ mod: 'tradeBonus', value: 0.10 }] }
        ],
        { id: 'trade4', name: 'Grain Fleets', desc: 'Stockpiles hold 30 more days.', fx: [{ mod: 'stockDays', value: 30 }] }
      ] },
      { id: 'state', name: 'Statecraft', tiers: [
        { id: 'state1', name: 'Written Law', desc: 'Stability +5%.', fx: [{ mod: 'stability', value: 0.05 }] },
        { id: 'state2', name: 'Colonies', desc: 'Manpower growth +15%.', fx: [{ mod: 'manpower', value: 0.15 }] },
        [
          { id: 'state3a', name: 'Tribute League', desc: 'Gold from allies in your faction (in game: +1 gold per day per faction member).', fx: [{ mod: 'factionGold', value: 1 }] },
          { id: 'state3b', name: 'Citizen Levy', desc: 'Manpower +20%, war support +10%.', fx: [{ mod: 'manpower', value: 0.20 }, { mod: 'warSupport', value: 0.10 }] }
        ],
        { id: 'state4', name: 'Sacred Truce', desc: 'Relations grow 50% faster.', fx: [{ mod: 'relGrowth', value: 0.50 }] }
      ] }
    ],
    national: {
      SPA: { name: 'Sparta', techs: [
        { id: 'spa1', name: 'Agoge', desc: 'Spartan hoplites +15% attack and defence.', fx: [{ mod: 'attack', value: 0.15, unit: ['spartans'] }, { mod: 'defence', value: 0.15, unit: ['spartans'] }] },
        { id: 'spa2', name: 'Helot Farms', desc: 'Farms +30%, stability -5%.', fx: [{ mod: 'farms', value: 0.30 }, { mod: 'stability', value: -0.05 }] },
        { id: 'spa3', name: 'Krypteia', desc: 'Stability +10% in home provinces (in game: stability +10%).', fx: [{ mod: 'stability', value: 0.10 }] },
        { id: 'spa4', name: 'Lycurgan Law', desc: 'War support +20%, upkeep -15%.', fx: [{ mod: 'warSupport', value: 0.20 }, { mod: 'upkeep', value: -0.15 }] }
      ] },
      ATH: { name: 'Athens', techs: [
        { id: 'ath1', name: 'Laurion Silver', desc: 'Laurion mines make Luxuries and gold (in game: Luxuries +50% in Attica, +1 gold per day).', fx: [{ mod: 'luxuries', value: 0.50, region: [23.3, 37.5, 24.4, 38.4] }, { mod: 'goldPerDay', value: 1 }] },
        { id: 'ath2', name: 'Delian Treasury', desc: '+1 gold per day from each faction member.', fx: [{ mod: 'factionGold', value: 1 }] },
        { id: 'ath3', name: 'Long Walls', desc: 'The capital cannot be starved: food shortages there are halved while sea trade is open (in game: food need -15%, stockpiles +15 days).', fx: [{ mod: 'foodNeed', value: -0.15 }, { mod: 'stockDays', value: 15 }] },
        { id: 'ath4', name: 'Piraeus Harbour', desc: '+2 trade slots.', fx: [{ mod: 'tradeSlots', value: 2 }] }
      ] },
      PER: { name: 'Achaemenid Persia', techs: [
        { id: 'per1', name: 'Royal Road', desc: '+20% speed and supply in your own land.', fx: [{ mod: 'speed', value: 0.20, where: 'home' }, { mod: 'supply', value: 0.20, where: 'home' }] },
        { id: 'per2', name: 'Satrapies', desc: 'Tax +15%.', fx: [{ mod: 'tax', value: 0.15 }] },
        { id: 'per3', name: 'Gold Darics', desc: '+10% trade bonus.', fx: [{ mod: 'tradeBonus', value: 0.10 }] },
        { id: 'per4', name: 'The Immortals', desc: 'Immortals +20% organisation.', fx: [{ mod: 'org', value: 0.20, unit: ['immortals'] }] }
      ] },
      CAR: { name: 'Carthage', techs: [
        { id: 'car1', name: 'Tin Routes', desc: 'Tin deposits in Iberia and Britain can trade with you from any coast (in game: +1 trade slot, tin works +20%).', fx: [{ mod: 'tradeSlots', value: 1 }, { mod: 'stratworks', value: 0.20 }] },
        { id: 'car2', name: 'Tyrian Purple', desc: 'Workshops +25%.', fx: [{ mod: 'workshops', value: 0.25 }] },
        { id: 'car3', name: 'Mercenary Contracts', desc: 'Hire units with gold instead of manpower (in game: manpower cost -30%, upkeep +10%).', fx: [{ mod: 'recruitCost', value: -0.30 }, { mod: 'upkeep', value: 0.10 }] },
        { id: 'car4', name: 'Cothon Harbour', desc: '+2 trade slots.', fx: [{ mod: 'tradeSlots', value: 2 }] }
      ] },
      ROM: { name: 'Roman Republic', techs: [
        { id: 'rom1', name: 'Twelve Tables', desc: 'Stability +10%.', fx: [{ mod: 'stability', value: 0.10 }] },
        { id: 'rom2', name: 'Latin League', desc: 'Manpower +20%.', fx: [{ mod: 'manpower', value: 0.20 }] },
        { id: 'rom3', name: 'Manipular Legion', desc: 'Infantry +10% attack.', fx: [{ mod: 'attack', value: 0.10, cls: 'infantry' }] },
        { id: 'rom4', name: 'Via Appia', desc: 'Available from 312 BC: +20% supply and speed at home.', fx: [{ mod: 'supply', value: 0.20, where: 'home' }, { mod: 'speed', value: 0.20, where: 'home' }], from: [-311, 1, 1] }
      ] },
      MAG: { name: 'Magadha', techs: [
        { id: 'mag1', name: 'Iron Ploughs of the Ganges', desc: 'Farms +25%.', fx: [{ mod: 'farms', value: 0.25 }] },
        { id: 'mag2', name: 'Punch-marked Coins', desc: 'Tax +10%.', fx: [{ mod: 'tax', value: 0.10 }] },
        { id: 'mag3', name: 'Elephant Corps', desc: 'War elephants +20% attack.', fx: [{ mod: 'attack', value: 0.20, unit: ['elephants'] }] },
        { id: 'mag4', name: 'Rajagriha Walls', desc: 'Capital defence +30%.', fx: [{ mod: 'defence', value: 0.30, where: 'capital' }] }
      ] },
      JIN: { name: 'Jin', techs: [
        { id: 'jin1', name: 'Cast Iron Foundries', desc: 'Mines +30%.', fx: [{ mod: 'mines', value: 0.30 }] },
        { id: 'jin2', name: 'Crossbow Workshops', desc: 'Crossbowmen +15% attack.', fx: [{ mod: 'attack', value: 0.15, unit: ['crossbowmen'] }] },
        { id: 'jin3', name: 'Legalist Reforms', desc: 'Tax +15%, stability -5%.', fx: [{ mod: 'tax', value: 0.15 }, { mod: 'stability', value: -0.05 }] },
        { id: 'jin4', name: 'Chariot Nobility', desc: 'Chariots +15% attack.', fx: [{ mod: 'attack', value: 0.15, unit: ['chariots'] }] }
      ] },
      CHU: { name: 'Chu', techs: [
        { id: 'chu1', name: 'Rice Paddies', desc: 'Farms on river and plains +25%.', fx: [{ mod: 'farms', value: 0.25, terrain: ['plains', 'marsh'] }] },
        { id: 'chu2', name: 'Southern Bronze', desc: 'Arsenals +20%.', fx: [{ mod: 'arsenals', value: 0.20 }] },
        { id: 'chu3', name: 'Square Wall', desc: 'Border provinces +20% defence.', fx: [{ mod: 'defence', value: 0.20, where: 'border' }] },
        { id: 'chu4', name: 'Court of Ying', desc: 'Research +10%.', fx: [{ mod: 'research', value: 0.10 }] }
      ] }
    }
  },

  // ================================================================ 117 AD
  'rome-117': {
    branches: [
      { id: 'mil', name: 'Military', tiers: [
        { id: 'mil1', name: 'Professional Army', desc: 'Organisation +10%.', fx: [{ mod: 'org', value: 0.10 }] },
        { id: 'mil2', name: 'Fortified Camps', desc: 'Faster organisation recovery, defence +10%.', fx: [{ mod: 'org', value: 0.05 }, { mod: 'defence', value: 0.10 }] },
        [
          { id: 'mil3a', name: 'Cavalry Alae', desc: 'Cavalry +15% attack.', fx: [{ mod: 'attack', value: 0.15, cls: 'cavalry' }] },
          { id: 'mil3b', name: 'Siege Train', desc: 'Siege engines +20% attack.', fx: [{ mod: 'attack', value: 0.20, unit: ['siege'] }] }
        ],
        { id: 'mil4', name: 'Frontier Forts', desc: 'Defence +20% in your own border provinces.', fx: [{ mod: 'defence', value: 0.20, where: 'border' }] }
      ] },
      { id: 'ind', name: 'Industry', tiers: [
        { id: 'ind1', name: 'Water Mills', desc: 'Farms +15%.', fx: [{ mod: 'farms', value: 0.15 }] },
        { id: 'ind2', name: 'State Workshops', desc: 'Arsenals +15%.', fx: [{ mod: 'arsenals', value: 0.15 }] },
        [
          { id: 'ind3a', name: 'Deep Mining', desc: 'Mines +30%.', fx: [{ mod: 'mines', value: 0.30 }] },
          { id: 'ind3b', name: 'Managed Forests', desc: 'Fuel works +30%.', fx: [{ mod: 'fuelworks', value: 0.30 }] }
        ],
        { id: 'ind4', name: 'Concrete', desc: 'Construction +30%.', fx: [{ mod: 'construction', value: 0.30 }] }
      ] },
      { id: 'trade', name: 'Trade', tiers: [
        { id: 'trade1', name: 'Silver Coinage', desc: 'Tax +10%.', fx: [{ mod: 'tax', value: 0.10 }] },
        { id: 'trade2', name: 'Paved Roads', desc: 'Supply +10%, land deals +1 slot.', fx: [{ mod: 'supply', value: 0.10 }, { mod: 'tradeSlots', value: 1 }] },
        [
          { id: 'trade3a', name: 'Silk Road', desc: 'Luxuries sell for 20% more.', fx: [{ mod: 'sellPrice', value: 0.20, good: 'luxuries' }] },
          { id: 'trade3b', name: 'Monsoon Trade', desc: 'Sea deals reach India and Africa, +10% trade bonus.', fx: [{ mod: 'tradeBonus', value: 0.10 }] }
        ],
        { id: 'trade4', name: 'Grain Dole', desc: 'Food shortages in the capital cause no unrest (in game: stability +5%, food need -5%).', fx: [{ mod: 'stability', value: 0.05 }, { mod: 'foodNeed', value: -0.05 }] }
      ] },
      { id: 'state', name: 'Statecraft', tiers: [
        { id: 'state1', name: 'Census', desc: 'Tax and manpower +5%.', fx: [{ mod: 'tax', value: 0.05 }, { mod: 'manpower', value: 0.05 }] },
        { id: 'state2', name: 'Provincial Governors', desc: 'Occupied provinces produce 75% instead of 50%.', fx: [{ mod: 'occupied', value: 0.25 }] },
        [
          { id: 'state3a', name: 'Citizenship Grants', desc: 'Manpower from conquered provinces +30% (in game: manpower +10%, occupied output +10%).', fx: [{ mod: 'manpower', value: 0.10 }, { mod: 'occupied', value: 0.10 }] },
          { id: 'state3b', name: 'Client Kings', desc: 'Relations with neighbours +20 (in game: relations grow 30% faster).', fx: [{ mod: 'relGrowth', value: 0.30 }] }
        ],
        { id: 'state4', name: 'Imperial Cult', desc: 'Stability +10%.', fx: [{ mod: 'stability', value: 0.10 }] }
      ] }
    ],
    national: {
      ROM: { name: 'Roman Empire', techs: [
        { id: 'rom1', name: 'Egyptian Grain Fleet', desc: 'Food from Egyptian provinces +50%.', fx: [{ mod: 'farms', value: 0.50, region: [24, 22, 36, 32] }] },
        { id: 'rom2', name: 'Dacian Gold', desc: 'Dacian mines give gold (in game: Luxuries +50% in Dacia, +1 gold per day).', fx: [{ mod: 'luxuries', value: 0.50, region: [21, 44.5, 27, 48.5] }, { mod: 'goldPerDay', value: 1 }] },
        { id: 'rom3', name: 'Via Traiana', desc: 'Supply +15%.', fx: [{ mod: 'supply', value: 0.15 }] },
        { id: 'rom4', name: 'Praetorian Guard', desc: 'Legionaries +10% organisation.', fx: [{ mod: 'org', value: 0.10, unit: ['legionaries'] }] }
      ] },
      PAR: { name: 'Parthian Empire', techs: [
        { id: 'par1', name: 'Cataphract Stables', desc: 'Horses +30%.', fx: [{ mod: 'strategic', value: 0.30 }] },
        { id: 'par2', name: 'Silk Road Middlemen', desc: '+15% trade bonus on land deals (in game: +15% trade bonus).', fx: [{ mod: 'tradeBonus', value: 0.15 }] },
        { id: 'par3', name: 'Great Houses', desc: 'Manpower +20%.', fx: [{ mod: 'manpower', value: 0.20 }] },
        { id: 'par4', name: 'Parthian Shot', desc: 'Horse archers +20% attack.', fx: [{ mod: 'attack', value: 0.20, unit: ['horsearchers'] }] }
      ] },
      ARM: { name: 'Armenia', techs: [
        { id: 'arm1', name: 'Mountain Fortresses', desc: 'Mountain defence +25%.', fx: [{ mod: 'defence', value: 0.25, terrain: ['mountains'] }] },
        { id: 'arm2', name: 'Buffer Diplomacy', desc: 'Relations with Rome and Parthia drift up (in game: relations grow 20% faster).', fx: [{ mod: 'relGrowth', value: 0.20 }] },
        { id: 'arm3', name: 'Arsacid Kin', desc: 'Relations with Parthia +30 (in game: relations grow 30% faster, stability +5%).', fx: [{ mod: 'relGrowth', value: 0.30 }, { mod: 'stability', value: 0.05 }] },
        { id: 'arm4', name: 'Highland Horse', desc: 'Cavalry +15%.', fx: [{ mod: 'attack', value: 0.15, cls: 'cavalry' }] }
      ] },
      KUS: { name: 'Kushan Empire', techs: [
        { id: 'kus1', name: 'Silk Road Crossroads', desc: '+2 land trade slots.', fx: [{ mod: 'tradeSlots', value: 2 }] },
        { id: 'kus2', name: 'Gandharan Workshops', desc: 'Workshops +30%.', fx: [{ mod: 'workshops', value: 0.30 }] },
        { id: 'kus3', name: 'Kushan Gold Coinage', desc: 'Tax +15%.', fx: [{ mod: 'tax', value: 0.15 }] },
        { id: 'kus4', name: 'Buddhist Councils', desc: 'Stability +10%.', fx: [{ mod: 'stability', value: 0.10 }] }
      ] },
      SAT: { name: 'Satavahana Empire', techs: [
        { id: 'sat1', name: 'Deccan Ports', desc: '+2 sea trade slots.', fx: [{ mod: 'tradeSlots', value: 2 }] },
        { id: 'sat2', name: 'Monsoon Fleets', desc: 'Trade bonus +10%.', fx: [{ mod: 'tradeBonus', value: 0.10 }] },
        { id: 'sat3', name: 'Rock-cut Monasteries', desc: 'Stability +10%.', fx: [{ mod: 'stability', value: 0.10 }] },
        { id: 'sat4', name: 'Elephant Corps', desc: 'War elephants +20% attack.', fx: [{ mod: 'attack', value: 0.20, unit: ['elephants'] }] }
      ] },
      HAN: { name: 'Han Dynasty', techs: [
        { id: 'han1', name: 'Salt and Iron Monopoly', desc: 'Mines +20%, tax +10%.', fx: [{ mod: 'mines', value: 0.20 }, { mod: 'tax', value: 0.10 }] },
        { id: 'han2', name: 'Military Farms', desc: 'Farms in border provinces +40%.', fx: [{ mod: 'farms', value: 0.40, where: 'border' }] },
        { id: 'han3', name: 'Paper', desc: 'Available from 105 AD: research +15%.', fx: [{ mod: 'research', value: 0.15 }], from: [105, 1, 1] },
        { id: 'han4', name: 'Mass Crossbows', desc: 'Crossbowmen +20% attack.', fx: [{ mod: 'attack', value: 0.20, unit: ['crossbowmen'] }] }
      ] }
    }
  },

  // ================================================================ 1200
  'medieval-1200': {
    branches: [
      { id: 'mil', name: 'Military', tiers: [
        { id: 'mil1', name: 'Feudal Levy', desc: 'Manpower +15%.', fx: [{ mod: 'manpower', value: 0.15 }] },
        { id: 'mil2', name: 'Stone Castles', desc: 'Defence +20% in your provinces.', fx: [{ mod: 'defence', value: 0.20, where: 'home' }] },
        [
          { id: 'mil3a', name: 'Heavy Cavalry', desc: 'Knights and heavy horse +15% attack.', fx: [{ mod: 'attack', value: 0.15, cls: 'armor' }] },
          { id: 'mil3b', name: 'Professional Infantry', desc: 'Men-at-arms and crossbowmen +15% defence.', fx: [{ mod: 'defence', value: 0.15, unit: ['menatarms', 'crossbowmen', 'varangians'] }] }
        ],
        { id: 'mil4', name: 'Counterweight Trebuchet', desc: 'Trebuchets +25% attack.', fx: [{ mod: 'attack', value: 0.25, unit: ['trebuchets'] }] }
      ] },
      { id: 'ind', name: 'Industry', tiers: [
        { id: 'ind1', name: 'Heavy Plough', desc: 'Farms +15%.', fx: [{ mod: 'farms', value: 0.15 }] },
        { id: 'ind2', name: 'Water and Windmills', desc: 'Workshops +20%.', fx: [{ mod: 'workshops', value: 0.20 }] },
        [
          { id: 'ind3a', name: 'Guilds', desc: 'Luxuries and construction +20%.', fx: [{ mod: 'luxuries', value: 0.20 }, { mod: 'construction', value: 0.20 }] },
          { id: 'ind3b', name: 'Bloomery Iron', desc: 'Mines +30%.', fx: [{ mod: 'mines', value: 0.30 }] }
        ],
        { id: 'ind4', name: 'Three-Field Rotation', desc: 'Farms +20%.', fx: [{ mod: 'farms', value: 0.20 }] }
      ] },
      { id: 'trade', name: 'Trade', tiers: [
        { id: 'trade1', name: 'Charter Fairs', desc: '+1 trade slot.', fx: [{ mod: 'tradeSlots', value: 1 }] },
        { id: 'trade2', name: 'Bills of Exchange', desc: 'Trade bonus +10%.', fx: [{ mod: 'tradeBonus', value: 0.10 }] },
        [
          { id: 'trade3a', name: 'Maritime Republics', desc: '+2 sea trade slots.', fx: [{ mod: 'tradeSlots', value: 2 }] },
          { id: 'trade3b', name: 'Caravanserais', desc: '+2 land trade slots.', fx: [{ mod: 'tradeSlots', value: 2 }] }
        ],
        { id: 'trade4', name: 'Merchant Leagues', desc: 'The world market pays 70% instead of 50%.', fx: [{ mod: 'worldMarket', value: 0.20 }] }
      ] },
      { id: 'state', name: 'Statecraft', tiers: [
        { id: 'state1', name: 'Royal Charters', desc: 'Tax +10%.', fx: [{ mod: 'tax', value: 0.10 }] },
        { id: 'state2', name: 'Chancery', desc: 'Political power +15%.', fx: [{ mod: 'pp', value: 0.15 }] },
        [
          { id: 'state3a', name: 'Crusading Zeal', desc: 'War support +15%, manpower +10%.', fx: [{ mod: 'warSupport', value: 0.15 }, { mod: 'manpower', value: 0.10 }] },
          { id: 'state3b', name: 'Universities', desc: 'Research +15%.', fx: [{ mod: 'research', value: 0.15 }] }
        ],
        { id: 'state4', name: 'Codified Law', desc: 'Stability +10%.', fx: [{ mod: 'stability', value: 0.10 }] }
      ] }
    ],
    national: {
      ENG: { name: 'England', techs: [
        { id: 'eng1', name: 'Exchequer', desc: 'Tax +15%.', fx: [{ mod: 'tax', value: 0.15 }] },
        { id: 'eng2', name: 'Wool Staple', desc: 'Wool is a Luxury, +20% price when sold to Flanders or France (in game: Luxuries +10%, Luxuries sell for 20% more).', fx: [{ mod: 'luxuries', value: 0.10 }, { mod: 'sellPrice', value: 0.20, good: 'luxuries' }] },
        { id: 'eng3', name: 'Welsh Bowmen', desc: 'Archers +20% attack.', fx: [{ mod: 'attack', value: 0.20, unit: ['archers'] }] },
        { id: 'eng4', name: 'Angevin Domains', desc: 'French provinces +20% stability.', fx: [{ mod: 'stability', value: 0.20, region: [-5, 42.5, 8, 51] }] }
      ] },
      FRA: { name: 'France', techs: [
        { id: 'fra1', name: 'Royal Demesne', desc: 'Tax +10%.', fx: [{ mod: 'tax', value: 0.10 }] },
        { id: 'fra2', name: 'University of Paris', desc: 'Chartered 1200: research +15%.', fx: [{ mod: 'research', value: 0.15 }], from: [1200, 1, 1] },
        { id: 'fra3', name: 'Oriflamme', desc: 'War support +15%.', fx: [{ mod: 'warSupport', value: 0.15 }] },
        { id: 'fra4', name: 'Gothic Cathedrals', desc: 'Stability +10%.', fx: [{ mod: 'stability', value: 0.10 }] }
      ] },
      HRE: { name: 'Holy Roman Empire', techs: [
        { id: 'hre1', name: 'Imperial Diets', desc: 'Political power +20%.', fx: [{ mod: 'pp', value: 0.20 }] },
        { id: 'hre2', name: 'Rammelsberg Silver', desc: 'Mines give gold (in game: +1 gold per day, Luxuries +50% in the Harz).', fx: [{ mod: 'goldPerDay', value: 1 }, { mod: 'luxuries', value: 0.50, region: [9.5, 51, 12, 52.5] }] },
        { id: 'hre3', name: 'Ministeriales', desc: 'Knights +10% organisation.', fx: [{ mod: 'org', value: 0.10, unit: ['knights'] }] },
        { id: 'hre4', name: 'Eastward Settlement', desc: 'Farms in eastern provinces +30%.', fx: [{ mod: 'farms', value: 0.30, region: [12, 47, 24, 56] }] }
      ] },
      SIC: { name: 'Sicily', techs: [
        { id: 'sic1', name: 'Norman-Arab Administration', desc: 'Tax +15%.', fx: [{ mod: 'tax', value: 0.15 }] },
        { id: 'sic2', name: 'Palermo Silk', desc: 'Workshops +30%.', fx: [{ mod: 'workshops', value: 0.30 }] },
        { id: 'sic3', name: 'Granary of Italy', desc: 'Farms +25%.', fx: [{ mod: 'farms', value: 0.25 }] },
        { id: 'sic4', name: 'Court of Palermo', desc: 'Research +15%.', fx: [{ mod: 'research', value: 0.15 }] }
      ] },
      CAS: { name: 'Castile', techs: [
        { id: 'cas1', name: 'Reconquista', desc: '+20% attack against Almohads (in game: +20% attack in southern Iberia and the Maghreb).', fx: [{ mod: 'attack', value: 0.20, region: [-10, 30, 0, 39.5] }] },
        { id: 'cas2', name: 'Mesta Sheep', desc: 'Luxuries +25%.', fx: [{ mod: 'luxuries', value: 0.25 }] },
        { id: 'cas3', name: 'Military Orders', desc: 'Military Orders +15%.', fx: [{ mod: 'attack', value: 0.15, unit: ['orders'] }] },
        { id: 'cas4', name: 'Toledo Translators', desc: 'Research +15%.', fx: [{ mod: 'research', value: 0.15 }] }
      ] },
      ALM: { name: 'Almohad Caliphate', techs: [
        { id: 'alm1', name: 'Almohad Doctrine', desc: 'Stability +10%.', fx: [{ mod: 'stability', value: 0.10 }] },
        { id: 'alm2', name: 'Saharan Gold', desc: '+gold from southern deals (in game: +1.5 gold per day).', fx: [{ mod: 'goldPerDay', value: 1.5 }] },
        { id: 'alm3', name: 'Andalusi Workshops', desc: 'Workshops +25%.', fx: [{ mod: 'workshops', value: 0.25 }] },
        { id: 'alm4', name: 'Berber Horse', desc: 'Light cavalry +15%.', fx: [{ mod: 'attack', value: 0.15, unit: ['lightcav'] }] }
      ] },
      HUN: { name: 'Hungary', techs: [
        { id: 'hun1', name: 'Transylvanian Salt and Gold', desc: 'Mines give gold (in game: +1 gold per day, Luxuries +50% in Transylvania).', fx: [{ mod: 'goldPerDay', value: 1 }, { mod: 'luxuries', value: 0.50, region: [21.5, 45.3, 26, 48] }] },
        { id: 'hun2', name: 'Royal Counties', desc: 'Tax +10%.', fx: [{ mod: 'tax', value: 0.10 }] },
        { id: 'hun3', name: 'Saxon Miners', desc: 'Mines +25%.', fx: [{ mod: 'mines', value: 0.25 }] },
        { id: 'hun4', name: 'Steppe Horses', desc: 'Horses +30%.', fx: [{ mod: 'strategic', value: 0.30 }] }
      ] },
      BYZ: { name: 'Byzantine Empire', techs: [
        { id: 'byz1', name: 'Greek Fire', desc: 'Marines +20%.', fx: [{ mod: 'attack', value: 0.20, cls: 'marines' }] },
        { id: 'byz2', name: 'Golden Bezant', desc: 'Trade bonus +15%.', fx: [{ mod: 'tradeBonus', value: 0.15 }] },
        { id: 'byz3', name: 'Silk of Constantinople', desc: 'Workshops +30%.', fx: [{ mod: 'workshops', value: 0.30 }] },
        { id: 'byz4', name: 'Pronoia Grants', desc: 'Manpower +20%, stability -5%.', fx: [{ mod: 'manpower', value: 0.20 }, { mod: 'stability', value: -0.05 }] }
      ] },
      RUM: { name: 'Sultanate of Rum', techs: [
        { id: 'rum1', name: 'Caravanserai Network', desc: '+2 land trade slots.', fx: [{ mod: 'tradeSlots', value: 2 }] },
        { id: 'rum2', name: 'Ghulam Guard', desc: 'Cavalry +10% organisation.', fx: [{ mod: 'org', value: 0.10, unit: ['mamluks', 'horsearchers', 'lightcav'] }] },
        { id: 'rum3', name: 'Anatolian Horse', desc: 'Horses +25%.', fx: [{ mod: 'strategic', value: 0.25 }] },
        { id: 'rum4', name: 'Court of Konya', desc: 'Research +10%.', fx: [{ mod: 'research', value: 0.10 }] }
      ] },
      AYY: { name: 'Ayyubid Sultanate', techs: [
        { id: 'ayy1', name: 'Legacy of Saladin', desc: 'Stability +10%.', fx: [{ mod: 'stability', value: 0.10 }] },
        { id: 'ayy2', name: 'Mamluk Regiments', desc: 'Mamluks +15%.', fx: [{ mod: 'attack', value: 0.15, unit: ['mamluks'] }] },
        { id: 'ayy3', name: 'Nile Grain', desc: 'Farms in Egypt +30%.', fx: [{ mod: 'farms', value: 0.30, region: [24, 22, 36, 32] }] },
        { id: 'ayy4', name: 'Red Sea Spices', desc: 'Luxuries sell for 25% more.', fx: [{ mod: 'sellPrice', value: 0.25, good: 'luxuries' }] }
      ] },
      KHW: { name: 'Khwarazmian Empire', techs: [
        { id: 'khw1', name: 'Oasis Irrigation', desc: 'Farms +20%.', fx: [{ mod: 'farms', value: 0.20 }] },
        { id: 'khw2', name: 'Kipchak Mercenaries', desc: 'Hire cavalry with gold (in game: cavalry manpower cost -30%).', fx: [{ mod: 'recruitCost', value: -0.30, cls: 'cavalry' }] },
        { id: 'khw3', name: 'Samarkand Paper', desc: 'Research +10%.', fx: [{ mod: 'research', value: 0.10 }] },
        { id: 'khw4', name: 'Shah\'s Treasury', desc: 'Tax +15%.', fx: [{ mod: 'tax', value: 0.15 }] }
      ] },
      GHU: { name: 'Ghurid Empire', techs: [
        { id: 'ghu1', name: 'Mountain Passes', desc: 'Mountain defence +20%.', fx: [{ mod: 'defence', value: 0.20, terrain: ['mountains'] }] },
        { id: 'ghu2', name: 'Turkic Slave Generals', desc: 'Commander skill +1.', fx: [{ mod: 'commander', value: 1 }] },
        { id: 'ghu3', name: 'Riches of Hindustan', desc: 'Gold from conquered Indian provinces (in game: occupied provinces in India produce 25% more).', fx: [{ mod: 'occupied', value: 0.25, region: [66, 8, 92, 34] }] },
        { id: 'ghu4', name: 'Firuzkuh Minaret', desc: 'Stability +10%.', fx: [{ mod: 'stability', value: 0.10 }] }
      ] },
      QAR: { name: 'Qara Khitai', techs: [
        { id: 'qar1', name: 'Tolerant Rule', desc: 'Stability +10% in conquered provinces (in game: stability +5%, occupied output +10%).', fx: [{ mod: 'stability', value: 0.05 }, { mod: 'occupied', value: 0.10 }] },
        { id: 'qar2', name: 'Silk Road Tolls', desc: '+gold per land deal crossing your land (in game: +10% trade bonus).', fx: [{ mod: 'tradeBonus', value: 0.10 }] },
        { id: 'qar3', name: 'Sogdian Merchants', desc: 'Trade bonus +15%.', fx: [{ mod: 'tradeBonus', value: 0.15 }] },
        { id: 'qar4', name: 'Khitan Cavalry', desc: 'Horse archers +15%.', fx: [{ mod: 'attack', value: 0.15, unit: ['horsearchers'] }] }
      ] },
      JIN: { name: 'Jin Dynasty', techs: [
        { id: 'jin1', name: 'Military Households', desc: 'Manpower +20%.', fx: [{ mod: 'manpower', value: 0.20 }] },
        { id: 'jin2', name: 'Paper Money', desc: 'Tax +20%, stability -5%.', fx: [{ mod: 'tax', value: 0.20 }, { mod: 'stability', value: -0.05 }] },
        { id: 'jin3', name: 'Northern Iron', desc: 'Mines +25%.', fx: [{ mod: 'mines', value: 0.25 }] },
        { id: 'jin4', name: 'Thunder-crash Bombs', desc: 'Available from 1221: siege +25%.', fx: [{ mod: 'attack', value: 0.25, unit: ['trebuchets'] }], from: [1221, 1, 1] }
      ] },
      SNG: { name: 'Southern Song', techs: [
        { id: 'sng1', name: 'Champa Rice', desc: 'Farms +25%.', fx: [{ mod: 'farms', value: 0.25 }] },
        { id: 'sng2', name: 'Paper Money', desc: 'Tax +20%, stability -5%.', fx: [{ mod: 'tax', value: 0.20 }, { mod: 'stability', value: -0.05 }] },
        { id: 'sng3', name: 'Quanzhou Harbour', desc: '+2 sea trade slots.', fx: [{ mod: 'tradeSlots', value: 2 }] },
        { id: 'sng4', name: 'Fire Lances', desc: 'Crossbowmen +15% attack.', fx: [{ mod: 'attack', value: 0.15, unit: ['crossbowmen'] }] }
      ] },
      XIX: { name: 'Western Xia', techs: [
        { id: 'xix1', name: 'Tangut Script', desc: 'Research +10%.', fx: [{ mod: 'research', value: 0.10 }] },
        { id: 'xix2', name: 'Iron Sparrowhawks', desc: 'Heavy cavalry +20%.', fx: [{ mod: 'attack', value: 0.20, cls: 'cavalry' }] },
        { id: 'xix3', name: 'Hexi Corridor Tolls', desc: 'Gold per Silk Road deal (in game: +10% trade bonus).', fx: [{ mod: 'tradeBonus', value: 0.10 }] },
        { id: 'xix4', name: 'Buddhist Printing', desc: 'Stability +10%.', fx: [{ mod: 'stability', value: 0.10 }] }
      ] },
      KAM: { name: 'Kamakura Shogunate', techs: [
        { id: 'kam1', name: 'Gokenin Vassals', desc: 'Manpower +15%.', fx: [{ mod: 'manpower', value: 0.15 }] },
        { id: 'kam2', name: 'Tatara Steel', desc: 'Arsenals +25%.', fx: [{ mod: 'arsenals', value: 0.25 }] },
        { id: 'kam3', name: 'Shoen Estates', desc: 'Farms +20%.', fx: [{ mod: 'farms', value: 0.20 }] },
        { id: 'kam4', name: 'Coastal Walls', desc: 'Coastal defence +30%.', fx: [{ mod: 'defence', value: 0.30, where: 'coast' }] }
      ] },
      KHM: { name: 'Khmer Empire', techs: [
        { id: 'khm1', name: 'Barays', desc: 'Farms +35%.', fx: [{ mod: 'farms', value: 0.35 }] },
        { id: 'khm2', name: 'Temples of Angkor', desc: 'Stability +15%.', fx: [{ mod: 'stability', value: 0.15 }] },
        { id: 'khm3', name: 'Elephant Corps', desc: 'War elephants +20%.', fx: [{ mod: 'attack', value: 0.20, unit: ['elephants'] }] },
        { id: 'khm4', name: 'Mekong Trade', desc: '+1 trade slot.', fx: [{ mod: 'tradeSlots', value: 1 }] }
      ] }
    }
  },

  // ================================================================ 1805
  'napoleonic-1805': {
    branches: [
      { id: 'mil', name: 'Military', tiers: [
        { id: 'mil1', name: 'Line Drill', desc: 'Infantry +10% defence.', fx: [{ mod: 'defence', value: 0.10, cls: 'infantry' }] },
        { id: 'mil2', name: 'Corps System', desc: 'Organisation +10%, speed +10%.', fx: [{ mod: 'org', value: 0.10 }, { mod: 'speed', value: 0.10 }] },
        [
          { id: 'mil3a', name: 'Grand Battery', desc: 'Artillery +20% attack.', fx: [{ mod: 'attack', value: 0.20, cls: 'artillery' }] },
          { id: 'mil3b', name: 'Skirmishers and Rifles', desc: 'Light infantry +20% attack.', fx: [{ mod: 'attack', value: 0.20, unit: ['light'] }] }
        ],
        { id: 'mil4', name: 'General Staff', desc: 'Commander skill +1, supply +10%.', fx: [{ mod: 'commander', value: 1 }, { mod: 'supply', value: 0.10 }] }
      ] },
      { id: 'ind', name: 'Industry', tiers: [
        { id: 'ind1', name: 'Crop Rotation', desc: 'Farms +20%.', fx: [{ mod: 'farms', value: 0.20 }] },
        { id: 'ind2', name: 'Coke Smelting', desc: 'Mines +20%, arsenals use 20% less fuel.', fx: [{ mod: 'mines', value: 0.20 }, { mod: 'arsenalInputs', value: -0.20, good: 'fuel' }] },
        [
          { id: 'ind3a', name: 'Steam Engines', desc: 'Workshops and construction +25%.', fx: [{ mod: 'workshops', value: 0.25 }, { mod: 'construction', value: 0.25 }] },
          { id: 'ind3b', name: 'Canals', desc: 'Construction +15%, supply +10%.', fx: [{ mod: 'construction', value: 0.15 }, { mod: 'supply', value: 0.10 }] }
        ],
        { id: 'ind4', name: 'Mechanised Textiles', desc: 'Luxuries +30%.', fx: [{ mod: 'luxuries', value: 0.30 }] }
      ] },
      { id: 'trade', name: 'Trade', tiers: [
        { id: 'trade1', name: 'Chartered Companies', desc: '+1 trade slot.', fx: [{ mod: 'tradeSlots', value: 1 }] },
        { id: 'trade2', name: 'National Bank', desc: 'Tax +10%, you can run a debt of 200 gold without penalty (in game: tax +10%, stability +2%).', fx: [{ mod: 'tax', value: 0.10 }, { mod: 'stability', value: 0.02 }] },
        [
          { id: 'trade3a', name: 'Free Trade', desc: 'Trade bonus +15%.', fx: [{ mod: 'tradeBonus', value: 0.15 }] },
          { id: 'trade3b', name: 'Protectionism', desc: 'All industries +10%, imports cost 10% more (in game: trade bonus -5%).', fx: [{ mod: 'industry', value: 0.10 }, { mod: 'tradeBonus', value: -0.05 }] }
        ],
        { id: 'trade4', name: 'Merchant Marine', desc: '+2 sea trade slots.', fx: [{ mod: 'tradeSlots', value: 2 }] }
      ] },
      { id: 'state', name: 'Statecraft', tiers: [
        { id: 'state1', name: 'Conscription', desc: 'Manpower +20%.', fx: [{ mod: 'manpower', value: 0.20 }] },
        { id: 'state2', name: 'Civil Code', desc: 'Stability +10%.', fx: [{ mod: 'stability', value: 0.10 }] },
        [
          { id: 'state3a', name: 'Enlightened Absolutism', desc: 'Political power +20%.', fx: [{ mod: 'pp', value: 0.20 }] },
          { id: 'state3b', name: 'Constitution', desc: 'Stability +10%, tax +10%.', fx: [{ mod: 'stability', value: 0.10 }, { mod: 'tax', value: 0.10 }] }
        ],
        { id: 'state4', name: 'Nationalism', desc: 'War support +15%.', fx: [{ mod: 'warSupport', value: 0.15 }] }
      ] }
    ],
    national: {
      FRA: { name: 'French Empire', techs: [
        { id: 'fra1', name: 'Levée en Masse', desc: 'Manpower +30%.', fx: [{ mod: 'manpower', value: 0.30 }] },
        { id: 'fra2', name: 'Napoleonic Code', desc: 'Stability +10%.', fx: [{ mod: 'stability', value: 0.10 }] },
        { id: 'fra3', name: 'Continental System', desc: 'Available from November 1806: an embargo on Britain that every faction member joins automatically (in game: all industries +5%, relations with your faction grow 20% faster).', fx: [{ mod: 'industry', value: 0.05 }, { mod: 'relGrowth', value: 0.20 }], from: [1806, 11, 21] },
        { id: 'fra4', name: 'Imperial Guard Reserve', desc: 'Imperial Guard +20%.', fx: [{ mod: 'attack', value: 0.20, unit: ['guard'] }] }
      ] },
      GBR: { name: 'United Kingdom', techs: [
        { id: 'gbr1', name: 'Industrial Revolution', desc: 'Workshops and arsenals +20%.', fx: [{ mod: 'workshops', value: 0.20 }, { mod: 'arsenals', value: 0.20 }] },
        { id: 'gbr2', name: 'Royal Navy Blockade', desc: 'Warships +15% in battle, raiders +30% against enemy convoys, +10% trade bonus.', fx: [{ mod: 'naval', value: 0.15 }, { mod: 'raiding', value: 0.30 }, { mod: 'tradeBonus', value: 0.10 }] },
        { id: 'gbr3', name: 'Subsidies', desc: 'Gold to allies raises their manpower (in game: relations grow 30% faster, +0.5 gold per day per faction member).', fx: [{ mod: 'relGrowth', value: 0.30 }, { mod: 'factionGold', value: 0.5 }] },
        { id: 'gbr4', name: 'Baker Rifles', desc: 'Light infantry +15%.', fx: [{ mod: 'attack', value: 0.15, unit: ['light'] }] }
      ] },
      EIC: { name: 'East India Company', techs: [
        { id: 'eic1', name: 'Bengal Saltpetre', desc: 'Saltpetre +50%.', fx: [{ mod: 'strategic', value: 0.50 }] },
        { id: 'eic2', name: 'Cotton and Indigo', desc: 'Luxuries +30%.', fx: [{ mod: 'luxuries', value: 0.30 }] },
        { id: 'eic3', name: 'Sepoy Regiments', desc: 'Sepoys +15%.', fx: [{ mod: 'attack', value: 0.15, unit: ['sepoys'] }] },
        { id: 'eic4', name: 'Three Presidencies', desc: 'Tax +15%.', fx: [{ mod: 'tax', value: 0.15 }] }
      ] },
      SPA: { name: 'Spain', techs: [
        { id: 'spa1', name: 'Silver of the Americas', desc: 'Gold +15%.', fx: [{ mod: 'tax', value: 0.15 }] },
        { id: 'spa2', name: 'Treasure Fleets', desc: '+2 sea trade slots.', fx: [{ mod: 'tradeSlots', value: 2 }] },
        { id: 'spa3', name: 'Guerrilla', desc: 'Available from 1808: defence +20% in occupied home provinces (in game: defence +20% at home).', fx: [{ mod: 'defence', value: 0.20, where: 'home' }], from: [1808, 5, 2] },
        { id: 'spa4', name: 'Juntas', desc: 'Stability +10% while at war.', fx: [{ mod: 'stability', value: 0.10, when: 'war' }] }
      ] },
      AUS: { name: 'Austrian Empire', techs: [
        { id: 'aus1', name: 'Military Frontier', desc: 'Manpower +15%.', fx: [{ mod: 'manpower', value: 0.15 }] },
        { id: 'aus2', name: 'Bohemian and Styrian Mines', desc: 'Mines +25%.', fx: [{ mod: 'mines', value: 0.25 }] },
        { id: 'aus3', name: 'Archduke Charles\'s Reforms', desc: 'Organisation +10%.', fx: [{ mod: 'org', value: 0.10 }] },
        { id: 'aus4', name: 'Landwehr', desc: 'Available from 1808: manpower +20%.', fx: [{ mod: 'manpower', value: 0.20 }], from: [1808, 6, 9] }
      ] },
      RUS: { name: 'Russian Empire', techs: [
        { id: 'rus1', name: 'Serf Levies', desc: 'Manpower +30%, stability -5%.', fx: [{ mod: 'manpower', value: 0.30 }, { mod: 'stability', value: -0.05 }] },
        { id: 'rus2', name: 'Tula Arms Works', desc: 'Arsenals +25%.', fx: [{ mod: 'arsenals', value: 0.25 }] },
        { id: 'rus3', name: 'Cossack Hosts', desc: 'Cossacks +20%.', fx: [{ mod: 'attack', value: 0.20, unit: ['cossacks'] }] },
        { id: 'rus4', name: 'Scorched Earth', desc: 'Enemies in your land lose 50% more supply (in game: defence +15% and supply +20% in your own land).', fx: [{ mod: 'defence', value: 0.15, where: 'home' }, { mod: 'supply', value: 0.20, where: 'home' }] }
      ] },
      PRU: { name: 'Prussia', techs: [
        { id: 'pru1', name: 'Silesian Mines', desc: 'Mines +25%.', fx: [{ mod: 'mines', value: 0.25 }] },
        { id: 'pru2', name: 'Scharnhorst Reforms', desc: 'Available from 1807: organisation +15%.', fx: [{ mod: 'org', value: 0.15 }], from: [1807, 7, 25] },
        { id: 'pru3', name: 'Krümper System', desc: 'Manpower +20%.', fx: [{ mod: 'manpower', value: 0.20 }] },
        { id: 'pru4', name: 'General Staff', desc: 'Commander skill +1.', fx: [{ mod: 'commander', value: 1 }] }
      ] },
      OTT: { name: 'Ottoman Empire', techs: [
        { id: 'ott1', name: 'Levant Trade', desc: '+1 trade slot.', fx: [{ mod: 'tradeSlots', value: 1 }] },
        { id: 'ott2', name: 'Timar Lands', desc: 'Manpower +15%.', fx: [{ mod: 'manpower', value: 0.15 }] },
        [
          { id: 'ott3a', name: 'Nizam-ı Cedid', desc: 'New army: line infantry +20%.', fx: [{ mod: 'attack', value: 0.20, unit: ['line'] }] },
          { id: 'ott3b', name: 'Janissary Corps', desc: 'Janissaries +20%, stability +10%.', fx: [{ mod: 'attack', value: 0.20, unit: ['janissaries'] }, { mod: 'stability', value: 0.10 }] }
        ],
        { id: 'ott4', name: 'Straits Tolls', desc: 'Gold from every Black Sea deal (in game: +2 gold per day).', fx: [{ mod: 'goldPerDay', value: 2 }] }
      ] },
      PER: { name: 'Qajar Persia', techs: [
        { id: 'per1', name: 'Horse Breeding', desc: 'Irregular Horse +20%.', fx: [{ mod: 'attack', value: 0.20, unit: ['irregcav'] }] },
        { id: 'per2', name: 'Silk of Gilan', desc: 'Luxuries +25%.', fx: [{ mod: 'luxuries', value: 0.25 }] },
        { id: 'per3', name: 'Caucasus Frontier', desc: 'Mountain defence +20%.', fx: [{ mod: 'defence', value: 0.20, terrain: ['mountains'] }] },
        { id: 'per4', name: 'Qajar Court', desc: 'Political power +15%.', fx: [{ mod: 'pp', value: 0.15 }] }
      ] },
      CHN: { name: 'Qing Empire', techs: [
        { id: 'chn1', name: 'Canton System', desc: 'Only 2 trade slots, but Luxuries sell for 50% more (in game: -1 trade slot).', fx: [{ mod: 'tradeSlots', value: -1 }, { mod: 'sellPrice', value: 0.50, good: 'luxuries' }] },
        { id: 'chn2', name: 'Porcelain and Tea', desc: 'Workshops +30%.', fx: [{ mod: 'workshops', value: 0.30 }] },
        { id: 'chn3', name: 'Grand Canal Grain', desc: 'Farms +20%, supply +10%.', fx: [{ mod: 'farms', value: 0.20 }, { mod: 'supply', value: 0.10 }] },
        { id: 'chn4', name: 'Banner Armies', desc: 'Organisation +10%.', fx: [{ mod: 'org', value: 0.10 }] }
      ] },
      JAP: { name: 'Tokugawa Japan', techs: [
        [
          { id: 'jap1a', name: 'Sakoku', desc: '1 trade slot, stability +15% (in game: -1 trade slot).', fx: [{ mod: 'tradeSlots', value: -1 }, { mod: 'stability', value: 0.15 }] },
          { id: 'jap1b', name: 'Dutch Learning', desc: 'Research +20% from the Dutch trade deal (in game: research +20%).', fx: [{ mod: 'research', value: 0.20 }] }
        ],
        { id: 'jap2', name: 'Samurai Domains', desc: 'Manpower +15%.', fx: [{ mod: 'manpower', value: 0.15 }] },
        { id: 'jap3', name: 'Rice Stipends', desc: 'Farms +20%.', fx: [{ mod: 'farms', value: 0.20 }] },
        { id: 'jap4', name: 'Osaka Rice Exchange', desc: 'Tax +15%.', fx: [{ mod: 'tax', value: 0.15 }] }
      ] },
      USA: { name: 'United States', techs: [
        { id: 'usa1', name: 'Cotton Gin', desc: 'Luxuries +30%.', fx: [{ mod: 'luxuries', value: 0.30 }] },
        { id: 'usa2', name: 'Western Lands', desc: 'Farms +25%.', fx: [{ mod: 'farms', value: 0.25 }] },
        { id: 'usa3', name: 'Embargo Act', desc: 'Available from 1807: an embargo that hurts the target twice as much and you half as much (in game: stockpiles hold 30 more days).', fx: [{ mod: 'stockDays', value: 30 }], from: [1807, 12, 22] },
        { id: 'usa4', name: 'Frontier Militia', desc: 'Militia +20%.', fx: [{ mod: 'attack', value: 0.20, unit: ['militia'] }] }
      ] }
    }
  },

  // ================================================================ 1917
  'greatwar-1917': {
    branches: [
      { id: 'mil', name: 'Military', tiers: [
        { id: 'mil1', name: 'Machine Guns', desc: 'Infantry +15% defence.', fx: [{ mod: 'defence', value: 0.15, cls: 'infantry' }] },
        { id: 'mil2', name: 'Defence in Depth', desc: 'Defence +15%: thin front lines, strongpoints and counterattack divisions behind them.', fx: [{ mod: 'defence', value: 0.15 }] },
        [
          { id: 'mil3a', name: 'Hurricane Bombardment', desc: 'Artillery +20% attack, gas troops +15% attack.', fx: [{ mod: 'attack', value: 0.20, cls: 'artillery' }, { mod: 'attack', value: 0.15, unit: ['gastroops'] }] },
          { id: 'mil3b', name: 'Infiltration Tactics', desc: 'Any army can raise Stormtroopers; infantry +10% attack.', fx: [{ mod: 'unlock', unit: 'stormtroops' }, { mod: 'attack', value: 0.10, cls: 'infantry' }] }
        ],
        { id: 'mil4', name: 'Mustard Gas', desc: 'From July 1917 (Ypres): gas troops +30% attack, infantry +5% attack.', from: [1917, 7, 12], fx: [{ mod: 'attack', value: 0.30, unit: ['gastroops'] }, { mod: 'attack', value: 0.05, cls: 'infantry' }] },
        { id: 'mil5', name: 'Combined Arms', desc: 'From July 1918 (Hamel and Amiens): tanks +25% attack, infantry and artillery +10% attack, organisation +10%.', from: [1918, 7, 4],
          fx: [{ mod: 'attack', value: 0.25, cls: 'armor' }, { mod: 'attack', value: 0.10, cls: 'infantry' }, { mod: 'attack', value: 0.10, cls: 'artillery' }, { mod: 'org', value: 0.10 }] }
      ] },
      { id: 'ind', name: 'War Industry', tiers: [
        { id: 'ind1', name: 'Shell Production', desc: 'Arsenals +20%: the shell crises of 1915 are over.', fx: [{ mod: 'arsenals', value: 0.20 }] },
        { id: 'ind2', name: 'Women in the Factories', desc: 'Workshops and arsenals +10%, manpower +10%.', fx: [{ mod: 'workshops', value: 0.10 }, { mod: 'arsenals', value: 0.10 }, { mod: 'manpower', value: 0.10 }] },
        [
          { id: 'ind3a', name: 'Synthetic Nitrates', desc: 'Nitrate works can be built without a deposit.', fx: [{ mod: 'synthetic', value: 1, good: 'strategic' }] },
          { id: 'ind3b', name: 'Open-Hearth Steel', desc: 'Mines +30%.', fx: [{ mod: 'mines', value: 0.30 }] }
        ],
        { id: 'ind4', name: 'Tank Factories', desc: 'From March 1918: any nation can build Heavy Tanks, and they cost 15% less.', from: [1918, 3, 1], fx: [{ mod: 'unlock', unit: 'landships' }, { mod: 'recruitCost', value: -0.15, unit: ['landships'] }] },
        { id: 'ind5', name: 'Light Tanks', desc: 'From May 1918: unlocks Light Tanks (Renault FT and Whippet) for every nation.', from: [1918, 5, 31], fx: [{ mod: 'unlock', unit: 'lighttanks', def: {
          name: 'Light Tanks', short: 'LTK', atk: 18, def: 10, speed: 5, org: 50, supply: 1.6, mp: 2500, eq: 380, days: 50, symbol: 'arm', look: 'renaultft', armor: true, breach: 0.35,
          note: 'The two-man Renault FT, the first tank with a fully turning turret, and the British Whippet. Built by the thousand in 1918.' } }] }
      ] },
      { id: 'trade', name: 'Trade and Shipping', tiers: [
        { id: 'trade1', name: 'Wireless Telegraphy', desc: '+1 trade slot.', fx: [{ mod: 'tradeSlots', value: 1 }] },
        { id: 'trade2', name: 'War Loans', desc: 'Tax +10%, +15% more while at war.', fx: [{ mod: 'tax', value: 0.10 }, { mod: 'tax', value: 0.15, when: 'war' }] },
        [
          { id: 'trade3a', name: 'Convoys', desc: 'From May 1917: convoy losses to U-boats halved, stockpiles hold 30 more days.', from: [1917, 5, 10], fx: [{ mod: 'convoyLoss', value: -0.5 }, { mod: 'stockDays', value: 30 }] },
          { id: 'trade3b', name: 'Neutral Shipping', desc: '+15% trade bonus while you are at peace.', fx: [{ mod: 'tradeBonus', value: 0.15, when: 'peace' }] }
        ],
        { id: 'trade4', name: 'Refrigerated Ships', desc: 'Food need -10%.', fx: [{ mod: 'foodNeed', value: -0.10 }] }
      ] },
      { id: 'state', name: 'Statecraft', tiers: [
        { id: 'state1', name: 'Conscription', desc: 'Manpower +25%.', fx: [{ mod: 'manpower', value: 0.25 }] },
        { id: 'state2', name: 'Propaganda', desc: 'War support +15%.', fx: [{ mod: 'warSupport', value: 0.15 }] },
        [
          { id: 'state3a', name: 'Total War', desc: 'All industries +15%, stability -10%.', fx: [{ mod: 'industry', value: 0.15 }, { mod: 'stability', value: -0.10 }] },
          { id: 'state3b', name: 'Social Reforms', desc: 'Stability +15%.', fx: [{ mod: 'stability', value: 0.15 }] }
        ],
        { id: 'state4', name: 'Rationing', desc: 'Food need -20%.', fx: [{ mod: 'foodNeed', value: -0.20 }] }
      ] }
    ],
    national: {
      GER: { name: 'German Empire', techs: [
        { id: 'ger1', name: 'Hindenburg Programme', desc: 'Arsenals +25%, heavy artillery +10%.', fx: [{ mod: 'arsenals', value: 0.25 }, { mod: 'attack', value: 0.10, unit: ['heavyart', 'railguns'] }] },
        { id: 'ger2', name: 'Unrestricted U-boat Warfare', desc: 'Raiders +40% against enemy convoys.', fx: [{ mod: 'raiding', value: 0.40 }] },
        { id: 'ger3', name: 'Haber Process', desc: 'Synthetic nitrates without taking the Industry choice.', fx: [{ mod: 'synthetic', value: 1, good: 'strategic' }] },
        { id: 'ger4', name: 'A7V Sturmpanzerwagen', desc: 'From March 1918: Germany can build Heavy Tanks.', from: [1918, 3, 21], fx: [{ mod: 'unlock', unit: 'landships' }] },
        { id: 'ger5', name: 'Kaiserschlacht', desc: 'From March 1918: stormtroopers +20% attack, speed +10% at war.', from: [1918, 3, 21], fx: [{ mod: 'attack', value: 0.20, unit: ['stormtroops'] }, { mod: 'speed', value: 0.10, when: 'war' }] }
      ] },
      AUH: { name: 'Austria-Hungary', techs: [
        { id: 'auh1', name: 'Škoda Works', desc: 'Arsenals +20%.', fx: [{ mod: 'arsenals', value: 0.20 }] },
        { id: 'auh2', name: 'Danube Grain', desc: 'Farms +20%.', fx: [{ mod: 'farms', value: 0.20 }] },
        { id: 'auh3', name: 'Alpine Warfare', desc: 'Mountain troops +20%.', fx: [{ mod: 'attack', value: 0.20, unit: ['mountain'] }] },
        { id: 'auh4', name: 'Sixtus Letters', desc: 'Emperor Karl\'s secret peace feelers: stability +10%, war support -5%.', fx: [{ mod: 'stability', value: 0.10 }, { mod: 'warSupport', value: -0.05 }] }
      ] },
      OTT: { name: 'Ottoman Empire', techs: [
        { id: 'ott1', name: 'Straits Control', desc: 'Defence +20% around the Straits, +10% trade bonus.', fx: [{ mod: 'tradeBonus', value: 0.10 }, { mod: 'defence', value: 0.20, region: [25.5, 39.5, 30, 41.7] }] },
        { id: 'ott2', name: 'Hejaz Railway', desc: 'Supply +15%.', fx: [{ mod: 'supply', value: 0.15 }] },
        { id: 'ott3', name: 'Yildirim Army Group', desc: 'Organisation +10%, attack +5% with German advisers.', fx: [{ mod: 'org', value: 0.10 }, { mod: 'attack', value: 0.05 }] },
        { id: 'ott4', name: 'Army of Islam', desc: 'Manpower +15%, irregulars +15%.', fx: [{ mod: 'manpower', value: 0.15 }, { mod: 'attack', value: 0.15, unit: ['irregulars', 'irregcav'] }] }
      ] },
      FRA: { name: 'France', techs: [
        { id: 'fra1', name: 'The Sacred Way', desc: 'Supply +15%, defence +10% in your own land.', fx: [{ mod: 'supply', value: 0.15 }, { mod: 'defence', value: 0.10, where: 'home' }] },
        { id: 'fra2', name: 'The 75mm Gun', desc: 'Field artillery +20%.', fx: [{ mod: 'attack', value: 0.20, unit: ['fieldart'] }] },
        { id: 'fra3', name: 'Pétain\'s Reforms', desc: 'From May 1917, after the mutinies: organisation +15%, stability +5%.', from: [1917, 5, 15], fx: [{ mod: 'org', value: 0.15 }, { mod: 'stability', value: 0.05 }] },
        { id: 'fra4', name: 'Renault FT', desc: 'From May 1918: light tanks for France, 20% cheaper.', from: [1918, 5, 31], fx: [{ mod: 'unlock', unit: 'lighttanks' }, { mod: 'recruitCost', value: -0.20, unit: ['lighttanks'] }] }
      ] },
      GBR: { name: 'United Kingdom', techs: [
        { id: 'gbr1', name: 'Ministry of Munitions', desc: 'Arsenals +25%.', fx: [{ mod: 'arsenals', value: 0.25 }] },
        { id: 'gbr2', name: 'Royal Navy Blockade', desc: 'Warships +15% in battle, raiders +30% against enemy convoys, +10% trade bonus.', fx: [{ mod: 'naval', value: 0.15 }, { mod: 'raiding', value: 0.30 }, { mod: 'tradeBonus', value: 0.10 }] },
        { id: 'gbr3', name: 'Tank Corps', desc: 'Heavy tanks +20% attack and 20% cheaper.', fx: [{ mod: 'attack', value: 0.20, unit: ['landships'] }, { mod: 'recruitCost', value: -0.20, unit: ['landships'] }] },
        { id: 'gbr4', name: 'Royal Air Force', desc: 'From April 1918: aircraft +15%.', from: [1918, 4, 1], fx: [{ mod: 'air', value: 0.15 }] }
      ] },
      RAJ: { name: 'British India', techs: [
        { id: 'raj1', name: 'Indian Army Expansion', desc: 'Manpower +25%.', fx: [{ mod: 'manpower', value: 0.25 }] },
        { id: 'raj2', name: 'Jute and Cotton', desc: 'Luxuries +30%.', fx: [{ mod: 'luxuries', value: 0.30 }] },
        { id: 'raj3', name: 'Bombay Mills', desc: 'Workshops +20%.', fx: [{ mod: 'workshops', value: 0.20 }] },
        { id: 'raj4', name: 'Mesopotamian Expedition', desc: 'Desert and river fighting +15%.', fx: [{ mod: 'attack', value: 0.15, terrain: ['desert', 'marsh'] }] }
      ] },
      RUS: { name: 'Russia', techs: [
        { id: 'rus1', name: 'Ukrainian Grain', desc: 'Farms +25%.', fx: [{ mod: 'farms', value: 0.25 }] },
        { id: 'rus2', name: 'Trans-Siberian Railway', desc: 'Supply +15%.', fx: [{ mod: 'supply', value: 0.15 }] },
        { id: 'rus3', name: 'Shock Battalions', desc: 'Infantry +10% attack, organisation +5%.', fx: [{ mod: 'attack', value: 0.10, cls: 'infantry' }, { mod: 'org', value: 0.05 }] },
        { id: 'rus4', name: 'Kerensky Offensive', desc: 'From July 1917: attack +10% at war.', fx: [{ mod: 'attack', value: 0.10, when: 'war' }], from: [1917, 7, 1] }
      ] },
      SRB: { name: 'Serbia', techs: [
        { id: 'srb1', name: 'Veterans of the Retreat', desc: 'Organisation +15%.', fx: [{ mod: 'org', value: 0.15 }] },
        { id: 'srb2', name: 'Mountain Defence', desc: 'Mountain defence +25%.', fx: [{ mod: 'defence', value: 0.25, terrain: ['mountains'] }] },
        { id: 'srb3', name: 'Yugoslav Volunteers', desc: 'Manpower +20%.', fx: [{ mod: 'manpower', value: 0.20 }] },
        { id: 'srb4', name: 'Salonika Front', desc: 'Supply +20% in your own land.', fx: [{ mod: 'supply', value: 0.20, where: 'home' }] }
      ] },
      JAP: { name: 'Empire of Japan', techs: [
        { id: 'jap1', name: 'Zaibatsu', desc: 'Workshops and arsenals +15%.', fx: [{ mod: 'workshops', value: 0.15 }, { mod: 'arsenals', value: 0.15 }] },
        { id: 'jap2', name: 'Anglo-Japanese Alliance', desc: 'Relations grow 30% faster.', fx: [{ mod: 'relGrowth', value: 0.30 }] },
        { id: 'jap3', name: 'Kwantung Railway', desc: 'Supply +10%.', fx: [{ mod: 'supply', value: 0.10 }] },
        { id: 'jap4', name: 'Mediterranean Squadron', desc: 'Warships +10% in battle, convoy losses -20%.', fx: [{ mod: 'naval', value: 0.10 }, { mod: 'convoyLoss', value: -0.2 }] }
      ] },
      ITA: { name: 'Italy', techs: [
        { id: 'ita1', name: 'Northern Industry', desc: 'Arsenals +20%.', fx: [{ mod: 'arsenals', value: 0.20 }] },
        { id: 'ita2', name: 'Arditi', desc: 'From July 1917: Italy can raise Stormtroopers, mountain troops +15%.', from: [1917, 7, 29], fx: [{ mod: 'unlock', unit: 'stormtroops' }, { mod: 'attack', value: 0.15, unit: ['mountain'] }] },
        { id: 'ita3', name: 'Emigrant Remittances', desc: 'Tax +10%.', fx: [{ mod: 'tax', value: 0.10 }] },
        { id: 'ita4', name: 'The Piave Line', desc: 'Defence +20% in the northeast.', fx: [{ mod: 'defence', value: 0.20, region: [11.5, 45, 14.5, 47.2] }] }
      ] },
      PER: { name: 'Persia', techs: [
        { id: 'per1', name: 'Oil Concession', desc: '+1 gold per day, fuel sells for 20% more.', fx: [{ mod: 'goldPerDay', value: 1 }, { mod: 'sellPrice', value: 0.20, good: 'fuel' }] },
        { id: 'per2', name: 'Cossack Brigade', desc: 'Cavalry +20%.', fx: [{ mod: 'attack', value: 0.20, cls: 'cavalry' }] },
        { id: 'per3', name: 'Tribal Confederacies', desc: 'Manpower +15%.', fx: [{ mod: 'manpower', value: 0.15 }] },
        { id: 'per4', name: 'Neutral Crossroads', desc: '+2 trade slots while at peace.', fx: [{ mod: 'tradeSlots', value: 2, when: 'peace' }] }
      ] },
      CHN: { name: 'Republic of China', techs: [
        { id: 'chn1', name: 'Hanyang Arsenal', desc: 'Arsenals +20%.', fx: [{ mod: 'arsenals', value: 0.20 }] },
        { id: 'chn2', name: 'Chinese Labour Corps', desc: 'Relations with the Entente grow faster, +10% trade bonus.', fx: [{ mod: 'relGrowth', value: 0.20 }, { mod: 'tradeBonus', value: 0.10 }] },
        { id: 'chn3', name: 'Treaty Ports', desc: '+2 trade slots, stability -5%.', fx: [{ mod: 'tradeSlots', value: 2 }, { mod: 'stability', value: -0.05 }] },
        { id: 'chn4', name: 'Warlord Levies', desc: 'Manpower +25%.', fx: [{ mod: 'manpower', value: 0.25 }] }
      ] },
      USA: { name: 'United States', techs: [
        { id: 'usa1', name: 'Neutral Trade Boom', desc: 'Trade bonus +25% while at peace.', fx: [{ mod: 'tradeBonus', value: 0.25, when: 'peace' }] },
        { id: 'usa2', name: 'Selective Service Act', desc: 'From May 1917: manpower +40%.', from: [1917, 5, 18], fx: [{ mod: 'manpower', value: 0.40 }] },
        { id: 'usa3', name: 'Liberty Bonds', desc: 'Tax +15% while at war.', fx: [{ mod: 'tax', value: 0.15, when: 'war' }] },
        { id: 'usa4', name: 'Emergency Fleet', desc: 'Arsenals +25%, convoy losses -20%.', fx: [{ mod: 'arsenals', value: 0.25 }, { mod: 'convoyLoss', value: -0.2 }] },
        { id: 'usa5', name: 'American Expeditionary Forces', desc: 'From June 1917: organisation +15%.', fx: [{ mod: 'org', value: 0.15 }], from: [1917, 6, 26] }
      ] },
      MEX: { name: 'Mexico', techs: [
        { id: 'mex1', name: 'Tampico Oil', desc: '+1 gold per day, fuel sells for 20% more.', fx: [{ mod: 'goldPerDay', value: 1 }, { mod: 'sellPrice', value: 0.20, good: 'fuel' }] },
        { id: 'mex2', name: 'Constitution of 1917', desc: 'Stability +15%.', fx: [{ mod: 'stability', value: 0.15 }] },
        { id: 'mex3', name: 'National Railways', desc: 'Supply +15%.', fx: [{ mod: 'supply', value: 0.15 }] },
        { id: 'mex4', name: 'Obregón\'s Army', desc: 'Organisation +10%, cavalry +10%.', fx: [{ mod: 'org', value: 0.10 }, { mod: 'attack', value: 0.10, cls: 'cavalry' }] }
      ] },
      VIL: { name: 'Villistas', techs: [
        { id: 'vil1', name: 'Hit and Run', desc: 'Irregular horse +20%.', fx: [{ mod: 'attack', value: 0.20, unit: ['irregcav'] }] },
        { id: 'vil2', name: 'División del Norte', desc: 'Cavalry +20%.', fx: [{ mod: 'attack', value: 0.20, cls: 'cavalry' }] },
        { id: 'vil3', name: 'Railway Raids', desc: 'Speed +10%.', fx: [{ mod: 'speed', value: 0.10 }] },
        { id: 'vil4', name: 'Sierra Hideouts', desc: 'Defence +25% in hills and mountains.', fx: [{ mod: 'defence', value: 0.25, terrain: ['hills', 'mountains'] }] }
      ] },
      BRA: { name: 'Brazil', techs: [
        { id: 'bra1', name: 'Coffee Exports', desc: 'Luxuries sell for 30% more.', fx: [{ mod: 'sellPrice', value: 0.30, good: 'luxuries' }] },
        { id: 'bra2', name: 'Amazon Rubber', desc: 'Luxuries +25% in the Amazon, +10% elsewhere.', fx: [{ mod: 'luxuries', value: 0.25, region: [-75, -12, -48, 2] }, { mod: 'luxuries', value: 0.10 }] },
        { id: 'bra3', name: 'Naval Division', desc: 'Warships +10%, marines +15%.', fx: [{ mod: 'naval', value: 0.10 }, { mod: 'attack', value: 0.15, cls: 'marines' }] },
        { id: 'bra4', name: 'Positivist Republic', desc: 'Stability +10%.', fx: [{ mod: 'stability', value: 0.10 }] }
      ] }
    }
  },

  // ================================================================ 1936
  'ww2-1936': {
    branches: [
      { id: 'mil', name: 'Military', tiers: [
        { id: 'mil1', name: 'Motorisation', desc: 'Motorised units +10% speed.', fx: [{ mod: 'speed', value: 0.10, cls: 'motorised' }] },
        { id: 'mil2', name: 'Combined Arms', desc: 'Tanks and mechanised +10% attack.', fx: [{ mod: 'attack', value: 0.10, unit: ['tanks', 'mechanized'] }] },
        [
          { id: 'mil3a', name: 'Mobile Warfare', desc: 'Tanks +20% attack, speed +10%.', fx: [{ mod: 'attack', value: 0.20, unit: ['tanks'] }, { mod: 'speed', value: 0.10, unit: ['tanks'] }] },
          { id: 'mil3b', name: 'Mass Assault', desc: 'Infantry +20% attack, manpower cost -15%.', fx: [{ mod: 'attack', value: 0.20, cls: 'infantry' }, { mod: 'recruitCost', value: -0.15 }] }
        ],
        { id: 'mil4', name: 'Airborne Operations', desc: 'Paratroopers +25%.', fx: [{ mod: 'attack', value: 0.25, unit: ['paratroopers'] }] }
      ] },
      { id: 'ind', name: 'Industry', tiers: [
        { id: 'ind1', name: 'Modern Farming', desc: 'Farms +20%.', fx: [{ mod: 'farms', value: 0.20 }] },
        { id: 'ind2', name: 'Production Lines', desc: 'Arsenals +20%.', fx: [{ mod: 'arsenals', value: 0.20 }] },
        [
          { id: 'ind3a', name: 'Synthetic Oil and Rubber', desc: 'Synthetic plants anywhere.', fx: [{ mod: 'synthetic', value: 1, good: 'strategic' }, { mod: 'synthetic', value: 1, good: 'fuel' }] },
          { id: 'ind3b', name: 'Heavy Industry', desc: 'Mines and fuel works +25%.', fx: [{ mod: 'mines', value: 0.25 }, { mod: 'fuelworks', value: 0.25 }] }
        ],
        { id: 'ind4', name: 'Dispersed Industry', desc: 'Occupied or bombed industries keep 75% output.', fx: [{ mod: 'occupied', value: 0.25 }] }
      ] },
      { id: 'trade', name: 'Trade', tiers: [
        { id: 'trade1', name: 'Trade Agreements', desc: '+1 trade slot.', fx: [{ mod: 'tradeSlots', value: 1 }] },
        { id: 'trade2', name: 'Clearing System', desc: 'Trade bonus +10%.', fx: [{ mod: 'tradeBonus', value: 0.10 }] },
        [
          { id: 'trade3a', name: 'Open Markets', desc: 'Trade bonus +15%, +1 slot.', fx: [{ mod: 'tradeBonus', value: 0.15 }, { mod: 'tradeSlots', value: 1 }] },
          { id: 'trade3b', name: 'Autarky', desc: 'All industries +10%, trade slots -1.', fx: [{ mod: 'industry', value: 0.10 }, { mod: 'tradeSlots', value: -1 }] }
        ],
        { id: 'trade4', name: 'Strategic Reserves', desc: 'Stockpiles hold 60 more days.', fx: [{ mod: 'stockDays', value: 60 }] }
      ] },
      { id: 'state', name: 'Statecraft', tiers: [
        { id: 'state1', name: 'Rearmament', desc: 'Manpower +15%.', fx: [{ mod: 'manpower', value: 0.15 }] },
        { id: 'state2', name: 'Propaganda', desc: 'War support +15%.', fx: [{ mod: 'warSupport', value: 0.15 }] },
        [
          { id: 'state3a', name: 'Mobilisation', desc: 'Industries +15%, stability -10%.', fx: [{ mod: 'industry', value: 0.15 }, { mod: 'stability', value: -0.10 }] },
          { id: 'state3b', name: 'Civil Defence', desc: 'Stability +15%.', fx: [{ mod: 'stability', value: 0.15 }] }
        ],
        { id: 'state4', name: 'Total War Economy', desc: 'Construction +30%.', fx: [{ mod: 'construction', value: 0.30 }] }
      ] }
    ],
    national: {
      GER: { name: 'Germany', techs: [
        { id: 'ger1', name: 'Four-Year Plan', desc: 'Synthetic oil and rubber without taking the Industry choice.', fx: [{ mod: 'synthetic', value: 1, good: 'strategic' }, { mod: 'synthetic', value: 1, good: 'fuel' }] },
        { id: 'ger2', name: 'Autobahn', desc: 'Supply +15%.', fx: [{ mod: 'supply', value: 0.15 }] },
        { id: 'ger3', name: 'Panzer Divisions', desc: 'Tanks +20%.', fx: [{ mod: 'attack', value: 0.20, unit: ['tanks'] }] },
        { id: 'ger4', name: 'Blitzkrieg', desc: 'Speed +20% for 30 days after an offensive order (in game: speed +10% at war).', fx: [{ mod: 'speed', value: 0.10, when: 'war' }] }
      ] },
      FRA: { name: 'France', techs: [
        { id: 'fra1', name: 'Maginot Line', desc: 'Defence +40% in eastern border provinces.', fx: [{ mod: 'defence', value: 0.40, where: 'border', region: [4.5, 47, 8.5, 50.2] }] },
        { id: 'fra2', name: 'Colonial Resources', desc: 'Food and metal from colonies +30% (in game: farms and mines in French Africa +30%).', fx: [{ mod: 'farms', value: 0.30, region: [-18, -26, 51, 37] }, { mod: 'mines', value: 0.30, region: [-18, -26, 51, 37] }] },
        { id: 'fra3', name: 'Popular Front Reforms', desc: 'Stability +10%.', fx: [{ mod: 'stability', value: 0.10 }] },
        { id: 'fra4', name: 'Char B1', desc: 'Tanks +15% defence.', fx: [{ mod: 'defence', value: 0.15, unit: ['tanks'] }] }
      ] },
      ENG: { name: 'United Kingdom', techs: [
        { id: 'eng1', name: 'Imperial Preference', desc: 'Deals with dominions and colonies +25% trade bonus (in game: +15% trade bonus).', fx: [{ mod: 'tradeBonus', value: 0.15 }] },
        { id: 'eng2', name: 'Shadow Factories', desc: 'Arsenals +20%.', fx: [{ mod: 'arsenals', value: 0.20 }] },
        { id: 'eng3', name: 'Radar Chain', desc: 'Coastal defence +20%.', fx: [{ mod: 'defence', value: 0.20, where: 'coast' }] },
        { id: 'eng4', name: 'Royal Navy Blockade', desc: 'Warships +15% in battle, raiders +30% against enemy convoys, +10% trade bonus.', fx: [{ mod: 'naval', value: 0.15 }, { mod: 'raiding', value: 0.30 }, { mod: 'tradeBonus', value: 0.10 }] }
      ] },
      ITA: { name: 'Italy', techs: [
        { id: 'ita1', name: 'Autarchia', desc: 'Farms and mines +15%.', fx: [{ mod: 'farms', value: 0.15 }, { mod: 'mines', value: 0.15 }] },
        { id: 'ita2', name: 'Alpini', desc: 'Mountain defence +20%.', fx: [{ mod: 'defence', value: 0.20, terrain: ['mountains'] }] },
        { id: 'ita3', name: 'Mare Nostrum', desc: '+2 Mediterranean sea trade slots.', fx: [{ mod: 'tradeSlots', value: 2 }] },
        { id: 'ita4', name: 'Littorio Divisions', desc: 'Motorised +15%.', fx: [{ mod: 'attack', value: 0.15, cls: 'motorised' }] }
      ] },
      SOV: { name: 'Soviet Union', techs: [
        { id: 'sov1', name: 'Five-Year Plans', desc: 'Construction +30%.', fx: [{ mod: 'construction', value: 0.30 }] },
        { id: 'sov2', name: 'Stakhanovites', desc: 'Arsenals +15%.', fx: [{ mod: 'arsenals', value: 0.15 }] },
        { id: 'sov3', name: 'Urals Relocation', desc: 'Can move arsenals away from the front (in game: arsenals east of the Volga +25%, occupied industry keeps 60%).', fx: [{ mod: 'arsenals', value: 0.25, region: [45, 40, 100, 70] }, { mod: 'occupied', value: 0.10 }] },
        { id: 'sov4', name: 'Deep Battle', desc: 'Attack +15%.', fx: [{ mod: 'attack', value: 0.15 }] }
      ] },
      USA: { name: 'United States', techs: [
        { id: 'usa1', name: 'New Deal', desc: 'Stability +10%.', fx: [{ mod: 'stability', value: 0.10 }] },
        { id: 'usa2', name: 'Detroit Arsenal', desc: 'Arsenals +30%.', fx: [{ mod: 'arsenals', value: 0.30 }] },
        { id: 'usa3', name: 'Arsenal of Democracy', desc: 'Military aid sends 2x (in game: relations grow 30% faster, +10% trade bonus).', fx: [{ mod: 'relGrowth', value: 0.30 }, { mod: 'tradeBonus', value: 0.10 }] },
        { id: 'usa4', name: 'Lend-Lease', desc: 'Available from 1941: sell Arms to friends on credit, no gold needed (in game: +1 gold per day per faction member, +1 trade slot).', fx: [{ mod: 'factionGold', value: 1 }, { mod: 'tradeSlots', value: 1 }], from: [1941, 3, 11] }
      ] },
      JAP: { name: 'Japan', techs: [
        { id: 'jap1', name: 'Manchurian Industry', desc: 'Mines in Manchuria +40%.', fx: [{ mod: 'mines', value: 0.40, region: [118, 38, 135, 53.5] }] },
        { id: 'jap2', name: 'Zaibatsu', desc: 'Workshops and arsenals +15%.', fx: [{ mod: 'workshops', value: 0.15 }, { mod: 'arsenals', value: 0.15 }] },
        { id: 'jap3', name: 'Southern Resource Plan', desc: 'Rubber and oil deals with Southeast Asia +25% (in game: +10% trade bonus, rubber and oil output in Southeast Asia +25%).', fx: [{ mod: 'tradeBonus', value: 0.10 }, { mod: 'stratworks', value: 0.25, region: [92, -11, 141, 22] }, { mod: 'fuelworks', value: 0.25, region: [92, -11, 141, 22] }] },
        { id: 'jap4', name: 'Naval Infantry', desc: 'Marines +20%.', fx: [{ mod: 'attack', value: 0.20, cls: 'marines' }] }
      ] },
      CHI: { name: 'China', techs: [
        { id: 'chi1', name: 'German-trained Divisions', desc: 'Organisation +15%.', fx: [{ mod: 'org', value: 0.15 }] },
        { id: 'chi2', name: 'United Front', desc: 'Stability +10%, relations with the Communists +30 (in game: relations grow 30% faster).', fx: [{ mod: 'stability', value: 0.10 }, { mod: 'relGrowth', value: 0.30 }] },
        { id: 'chi3', name: 'Yellow River Defences', desc: 'River defence +25% (in game: defence +25% along the Yellow River).', fx: [{ mod: 'defence', value: 0.25, region: [105, 33, 120, 38.5] }] },
        { id: 'chi4', name: 'Burma Road', desc: 'Available from 1938: a land deal through British India that cannot be cut by a sea blockade (in game: +1 trade slot).', fx: [{ mod: 'tradeSlots', value: 1 }], from: [1938, 12, 2] }
      ] },
      POL: { name: 'Poland', techs: [
        { id: 'pol1', name: 'Central Industrial Region', desc: 'Arsenals +25%.', fx: [{ mod: 'arsenals', value: 0.25 }] },
        { id: 'pol2', name: 'Gdynia Port', desc: '+2 sea trade slots.', fx: [{ mod: 'tradeSlots', value: 2 }] },
        { id: 'pol3', name: 'Cipher Bureau', desc: 'Research +10%.', fx: [{ mod: 'research', value: 0.10 }] },
        { id: 'pol4', name: 'Cavalry Brigades', desc: 'Recon +20%.', fx: [{ mod: 'attack', value: 0.20, unit: ['recon'] }] }
      ] },
      SPA: { name: 'Spain', techs: [
        { id: 'spa1', name: 'Almadén Mercury', desc: 'Mercury is a Luxury, +30%.', fx: [{ mod: 'luxuries', value: 0.30 }] },
        { id: 'spa2', name: 'International Brigades', desc: 'Manpower +10% from friendly nations.', fx: [{ mod: 'manpower', value: 0.10 }] },
        { id: 'spa3', name: 'Basque Industry', desc: 'Arsenals +20%.', fx: [{ mod: 'arsenals', value: 0.20 }] },
        { id: 'spa4', name: 'Mountain Warfare', desc: 'Mountain defence +20%.', fx: [{ mod: 'defence', value: 0.20, terrain: ['mountains'] }] }
      ] },
      TUR: { name: 'Turkey', techs: [
        { id: 'tur1', name: 'Etatism', desc: 'Construction +25%.', fx: [{ mod: 'construction', value: 0.25 }] },
        { id: 'tur2', name: 'Montreux Straits', desc: 'Can close the Straits to warring nations\' sea deals (in game: +10% trade bonus, +20% defence around the Straits).', fx: [{ mod: 'tradeBonus', value: 0.10 }, { mod: 'defence', value: 0.20, region: [25.5, 39.5, 30, 41.7] }] },
        { id: 'tur3', name: 'Chrome Exports', desc: 'Metal sells for 30% more.', fx: [{ mod: 'sellPrice', value: 0.30, good: 'metal' }] },
        { id: 'tur4', name: 'Kemalist Reforms', desc: 'Stability +10%.', fx: [{ mod: 'stability', value: 0.10 }] }
      ] },
      ROM: { name: 'Romania', techs: [
        { id: 'rom1', name: 'Ploiești Oil', desc: 'Oil +40%.', fx: [{ mod: 'fuelworks', value: 0.40 }] },
        { id: 'rom2', name: 'Danube Trade', desc: '+1 land trade slot.', fx: [{ mod: 'tradeSlots', value: 1 }] },
        { id: 'rom3', name: 'Carpathian Line', desc: 'Mountain defence +20%.', fx: [{ mod: 'defence', value: 0.20, terrain: ['mountains'] }] },
        { id: 'rom4', name: 'Royal Dictatorship', desc: 'Political power +15%.', fx: [{ mod: 'pp', value: 0.15 }] }
      ] },
      HOL: { name: 'Netherlands', techs: [
        { id: 'hol1', name: 'East Indies Oil and Rubber', desc: 'Rubber and oil from the Indies +40%.', fx: [{ mod: 'stratworks', value: 0.40, region: [95, -11, 141, 6] }, { mod: 'fuelworks', value: 0.40, region: [95, -11, 141, 6] }] },
        { id: 'hol2', name: 'Port of Rotterdam', desc: '+2 sea trade slots.', fx: [{ mod: 'tradeSlots', value: 2 }] },
        { id: 'hol3', name: 'Dutch Water Line', desc: 'Defence +40% in Holland when flooded (in game: defence +40% in Holland).', fx: [{ mod: 'defence', value: 0.40, region: [3.3, 51.3, 6.2, 53.5] }] },
        { id: 'hol4', name: 'Colonial Army', desc: 'Colonial units +15% (in game: attack and defence +15% in the Indies).', fx: [{ mod: 'attack', value: 0.15, region: [95, -11, 141, 6] }, { mod: 'defence', value: 0.15, region: [95, -11, 141, 6] }] }
      ] },
      BEL: { name: 'Belgium', techs: [
        { id: 'bel1', name: 'Congo Minerals', desc: 'Metal and rubber from the Congo +40%.', fx: [{ mod: 'mines', value: 0.40, region: [12, -14, 31, 5.5] }, { mod: 'stratworks', value: 0.40, region: [12, -14, 31, 5.5] }] },
        { id: 'bel2', name: 'Port of Antwerp', desc: '+2 sea trade slots.', fx: [{ mod: 'tradeSlots', value: 2 }] },
        { id: 'bel3', name: 'Eben-Emael and the Albert Canal', desc: 'Border defence +30%.', fx: [{ mod: 'defence', value: 0.30, where: 'border' }] },
        { id: 'bel4', name: 'Armed Neutrality', desc: 'Stability +10% while at peace.', fx: [{ mod: 'stability', value: 0.10, when: 'peace' }] }
      ] }
    }
  },
  // ================================================================ 2026
  // Six tiers, three research slots, and techLevel: every point of it counts twice in battle (power ~ level squared).
  'modern-2026': {
    tierCost: [60, 120, 200, 320, 450, 600],
    branches: [
      { id: 'mil', name: 'Military', tiers: [
        { id: 'mil1', name: 'Precision-Guided Munitions', desc: 'Artillery and rockets +15% attack; technology level +0.03.', fx: [{ mod: 'attack', value: 0.15, unit: ['artillery', 'rockets'] }, { mod: 'techLevel', value: 0.03 }] },
        { id: 'mil2', name: 'Battlefield Networks', desc: 'Every sensor feeds every shooter: technology level +0.05, organisation +5%.', fx: [{ mod: 'techLevel', value: 0.05 }, { mod: 'org', value: 0.05 }] },
        [
          { id: 'mil3a', name: 'Mass Drone Warfare', desc: 'Drone units +30% attack and 20% cheaper.', fx: [{ mod: 'attack', value: 0.30, unit: ['drones'] }, { mod: 'recruitCost', value: -0.20, unit: ['drones'] }] },
          { id: 'mil3b', name: 'Layered Air Defence', desc: 'Jamming and interceptors: counter-drone +20%, air defence +20% defence, all units +5% defence.', fx: [{ mod: 'counterDrone', value: 0.20 }, { mod: 'defence', value: 0.20, unit: ['airdefence', 'ewar'] }, { mod: 'defence', value: 0.05 }] }
        ],
        { id: 'mil4', name: 'AI Targeting', desc: 'Machine vision finds and strikes targets in seconds: technology level +0.06, drones +15% and artillery +10% attack.', fx: [{ mod: 'techLevel', value: 0.06 }, { mod: 'attack', value: 0.15, unit: ['drones'] }, { mod: 'attack', value: 0.10, unit: ['artillery', 'rockets'] }] },
        { id: 'mil5', name: 'Robotic Combat Vehicles', desc: 'From September 2026: unlocks Robotic Combat Vehicles, unmanned and hard to kill; technology level +0.03.', from: [2026, 9, 1], fx: [{ mod: 'techLevel', value: 0.03 }, { mod: 'unlock', unit: 'robots', def: {
          name: 'Robotic Combat Vehicles', short: 'RCV', atk: 26, def: 22, speed: 9, org: 75, supply: 1.8, mp: 400, eq: 640, days: 60, symbol: 'arm', look: 'ifv', armor: true, chips: true, drone: true, breach: 0.2,
          note: 'Remote-controlled and autonomous ground vehicles with cannon, missiles and mine ploughs: they go first, so soldiers do not have to.' } }] },
        { id: 'mil6', name: 'Hypersonic Strike', desc: 'From June 2027: rocket artillery +30% attack; technology level +0.08.', from: [2027, 6, 1], fx: [{ mod: 'attack', value: 0.30, unit: ['rockets'] }, { mod: 'techLevel', value: 0.08 }] }
      ] },
      { id: 'ind', name: 'Industry', tiers: [
        { id: 'ind1', name: 'Defence Industrial Base', desc: 'Defence plants +15%.', fx: [{ mod: 'arsenals', value: 0.15 }] },
        { id: 'ind2', name: 'Drone Mass Production', desc: 'Drone units 25% cheaper; defence plants +10%.', fx: [{ mod: 'recruitCost', value: -0.25, unit: ['drones'] }, { mod: 'arsenals', value: 0.10 }] },
        [
          { id: 'ind3a', name: 'Domestic Chip Fabs', desc: 'Chip fabs can be built without a deposit; chip fabs +20%.', fx: [{ mod: 'synthetic', value: 1, good: 'strategic' }, { mod: 'stratworks', value: 0.20 }] },
          { id: 'ind3b', name: 'Rare Earth Refining', desc: 'Mines +30%, and defence plants need 15% fewer inputs.', fx: [{ mod: 'mines', value: 0.30 }, { mod: 'arsenalInputs', value: -0.15, good: 'metal' }] }
        ],
        { id: 'ind4', name: 'Industrial Robotics', desc: 'All industries +15%; technology level +0.03.', fx: [{ mod: 'industry', value: 0.15 }, { mod: 'techLevel', value: 0.03 }] },
        { id: 'ind5', name: 'Combat Lasers', desc: 'Directed-energy weapons burn drones out of the sky for a few dollars a shot: counter-drone +20%, air defence +20% defence.', fx: [{ mod: 'counterDrone', value: 0.20 }, { mod: 'defence', value: 0.20, unit: ['airdefence'] }] },
        { id: 'ind6', name: 'Quantum Computing', desc: 'From January 2028: research +25%, technology level +0.06.', from: [2028, 1, 1], fx: [{ mod: 'research', value: 0.25 }, { mod: 'techLevel', value: 0.06 }] }
      ] },
      { id: 'trade', name: 'Trade and Finance', tiers: [
        { id: 'trade1', name: 'Global Supply Chains', desc: '+1 trade slot.', fx: [{ mod: 'tradeSlots', value: 1 }] },
        { id: 'trade2', name: 'Digital Finance', desc: 'Tax +10%.', fx: [{ mod: 'tax', value: 0.10 }] },
        [
          { id: 'trade3a', name: 'Friend-Shoring', desc: '+15% trade bonus, stockpiles hold 30 more days.', fx: [{ mod: 'tradeBonus', value: 0.15 }, { mod: 'stockDays', value: 30 }] },
          { id: 'trade3b', name: 'Shadow Fleet', desc: 'Sanctions leak: convoy losses -30%, +10% trade bonus while at war.', fx: [{ mod: 'convoyLoss', value: -0.3 }, { mod: 'tradeBonus', value: 0.10, when: 'war' }] }
        ],
        { id: 'trade4', name: 'LNG Terminals', desc: 'Oil and gas fields +20%.', fx: [{ mod: 'fuelworks', value: 0.20 }] },
        { id: 'trade5', name: 'Satellite Internet', desc: 'Supply +15% (Starlink-style terminals at the front); technology level +0.02.', fx: [{ mod: 'supply', value: 0.15 }, { mod: 'techLevel', value: 0.02 }] },
        { id: 'trade6', name: 'Undersea Cable Security', desc: '+1 trade slot, stability +5%.', fx: [{ mod: 'tradeSlots', value: 1 }, { mod: 'stability', value: 0.05 }] }
      ] },
      { id: 'state', name: 'Statecraft', tiers: [
        { id: 'state1', name: 'Reserve Mobilisation', desc: 'Manpower +20%.', fx: [{ mod: 'manpower', value: 0.20 }] },
        { id: 'state2', name: 'Information Warfare', desc: 'War support +10%, stability +5%.', fx: [{ mod: 'warSupport', value: 0.10 }, { mod: 'stability', value: 0.05 }] },
        [
          { id: 'state3a', name: 'War Economy', desc: 'All industries +15%, defence plants +15%, stability -10%.', fx: [{ mod: 'industry', value: 0.15 }, { mod: 'arsenals', value: 0.15 }, { mod: 'stability', value: -0.10 }] },
          { id: 'state3b', name: 'Resilience Doctrine', desc: 'Stability +15%, all units +5% defence.', fx: [{ mod: 'stability', value: 0.15 }, { mod: 'defence', value: 0.05 }] }
        ],
        { id: 'state4', name: 'Cyber Command', desc: 'Technology level +0.04, research +10%.', fx: [{ mod: 'techLevel', value: 0.04 }, { mod: 'research', value: 0.10 }] },
        { id: 'state5', name: 'National AI Programme', desc: 'Research +20%, technology level +0.04.', fx: [{ mod: 'research', value: 0.20 }, { mod: 'techLevel', value: 0.04 }] },
        { id: 'state6', name: 'Missile Shield', desc: 'From January 2027: air defence +25% defence, counter-drone +10%.', from: [2027, 1, 1], fx: [{ mod: 'defence', value: 0.25, unit: ['airdefence'] }, { mod: 'counterDrone', value: 0.10 }] }
      ] }
    ],
    national: {
      USA: { name: 'United States', techs: [
        { id: 'usa1', name: 'Department of War', desc: 'All units +5% attack, war support +5%.', fx: [{ mod: 'attack', value: 0.05 }, { mod: 'warSupport', value: 0.05 }] },
        { id: 'usa2', name: 'Defence Tech Start-ups', desc: 'Research +15%, drone units 15% cheaper.', fx: [{ mod: 'research', value: 0.15 }, { mod: 'recruitCost', value: -0.15, unit: ['drones'] }] },
        { id: 'usa3', name: 'Golden Dome', desc: 'Counter-drone +15%, air defence +20% defence.', fx: [{ mod: 'counterDrone', value: 0.15 }, { mod: 'defence', value: 0.20, unit: ['airdefence'] }] },
        { id: 'usa4', name: 'Collaborative Combat Aircraft', desc: 'Robot wingmen: air power +20%, technology level +0.04.', fx: [{ mod: 'air', value: 0.20 }, { mod: 'techLevel', value: 0.04 }] },
        { id: 'usa5', name: 'Replicator', desc: 'Thousands of cheap autonomous systems: drones +25% attack and 20% cheaper.', fx: [{ mod: 'attack', value: 0.25, unit: ['drones'] }, { mod: 'recruitCost', value: -0.20, unit: ['drones'] }] }
      ] },
      CHN: { name: 'China', techs: [
        { id: 'chn1', name: 'Military-Civil Fusion', desc: 'Defence plants +20%.', fx: [{ mod: 'arsenals', value: 0.20 }] },
        { id: 'chn2', name: 'Rare Earth Leverage', desc: 'Mines +25%, metals sell for 15% more.', fx: [{ mod: 'mines', value: 0.25 }, { mod: 'sellPrice', value: 0.15, good: 'metal' }] },
        { id: 'chn3', name: 'Anti-Access Missiles', desc: 'Rocket artillery +20% attack, navy +15%.', fx: [{ mod: 'attack', value: 0.20, unit: ['rockets'] }, { mod: 'naval', value: 0.15 }] },
        { id: 'chn4', name: 'Drone Swarms', desc: 'Drones +25% attack.', fx: [{ mod: 'attack', value: 0.25, unit: ['drones'] }] },
        { id: 'chn5', name: 'Intelligentised Warfare', desc: 'From 2027, the PLA centenary: technology level +0.06.', from: [2027, 8, 1], fx: [{ mod: 'techLevel', value: 0.06 }] }
      ] },
      RUS: { name: 'Russia', techs: [
        { id: 'rus1', name: 'Glide Bombs', desc: 'Air power +15%, artillery +10% attack.', fx: [{ mod: 'air', value: 0.15 }, { mod: 'attack', value: 0.10, unit: ['artillery'] }] },
        { id: 'rus2', name: 'Fibre-Optic Drones', desc: 'Unjammable drones: drones +20% attack, counter-drone +10%.', fx: [{ mod: 'attack', value: 0.20, unit: ['drones'] }, { mod: 'counterDrone', value: 0.10 }] },
        { id: 'rus3', name: 'Total Mobilisation of Industry', desc: 'Defence plants +25%, stability -5%.', fx: [{ mod: 'arsenals', value: 0.25 }, { mod: 'stability', value: -0.05 }] },
        { id: 'rus4', name: 'Rubikon Drone Centre', desc: 'Drone units 20% cheaper, organisation +5%.', fx: [{ mod: 'recruitCost', value: -0.20, unit: ['drones'] }, { mod: 'org', value: 0.05 }] },
        { id: 'rus5', name: 'Oreshnik', desc: 'Rocket artillery +25% attack.', fx: [{ mod: 'attack', value: 0.25, unit: ['rockets'] }] }
      ] },
      UKR: { name: 'Ukraine', techs: [
        { id: 'ukr1', name: 'Army of Drones', desc: 'Drones +25% attack.', fx: [{ mod: 'attack', value: 0.25, unit: ['drones'] }] },
        { id: 'ukr2', name: 'Brave1 Defence Cluster', desc: 'Research +15%, drone units 20% cheaper.', fx: [{ mod: 'research', value: 0.15 }, { mod: 'recruitCost', value: -0.20, unit: ['drones'] }] },
        { id: 'ukr3', name: 'Sea Drones', desc: 'Navy +25%, raiders +25%.', fx: [{ mod: 'naval', value: 0.25 }, { mod: 'raiding', value: 0.25 }] },
        { id: 'ukr4', name: 'Interceptor Drones', desc: 'Counter-drone +20%.', fx: [{ mod: 'counterDrone', value: 0.20 }] },
        { id: 'ukr5', name: 'Long-Range Strike', desc: 'Flamingo and Neptune missiles: rocket artillery +25% attack.', fx: [{ mod: 'attack', value: 0.25, unit: ['rockets'] }] }
      ] },
      ISR: { name: 'Israel', techs: [
        { id: 'isr1', name: 'Iron Dome', desc: 'Counter-drone +15%, air defence +20% defence.', fx: [{ mod: 'counterDrone', value: 0.15 }, { mod: 'defence', value: 0.20, unit: ['airdefence'] }] },
        { id: 'isr2', name: 'Unit 8200', desc: 'Technology level +0.05.', fx: [{ mod: 'techLevel', value: 0.05 }] },
        { id: 'isr3', name: 'Iron Beam', desc: 'Laser air defence: counter-drone +15%.', fx: [{ mod: 'counterDrone', value: 0.15 }] },
        { id: 'isr4', name: 'Precision Strike', desc: 'All units +10% attack, air power +10%.', fx: [{ mod: 'attack', value: 0.10 }, { mod: 'air', value: 0.10 }] }
      ] },
      TWN: { name: 'Taiwan', techs: [
        { id: 'twn1', name: 'TSMC', desc: 'Chip fabs +30%, research +10%.', fx: [{ mod: 'stratworks', value: 0.30 }, { mod: 'research', value: 0.10 }] },
        { id: 'twn2', name: 'Porcupine Strategy', desc: 'All units +20% defence.', fx: [{ mod: 'defence', value: 0.20 }] },
        { id: 'twn3', name: 'T-Dome', desc: 'Air defence +20% defence, counter-drone +10%.', fx: [{ mod: 'defence', value: 0.20, unit: ['airdefence'] }, { mod: 'counterDrone', value: 0.10 }] },
        { id: 'twn4', name: 'Silicon Shield', desc: 'Stability +10%, relations grow faster.', fx: [{ mod: 'stability', value: 0.10 }, { mod: 'relGrowth', value: 0.25 }] }
      ] },
      KOR: { name: 'South Korea', techs: [
        { id: 'kor1', name: 'K-Defence Exports', desc: 'Defence plants +20%; weapons sell for 15% more.', fx: [{ mod: 'arsenals', value: 0.20 }, { mod: 'sellPrice', value: 0.15, good: 'arms' }] },
        { id: 'kor2', name: 'Memory Chips', desc: 'Chip fabs +25%.', fx: [{ mod: 'stratworks', value: 0.25 }] },
        { id: 'kor3', name: 'Kill Chain', desc: 'Rocket artillery +20% attack.', fx: [{ mod: 'attack', value: 0.20, unit: ['rockets'] }] },
        { id: 'kor4', name: 'KF-21 Boramae', desc: 'Air power +20%.', fx: [{ mod: 'air', value: 0.20 }] }
      ] },
      JPN: { name: 'Japan', techs: [
        { id: 'jpn1', name: 'Counterstrike Capability', desc: 'Rocket artillery +20% attack.', fx: [{ mod: 'attack', value: 0.20, unit: ['rockets'] }] },
        { id: 'jpn2', name: 'Defence Budget Doubling', desc: 'Defence plants +20%.', fx: [{ mod: 'arsenals', value: 0.20 }] },
        { id: 'jpn3', name: 'Rapidus Fabs', desc: 'Chip fabs +20%.', fx: [{ mod: 'stratworks', value: 0.20 }] },
        { id: 'jpn4', name: 'GCAP Fighter', desc: 'Air power +20%, technology level +0.03.', fx: [{ mod: 'air', value: 0.20 }, { mod: 'techLevel', value: 0.03 }] }
      ] },
      IND: { name: 'India', techs: [
        { id: 'bha1', name: 'Make in India', desc: 'Defence plants +20%.', fx: [{ mod: 'arsenals', value: 0.20 }] },
        { id: 'bha2', name: 'BrahMos', desc: 'Rocket artillery +25% attack.', fx: [{ mod: 'attack', value: 0.25, unit: ['rockets'] }] },
        { id: 'bha3', name: 'Akash and S-400', desc: 'Air defence +20% defence, counter-drone +10%.', fx: [{ mod: 'defence', value: 0.20, unit: ['airdefence'] }, { mod: 'counterDrone', value: 0.10 }] },
        { id: 'bha4', name: 'Semiconductor Mission', desc: 'Chip fabs +20%, research +10%.', fx: [{ mod: 'stratworks', value: 0.20 }, { mod: 'research', value: 0.10 }] }
      ] },
      IRN: { name: 'Iran', techs: [
        { id: 'irn1', name: 'Shahed Drones', desc: 'Drones +25% attack and 25% cheaper.', fx: [{ mod: 'attack', value: 0.25, unit: ['drones'] }, { mod: 'recruitCost', value: -0.25, unit: ['drones'] }] },
        { id: 'irn2', name: 'Missile Cities', desc: 'Rocket artillery +25% attack.', fx: [{ mod: 'attack', value: 0.25, unit: ['rockets'] }] },
        { id: 'irn3', name: 'Mosaic Defence', desc: 'All units +15% defence.', fx: [{ mod: 'defence', value: 0.15 }] },
        { id: 'irn4', name: 'Basij', desc: 'Manpower +25%, stability +5%.', fx: [{ mod: 'manpower', value: 0.25 }, { mod: 'stability', value: 0.05 }] }
      ] },
      TUR: { name: 'Turkey', techs: [
        { id: 'tur1', name: 'Bayraktar', desc: 'Drones +25% attack.', fx: [{ mod: 'attack', value: 0.25, unit: ['drones'] }] },
        { id: 'tur2', name: 'Steel Dome', desc: 'Air defence +20% defence.', fx: [{ mod: 'defence', value: 0.20, unit: ['airdefence'] }] },
        { id: 'tur3', name: 'KAAN Fighter', desc: 'Air power +20%.', fx: [{ mod: 'air', value: 0.20 }] },
        { id: 'tur4', name: 'Altay Tank', desc: 'Tanks +15% attack.', fx: [{ mod: 'attack', value: 0.15, unit: ['tanks'] }] }
      ] },
      PRK: { name: 'North Korea', techs: [
        { id: 'prk1', name: 'Artillery Wall', desc: 'Artillery and rockets +20% attack.', fx: [{ mod: 'attack', value: 0.20, unit: ['artillery', 'rockets'] }] },
        { id: 'prk2', name: 'Lessons from Kursk', desc: 'Drones +20% attack, organisation +5%.', fx: [{ mod: 'attack', value: 0.20, unit: ['drones'] }, { mod: 'org', value: 0.05 }] },
        { id: 'prk3', name: 'Hwasong Missiles', desc: 'Rocket artillery +20% attack.', fx: [{ mod: 'attack', value: 0.20, unit: ['rockets'] }] },
        { id: 'prk4', name: 'Military First', desc: 'Manpower +25%.', fx: [{ mod: 'manpower', value: 0.25 }] }
      ] }
    },
    // regional branches for everyone else (the old culture branches do not fit 2026)
    areaDefault: 'south',
    areaOf: (function () {
      const o = {}, put = (k, l) => l.forEach(t => { o[t] = k; });
      put('eu', ['GBR', 'FRA', 'DEU', 'ITA', 'ESP', 'PRT', 'NLD', 'BEL', 'LUX', 'IRL', 'DNK', 'NOR', 'SWE', 'FIN', 'ISL', 'EST', 'LVA', 'LTU', 'POL', 'CZE', 'SVK', 'HUN', 'SVN', 'HRV', 'AUT', 'CHE',
        'GRC', 'CYP', 'BGR', 'ROU', 'MDA', 'ALB', 'MKD', 'MNE', 'SRB', 'BIH', 'XKX']);
      put('anglo', ['CAN', 'AUS', 'NZL']);
      put('gulf', ['SAU', 'ARE', 'QAT', 'KWT', 'OMN']);
      put('mideast', ['SYR', 'AES', 'LBN', 'JOR', 'IRQ', 'YEM', 'HOU', 'PSE', 'EGY', 'LBY', 'LNA', 'TUN', 'DZA', 'MAR', 'AFG', 'PAK']);
      put('eurasia', ['BLR', 'KAZ', 'UZB', 'TKM', 'KGZ', 'TJK', 'GEO', 'ARM', 'AZE', 'MNG']);
      put('asean', ['VNM', 'THA', 'MYS', 'SGP', 'IDN', 'PHL', 'KHM', 'LAO', 'MMR', 'NUG', 'ARA', 'TLS', 'PNG', 'SLB', 'FJI']);
      put('latam', ['MEX', 'GTM', 'HND', 'NIC', 'SLV', 'CRI', 'PAN', 'CUB', 'HTI', 'DOM', 'JAM', 'COL', 'VEN', 'GUY', 'SUR', 'ECU', 'PER', 'BOL', 'BRA', 'PRY', 'URY', 'ARG', 'CHL']);
      put('africa', ['MRT', 'MLI', 'NER', 'TCD', 'SDN', 'RSF', 'SSD', 'ERI', 'ETH', 'DJI', 'SOM', 'SML', 'KEN', 'UGA', 'RWA', 'BDI', 'TZA', 'COD', 'M23', 'COG', 'GAB', 'GNQ', 'CMR', 'CAF',
        'NGA', 'BEN', 'TGO', 'GHA', 'CIV', 'BFA', 'LBR', 'SLE', 'GIN', 'GNB', 'SEN', 'GMB', 'AGO', 'ZMB', 'MWI', 'MOZ', 'ZWE', 'BWA', 'NAM', 'ZAF', 'LSO', 'SWZ', 'MDG']);
      return o;
    })(),
    areas: {
      eu: { name: 'European Rearmament', techs: [
        { id: 'eu1', name: 'ReArm Europe', desc: 'Defence plants +20%.', fx: [{ mod: 'arsenals', value: 0.20 }] },
        { id: 'eu2', name: 'European Sky Shield', desc: 'Air defence +15% defence, counter-drone +10%.', fx: [{ mod: 'defence', value: 0.15, unit: ['airdefence'] }, { mod: 'counterDrone', value: 0.10 }] },
        { id: 'eu3', name: 'Ammunition Initiative', desc: 'Artillery +10% attack, all units 10% cheaper.', fx: [{ mod: 'attack', value: 0.10, unit: ['artillery', 'rockets'] }, { mod: 'recruitCost', value: -0.10 }] },
        { id: 'eu4', name: 'Galileo and IRIS²', desc: 'Supply +10%, technology level +0.03.', fx: [{ mod: 'supply', value: 0.10 }, { mod: 'techLevel', value: 0.03 }] },
        { id: 'eu5', name: 'Drone Wall', desc: 'A sensor and interceptor belt on the eastern border: counter-drone +15%, defence +5%.', fx: [{ mod: 'counterDrone', value: 0.15 }, { mod: 'defence', value: 0.05 }] }
      ] },
      anglo: { name: 'Five Eyes', techs: [
        { id: 'anglo1', name: 'Five Eyes Intelligence', desc: 'Technology level +0.03.', fx: [{ mod: 'techLevel', value: 0.03 }] },
        { id: 'anglo2', name: 'Critical Minerals Deals', desc: 'Mines +25%.', fx: [{ mod: 'mines', value: 0.25 }] },
        { id: 'anglo3', name: 'AUKUS', desc: 'Navy +15%, research +10%.', fx: [{ mod: 'naval', value: 0.15 }, { mod: 'research', value: 0.10 }] },
        { id: 'anglo4', name: 'Arctic and Outback Logistics', desc: 'Supply +15%.', fx: [{ mod: 'supply', value: 0.15 }] }
      ] },
      gulf: { name: 'Gulf Monarchies', techs: [
        { id: 'gulf1', name: 'Sovereign Wealth', desc: '+2 gold a day.', fx: [{ mod: 'goldPerDay', value: 2 }] },
        { id: 'gulf2', name: 'Bought Air Defence', desc: 'Air defence +15% defence, counter-drone +10%.', fx: [{ mod: 'defence', value: 0.15, unit: ['airdefence'] }, { mod: 'counterDrone', value: 0.10 }] },
        { id: 'gulf3', name: 'AI Data Centres', desc: 'Research +15%, technology level +0.02.', fx: [{ mod: 'research', value: 0.15 }, { mod: 'techLevel', value: 0.02 }] },
        { id: 'gulf4', name: 'Desalination', desc: 'Farms +25%.', fx: [{ mod: 'farms', value: 0.25 }] }
      ] },
      mideast: { name: 'Middle East and North Africa', techs: [
        { id: 'mena1', name: 'Oil and Gas Rents', desc: 'Oil and gas fields +20%.', fx: [{ mod: 'fuelworks', value: 0.20 }] },
        { id: 'mena2', name: 'Drone Imports', desc: 'Drones +15% attack.', fx: [{ mod: 'attack', value: 0.15, unit: ['drones'] }] },
        { id: 'mena3', name: 'Urban Warfare', desc: 'All units +10% defence.', fx: [{ mod: 'defence', value: 0.10 }] },
        { id: 'mena4', name: 'Rocket Arsenals', desc: 'Rocket artillery +15% attack.', fx: [{ mod: 'attack', value: 0.15, unit: ['rockets'] }] }
      ] },
      eurasia: { name: 'Eurasian Heartland', techs: [
        { id: 'eura1', name: 'Soviet Stockpiles', desc: 'Defence plants +15%.', fx: [{ mod: 'arsenals', value: 0.15 }] },
        { id: 'eura2', name: 'Steppe Logistics', desc: 'Supply +15%.', fx: [{ mod: 'supply', value: 0.15 }] },
        { id: 'eura3', name: 'Pipelines East and West', desc: 'Oil and gas fields +20%.', fx: [{ mod: 'fuelworks', value: 0.20 }] },
        { id: 'eura4', name: 'Conscript Reserves', desc: 'Manpower +20%.', fx: [{ mod: 'manpower', value: 0.20 }] }
      ] },
      asean: { name: 'Southeast Asia', techs: [
        { id: 'sea1', name: 'Factory Asia', desc: 'Tech industry +15%.', fx: [{ mod: 'workshops', value: 0.15 }] },
        { id: 'sea2', name: 'Maritime Militia', desc: 'Navy +10%, coastal provinces +10% defence.', fx: [{ mod: 'naval', value: 0.10 }, { mod: 'defence', value: 0.10, where: 'coast' }] },
        { id: 'sea3', name: 'Chip Packaging', desc: 'Chip fabs +20%.', fx: [{ mod: 'stratworks', value: 0.20 }] },
        { id: 'sea4', name: 'Jungle Warfare', desc: '+20% defence in jungle and mountains.', fx: [{ mod: 'defence', value: 0.20, terrain: ['jungle', 'mountains'] }] }
      ] },
      latam: { name: 'Latin America', techs: [
        { id: 'lat1', name: 'Commodity Boom', desc: 'Mines +20%.', fx: [{ mod: 'mines', value: 0.20 }] },
        { id: 'lat2', name: 'Agribusiness', desc: 'Farms +25%.', fx: [{ mod: 'farms', value: 0.25 }] },
        { id: 'lat3', name: 'Mercosur', desc: '+10% trade bonus, +1 trade slot.', fx: [{ mod: 'tradeBonus', value: 0.10 }, { mod: 'tradeSlots', value: 1 }] },
        { id: 'lat4', name: 'Jungle and Andes Warfare', desc: '+20% defence in jungle and mountains.', fx: [{ mod: 'defence', value: 0.20, terrain: ['jungle', 'mountains'] }] }
      ] },
      africa: { name: 'African Union', techs: [
        { id: 'afr1', name: 'Critical Minerals', desc: 'Mines +25%.', fx: [{ mod: 'mines', value: 0.25 }] },
        { id: 'afr2', name: 'Mobile Money', desc: 'Tax +10%.', fx: [{ mod: 'tax', value: 0.10 }] },
        { id: 'afr3', name: 'Peacekeeping Missions', desc: 'Organisation +10%.', fx: [{ mod: 'org', value: 0.10 }] },
        { id: 'afr4', name: 'Bush Warfare', desc: 'Infantry and militia +15% defence.', fx: [{ mod: 'defence', value: 0.15, unit: ['infantry', 'militia'] }] }
      ] },
      south: { name: 'Global South', techs: [
        { id: 'gs1', name: 'Demographic Dividend', desc: 'Manpower +15%.', fx: [{ mod: 'manpower', value: 0.15 }] },
        { id: 'gs2', name: 'IT Services', desc: 'Research +10%.', fx: [{ mod: 'research', value: 0.10 }] },
        { id: 'gs3', name: 'Green Revolution', desc: 'Farms +20%.', fx: [{ mod: 'farms', value: 0.20 }] },
        { id: 'gs4', name: 'Non-Alignment', desc: '+10% trade bonus.', fx: [{ mod: 'tradeBonus', value: 0.10 }] }
      ] }
    }
  }
};

// TECH_CULTURE[group] = { name, techs: [t1, t2, t3, t4] }. Effects apply to the era's own
// units: 'cavalry' means horse archers in 431 BC and cossacks in 1805.
const TECH_CULTURE = {
  steppe: { name: 'Steppe', techs: [
    { id: 'steppe1', name: 'Remount Herds', desc: 'Horses +30% (in game: strategic good +30%).', fx: [{ mod: 'strategic', value: 0.30 }] },
    { id: 'steppe2', name: 'Feigned Retreat', desc: 'Mounted units +15% attack.', fx: [{ mod: 'attack', value: 0.15, cls: 'cavalry' }] },
    { id: 'steppe3', name: 'Tribute of the Settled', desc: 'Gold from each weaker neighbour (in game: +1.5 gold per day).', fx: [{ mod: 'goldPerDay', value: 1.5 }] },
    { id: 'steppe4', name: 'Great Assembly', desc: 'Stability +10%.', fx: [{ mod: 'stability', value: 0.10 }] }
  ] },
  arab: { name: 'Arab and North African', techs: [
    { id: 'arab1', name: 'Caravan Cities', desc: '+1 land trade slot.', fx: [{ mod: 'tradeSlots', value: 1 }] },
    { id: 'arab2', name: 'Endowments (waqf)', desc: 'Stability +10%.', fx: [{ mod: 'stability', value: 0.10 }] },
    { id: 'arab3', name: 'Dhow Trade', desc: '+1 sea trade slot.', fx: [{ mod: 'tradeSlots', value: 1 }] },
    { id: 'arab4', name: 'Desert Warriors', desc: 'Desert combat +20%.', fx: [{ mod: 'attack', value: 0.20, terrain: ['desert'] }, { mod: 'defence', value: 0.20, terrain: ['desert'] }] }
  ] },
  persian: { name: 'Persian', techs: [
    { id: 'persian1', name: 'Qanats', desc: 'Farms in desert +40%.', fx: [{ mod: 'farms', value: 0.40, terrain: ['desert'] }] },
    { id: 'persian2', name: 'Royal Roads', desc: 'Supply +15%.', fx: [{ mod: 'supply', value: 0.15 }] },
    { id: 'persian3', name: 'Heavy Horse', desc: 'Cavalry +15%.', fx: [{ mod: 'attack', value: 0.15, cls: 'cavalry' }] },
    { id: 'persian4', name: 'Satrapal Rule', desc: 'Tax +10%.', fx: [{ mod: 'tax', value: 0.10 }] }
  ] },
  turkic: { name: 'Turkic', techs: [
    { id: 'turkic1', name: 'Horse Lords', desc: 'Horses +25% (in game: strategic good +25%).', fx: [{ mod: 'strategic', value: 0.25 }] },
    { id: 'turkic2', name: 'Frontier Warriors', desc: 'Manpower +15%.', fx: [{ mod: 'manpower', value: 0.15 }] },
    { id: 'turkic3', name: 'Caravan Tolls', desc: 'Gold from land deals (in game: +10% trade bonus).', fx: [{ mod: 'tradeBonus', value: 0.10 }] },
    { id: 'turkic4', name: 'Court Scribes', desc: 'Political power +10%.', fx: [{ mod: 'pp', value: 0.10 }] }
  ] },
  chinese: { name: 'Chinese', techs: [
    { id: 'chinese1', name: 'Ever-normal Granaries', desc: 'Food stockpile +60 days (in game: stockpiles hold 60 more days).', fx: [{ mod: 'stockDays', value: 60 }] },
    { id: 'chinese2', name: 'Examinations', desc: 'Research +10%.', fx: [{ mod: 'research', value: 0.10 }] },
    { id: 'chinese3', name: 'Canals', desc: 'Supply +15%.', fx: [{ mod: 'supply', value: 0.15 }] },
    { id: 'chinese4', name: 'Salt and Iron', desc: 'Mines +20%.', fx: [{ mod: 'mines', value: 0.20 }] }
  ] },
  eastasian: { name: 'Japanese and other East Asian', techs: [
    { id: 'eastasian1', name: 'Rice Terraces', desc: 'Farms +20%.', fx: [{ mod: 'farms', value: 0.20 }] },
    { id: 'eastasian2', name: 'Sword Smiths', desc: 'Arsenals +20%.', fx: [{ mod: 'arsenals', value: 0.20 }] },
    { id: 'eastasian3', name: 'Coastal Trade', desc: '+1 sea trade slot.', fx: [{ mod: 'tradeSlots', value: 1 }] },
    { id: 'eastasian4', name: 'Warrior Houses', desc: 'Organisation +10%.', fx: [{ mod: 'org', value: 0.10 }] }
  ] },
  indian: { name: 'Indian and Southeast Asian', techs: [
    { id: 'indian1', name: 'Monsoon Ports', desc: '+1 sea trade slot.', fx: [{ mod: 'tradeSlots', value: 1 }] },
    { id: 'indian2', name: 'Temple Economy', desc: 'Stability +10%.', fx: [{ mod: 'stability', value: 0.10 }] },
    { id: 'indian3', name: 'Elephant Stables', desc: 'Elephants +20% (or cavalry in later eras).', fx: [{ mod: 'attack', value: 0.20, cls: 'armor' }, { mod: 'attack', value: 0.10, cls: 'cavalry' }] },
    { id: 'indian4', name: 'Spice Gardens', desc: 'Luxuries +30%.', fx: [{ mod: 'luxuries', value: 0.30 }] }
  ] },
  germanic: { name: 'Germanic, Frankish, English', techs: [
    { id: 'germanic1', name: 'Village Commons', desc: 'Farms +15%.', fx: [{ mod: 'farms', value: 0.15 }] },
    { id: 'germanic2', name: 'Guild Towns', desc: 'Workshops +20%.', fx: [{ mod: 'workshops', value: 0.20 }] },
    { id: 'germanic3', name: 'Assemblies', desc: 'Stability +10%.', fx: [{ mod: 'stability', value: 0.10 }] },
    { id: 'germanic4', name: 'Shield Wall and Drill', desc: 'Infantry +10% defence.', fx: [{ mod: 'defence', value: 0.10, cls: 'infantry' }] }
  ] },
  latin: { name: 'Latin, Italian, Iberian', techs: [
    { id: 'latin1', name: 'Roman Law', desc: 'Stability +10%.', fx: [{ mod: 'stability', value: 0.10 }] },
    { id: 'latin2', name: 'City Communes', desc: 'Tax +15%.', fx: [{ mod: 'tax', value: 0.15 }] },
    { id: 'latin3', name: 'Sea Trade', desc: '+1 sea trade slot.', fx: [{ mod: 'tradeSlots', value: 1 }] },
    { id: 'latin4', name: 'Vineyards and Olives', desc: 'Luxuries +25%.', fx: [{ mod: 'luxuries', value: 0.25 }] }
  ] },
  greek: { name: 'Greek', techs: [
    { id: 'greek1', name: 'Harbours', desc: '+1 sea trade slot.', fx: [{ mod: 'tradeSlots', value: 1 }] },
    { id: 'greek2', name: 'Philosophy', desc: 'Research +15%.', fx: [{ mod: 'research', value: 0.15 }] },
    { id: 'greek3', name: 'Olive and Wine', desc: 'Luxuries +25%.', fx: [{ mod: 'luxuries', value: 0.25 }] },
    { id: 'greek4', name: 'Citizen Levy', desc: 'Manpower +15%.', fx: [{ mod: 'manpower', value: 0.15 }] }
  ] },
  slavic: { name: 'Slavic and Russian', techs: [
    { id: 'slavic1', name: 'River Routes', desc: '+1 land trade slot.', fx: [{ mod: 'tradeSlots', value: 1 }] },
    { id: 'slavic2', name: 'Forest Frontier', desc: 'Fuel works +30%.', fx: [{ mod: 'fuelworks', value: 0.30 }] },
    { id: 'slavic3', name: 'Fortified Towns', desc: 'Defence +20% (in game: in your own provinces).', fx: [{ mod: 'defence', value: 0.20, where: 'home' }] },
    { id: 'slavic4', name: 'Boyar Levies', desc: 'Manpower +20%.', fx: [{ mod: 'manpower', value: 0.20 }] }
  ] },
  celtic: { name: 'Celtic', techs: [
    { id: 'celtic1', name: 'Oppida', desc: 'Defence +15% (in game: in your own provinces).', fx: [{ mod: 'defence', value: 0.15, where: 'home' }] },
    { id: 'celtic2', name: 'Iron Hillforts', desc: 'Mines +20%.', fx: [{ mod: 'mines', value: 0.20 }] },
    { id: 'celtic3', name: 'Druid Councils', desc: 'Stability +10%.', fx: [{ mod: 'stability', value: 0.10 }] },
    { id: 'celtic4', name: 'War Chariots and Horse', desc: 'Cavalry +15%.', fx: [{ mod: 'attack', value: 0.15, cls: 'cavalry' }, { mod: 'attack', value: 0.15, cls: 'armor' }] }
  ] },
  african: { name: 'Sub-Saharan African', techs: [
    { id: 'african1', name: 'Gold Trade', desc: 'Luxuries sell for 25% more.', fx: [{ mod: 'sellPrice', value: 0.25, good: 'luxuries' }] },
    { id: 'african2', name: 'Iron Smelting', desc: 'Mines +25%.', fx: [{ mod: 'mines', value: 0.25 }] },
    { id: 'african3', name: 'Cattle Wealth', desc: 'Food +20%.', fx: [{ mod: 'farms', value: 0.20 }] },
    { id: 'african4', name: 'Kinship Levies', desc: 'Manpower +20%.', fx: [{ mod: 'manpower', value: 0.20 }] }
  ] },
  americas: { name: 'Americas', techs: [
    { id: 'americas1', name: 'Terrace Farming', desc: 'Farms +30%.', fx: [{ mod: 'farms', value: 0.30 }] },
    { id: 'americas2', name: 'Tribute Networks', desc: 'Tax +15%.', fx: [{ mod: 'tax', value: 0.15 }] },
    { id: 'americas3', name: 'Relay Runners', desc: 'Supply +20%.', fx: [{ mod: 'supply', value: 0.20 }] },
    { id: 'americas4', name: 'Obsidian and Copper Workshops', desc: 'Arsenals +20%.', fx: [{ mod: 'arsenals', value: 0.20 }] }
  ] }
};

// culture code (the `culture` field on nations) -> TECH_CULTURE group key.
const TECH_CULTURE_MAP = {
  // 431 BC
  spa: 'greek', gre: 'greek', ste: 'steppe', per: 'persian', car: 'arab', ita: 'latin', cel: 'celtic', ind: 'indian', chi: 'chinese', ame: 'americas',
  // 117 AD
  lat: 'latin', afr: 'african', ger: 'germanic', oth: 'slavic',
  // 1200
  frk: 'germanic', sla: 'slavic', ibr: 'latin', ara: 'arab', tur: 'turkic', jap: 'eastasian',
  // 1805
  fra: 'latin', his: 'latin', eng: 'germanic', rus: 'slavic',
  // 1914 and 1936
  rom: 'latin', ang: 'germanic', asi: 'chinese'
};

// Per-era, per-nation overrides where the culture code is too coarse.
const TECH_CULTURE_OVERRIDE = {
  'greece-431bc': {
    ILL: 'celtic', PAE: 'celtic', LIB: 'arab', GAR: 'arab', KUS: 'african', SAB: 'arab', GER: 'germanic'
  },
  'rome-117': {
    BOS: 'greek', GOG: 'eastasian', BUY: 'eastasian', SAM: 'eastasian', WAA: 'eastasian', TAR: 'persian',
    HIM: 'arab', HAD: 'arab', GAR: 'arab'
  },
  'medieval-1200': {
    WAL: 'celtic', CON: 'celtic', SCO: 'celtic', GRY: 'eastasian', DVT: 'eastasian', ARM: 'persian', QOC: 'turkic',
    CUM: 'steppe', TIB: 'chinese', MAK: 'african', ALO: 'african'
  },
  'napoleonic-1805': {
    HOL: 'germanic', WAL: 'latin', MOL: 'latin', EGY: 'arab', ALG: 'arab', TUN: 'arab', TRI: 'arab', MOR: 'arab', SAU: 'arab', YEM: 'arab', OMA: 'arab',
    KAZ: 'steppe', AFG: 'persian', KLT: 'persian', JOS: 'eastasian', JAP: 'eastasian', VIE: 'eastasian', HAI: 'african', PER: 'persian'
  },
  'greatwar-1917': {
    OTT: 'turkic', PER: 'persian', AFG: 'persian', BUK: 'turkic', KHI: 'turkic', GRE: 'greek', NDG: 'greek', HEJ: 'arab', VIL: 'americas',
    ETH: 'african', LIB: 'african', HAI: 'african', MON: 'steppe', JAP: 'eastasian', NEP: 'indian', SIA: 'indian', RAJ: 'indian', NED: 'germanic'
  },
  'ww2-1936': {
    HUN: 'germanic', GRE: 'greek', TUR: 'turkic', FIN: 'germanic', EST: 'germanic', LAT: 'germanic', LIT: 'slavic',
    NEP: 'indian', TIB: 'chinese', ETH: 'african', LIB: 'african', PER: 'persian', AFG: 'persian',
    MON: 'steppe', JAP: 'eastasian', SIA: 'indian', RAJ: 'indian', HAI: 'african', PHI: 'indian'
  }
};

// Deposits per era: [good, lon, lat, size, label]. good: food, metal, fuel, strategic, luxuries.
// For 1936 these add to RESOURCE_SITES in countries.js (oil, steel, coal, rubber, ...).
const ERA_DEPOSITS = {
  'greece-431bc': [
    // strategic: tin
    ['strategic', -5.2, 50.2, 18, 'Cornish tin'],
    ['strategic', -3.5, 47.8, 10, 'Armorican tin'],
    ['strategic', -8.3, 42.5, 14, 'Galician tin (the Cassiterides)'],
    ['strategic', 13.0, 50.5, 6, 'Ore Mountains tin'],
    ['strategic', 10.6, 43.1, 5, 'Campiglia tin'],
    ['strategic', 66.0, 39.5, 8, 'Zeravshan tin'],
    ['strategic', 103.15, 23.36, 10, 'Gejiu tin'],
    ['strategic', 112.0, 25.5, 6, 'Nanling tin'],
    // luxuries
    ['luxuries', 24.05, 37.72, 20, 'Laurion silver'],
    ['luxuries', 24.0, 40.9, 12, 'Mount Pangaion gold'],
    ['luxuries', 28.05, 38.48, 10, 'Pactolus gold'],
    ['luxuries', -6.6, 37.7, 14, 'Río Tinto silver'],
    ['luxuries', 35.2, 33.27, 8, 'Tyrian purple'],
    ['luxuries', 26.1, 38.4, 6, 'Chian wine'],
    ['luxuries', 33.5, 21.0, 10, 'Nubian gold'],
    ['luxuries', 118.3, 36.8, 10, 'Qi silk'],
    ['luxuries', 20.0, 54.9, 6, 'Baltic amber'],
    // metal
    ['metal', 33.0, 35.0, 16, 'Cypriot copper'],
    ['metal', 35.4, 30.6, 6, 'Faynan copper'],
    ['metal', 10.3, 42.8, 10, 'Elba iron'],
    ['metal', 14.3, 47.1, 8, 'Noric iron'],
    ['metal', 37.5, 41.0, 8, 'Chalybian iron'],
    ['metal', 56.5, 24.0, 6, 'Magan copper'],
    ['metal', 114.9, 30.1, 12, 'Tonglüshan copper'],
    ['metal', 85.3, 23.4, 10, 'Magadha iron'],
    // fuel: timber and charcoal
    ['fuel', 22.5, 40.8, 14, 'Macedonian timber'],
    ['fuel', 35.9, 34.2, 12, 'Cedars of Lebanon'],
    ['fuel', 33.5, 41.5, 8, 'Pontic timber'],
    ['fuel', 16.5, 39.3, 8, 'Sila forest'],
    ['fuel', 111.0, 30.0, 10, 'Yangtze forests'],
    ['fuel', 3.0, 47.0, 8, 'Gallic forests'],
    // food
    ['food', 31.2, 30.0, 30, 'Nile Delta grain'],
    ['food', 32.6, 25.7, 14, 'Upper Egyptian grain'],
    ['food', 14.3, 37.5, 18, 'Sicilian grain'],
    ['food', 34.0, 45.2, 20, 'Pontic grain'],
    ['food', 44.4, 32.5, 20, 'Mesopotamian grain'],
    ['food', 85.0, 25.5, 20, 'Ganges rice'],
    ['food', 113.5, 35.0, 20, 'Yellow River millet'],
    ['food', 22.4, 39.6, 8, 'Thessalian plain'],
    ['food', 14.4, 41.0, 10, 'Campanian grain'],
    ['food', 9.8, 36.6, 12, 'Bagradas valley grain'],
    ['food', -92.5, 17.5, 8, 'Olmec maize']
  ],
  'rome-117': [
    // strategic: horses
    ['strategic', 48.5, 34.8, 18, 'Nisean horse herds'],
    ['strategic', 45.0, 24.0, 10, 'Arabian horses'],
    ['strategic', 36.0, 47.5, 16, 'Pontic steppe herds'],
    ['strategic', 20.0, 46.8, 8, 'Pannonian plain horses'],
    ['strategic', 35.0, 38.7, 10, 'Cappadocian studs'],
    ['strategic', 71.5, 40.6, 16, 'Ferghana horses'],
    ['strategic', 105.0, 47.0, 18, 'Mongolian steppe herds'],
    ['strategic', 7.0, 35.5, 10, 'Numidian horses'],
    ['strategic', -4.5, 39.0, 8, 'Iberian studs'],
    // luxuries
    ['luxuries', 23.1, 46.3, 16, 'Dacian gold (Alburnus Maior)'],
    ['luxuries', -6.77, 42.47, 16, 'Las Médulas gold'],
    ['luxuries', -6.6, 37.7, 10, 'Río Tinto silver'],
    ['luxuries', 117.0, 36.5, 16, 'Shandong silk'],
    ['luxuries', 76.2, 10.2, 16, 'Malabar pepper'],
    ['luxuries', 54.0, 17.2, 12, 'Frankincense of Dhofar'],
    ['luxuries', 35.3, 33.4, 8, 'Syrian glass and purple'],
    ['luxuries', 29.9, 31.2, 8, 'Alexandrian glassworks'],
    ['luxuries', 20.0, 54.9, 6, 'Baltic amber'],
    ['luxuries', 80.4, 6.7, 6, 'Ceylon gems'],
    // metal
    ['metal', 14.3, 47.1, 12, 'Noric steel'],
    ['metal', -2.55, 51.8, 8, 'Forest of Dean iron'],
    ['metal', 18.0, 44.0, 8, 'Dalmatian iron'],
    ['metal', 33.0, 35.0, 8, 'Cypriot copper'],
    ['metal', 113.5, 34.6, 16, 'Han state ironworks'],
    ['metal', 78.5, 17.5, 10, 'Deccan wootz'],
    ['metal', 2.4, 47.1, 8, 'Berry iron'],
    // fuel
    ['fuel', 9.5, 51.0, 14, 'Germanic forests'],
    ['fuel', 2.0, 47.5, 10, 'Gallic forests'],
    ['fuel', 35.9, 34.2, 8, 'Cedars of Lebanon'],
    ['fuel', 33.5, 41.5, 8, 'Pontic timber'],
    ['fuel', 25.0, 47.0, 8, 'Carpathian forests'],
    ['fuel', 108.0, 33.8, 10, 'Qinling forests'],
    ['fuel', 76.0, 12.0, 8, 'Malabar teak'],
    // food
    ['food', 31.2, 30.0, 30, 'Nile Delta grain'],
    ['food', 32.6, 25.7, 14, 'Upper Egyptian grain'],
    ['food', 9.8, 36.3, 20, 'African grain (Africa Proconsularis)'],
    ['food', 14.3, 37.5, 12, 'Sicilian grain'],
    ['food', 34.0, 45.2, 14, 'Bosporan grain'],
    ['food', 44.4, 32.5, 18, 'Mesopotamian grain'],
    ['food', 108.9, 34.3, 18, 'Guanzhong millet'],
    ['food', 115.0, 36.0, 20, 'North China Plain'],
    ['food', 83.0, 25.5, 18, 'Ganges rice'],
    ['food', 14.4, 41.0, 8, 'Campanian grain'],
    ['food', -98.8, 19.7, 10, 'Valley of Mexico maize']
  ],
  'medieval-1200': [
    // strategic: horses
    ['strategic', 105.0, 47.0, 20, 'Mongolian steppe herds'],
    ['strategic', 45.0, 48.0, 16, 'Kipchak steppe herds'],
    ['strategic', 20.0, 47.0, 10, 'Hungarian plain herds'],
    ['strategic', 33.0, 39.0, 12, 'Anatolian herds'],
    ['strategic', 45.0, 24.0, 8, 'Arabian horses'],
    ['strategic', 59.0, 37.5, 12, 'Turkmen horses'],
    ['strategic', -5.5, 37.5, 8, 'Andalusian studs'],
    ['strategic', 71.5, 40.6, 10, 'Ferghana horses'],
    ['strategic', 125.0, 45.0, 10, 'Jurchen herds'],
    ['strategic', 100.0, 36.5, 8, 'Qinghai horses'],
    ['strategic', 40.0, 36.0, 6, 'Jazira horses'],
    // luxuries
    ['luxuries', 28.97, 41.01, 10, 'Constantinople silk'],
    ['luxuries', 120.2, 30.3, 16, 'Jiangnan silk'],
    ['luxuries', 3.7, 51.05, 14, 'Flemish cloth'],
    ['luxuries', 76.2, 10.2, 14, 'Malabar pepper'],
    ['luxuries', 127.4, 0.8, 10, 'Moluccan spices'],
    ['luxuries', 117.2, 29.3, 12, 'Jingdezhen porcelain'],
    ['luxuries', -11.0, 13.5, 16, 'Bambuk gold'],
    ['luxuries', -8.9, 11.7, 10, 'Bure gold'],
    ['luxuries', 29.3, -22.2, 10, 'Limpopo gold (Mapungubwe)'],
    ['luxuries', 10.43, 51.89, 10, 'Rammelsberg silver'],
    ['luxuries', 13.3, 50.9, 10, 'Freiberg silver'],
    ['luxuries', 23.1, 46.3, 8, 'Transylvanian gold'],
    // metal
    ['metal', 14.9, 47.5, 12, 'Styrian Erzberg iron'],
    ['metal', 15.0, 60.0, 10, 'Bergslagen iron'],
    ['metal', -2.9, 43.2, 8, 'Biscay iron'],
    ['metal', 114.5, 36.6, 14, 'Cizhou iron'],
    ['metal', 78.5, 17.5, 8, 'Deccan wootz'],
    ['metal', 133.0, 35.2, 8, 'Izumo iron sand'],
    // fuel
    ['fuel', 38.0, 56.0, 14, 'Russian forests'],
    ['fuel', 10.0, 50.5, 10, 'Hercynian forest'],
    ['fuel', 21.0, 54.0, 8, 'Prussian forests'],
    ['fuel', 112.5, 37.8, 14, 'Shanxi coal'],
    ['fuel', 33.5, 41.5, 8, 'Pontic timber'],
    ['fuel', 137.5, 35.5, 6, 'Kiso forests'],
    // food
    ['food', 31.2, 30.0, 26, 'Nile grain'],
    ['food', 14.3, 37.5, 14, 'Sicilian grain'],
    ['food', 10.0, 45.2, 12, 'Lombard plain'],
    ['food', 2.3, 48.8, 14, 'Île-de-France grain'],
    ['food', 31.0, 49.5, 14, 'Black earth of Kiev'],
    ['food', 120.0, 31.0, 24, 'Jiangnan rice'],
    ['food', 103.9, 13.4, 14, 'Angkor rice (Tonlé Sap)'],
    ['food', 83.0, 25.5, 18, 'Ganges rice'],
    ['food', 60.0, 41.5, 8, 'Khwarazm oasis']
  ],
  'napoleonic-1805': [
    // strategic: saltpetre
    ['strategic', 85.1, 25.6, 26, 'Bihar saltpetre'],
    ['strategic', 88.0, 23.5, 10, 'Bengal saltpetre'],
    ['strategic', -86.1, 37.2, 6, 'Kentucky saltpetre caves'],
    ['strategic', -1.9, 41.6, 4, 'Aragonese saltpetre'],
    ['strategic', 114.0, 36.0, 8, 'North China saltpetre'],
    ['strategic', 51.7, 32.7, 6, 'Isfahan saltpetre'],
    ['strategic', 34.5, 49.6, 6, 'Ukrainian saltpetre'],
    ['strategic', 21.6, 47.5, 6, 'Hungarian saltpetre'],
    ['strategic', 32.6, 25.7, 4, 'Upper Egyptian saltpetre'],
    // luxuries
    ['luxuries', -77.3, 18.1, 14, 'Jamaican sugar'],
    ['luxuries', -72.3, 19.0, 10, 'Haitian sugar and coffee'],
    ['luxuries', -35.0, -8.0, 12, 'Pernambuco sugar'],
    ['luxuries', 118.0, 26.5, 18, 'Fujian tea'],
    ['luxuries', -2.2, 53.5, 16, 'Lancashire cotton mills'],
    ['luxuries', -101.3, 21.0, 18, 'Guanajuato silver'],
    ['luxuries', -65.75, -19.6, 12, 'Potosí silver'],
    ['luxuries', -81.0, 33.5, 10, 'Carolina cotton'],
    ['luxuries', 90.4, 23.7, 10, 'Dhaka muslin and indigo'],
    ['luxuries', 4.8, 45.7, 8, 'Lyon silk'],
    ['luxuries', 110.0, -7.5, 8, 'Java coffee'],
    // metal
    ['metal', 15.0, 60.0, 14, 'Bergslagen iron'],
    ['metal', 60.0, 57.0, 16, 'Urals ironworks'],
    ['metal', -2.5, 52.6, 12, 'Coalbrookdale iron'],
    ['metal', 18.9, 50.3, 10, 'Upper Silesian iron'],
    ['metal', 14.9, 47.5, 10, 'Styrian iron'],
    ['metal', -2.9, 43.2, 8, 'Biscay iron'],
    ['metal', 37.6, 54.2, 8, 'Tula iron'],
    ['metal', -76.5, 40.3, 6, 'Pennsylvania iron'],
    ['metal', -5.2, 50.2, 8, 'Cornish copper'],
    // fuel
    ['fuel', -1.6, 55.0, 16, 'Newcastle coal'],
    ['fuel', -3.3, 51.7, 12, 'South Wales coal'],
    ['fuel', 7.0, 51.5, 8, 'Ruhr coal'],
    ['fuel', 4.0, 50.5, 10, 'Walloon coal'],
    ['fuel', 38.0, 56.0, 14, 'Russian forests'],
    ['fuel', 15.0, 62.0, 8, 'Swedish forests'],
    ['fuel', -72.0, 44.0, 10, 'New England forests'],
    // food
    ['food', 33.0, 48.0, 18, 'Ukrainian grain'],
    ['food', 19.0, 53.0, 12, 'Vistula grain'],
    ['food', 2.3, 48.8, 12, 'Paris basin grain'],
    ['food', 31.2, 30.0, 14, 'Nile grain'],
    ['food', 89.0, 24.0, 18, 'Bengal rice'],
    ['food', 120.0, 31.0, 18, 'Jiangnan rice'],
    ['food', -78.0, 39.0, 10, 'Chesapeake grain'],
    ['food', 20.0, 47.0, 10, 'Hungarian plain'],
    ['food', 10.0, 45.2, 8, 'Po valley']
  ],
  'greatwar-1917': [
    // strategic: nitrates
    ['strategic', -69.8, -20.2, 30, 'Tarapacá nitrates'],
    ['strategic', -69.9, -23.3, 20, 'Antofagasta nitrates'],
    ['strategic', -76.4, -13.6, 6, 'Peruvian guano islands'],
    ['strategic', 9.26, 59.56, 6, 'Notodden nitrates (Norsk Hydro)'],
    ['strategic', 85.1, 25.6, 8, 'Bihar saltpetre'],
    ['strategic', -79.5, 40.2, 6, 'Pennsylvania coke-oven ammonia'],
    ['strategic', 7.2, 51.5, 6, 'Ruhr coke-oven ammonia'],
    ['strategic', -1.6, 54.8, 4, 'Durham coke-oven ammonia'],
    // luxuries
    ['luxuries', -47.0, -22.5, 18, 'São Paulo coffee'],
    ['luxuries', -89.0, 32.5, 16, 'Cotton Belt'],
    ['luxuries', 31.0, 30.8, 12, 'Egyptian cotton'],
    ['luxuries', 75.0, 20.0, 10, 'Deccan cotton'],
    ['luxuries', -2.2, 53.5, 10, 'Lancashire mills'],
    ['luxuries', 80.7, 7.0, 8, 'Ceylon tea'],
    ['luxuries', -60.0, -3.1, 10, 'Amazon rubber'],
    ['luxuries', 28.0, -26.2, 14, 'Witwatersrand gold'],
    ['luxuries', 138.5, 36.2, 10, 'Japanese silk'],
    // metal: steel
    ['metal', 7.0, 51.5, 20, 'Ruhr steel'],
    ['metal', 6.0, 49.2, 18, 'Lorraine minette ore'],
    ['metal', 20.2, 67.85, 10, 'Kiruna iron'],
    ['metal', -80.0, 40.45, 24, 'Pittsburgh steel'],
    ['metal', -92.5, 47.5, 16, 'Mesabi Range iron'],
    ['metal', 33.4, 47.9, 14, 'Krivoi Rog iron'],
    ['metal', 13.4, 49.75, 8, 'Škoda Pilsen steel'],
    ['metal', -1.2, 54.6, 12, 'Middlesbrough steel'],
    ['metal', 114.9, 30.2, 6, 'Daye iron (Hanyeping)'],
    // fuel: coal (and early oil)
    ['fuel', -1.6, 55.0, 16, 'Northumberland coal'],
    ['fuel', -3.3, 51.7, 16, 'South Wales coal'],
    ['fuel', 7.1, 51.45, 20, 'Ruhr coal'],
    ['fuel', 3.1, 50.5, 12, 'Nord-Pas-de-Calais coal'],
    ['fuel', 18.9, 50.2, 10, 'Upper Silesian coal'],
    ['fuel', 38.0, 48.0, 14, 'Donbas coal'],
    ['fuel', -81.6, 38.4, 24, 'Appalachian coal'],
    ['fuel', 118.2, 39.6, 6, 'Kaiping coal'],
    ['fuel', 130.4, 33.6, 6, 'Chikuho coal'],
    ['fuel', 49.9, 40.4, 10, 'Baku oil'],
    ['fuel', 49.3, 31.97, 6, 'Masjed Soleyman oil'],
    ['fuel', -97.85, 22.25, 6, 'Tampico oil'],
    // food
    ['food', 33.0, 48.0, 20, 'Ukrainian grain'],
    ['food', -95.0, 40.0, 20, 'US Midwest grain'],
    ['food', -104.0, 51.0, 14, 'Canadian prairie wheat'],
    ['food', -61.0, -34.0, 18, 'Argentine pampas'],
    ['food', 146.0, -34.0, 8, 'Riverina wheat'],
    ['food', 74.0, 31.0, 10, 'Punjab wheat'],
    ['food', 20.0, 47.0, 12, 'Hungarian plain'],
    ['food', 26.0, 44.3, 8, 'Wallachian grain']
  ],
  'ww2-1936': [
    // food regions
    ['food', 33.0, 48.5, 24, 'Ukrainian black earth'],
    ['food', 39.5, 45.5, 12, 'Kuban grain'],
    ['food', -93.0, 41.5, 26, 'US Corn Belt'],
    ['food', -99.0, 38.5, 18, 'Great Plains wheat'],
    ['food', -105.0, 51.0, 18, 'Canadian prairie wheat'],
    ['food', -61.0, -34.5, 22, 'Argentine pampas'],
    ['food', 74.0, 31.0, 14, 'Punjab wheat'],
    ['food', 89.0, 24.0, 14, 'Bengal rice'],
    ['food', 114.0, 30.0, 14, 'Yangtze rice'],
    ['food', 104.0, 30.5, 12, 'Sichuan basin'],
    ['food', 95.5, 17.0, 12, 'Irrawaddy rice'],
    ['food', 105.8, 10.2, 10, 'Mekong Delta rice'],
    ['food', 31.2, 30.5, 12, 'Nile Delta'],
    ['food', 146.0, -34.5, 12, 'Australian wheat belt'],
    ['food', 172.5, -43.5, 6, 'Canterbury plains'],
    ['food', 20.0, 46.8, 12, 'Hungarian plain'],
    ['food', 26.5, 44.3, 10, 'Danubian grain'],
    ['food', 10.0, 45.2, 8, 'Po valley'],
    ['food', 2.0, 49.0, 10, 'Paris basin'],
    ['food', 21.0, 54.3, 6, 'East Prussian grain'],
    ['food', 110.5, -7.3, 10, 'Javanese rice'],
    ['food', 126.0, 45.5, 12, 'Manchurian soybeans'],
    // luxuries
    ['luxuries', -47.0, -22.5, 14, 'São Paulo coffee'],
    ['luxuries', -75.6, 5.0, 8, 'Colombian coffee'],
    ['luxuries', -79.0, 22.0, 10, 'Cuban sugar'],
    ['luxuries', 112.0, -7.5, 8, 'Javanese sugar'],
    ['luxuries', 91.5, 26.5, 8, 'Assam tea'],
    ['luxuries', 138.5, 36.2, 10, 'Japanese silk'],
    ['luxuries', 28.0, -26.2, 14, 'Witwatersrand gold'],
    ['luxuries', 31.0, 30.8, 8, 'Egyptian cotton'],
    ['luxuries', -89.0, 32.5, 12, 'Cotton Belt'],
    ['luxuries', -4.83, 38.77, 8, 'Almadén mercury']
  ],
  'modern-2026': [
    // strategic: microchips (leading-edge fabs, memory, packaging and the machines that make chips)
    ['strategic', 121.0, 24.8, 40, 'Hsinchu and Tainan fabs (TSMC)'],
    ['strategic', 127.1, 37.2, 26, 'Pyeongtaek and Icheon memory fabs'],
    ['strategic', 121.5, 31.2, 16, 'Shanghai fabs (SMIC)'],
    ['strategic', 114.1, 22.6, 10, 'Shenzhen electronics'],
    ['strategic', 114.3, 30.6, 8, 'Wuhan memory fabs'],
    ['strategic', -112.1, 33.5, 12, 'Arizona fabs'],
    ['strategic', -122.0, 37.4, 8, 'Silicon Valley design houses'],
    ['strategic', -97.7, 30.3, 8, 'Texas fabs'],
    ['strategic', -73.8, 42.9, 6, 'Upstate New York fabs'],
    ['strategic', 130.7, 32.8, 10, 'Kumamoto fabs'],
    ['strategic', 141.4, 43.1, 4, 'Hokkaido fabs (Rapidus)'],
    ['strategic', 5.4, 51.4, 10, 'Veldhoven lithography (ASML)'],
    ['strategic', 13.7, 51.0, 8, 'Silicon Saxony'],
    ['strategic', -6.5, 53.4, 4, 'Leixlip fabs'],
    ['strategic', 34.8, 31.6, 6, 'Kiryat Gat fabs'],
    ['strategic', 100.3, 5.4, 8, 'Penang chip packaging'],
    ['strategic', 103.8, 1.35, 6, 'Singapore fabs'],
    ['strategic', 72.6, 23.0, 4, 'Gujarat chip plants'],
    ['strategic', 37.6, 55.7, 3, 'Zelenograd fabs'],
    // metal: rare earths, lithium, cobalt, copper, nickel
    ['metal', 109.9, 40.6, 24, 'Bayan Obo rare earths'],
    ['metal', 115.0, 25.8, 10, 'Ganzhou rare earths'],
    ['metal', -115.5, 35.5, 6, 'Mountain Pass rare earths'],
    ['metal', 122.0, -28.8, 8, 'Mount Weld rare earths'],
    ['metal', 25.5, -10.7, 18, 'Katanga copper and cobalt'],
    ['metal', -68.9, -22.3, 16, 'Atacama copper'],
    ['metal', -67.5, -20.5, 10, 'Uyuni lithium'],
    ['metal', 118.7, -22.5, 14, 'Pilbara iron and lithium'],
    ['metal', 122.4, -3.7, 12, 'Sulawesi nickel'],
    ['metal', 88.2, 69.3, 8, 'Norilsk nickel and palladium'],
    ['metal', 27.5, -25.5, 10, 'Bushveld platinum'],
    // luxuries: consumer electronics and brands
    ['luxuries', 113.5, 23.0, 14, 'Pearl River Delta consumer goods'],
    ['luxuries', 106.0, 21.0, 8, 'Hanoi phone factories'],
    ['luxuries', 2.35, 48.85, 6, 'Paris luxury houses'],
    ['luxuries', 9.2, 45.5, 6, 'Milan fashion and design']
  ]
};
