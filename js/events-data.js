// Iron Meridian event content: everyday events any nation can meet and historical events per era.
// Schema and engine semantics: see the header of js/events.js. Pure data.
'use strict';

const EVENT_DEFS = [

  // =====================================================================
  // EVERYDAY EVENTS (any nation; some limited to eras where the wording fits)
  // =====================================================================

  { id: 'ev_good_harvest', title: 'A Bountiful Harvest',
    text: 'Fair weather and a long summer have filled the granaries of {name} beyond all expectation. The question is what to do with the surplus of {food}.',
    mtth: 900,
    options: [
      { text: 'Sell the surplus abroad', ai: 3, fx: { gold: 180 } },
      { text: 'Fill the state stores', ai: 2, fx: { goods: { food: 30 } } },
      { text: 'Hold harvest festivals', ai: 1, fx: { stab: 0.04, goods: { food: 10 } } }
    ] },

  { id: 'ev_poor_harvest', title: 'Blight in the Fields',
    text: 'Late frosts and a wet autumn have ruined much of the harvest. Prices of {food} are climbing in the markets of {capital}.',
    mtth: 900,
    options: [
      { text: 'Buy {food} from abroad', ai: 2, fx: { gold: -150, goods: { food: 20 } } },
      { text: 'Introduce rationing', ai: 2, fx: { stab: -0.03, mod: { name: 'Rationing', days: 180, fx: [{ mod: 'foodNeed', value: -0.10 }, { mod: 'stability', value: -0.03 }] } } },
      { text: 'Let the market settle it', ai: 1, fx: { stab: -0.06, goods: { food: -10 } } }
    ] },

  { id: 'ev_famine', title: 'Famine Spreads',
    text: 'Stores of {food} have run dangerously low and hunger is reaching the towns. Crowds gather outside the offices of the government in {capital}.',
    mtth: 120, repeat: 900, cond: { short: 'food' },
    options: [
      { text: 'Pay any price for imports', ai: 3, fx: { gold: -250, goods: { food: 25 }, stab: 0.02 } },
      { text: 'Enforce strict rationing', ai: 2, fx: { stab: -0.06, mod: { name: 'Famine Rationing', days: 180, fx: [{ mod: 'foodNeed', value: -0.15 }, { mod: 'manpower', value: -0.10 }] } } },
      { text: 'Appeal to neighbours for aid', ai: 1, fx: { pp: -30, goods: { food: 15 }, relNeighbours: 5 } }
    ] },

  { id: 'ev_mine_discovery', title: 'A New Vein Found',
    text: 'Prospectors have found a rich deposit of {metal} in the hills. Several parties already claim a share of it.',
    mtth: 1100,
    options: [
      { text: 'Open state workings', ai: 2, fx: { gold: -150, mod: { name: 'New Workings', days: 365, fx: [{ mod: 'mines', value: 0.15 }] } } },
      { text: 'Lease it to private hands', ai: 2, fx: { gold: 220 } },
      { text: 'Grant it to loyal supporters', ai: 1, fx: { pp: 25, stab: 0.02 } }
    ] },

  { id: 'ev_workers_strike', title: 'Strike in the Workshops',
    era: ['napoleonic-1805', 'greatwar-1914', 'ww2-1936'],
    text: 'Workers in the manufactories around {capital} have laid down their tools, demanding higher pay and shorter hours. Output is slowing.',
    mtth: 900, cond: { minProvs: 3 },
    options: [
      { text: 'Meet their demands', ai: 2, fx: { gold: -200, stab: 0.04 } },
      { text: 'Break the strike', ai: 1, fx: { stab: -0.05, pp: 15, mod: { name: 'Bitter Workforce', days: 120, fx: [{ mod: 'industry', value: -0.10 }] } } },
      { text: 'Open negotiations', ai: 2, fx: { pp: -25, mod: { name: 'Slow Negotiations', days: 60, fx: [{ mod: 'industry', value: -0.05 }] } } }
    ] },

  { id: 'ev_tax_revolt', title: 'Tax Riots',
    text: 'Collectors have been driven out of several districts by angry crowds. The people say they cannot pay what {name} demands of them.',
    mtth: 500, cond: { stabBelow: 0.5 },
    options: [
      { text: 'Remit taxes for a season', ai: 2, fx: { stab: 0.05, mod: { name: 'Tax Remission', days: 180, fx: [{ mod: 'tax', value: -0.15 }] } } },
      { text: 'Send in the troops', ai: 1, fx: { stab: -0.03, pp: 10, ws: -0.02 } },
      { text: 'Promise reforms', ai: 2, fx: { pp: -40, stab: 0.04 } }
    ] },

  { id: 'ev_corruption', title: 'Corruption Scandal',
    text: 'Senior officials in {capital} have been caught skimming {coin} from public contracts. The story is spreading fast.',
    mtth: 900,
    options: [
      { text: 'Hold a public trial', ai: 2, fx: { pp: -30, stab: 0.03 } },
      { text: 'Hush it up', ai: 1, fx: { stab: -0.04, gold: 100 } },
      { text: 'Purge the whole office', ai: 1, fx: { pp: -50, mod: { name: 'Honest Collectors', days: 365, fx: [{ mod: 'tax', value: 0.08 }] } } }
    ] },

  { id: 'ev_border_incident', title: 'Border Incident',
    text: 'Soldiers of {name} and a neighbouring power have exchanged fire at a frontier post. Both sides blame the other.',
    mtth: 900, cond: { peace: true },
    options: [
      { text: 'Demand an apology', ai: 2, fx: { ws: 0.03, relNeighbours: -10 } },
      { text: 'Let the matter drop', ai: 2, fx: { ws: -0.02, relNeighbours: 5 } },
      { text: 'Propose a joint commission', ai: 1, fx: { pp: -15, relNeighbours: 10 } }
    ] },

  { id: 'ev_refugees', title: 'Refugees at the Border',
    text: 'Thousands of people fleeing war and hardship abroad have arrived at the borders of {name}, asking to be let in.',
    mtth: 1000,
    options: [
      { text: 'Take them in', ai: 2, fx: { manpower: 8000, stab: -0.03, goods: { food: -8 } } },
      { text: 'Turn them back', ai: 1, fx: { stab: 0.01, relNeighbours: -5 } },
      { text: 'Settle them on empty land', ai: 2, fx: { gold: -120, manpower: 4000, mod: { name: 'New Settlers', days: 365, fx: [{ mod: 'farms', value: 0.06 }] } } }
    ] },

  { id: 'ev_merchant_loan', title: 'A Merchant Offers a Loan',
    text: 'A wealthy trading house offers to lend {name} a large sum of {coin}, repaid in instalments with generous interest.',
    mtth: 400, repeat: 900, cond: { goldBelow: 300 },
    options: [
      { text: 'Accept the loan', ai: 3, fx: { gold: 400, mod: { name: 'Loan Repayments', days: 365, fx: [{ mod: 'goldPerDay', value: -1.5 }] } } },
      { text: 'Borrow a smaller sum', ai: 2, fx: { gold: 180, mod: { name: 'Small Loan Repayments', days: 180, fx: [{ mod: 'goldPerDay', value: -1 }] } } },
      { text: 'Decline politely', ai: 1, fx: { pp: 10 } }
    ] },

  { id: 'ev_military_reformer', title: 'A Military Reformer',
    text: 'A young officer has written a sharp critique of how the army of {name} trains and fights. The old guard is outraged.',
    mtth: 1100,
    options: [
      { text: 'Give him command of training', ai: 2, fx: { pp: -40, mod: { name: 'Army Reforms', days: 365, fx: [{ mod: 'org', value: 0.10 }, { mod: 'attack', value: 0.05 }] } } },
      { text: 'Give him a minor post', ai: 2, fx: { pp: -10, mod: { name: 'Modest Reforms', days: 180, fx: [{ mod: 'attack', value: 0.04 }] } } },
      { text: 'Side with the generals', ai: 1, fx: { pp: 15, stab: 0.01 } }
    ] },

  { id: 'ev_veteran_unrest', title: 'Veterans Grow Restless',
    text: 'Soldiers who have served for years without leave are complaining about unpaid wages and broken promises.',
    mtth: 400, cond: { war: true, stabBelow: 0.6 },
    options: [
      { text: 'Pay a bonus from the treasury', ai: 2, fx: { gold: -200, stab: 0.03, ws: 0.02 } },
      { text: 'Promise land after the war', ai: 2, fx: { pp: -20, ws: 0.03 } },
      { text: 'Ignore their grievances', ai: 1, fx: { stab: -0.05, mod: { name: 'Disgruntled Ranks', days: 120, fx: [{ mod: 'org', value: -0.08 }] } } }
    ] },

  { id: 'ev_war_weariness', title: 'War Weariness',
    text: 'The lists of the dead grow longer and the people of {name} ask what the war is for. Recruiters report empty halls.',
    mtth: 300, repeat: 800, cond: { war: true, wsBelow: 0.35 },
    options: [
      { text: 'Launch a campaign of speeches', ai: 2, fx: { pp: -30, ws: 0.05 } },
      { text: 'Rotate tired units home', ai: 2, fx: { ws: 0.03, stab: 0.02, mod: { name: 'Troop Rotation', days: 120, fx: [{ mod: 'attack', value: -0.05 }] } } },
      { text: 'Silence the critics', ai: 1, fx: { stab: -0.04, ws: 0.02 } }
    ] },

  { id: 'ev_victory_celebration', title: 'Victory Celebrations',
    text: 'News of success at the front has reached {capital}, and the streets are full of cheering crowds.',
    mtth: 400, cond: { war: true, losing: false, wsAbove: 0.45 },
    options: [
      { text: 'Hold a grand parade', ai: 2, fx: { gold: -100, ws: 0.05, stab: 0.03 } },
      { text: 'Use the mood to recruit', ai: 2, fx: { manpower: 10000, ws: 0.02 } },
      { text: 'Keep a modest tone', ai: 1, fx: { pp: 20 } }
    ] },

  { id: 'ev_treasury_crisis', title: 'Treasury Crisis',
    text: 'The treasury of {name} is empty and creditors are refusing further credit. Officials and soldiers await their pay.',
    mtth: 60, repeat: 400, cond: { goldBelow: 0 },
    options: [
      { text: 'Debase the {coin}', ai: 2, fx: { gold: 300, stab: -0.05, mod: { name: 'Debased Currency', days: 365, fx: [{ mod: 'tradeBonus', value: -0.10 }] } } },
      { text: 'Raise emergency taxes', ai: 2, fx: { gold: 200, stab: -0.04, mod: { name: 'Emergency Levy', days: 180, fx: [{ mod: 'tax', value: 0.10 }, { mod: 'stability', value: -0.03 }] } } },
      { text: 'Sell state lands', ai: 1, fx: { gold: 250, pp: -30 } }
    ] },

  { id: 'ev_coup_plot', title: 'Plot Against the Government',
    text: 'Informers warn that a group of officers and courtiers is planning to seize power in {capital}.',
    mtth: 200, repeat: 1000, cond: { stabBelow: 0.35 },
    options: [
      { text: 'Arrest the plotters', ai: 3, fx: { pp: -40, stab: 0.05, mod: { name: 'Purged Command', days: 180, fx: [{ mod: 'org', value: -0.05 }] } } },
      { text: 'Buy their loyalty', ai: 2, fx: { gold: -250, stab: 0.04 } },
      { text: 'Dismiss the rumours', ai: 1, fx: { stab: -0.06, pp: 10 } }
    ] },

  { id: 'ev_plague', title: 'Pestilence',
    era: ['greece-431bc', 'rome-117', 'medieval-1200'],
    text: 'A deadly sickness has broken out in {capital} and is spreading along the roads. Healers can do little against it.',
    mtth: 1400, repeat: 2000,
    options: [
      { text: 'Close the city gates', ai: 2, fx: { mod: { name: 'Quarantine', days: 180, fx: [{ mod: 'tradeBonus', value: -0.15 }, { mod: 'manpower', value: -0.05 }] } } },
      { text: 'Hold rites and processions', ai: 2, fx: { gold: -80, stab: 0.02, mod: { name: 'Pestilence', days: 270, fx: [{ mod: 'manpower', value: -0.15 }] } } },
      { text: 'Move the court away', ai: 1, fx: { pp: -30, stab: -0.03, mod: { name: 'Lingering Sickness', days: 180, fx: [{ mod: 'manpower', value: -0.10 }] } } }
    ] },

  { id: 'ev_great_fire', title: 'Fire in the Capital',
    text: 'A great fire has swept through the crowded quarters of {capital}, leaving thousands without homes.',
    mtth: 1500,
    options: [
      { text: 'Rebuild on a grand plan', ai: 2, fx: { gold: -300, stab: 0.02, mod: { name: 'Grand Rebuilding', days: 365, fx: [{ mod: 'construction', value: 0.10 }] } } },
      { text: 'Rebuild cheaply and quickly', ai: 2, fx: { gold: -100, mod: { name: 'Hasty Rebuilding', days: 180, fx: [{ mod: 'industry', value: -0.05 }] } } },
      { text: 'Leave it to the citizens', ai: 1, fx: { stab: -0.05 } }
    ] },

  { id: 'ev_scholars', title: 'Scholars Seek Patronage',
    text: 'A circle of learned men has come to {capital} seeking a patron. They promise new knowledge in exchange for support.',
    mtth: 1100,
    options: [
      { text: 'Fund their work', ai: 2, fx: { gold: -150, mod: { name: 'Learned Patronage', days: 365, fx: [{ mod: 'research', value: 0.10 }] } } },
      { text: 'Offer a modest stipend', ai: 2, fx: { gold: -50, mod: { name: 'Small Stipend', days: 180, fx: [{ mod: 'research', value: 0.05 }] } } },
      { text: 'Send them away', ai: 1, fx: { pp: 5 } }
    ] },

  { id: 'ev_pirates', title: 'Raiders on the Coast',
    text: 'Raiders have been seizing merchant ships and plundering coastal villages of {name}. Traders demand protection.',
    mtth: 900, cond: { coastal: true },
    options: [
      { text: 'Hunt them down', ai: 2, fx: { gold: -150, mod: { name: 'Coastal Patrols', days: 365, fx: [{ mod: 'tradeBonus', value: 0.05 }, { mod: 'naval', value: 0.05 }] } } },
      { text: 'Pay them to go elsewhere', ai: 1, fx: { gold: -100, relNeighbours: -5 } },
      { text: 'Let the merchants cope', ai: 1, fx: { mod: { name: 'Raided Shipping', days: 180, fx: [{ mod: 'tradeBonus', value: -0.10 }] } } }
    ] },

  { id: 'ev_religious_revival', title: 'A Wave of Devotion',
    text: 'Preachers draw great crowds across the country and pilgrims fill the roads to the holy places of {name}.',
    mtth: 1200,
    options: [
      { text: 'Sponsor the festivals', ai: 2, fx: { gold: -100, stab: 0.05 } },
      { text: 'Tax the pilgrims', ai: 1, fx: { gold: 150, stab: -0.02 } },
      { text: 'Enlist the faithful', ai: 1, fx: { manpower: 6000, ws: 0.03, stab: -0.01 } }
    ] },

  { id: 'ev_trade_boom', title: 'A Season of Trade',
    text: 'Foreign merchants have crowded into the markets of {capital} this year, eager for {luxuries} and other wares.',
    mtth: 1000, cond: { peace: true },
    options: [
      { text: 'Build new markets and roads', ai: 2, fx: { gold: -120, mod: { name: 'Trade Boom', days: 365, fx: [{ mod: 'tradeBonus', value: 0.12 }] } } },
      { text: 'Levy tolls on the traders', ai: 2, fx: { gold: 200, relNeighbours: -3 } }
    ] },

  { id: 'ev_deserters', title: 'Deserters in the Hills',
    text: 'Bands of deserters are living off the land and robbing travellers. Many say they would return for a pardon.',
    mtth: 500, cond: { war: true },
    options: [
      { text: 'Offer an amnesty', ai: 2, fx: { manpower: 6000, ws: -0.02 } },
      { text: 'Hunt them down', ai: 2, fx: { pp: -10, ws: 0.02, mod: { name: 'Harsh Discipline', days: 180, fx: [{ mod: 'org', value: 0.05 }, { mod: 'stability', value: -0.02 }] } } },
      { text: 'Leave the hills alone', ai: 1, fx: { stab: -0.03 } }
    ] },

  { id: 'ev_arms_surplus', title: 'Surplus {arms}',
    text: 'The arsenals of {name} hold more {arms} than a peacetime army needs. A foreign buyer has made an offer.',
    mtth: 1100, cond: { peace: true },
    options: [
      { text: 'Sell to the buyer', ai: 2, fx: { arms: -500, gold: 220 } },
      { text: 'Keep them in reserve', ai: 2, fx: { ws: 0.01 } },
      { text: 'Gift them to a neighbour', ai: 1, fx: { arms: -400, relNeighbours: 10 } }
    ] },

  { id: 'ev_court_rivalry', title: 'Quarrel at Court',
    text: 'The commander of the army and the keeper of the treasury are openly feuding over the budget of {name}. Both demand the ruler take a side.',
    mtth: 1000,
    options: [
      { text: 'Back the army', ai: 2, fx: { mod: { name: 'Army Favoured', days: 365, fx: [{ mod: 'recruitCost', value: -0.10 }, { mod: 'tax', value: -0.05 }] } } },
      { text: 'Back the treasury', ai: 2, fx: { mod: { name: 'Treasury Favoured', days: 365, fx: [{ mod: 'tax', value: 0.08 }, { mod: 'recruitCost', value: 0.05 }] } } },
      { text: 'Dismiss them both', ai: 1, fx: { pp: -25, stab: 0.02 } }
    ] },

  { id: 'ev_metal_shortage', title: 'Shortage of {metal}',
    text: 'Workshops report they cannot get enough {metal} to meet their orders. Hoarders are driving up prices.',
    mtth: 200, repeat: 900, cond: { short: 'metal' },
    options: [
      { text: 'Seize the hoards', ai: 2, fx: { goods: { metal: 15 }, stab: -0.04 } },
      { text: 'Buy abroad at any cost', ai: 2, fx: { gold: -200, goods: { metal: 20 } } },
      { text: 'Cut back production', ai: 1, fx: { mod: { name: 'Metal Rationing', days: 120, fx: [{ mod: 'arsenals', value: -0.10 }, { mod: 'workshops', value: -0.05 }] } } }
    ] },

  { id: 'ev_fuel_shortage', title: 'Shortage of {fuel}',
    era: ['napoleonic-1805', 'greatwar-1914', 'ww2-1936'],
    text: 'Stocks of {fuel} are running out. Factories and transport in {name} are grinding to a halt.',
    mtth: 200, repeat: 900, cond: { short: 'fuel' },
    options: [
      { text: 'Import at premium prices', ai: 2, fx: { gold: -200, goods: { fuel: 20 } } },
      { text: 'Ration it strictly', ai: 2, fx: { stab: -0.03, mod: { name: 'Fuel Rationing', days: 180, fx: [{ mod: 'industry', value: -0.08 }, { mod: 'speed', value: -0.05 }] } } }
    ] },

  { id: 'ev_recruitment_drive', title: 'Call for Volunteers',
    text: 'The war demands more men. Officials propose a new drive for recruits across the country.',
    mtth: 500, cond: { war: true, wsAbove: 0.35 },
    options: [
      { text: 'Call up every able man', ai: 2, fx: { manpower: 15000, stab: -0.05 } },
      { text: 'Ask for volunteers only', ai: 2, fx: { manpower: 5000, ws: 0.02 } },
      { text: 'Pay for foreign recruits', ai: 1, fx: { gold: -200, manpower: 8000 } }
    ] },

  { id: 'ev_envoys', title: 'Envoys from Afar',
    text: 'A distant ruler has sent envoys to {capital} with gifts and a wish for friendship.',
    mtth: 1200,
    options: [
      { text: 'Receive them with honours', ai: 2, fx: { gold: -60, pp: 20, relNeighbours: 5 } },
      { text: 'Accept the gifts only', ai: 2, fx: { goods: { luxuries: 20 } } }
    ] },

  // =====================================================================
  // 1936: THE GATHERING STORM
  // =====================================================================

  { id: 'h36_ethiopia', era: 'ww2-1936', tag: 'ITA', date: [1936, 1, 15], until: [1936, 12, 31], news: true,
    title: 'The Ethiopian Campaign',
    text: 'Italian forces massed in Eritrea and Somaliland await orders to advance on Addis Ababa. The League of Nations has threatened sanctions.',
    cond: { exists: 'ETH', notWarWith: 'ETH' },
    options: [
      { text: 'Order the advance', ai: 4, fx: { war: { on: 'ETH', name: 'Second Italo-Ethiopian War' }, ws: 0.05, rel: { ENG: -15, FRA: -10 } } },
      { text: 'Accept a negotiated protectorate', ai: 1, fx: { pp: -30, rel: { ETH: 20, ENG: 10 } } }
    ] },

  { id: 'h36_rhineland', era: 'ww2-1936', tag: 'GER', date: [1936, 3, 7], until: [1936, 12, 31], news: true,
    title: 'Remilitarisation of the Rhineland',
    text: 'German troops stand ready to march into the demilitarised Rhineland, in breach of the Versailles and Locarno treaties.',
    options: [
      { text: 'March into the Rhineland', ai: 5, fx: { ws: 0.05, stab: 0.03, rel: { FRA: -20, ENG: -10, BEL: -10 }, mod: { name: 'Western Fortifications', days: 730, fx: [{ mod: 'defence', value: 0.05 }] } } },
      { text: 'Wait for a better moment', ai: 1, fx: { pp: -20, rel: { FRA: 10, ENG: 10 } } }
    ] },

  { id: 'h36_spain', era: 'ww2-1936', tag: 'SPA', date: [1936, 7, 17], news: true,
    title: 'Spain Divided',
    text: 'Army garrisons across Spain have risen against the elected government in Madrid. The country is sliding into civil war.',
    options: [
      { text: 'The generals take power', ai: 3, fx: { gov: 'Authoritarian', stab: -0.10, manpower: -20000, rel: { GER: 20, ITA: 20 } } },
      { text: 'The Republic holds on', ai: 2, fx: { stab: -0.12, manpower: -20000, ws: 0.05, rel: { SOV: 20 } } },
      { text: 'A negotiated truce', ai: 1, fx: { pp: -50, stab: -0.05 } }
    ] },

  { id: 'h36_purges', era: 'ww2-1936', tag: 'SOV', date: [1936, 8, 19], until: [1937, 12, 31],
    title: 'The Great Purge',
    text: 'Show trials in Moscow signal a sweeping campaign against supposed enemies in the party and the army. Thousands of officers are under suspicion.',
    options: [
      { text: 'Purge the officer corps', ai: 3, fx: { pp: 60, stab: 0.04, mod: { name: 'Purged Officer Corps', days: 730, fx: [{ mod: 'org', value: -0.15 }, { mod: 'attack', value: -0.10 }] } } },
      { text: 'Limit it to the party', ai: 1, fx: { pp: 20, mod: { name: 'Party Purge', days: 365, fx: [{ mod: 'stability', value: -0.03 }] } } }
    ] },

  { id: 'h36_abdication', era: 'ww2-1936', tag: 'ENG', date: [1936, 12, 10], until: [1937, 6, 1],
    title: 'The Abdication Crisis',
    text: 'King Edward VIII wishes to marry a divorced American. The cabinet and the dominions warn they will not accept it.',
    options: [
      { text: 'The King abdicates', ai: 4, fx: { stab: 0.03 } },
      { text: 'Stand by the King', ai: 1, fx: { stab: -0.08, pp: -30 } }
    ] },

  { id: 'h36_xian', era: 'ww2-1936', tag: 'CHI', date: [1936, 12, 12], until: [1937, 6, 1], news: true,
    title: 'The Xi\'an Incident',
    text: 'Chiang Kai-shek has been detained by his own generals at Xi\'an, who demand an end to the fight with the Communists and a united front against Japan.',
    cond: { exists: 'PRC' },
    options: [
      { text: 'Agree to a united front', ai: 3, fx: { peace: 'PRC', pact: { with: 'PRC', years: 5 }, rel: { PRC: 40, JAP: -20 }, ws: 0.05 } },
      { text: 'Continue the suppression', ai: 1, fx: { stab: -0.05, rel: { PRC: -20 } } }
    ] },

  { id: 'h36_marco_polo', era: 'ww2-1936', tag: 'JAP', date: [1937, 7, 7], until: [1938, 12, 31], news: true,
    title: 'The Marco Polo Bridge Incident',
    text: 'A skirmish between Japanese and Chinese troops near Peking has escalated. Army commanders urge a full campaign in China.',
    cond: { exists: 'CHI', notWarWith: 'CHI' },
    options: [
      { text: 'Launch a full campaign', ai: 4, fx: { war: { on: 'CHI', name: 'Second Sino-Japanese War' }, ws: 0.05 } },
      { text: 'Settle it locally', ai: 1, fx: { pp: -30, rel: { CHI: 10 } } }
    ] },

  { id: 'h36_anschluss_aus', era: 'ww2-1936', tag: 'AUS', date: [1938, 2, 12], until: [1938, 12, 31],
    title: 'Summons to Berchtesgaden',
    text: 'The Austrian Chancellor has been called to meet Hitler and presented with demands that would place pro-German ministers in the cabinet.',
    cond: { exists: 'GER' },
    options: [
      { text: 'Accept the demands', ai: 2, fx: { stab: -0.05, rel: { GER: 30 }, flag: 'aus_accepted' } },
      { text: 'Call a plebiscite on independence', ai: 2, fx: { ws: 0.10, rel: { GER: -30, ITA: 10 } } }
    ] },

  { id: 'h36_anschluss', era: 'ww2-1936', tag: 'GER', date: [1938, 3, 12], until: [1939, 12, 31], news: true,
    title: 'The Anschluss',
    text: 'German forces are massed on the Austrian border. Vienna cannot count on help from Rome, Paris or London.',
    cond: { exists: 'AUS', notWarWith: 'AUS' },
    options: [
      { text: 'Annex Austria', ai: 4, fx: { annex: 'AUS', stab: 0.04, ws: 0.03, rel: { FRA: -15, ENG: -10, CZE: -20 } } },
      { text: 'Settle for a customs union', ai: 1, fx: { rel: { AUS: 20 }, pp: 20 } }
    ] },

  { id: 'h36_sudeten', era: 'ww2-1936', tag: 'GER', date: [1938, 9, 29], until: [1939, 6, 1], news: true,
    title: 'The Munich Agreement',
    text: 'At Munich, Britain and France have agreed that the German-speaking borderlands of Bohemia should pass to Germany. Czechoslovakia was not consulted.',
    cond: { exists: 'CZE', notWarWith: 'CZE', notOwns: 'Plzeň Hills' },
    options: [
      { text: 'Take the borderlands', ai: 4, fx: { provs: { names: ['Plzeň Hills', 'Plzeň Plains'], to: 'self' }, stab: 0.03, rel: { CZE: -40 } } },
      { text: 'Refuse the compromise', ai: 1, fx: { ws: 0.03, rel: { ENG: -20, FRA: -20 } } }
    ] },

  { id: 'h36_prague', era: 'ww2-1936', tag: 'GER', date: [1939, 3, 15], until: [1939, 12, 31], news: true,
    title: 'The End of Czechoslovakia',
    text: 'Slovak separatists have declared independence and the rump Czech state is defenceless. Berlin considers occupying Prague.',
    cond: { exists: 'CZE', notWarWith: 'CZE' },
    options: [
      { text: 'Occupy Bohemia and Moravia', ai: 3, fx: { annex: 'CZE', rel: { ENG: -30, FRA: -25, POL: -20, SOV: -10 } } },
      { text: 'Make it a client state', ai: 2, fx: { puppet: 'CZE', rel: { ENG: -10, FRA: -10 } } }
    ] },

  { id: 'h36_albania', era: 'ww2-1936', tag: 'ITA', date: [1939, 4, 7], until: [1940, 6, 1], news: true,
    title: 'The Albanian Crown',
    text: 'King Zog has fled and Italian troops hold Tirana. Rome must decide how to govern its new possession.',
    cond: { owns: 'Tirana' },
    options: [
      { text: 'Unite the two crowns', ai: 3, fx: { manpower: 10000, pp: 20, rel: { GRE: -15, YUG: -15, ENG: -10 } } },
      { text: 'Keep a loose protectorate', ai: 1, fx: { stab: 0.02, rel: { GRE: 5, YUG: 5 } } }
    ] },

  { id: 'h36_molotov', era: 'ww2-1936', tag: 'SOV', date: [1939, 8, 23], until: [1940, 6, 1], news: true,
    title: 'Pact with Germany',
    text: 'Talks with Britain and France have stalled. Berlin now offers a non-aggression pact with secret terms dividing Eastern Europe.',
    cond: { exists: 'GER', notWarWith: 'GER' },
    options: [
      { text: 'Sign the pact', ai: 4, fx: { pact: { with: 'GER', years: 10 }, rel: { GER: 30, ENG: -15, FRA: -15, POL: -20 } } },
      { text: 'Keep courting the West', ai: 1, fx: { rel: { ENG: 20, FRA: 20, GER: -20 } } }
    ] },

  { id: 'h36_danzig', era: 'ww2-1936', tag: 'GER', date: [1939, 9, 1], until: [1940, 6, 1], news: true,
    title: 'The Danzig Crisis',
    text: 'Poland refuses to cede Danzig or a road through the corridor. The army is ready on the Polish border.',
    cond: { exists: 'POL', notWarWith: 'POL' },
    options: [
      { text: 'Invade Poland', ai: 4, fx: { war: { on: 'POL', name: 'Invasion of Poland' }, ws: 0.05 } },
      { text: 'Keep negotiating', ai: 1, fx: { pp: -30, ws: -0.03, rel: { POL: 10 } } }
    ] },

  { id: 'h36_winter_war', era: 'ww2-1936', tag: 'SOV', date: [1939, 11, 30], until: [1941, 6, 1], news: true,
    title: 'Demands on Finland',
    text: 'Finland has rejected Soviet demands to move the border away from Leningrad and to lease the Hanko peninsula.',
    cond: { exists: 'FIN', notWarWith: 'FIN', owns: 'Moscow' },
    options: [
      { text: 'Attack Finland', ai: 3, fx: { war: { on: 'FIN', name: 'Winter War' }, flag: 'winter_war' } },
      { text: 'Drop the demands', ai: 1, fx: { pp: -20, rel: { FIN: 15 } } }
    ] },

  { id: 'h36_moscow_peace', era: 'ww2-1936', tag: 'SOV', date: [1940, 3, 12], until: [1941, 6, 1],
    title: 'Peace Terms for Finland',
    text: 'Finnish lines on the Karelian Isthmus are breaking and Helsinki has asked for terms. The Red Army has paid a heavy price.',
    cond: { warWith: 'FIN', flag: 'winter_war' },
    options: [
      { text: 'Take Karelia and make peace', ai: 3, fx: { peace: 'FIN', provs: { names: ['Viipuri', 'Viipuri Woods', 'Viipuri Marshes'], to: 'self' }, rel: { FIN: -20 } } },
      { text: 'Fight on to Helsinki', ai: 1, fx: { ws: -0.05, mod: { name: 'Winter Losses', days: 180, fx: [{ mod: 'org', value: -0.05 }] } } }
    ] },

  { id: 'h36_tripartite', era: 'ww2-1936', tag: ['ITA', 'JAP'], date: [1940, 9, 27], until: [1941, 12, 31], news: true,
    title: 'The Tripartite Pact',
    text: 'Berlin invites {name} to sign a treaty of mutual assistance against any power that joins the war against them.',
    cond: { exists: 'GER', notWarWith: 'GER' },
    options: [
      { text: 'Sign the pact', ai: 4, fx: { join: 'GER', rel: { USA: -15 } } },
      { text: 'Keep our hands free', ai: 1, fx: { pp: 20, rel: { GER: -10 } } }
    ] },

  { id: 'h36_lend_lease', era: 'ww2-1936', tag: 'USA', date: [1941, 3, 11], until: [1942, 12, 31], news: true,
    title: 'Lend-Lease',
    text: 'Congress debates a bill letting the President send war materials to nations whose defence is vital to the United States.',
    cond: { exists: 'ENG', notWarWith: 'ENG' },
    options: [
      { text: 'Pass the Lend-Lease Act', ai: 4, fx: { rel: { ENG: 30, SOV: 10, GER: -20 }, ws: 0.05, mod: { name: 'Arsenal of Democracy', days: 730, fx: [{ mod: 'arsenals', value: 0.15 }] } } },
      { text: 'Stay strictly neutral', ai: 1, fx: { stab: 0.02, rel: { GER: 5, ENG: -10 } } }
    ] },

  { id: 'h36_barbarossa', era: 'ww2-1936', tag: 'GER', date: [1941, 6, 22], until: [1942, 12, 31], news: true,
    title: 'The Question of the East',
    text: 'The General Staff has drawn up plans for an invasion of the Soviet Union. Others warn against a war on two fronts.',
    cond: { exists: 'SOV', notWarWith: 'SOV' },
    options: [
      { text: 'Invade the Soviet Union', ai: 3, fx: { war: { on: 'SOV', name: 'Eastern Front' }, ws: 0.03 } },
      { text: 'Honour the pact for now', ai: 1, fx: { rel: { SOV: 10 }, pp: 20 } }
    ] },

  { id: 'h36_pacific', era: 'ww2-1936', tag: 'JAP', date: [1941, 12, 7], until: [1942, 12, 31], news: true,
    title: 'The Oil Embargo',
    text: 'An American oil embargo leaves Japan with months of fuel. The navy proposes a surprise strike on the Pacific Fleet.',
    cond: { exists: 'USA', notWarWith: 'USA' },
    options: [
      { text: 'Strike the Pacific Fleet', ai: 3, fx: { war: { on: 'USA', name: 'Pacific War' }, ws: 0.05 } },
      { text: 'Seek a settlement', ai: 1, fx: { pp: -40, rel: { USA: 15 }, goods: { fuel: 15 } } }
    ] },

  // =====================================================================
  // 1914: THE GREAT WAR
  // =====================================================================

  { id: 'h14_japan', era: 'greatwar-1914', tag: 'JAP', date: [1914, 8, 23], until: [1915, 6, 1], news: true,
    title: 'Japan and the German Concessions',
    text: 'Britain asks its Japanese ally for help against German shipping in the Pacific. The German base at Tsingtao lies within reach.',
    cond: { exists: 'GER', notWarWith: 'GER' },
    options: [
      { text: 'Declare war on Germany', ai: 4, fx: { war: { on: 'GER', name: 'Siege of Tsingtao' }, rel: { GBR: 20 } } },
      { text: 'Stay out of Europe\'s war', ai: 1, fx: { pp: 20, rel: { GBR: -10 } } }
    ] },

  { id: 'h14_marne', era: 'greatwar-1914', tag: 'GER', date: [1914, 9, 9], until: [1914, 12, 31], news: true,
    title: 'Crisis on the Marne',
    text: 'French and British counterattacks have opened a gap between the German armies east of Paris. The Chief of Staff must decide.',
    cond: { warWith: 'FRA' },
    options: [
      { text: 'Fall back to the Aisne', ai: 3, fx: { ws: -0.03, mod: { name: 'Entrenched Line', days: 365, fx: [{ mod: 'defence', value: 0.10 }] } } },
      { text: 'Press on toward Paris', ai: 1, fx: { mod: { name: 'Exhausted Armies', days: 180, fx: [{ mod: 'attack', value: 0.05 }, { mod: 'org', value: -0.10 }] } } }
    ] },

  { id: 'h14_ottoman', era: 'greatwar-1914', tag: 'OTT', date: [1914, 10, 29], until: [1915, 12, 31], news: true,
    title: 'The Ottoman Decision',
    text: 'German warships flying the Ottoman flag have shelled Russian ports on the Black Sea. The government must decide whether to stand behind them.',
    cond: { exists: 'RUS', notWarWith: 'RUS' },
    options: [
      { text: 'Enter the war beside Germany', ai: 3, fx: { war: { on: 'RUS', name: 'Caucasus Campaign' }, rel: { GER: 30, AUH: 20 } } },
      { text: 'Disown the attack', ai: 1, fx: { pp: -20, rel: { RUS: 10, GBR: 10, GER: -20 } } }
    ] },

  { id: 'h14_italy', era: 'greatwar-1914', tag: 'ITA', date: [1915, 5, 23], until: [1916, 12, 31], news: true,
    title: 'The Treaty of London',
    text: 'The Entente has promised Italy the Trentino, Trieste and more if it enters the war against Austria-Hungary.',
    cond: { exists: 'AUH', notWarWith: 'AUH' },
    options: [
      { text: 'Declare war on Austria-Hungary', ai: 3, fx: { war: { on: 'AUH', name: 'Italian Front' }, ws: 0.05, rel: { FRA: 20, GBR: 20 } } },
      { text: 'Remain neutral', ai: 1, fx: { pp: 25, stab: 0.02 } },
      { text: 'Honour the Triple Alliance', ai: 0.3, fx: { join: 'GER', rel: { AUH: 20, FRA: -30 } } }
    ] },

  { id: 'h14_lusitania', era: 'greatwar-1914', tag: 'USA', date: [1915, 5, 7], until: [1915, 12, 31],
    title: 'The Lusitania Sunk',
    text: 'A German submarine has sunk a British liner off Ireland. More than a hundred Americans are among the dead.',
    cond: { notWarWith: 'GER' },
    options: [
      { text: 'Send a stern protest', ai: 3, fx: { ws: 0.05, rel: { GER: -20, GBR: 10 } } },
      { text: 'Keep strict neutrality', ai: 1, fx: { pp: 15, rel: { GER: 5 } } }
    ] },

  { id: 'h14_bulgaria', era: 'greatwar-1914', tag: 'BUL', date: [1915, 10, 14], until: [1916, 12, 31], news: true,
    title: 'Bulgaria Chooses a Side',
    text: 'Berlin and Vienna offer Bulgaria Serbian Macedonia if it joins their attack on Serbia.',
    cond: { exists: 'SRB', notWarWith: 'SRB' },
    options: [
      { text: 'Attack Serbia', ai: 3, fx: { war: { on: 'SRB', name: 'Serbian Campaign' }, rel: { GER: 25, AUH: 25 } } },
      { text: 'Stay neutral', ai: 1, fx: { stab: 0.03, rel: { RUS: 10 } } }
    ] },

  { id: 'h14_romania', era: 'greatwar-1914', tag: 'ROM', date: [1916, 8, 27], until: [1917, 6, 1], news: true,
    title: 'Romania Enters the War',
    text: 'The Entente promises Transylvania if Romania strikes at Austria-Hungary while Russia presses in Galicia.',
    cond: { exists: 'AUH', notWarWith: 'AUH' },
    options: [
      { text: 'Invade Transylvania', ai: 3, fx: { war: { on: 'AUH', name: 'Romanian Campaign' }, ws: 0.05 } },
      { text: 'Keep out of the war', ai: 1, fx: { pp: 20, rel: { RUS: -10 } } }
    ] },

  { id: 'h14_zimmermann_mex', era: 'greatwar-1914', tag: 'MEX', date: [1917, 1, 20], until: [1917, 12, 31],
    title: 'A Telegram from Berlin',
    text: 'Germany secretly offers Mexico an alliance and the return of Texas, New Mexico and Arizona if it goes to war with the United States.',
    cond: { exists: 'USA', notWarWith: 'USA' },
    options: [
      { text: 'Reject the offer', ai: 5, fx: { rel: { USA: 15, GER: -10 } } },
      { text: 'Accept the alliance', ai: 0.3, fx: { war: { on: 'USA', name: 'Mexican Border War' }, rel: { GER: 30 } } }
    ] },

  { id: 'h14_usa_entry', era: 'greatwar-1914', tag: 'USA', date: [1917, 4, 6], until: [1918, 6, 1], news: true,
    title: 'The Zimmermann Telegram',
    text: 'A German offer of alliance to Mexico has been published, just as unrestricted submarine warfare resumes in the Atlantic.',
    cond: { exists: 'GER', notWarWith: 'GER' },
    options: [
      { text: 'Declare war on Germany', ai: 4, fx: { war: { on: 'GER', name: 'American Expeditionary Force' }, ws: 0.10, rel: { GBR: 20, FRA: 20 } } },
      { text: 'Arm merchant ships only', ai: 1, fx: { ws: 0.03, mod: { name: 'Armed Neutrality', days: 365, fx: [{ mod: 'naval', value: 0.10 }] } } }
    ] },

  { id: 'h14_february', era: 'greatwar-1914', tag: 'RUS', date: [1917, 3, 8], until: [1917, 12, 31], news: true,
    title: 'Revolution in Petrograd',
    text: 'Bread riots in the capital have turned into revolt, and the garrison has joined the crowds. The Tsar\'s ministers have lost control.',
    cond: { war: true },
    options: [
      { text: 'The Tsar abdicates', ai: 3, fx: { gov: 'Republic', stab: -0.10, ws: -0.08, flag: 'rus_provisional' } },
      { text: 'Crush the revolt', ai: 1, fx: { stab: -0.12, ws: -0.05, manpower: -20000 } }
    ] },

  { id: 'h14_october', era: 'greatwar-1914', tag: 'RUS', date: [1917, 11, 7], until: [1918, 12, 31], news: true,
    title: 'The October Revolution',
    text: 'The Bolsheviks have seized the Winter Palace and promise peace, land and bread. The Provisional Government has collapsed.',
    cond: { flag: 'rus_provisional' },
    options: [
      { text: 'Make peace with the Central Powers', ai: 3, fx: { gov: 'Communist', peace: 'GER', stab: -0.05, ws: -0.10 } },
      { text: 'Fight on under the Provisional Government', ai: 1, fx: { stab: -0.10, ws: -0.05 } }
    ] },

  // =====================================================================
  // 1805: THE NAPOLEONIC WARS
  // =====================================================================

  { id: 'h05_trafalgar_fra', era: 'napoleonic-1805', tag: 'FRA', date: [1805, 10, 22], until: [1806, 6, 1], news: true,
    title: 'Disaster at Trafalgar',
    text: 'The combined French and Spanish fleet has been destroyed off Cape Trafalgar. Invasion of Britain is now out of the question.',
    cond: { warWith: 'GBR' },
    options: [
      { text: 'Rebuild the fleet', ai: 1, fx: { gold: -350, mod: { name: 'Naval Rebuilding', days: 730, fx: [{ mod: 'naval', value: 0.10 }] } } },
      { text: 'Seek victory on land', ai: 3, fx: { pp: 20, mod: { name: 'Grande Armee', days: 365, fx: [{ mod: 'attack', value: 0.05 }, { mod: 'naval', value: -0.10 }] } } }
    ] },

  { id: 'h05_trafalgar_gbr', era: 'napoleonic-1805', tag: 'GBR', date: [1805, 10, 22], until: [1806, 6, 1],
    title: 'Victory and Mourning',
    text: 'The Royal Navy has won a crushing victory at Trafalgar, but Admiral Nelson fell in the battle.',
    cond: { warWith: 'FRA' },
    options: [
      { text: 'A state funeral for Nelson', ai: 2, fx: { gold: -80, ws: 0.06, stab: 0.03 } },
      { text: 'Press the advantage at sea', ai: 2, fx: { mod: { name: 'Mastery of the Seas', days: 730, fx: [{ mod: 'naval', value: 0.10 }, { mod: 'tradeBonus', value: 0.05 }] } } }
    ] },

  { id: 'h05_pressburg', era: 'napoleonic-1805', tag: 'AUS', date: [1805, 12, 27], until: [1806, 6, 1], news: true,
    title: 'The Peace of Pressburg',
    text: 'After Austerlitz, Napoleon demands Venetia for his Kingdom of Italy and the Tyrol for Bavaria as the price of peace.',
    cond: { warWith: 'FRA' },
    options: [
      { text: 'Sign the treaty', ai: 3, fx: { peace: 'FRA', provs: { names: ['Venice'], to: 'ITA' }, stab: -0.05, pp: -30 } },
      { text: 'Fight on with Russia', ai: 1, fx: { ws: 0.03, stab: -0.06 } }
    ] },

  { id: 'h05_confederation', era: 'napoleonic-1805', tag: 'FRA', date: [1806, 7, 12], until: [1807, 12, 31], news: true,
    title: 'The Confederation of the Rhine',
    text: 'The south German princes are ready to leave the Holy Roman Empire and place themselves under French protection.',
    cond: { exists: 'BAV', notWarWith: 'BAV' },
    options: [
      { text: 'Found the Confederation', ai: 3, fx: { puppet: 'BAV', rel: { WUR: 20, BAD: 20, AUS: -20, PRU: -25 } } },
      { text: 'Keep them as free allies', ai: 1, fx: { rel: { BAV: 20, WUR: 20, BAD: 20 }, pp: 15 } }
    ] },

  { id: 'h05_prussia', era: 'napoleonic-1805', tag: 'PRU', date: [1806, 10, 9], until: [1807, 6, 1], news: true,
    title: 'Prussia Takes Up Arms',
    text: 'French troops in Germany and the new Confederation of the Rhine have alarmed Berlin. The war party at court demands action.',
    cond: { exists: 'FRA', notWarWith: 'FRA' },
    options: [
      { text: 'Declare war on France', ai: 3, fx: { war: { on: 'FRA', name: 'War of the Fourth Coalition' }, ws: 0.08, rel: { RUS: 20, GBR: 15 } } },
      { text: 'Stay neutral', ai: 1, fx: { pp: -20, stab: -0.03, rel: { FRA: 15 } } }
    ] },

  { id: 'h05_continental', era: 'napoleonic-1805', tag: 'FRA', date: [1806, 11, 21], until: [1808, 1, 1], news: true,
    title: 'The Continental System',
    text: 'From Berlin, Napoleon proposes to close every port under French control to British goods and starve Britain of trade.',
    cond: { exists: 'GBR' },
    options: [
      { text: 'Enforce the blockade', ai: 3, fx: { rel: { GBR: -20, RUS: -5, POR: -10 }, mod: { name: 'Continental System', days: 1095, fx: [{ mod: 'tradeBonus', value: -0.10 }, { mod: 'workshops', value: 0.10 }] } } },
      { text: 'Allow licensed trade', ai: 1, fx: { gold: 150, pp: -20 } }
    ] },

  { id: 'h05_tilsit', era: 'napoleonic-1805', tag: 'RUS', date: [1807, 7, 7], until: [1808, 6, 1], news: true,
    title: 'Meeting at Tilsit',
    text: 'After Friedland, Napoleon invites the Tsar to meet on a raft in the Niemen and divide Europe between them.',
    cond: { warWith: 'FRA' },
    options: [
      { text: 'Make peace and ally with France', ai: 3, fx: { peace: 'FRA', join: 'FRA', rel: { GBR: -20, PRU: -15 } } },
      { text: 'Fight on', ai: 1, fx: { ws: 0.03, stab: -0.05 } }
    ] },

  { id: 'h05_copenhagen', era: 'napoleonic-1805', tag: 'GBR', date: [1807, 8, 15], until: [1808, 6, 1],
    title: 'The Danish Fleet',
    text: 'London fears the Danish fleet will fall into French hands. The cabinet considers seizing it before Napoleon can.',
    cond: { exists: 'DEN', notWarWith: 'DEN' },
    options: [
      { text: 'Bombard Copenhagen', ai: 3, fx: { war: { on: 'DEN', name: 'Gunboat War' }, mod: { name: 'Captured Fleet', days: 730, fx: [{ mod: 'naval', value: 0.08 }] } } },
      { text: 'Seek a treaty with Denmark', ai: 1, fx: { pp: -20, rel: { DEN: 15 } } }
    ] },

  { id: 'h05_embargo', era: 'napoleonic-1805', tag: 'USA', date: [1807, 12, 22], until: [1809, 3, 1],
    title: 'The Embargo Act',
    text: 'British and French restrictions on neutral shipping are ruining American trade. Congress considers an embargo on all foreign commerce.',
    options: [
      { text: 'Pass the embargo', ai: 2, fx: { stab: -0.04, rel: { GBR: -10, FRA: -10 }, mod: { name: 'Embargo', days: 450, fx: [{ mod: 'tradeBonus', value: -0.20 }, { mod: 'workshops', value: 0.08 }] } } },
      { text: 'Keep trading at our risk', ai: 2, fx: { ws: 0.03, rel: { GBR: -5 } } }
    ] },

  { id: 'h05_dos_de_mayo', era: 'napoleonic-1805', tag: 'SPA', date: [1808, 5, 2], until: [1809, 6, 1], news: true,
    title: 'Rising in Madrid',
    text: 'French troops in Spain have forced the royal family to abdicate. The people of Madrid have risen against them.',
    cond: { exists: 'FRA', notWarWith: 'FRA' },
    options: [
      { text: 'Rise against France', ai: 3, fx: { leave: true, war: { on: 'FRA', name: 'Peninsular War' }, ws: 0.10, rel: { GBR: 30 } } },
      { text: 'Accept the new king', ai: 1, fx: { stab: -0.10, rel: { FRA: 30 } } }
    ] },

  // =====================================================================
  // 1200: THE AGE OF CRUSADES
  // =====================================================================

  { id: 'h1200_zara', era: 'medieval-1200', tag: 'VEN', date: [1202, 10, 1], until: [1203, 6, 1], news: true,
    title: 'The Crusaders\' Debt',
    text: 'The crusading army cannot pay Venice for its fleet. The Doge proposes that they settle the debt by taking the rebel port of Zara.',
    cond: { exists: 'HUN', notOwns: 'Zara' },
    options: [
      { text: 'Take Zara for Venice', ai: 3, fx: { provs: { names: ['Zara'], to: 'self' }, gold: 150, rel: { HUN: -40, PAP: -25 } } },
      { text: 'Forgive the debt', ai: 1, fx: { gold: -300, pp: 20, rel: { PAP: 20 } } }
    ] },

  { id: 'h1200_constantinople', era: 'medieval-1200', tag: 'VEN', date: [1203, 6, 24], until: [1205, 1, 1], news: true,
    title: 'Diversion to Constantinople',
    text: 'A Byzantine prince promises the crusaders silver and soldiers if they restore his father to the throne of Constantinople.',
    cond: { exists: 'BYZ', notWarWith: 'BYZ' },
    options: [
      { text: 'Sail for Constantinople', ai: 3, fx: { war: { on: 'BYZ', name: 'Fourth Crusade' }, ws: 0.05, rel: { PAP: -10 } } },
      { text: 'Sail on to Egypt', ai: 1, fx: { pp: 20, rel: { PAP: 20, AYY: -30 } } }
    ] },

  { id: 'h1200_byz_siege', era: 'medieval-1200', tag: 'BYZ', date: [1203, 7, 17], until: [1205, 1, 1],
    title: 'The Latins at the Walls',
    text: 'A Venetian fleet and a crusading army are camped before Constantinople. The emperor must decide how to meet them.',
    cond: { warWith: 'VEN' },
    options: [
      { text: 'Pay the Venetians to leave', ai: 2, fx: { gold: -400, peace: 'VEN', stab: -0.05 } },
      { text: 'Man the walls', ai: 2, fx: { ws: 0.05, mod: { name: 'Theodosian Walls', days: 365, fx: [{ mod: 'defence', value: 0.20 }] } } }
    ] },

  { id: 'h1200_normandy', era: 'medieval-1200', tag: 'ENG', date: [1204, 6, 24], until: [1206, 1, 1], news: true,
    title: 'The Fall of Normandy',
    text: 'Chateau Gaillard has fallen and Rouen is surrounded. King John\'s barons in Normandy are going over to Philip of France.',
    cond: { warWith: 'FRA' },
    options: [
      { text: 'Cede Normandy for peace', ai: 2, fx: { peace: 'FRA', provs: { names: ['Rouen'], to: 'FRA' }, stab: -0.05, pp: -20 } },
      { text: 'Raise a scutage and fight on', ai: 2, fx: { gold: 200, stab: -0.06, ws: 0.03 } }
    ] },

  { id: 'h1200_interdict', era: 'medieval-1200', tag: 'ENG', date: [1208, 3, 23], until: [1210, 1, 1],
    title: 'The Papal Interdict',
    text: 'The king refuses to accept the Pope\'s choice of Archbishop of Canterbury. England is placed under interdict and the churches fall silent.',
    cond: { exists: 'PAP' },
    options: [
      { text: 'Seize church revenues', ai: 2, fx: { gold: 300, stab: -0.06, rel: { PAP: -30 } } },
      { text: 'Submit to Rome', ai: 1, fx: { pp: -40, stab: 0.03, rel: { PAP: 30 } } }
    ] },

  { id: 'h1200_keraites', era: 'medieval-1200', tag: 'MON', date: [1203, 3, 1], until: [1205, 1, 1], news: true,
    title: 'Break with the Keraites',
    text: 'Temujin\'s old patron Toghrul of the Keraites has turned against him. The steppe will not hold two masters.',
    cond: { exists: 'KER', notWarWith: 'KER' },
    options: [
      { text: 'Strike the Keraites', ai: 3, fx: { war: { on: 'KER', name: 'Unification of the Steppe' }, ws: 0.05 } },
      { text: 'Renew the old alliance', ai: 1, fx: { rel: { KER: 30 }, pp: 15 } }
    ] },

  { id: 'h1200_kurultai', era: 'medieval-1200', tag: 'MON', date: [1206, 5, 1], until: [1208, 1, 1], news: true,
    title: 'The Great Kurultai',
    text: 'The chiefs of the steppe have gathered by the Onon River. They are ready to proclaim Temujin as Genghis Khan, ruler of all who live in felt tents.',
    options: [
      { text: 'Proclaim the Great Khan', ai: 4, fx: { annex: 'TAT', stab: 0.08, mod: { name: 'Decimal Army', days: 1095, fx: [{ mod: 'org', value: 0.10 }, { mod: 'attack', value: 0.10 }] } } },
      { text: 'Keep a loose confederation', ai: 1, fx: { stab: 0.03, relNeighbours: 15 } }
    ] },

  { id: 'h1200_jin', era: 'medieval-1200', tag: 'MON', date: [1211, 3, 1], until: [1214, 1, 1], news: true,
    title: 'War with the Jin',
    text: 'The Jin emperor demands tribute from the Mongols. The khan considers answering with an invasion of northern China.',
    cond: { exists: 'JIN', notWarWith: 'JIN' },
    options: [
      { text: 'Invade the Jin', ai: 3, fx: { war: { on: 'JIN', name: 'Mongol Conquest of the Jin' }, ws: 0.05 } },
      { text: 'Send token tribute', ai: 1, fx: { gold: -150, rel: { JIN: 20 } } }
    ] },

  { id: 'h1200_albigensian', era: 'medieval-1200', tag: 'FRA', date: [1209, 6, 24], until: [1212, 1, 1], news: true,
    title: 'Crusade in the South',
    text: 'The Pope has called for a crusade against heretics in the lands of the Count of Toulouse. Northern barons are gathering.',
    cond: { exists: 'TOU', notWarWith: 'TOU' },
    options: [
      { text: 'Join the crusade', ai: 3, fx: { war: { on: 'TOU', name: 'Albigensian Crusade' }, rel: { PAP: 25 } } },
      { text: 'Let the barons go alone', ai: 1, fx: { pp: 20, rel: { TOU: 15 } } }
    ] },

  { id: 'h1200_navas', era: 'medieval-1200', tag: 'CAS', date: [1212, 6, 20], until: [1214, 1, 1], news: true,
    title: 'Alliance against the Almohads',
    text: 'Aragon, Navarre and Portugal are ready to join Castile in a great campaign against the Almohad caliph.',
    cond: { exists: 'ALM', notWarWith: 'ALM' },
    options: [
      { text: 'March south', ai: 3, fx: { war: { on: 'ALM', name: 'Las Navas de Tolosa' }, rel: { ARA: 20, NAV: 20, POR: 20 }, ws: 0.05 } },
      { text: 'Renew the truce', ai: 1, fx: { stab: 0.03, gold: 100 } }
    ] },

  // =====================================================================
  // 117 AD: THE HEIGHT OF ROME
  // =====================================================================

  { id: 'h117_diaspora_revolt', era: 'rome-117', tag: 'ROM', date: [117, 2, 1], until: [118, 6, 1], news: true,
    title: 'Revolts in the East',
    text: 'Jewish communities in Cyrene, Egypt and Cyprus have risen against Roman rule while the legions are far away in Mesopotamia.',
    options: [
      { text: 'Send legions to crush them', ai: 3, fx: { army: { divs: 2, where: 'capital' }, stab: -0.03, mod: { name: 'Eastern Revolts', days: 270, fx: [{ mod: 'tax', value: -0.08 }] } } },
      { text: 'Hold the cities and wait', ai: 1, fx: { stab: -0.05, mod: { name: 'Unsettled Provinces', days: 365, fx: [{ mod: 'tax', value: -0.15 }] } } }
    ] },

  { id: 'h117_hadrian', era: 'rome-117', tag: 'ROM', date: [117, 8, 11], until: [118, 12, 31], news: true,
    title: 'Hadrian Succeeds Trajan',
    text: 'Trajan has died in Cilicia and Hadrian is acclaimed emperor by the army of Syria. The new provinces beyond the Euphrates are in revolt.',
    cond: { warWith: 'PAR' },
    options: [
      { text: 'Abandon the eastern conquests', ai: 3, fx: { peace: 'PAR', provs: { names: ['Seleucia', 'Seleucia Woods'], to: 'PAR' }, stab: 0.06, pp: -20 } },
      { text: 'Hold the Tigris frontier', ai: 1, fx: { ws: 0.03, stab: -0.05, mod: { name: 'Overstretched Frontier', days: 365, fx: [{ mod: 'supply', value: -0.10 }] } } }
    ] },

  { id: 'h117_armenia', era: 'rome-117', tag: 'ROM', date: [118, 3, 1], until: [120, 1, 1],
    title: 'The Future of Armenia',
    text: 'Hadrian\'s advisers argue that Armenia costs more to garrison than it yields and would be better ruled by a friendly king.',
    cond: { owns: 'Artaxata', exists: 'ARM', notWarWith: 'ARM' },
    options: [
      { text: 'Restore a client king', ai: 2, fx: { provs: { names: ['Artaxata', 'Artaxata Woods'], to: 'ARM' }, rel: { ARM: 40, PAR: 15 }, mod: { name: 'Shorter Frontier', days: 730, fx: [{ mod: 'supply', value: 0.08 }] } } },
      { text: 'Keep it as a province', ai: 1, fx: { rel: { PAR: -10 }, pp: 10 } }
    ] },

  { id: 'h117_consulars', era: 'rome-117', tag: 'ROM', date: [118, 4, 1], until: [119, 1, 1],
    title: 'The Four Consulars',
    text: 'Four former consuls, all close to Trajan, have been executed for plotting against the new emperor. The Senate is uneasy.',
    options: [
      { text: 'Win the people with largesse', ai: 2, fx: { gold: -300, stab: 0.05 } },
      { text: 'Rule firmly regardless', ai: 1, fx: { pp: 40, stab: -0.04 } }
    ] },

  { id: 'h117_roxolani', era: 'rome-117', tag: 'ROX', date: [117, 10, 1], until: [119, 1, 1],
    title: 'Roman Subsidies',
    text: 'The Roxolani king complains that Rome has cut his subsidies. His riders could cross the Danube, or he could bargain.',
    cond: { exists: 'ROM', notWarWith: 'ROM' },
    options: [
      { text: 'Raid across the Danube', ai: 1, fx: { war: { on: 'ROM', name: 'Sarmatian War' }, ws: 0.05 } },
      { text: 'Bargain for new subsidies', ai: 3, fx: { gold: 150, rel: { ROM: 20 } } }
    ] },

  { id: 'h117_parthia', era: 'rome-117', tag: 'PAR', date: [118, 1, 1], until: [120, 1, 1],
    title: 'Rival Kings of Parthia',
    text: 'Osroes and Vologases both claim the Parthian throne, and the eastern nobles back one or the other.',
    options: [
      { text: 'Reconcile the claimants', ai: 2, fx: { pp: -30, stab: 0.05 } },
      { text: 'Crush the pretender', ai: 2, fx: { manpower: -5000, stab: 0.02, mod: { name: 'Royal Authority', days: 365, fx: [{ mod: 'tax', value: 0.08 }] } } }
    ] },

  { id: 'h117_wall', era: 'rome-117', tag: 'ROM', date: [122, 6, 1], until: [125, 1, 1], news: true,
    title: 'A Wall across Britannia',
    text: 'Visiting Britannia, Hadrian orders the legions to build a stone wall from sea to sea to divide the Romans from the northern tribes.',
    options: [
      { text: 'Build the wall', ai: 3, fx: { gold: -300, mod: { name: 'Hadrian\'s Wall', days: 1095, fx: [{ mod: 'defence', value: 0.08 }] }, rel: { CAL: -10 } } },
      { text: 'Campaign in Caledonia', ai: 1, fx: { war: { on: 'CAL', name: 'Caledonian Campaign' }, ws: 0.03 } }
    ] },

  { id: 'h117_han_qiang', era: 'rome-117', tag: 'HAN', date: [118, 1, 1], until: [120, 1, 1],
    title: 'The Qiang Wars End',
    text: 'After a decade of costly fighting in the northwest, the Qiang rising has been broken. The frontier commanderies must be restored.',
    options: [
      { text: 'Resettle the frontier', ai: 2, fx: { gold: -200, mod: { name: 'Frontier Colonies', days: 730, fx: [{ mod: 'farms', value: 0.08 }] } } },
      { text: 'Cut military spending', ai: 2, fx: { gold: 200, stab: 0.02, mod: { name: 'Reduced Garrisons', days: 365, fx: [{ mod: 'defence', value: -0.05 }] } } }
    ] },

  // =====================================================================
  // 431 BC: THE PELOPONNESIAN WAR
  // =====================================================================

  { id: 'h431_plague', era: 'greece-431bc', tag: 'ATH', date: [-429, 5, 1], until: [-427, 1, 1], news: true,
    title: 'Plague in Athens',
    text: 'The people of Attica crowded behind the Long Walls are dying of a terrible sickness. Pericles\' strategy is under attack.',
    options: [
      { text: 'Hold to Pericles\' plan', ai: 2, fx: { stab: -0.05, mod: { name: 'Plague of Athens', days: 730, fx: [{ mod: 'manpower', value: -0.20 }] } } },
      { text: 'Send the people back to the farms', ai: 1, fx: { ws: -0.05, stab: -0.02, mod: { name: 'Scattered Plague', days: 365, fx: [{ mod: 'manpower', value: -0.10 }, { mod: 'farms', value: -0.05 }] } } },
      { text: 'Sue Sparta for peace', ai: 0.5, fx: { peace: 'SPA', stab: -0.04, pp: -30 } }
    ] },

  { id: 'h431_sitalces', era: 'greece-431bc', tag: 'ODR', date: [-428, 10, 1], until: [-426, 1, 1], news: true,
    title: 'Sitalces Marches on Macedon',
    text: 'Allied to Athens, the Odrysian king has gathered a huge army to punish Perdiccas of Macedon for breaking his promises.',
    cond: { exists: 'MAC', notWarWith: 'MAC' },
    options: [
      { text: 'Invade Macedon', ai: 2, fx: { war: { on: 'MAC', name: 'Thracian Invasion' }, rel: { ATH: 15 } } },
      { text: 'Accept Perdiccas\' gifts', ai: 2, fx: { gold: 200, rel: { MAC: 20, ATH: -10 } } }
    ] },

  { id: 'h431_mytilene', era: 'greece-431bc', tag: 'ATH', date: [-427, 6, 1], until: [-425, 1, 1],
    title: 'The Mytilenean Debate',
    text: 'The revolt on Lesbos has been put down. The Assembly voted to kill every man of Mytilene, and now meets again to reconsider.',
    options: [
      { text: 'Carry out the decree', ai: 1, fx: { ws: 0.04, relNeighbours: -15, stab: -0.02 } },
      { text: 'Punish only the ringleaders', ai: 3, fx: { stab: 0.03, pp: -20, relNeighbours: 5 } }
    ] },

  { id: 'h431_pylos', era: 'greece-431bc', tag: 'SPA', date: [-424, 7, 1], until: [-422, 1, 1], news: true,
    title: 'Surrender at Sphacteria',
    text: 'Nearly three hundred hoplites, many of them Spartiates, have surrendered to the Athenians on the island off Pylos.',
    cond: { warWith: 'ATH' },
    options: [
      { text: 'Offer peace for the prisoners', ai: 1, fx: { peace: 'ATH', stab: -0.04, pp: -30 } },
      { text: 'Fight on', ai: 3, fx: { ws: 0.03, stab: -0.05, manpower: -2000 } }
    ] },

  { id: 'h431_brasidas', era: 'greece-431bc', tag: 'SPA', date: [-423, 8, 1], until: [-421, 1, 1],
    title: 'Brasidas in Thrace',
    text: 'The bold general Brasidas asks for men to march north and strike at Athenian allies in Thrace.',
    cond: { warWith: 'ATH' },
    options: [
      { text: 'Send Brasidas north', ai: 3, fx: { army: { divs: 2, where: 'capital' }, mod: { name: 'Brasidas', days: 365, fx: [{ mod: 'attack', value: 0.10 }] } } },
      { text: 'Keep the army at home', ai: 1, fx: { mod: { name: 'Home Defence', days: 365, fx: [{ mod: 'defence', value: 0.10 }] } } }
    ] },

  { id: 'h431_nicias', era: 'greece-431bc', tag: 'ATH', date: [-420, 3, 1], until: [-418, 1, 1], news: true,
    title: 'The Peace of Nicias',
    text: 'With Cleon and Brasidas both dead at Amphipolis, Nicias proposes a fifty-year peace with Sparta.',
    cond: { warWith: 'SPA' },
    options: [
      { text: 'Accept the peace', ai: 3, fx: { peace: 'SPA', pact: { with: 'SPA', years: 6 }, stab: 0.05 } },
      { text: 'Continue the war', ai: 1, fx: { ws: 0.04, stab: -0.03 } }
    ] },

  { id: 'h431_sicily', era: 'greece-431bc', tag: 'ATH', date: [-414, 6, 1], until: [-412, 1, 1], news: true,
    title: 'The Sicilian Expedition',
    text: 'Envoys from Segesta ask for help against Syracuse. Alcibiades urges a great fleet to conquer Sicily; Nicias warns against it.',
    cond: { exists: 'SYR', notWarWith: 'SYR' },
    options: [
      { text: 'Launch the expedition', ai: 3, fx: { war: { on: 'SYR', name: 'Sicilian Expedition' }, gold: -300, ws: 0.05 } },
      { text: 'Heed Nicias', ai: 2, fx: { pp: 20, stab: 0.02 } }
    ] },

  { id: 'h431_persian_gold', era: 'greece-431bc', tag: 'SPA', date: [-411, 1, 1], until: [-408, 1, 1], news: true,
    title: 'Persian Gold',
    text: 'The satrap Tissaphernes offers Persian silver to pay for a Spartan fleet, in return for the Greek cities of Ionia.',
    cond: { exists: 'PER', notWarWith: 'PER' },
    options: [
      { text: 'Accept the Persian terms', ai: 3, fx: { gold: 400, rel: { PER: 30 }, mod: { name: 'Persian-funded Fleet', days: 1095, fx: [{ mod: 'naval', value: 0.15 }] } } },
      { text: 'Refuse to betray Ionia', ai: 1, fx: { stab: 0.03, pp: 20 } }
    ] },

  { id: 'h431_persia_policy', era: 'greece-431bc', tag: 'PER', date: [-411, 1, 1], until: [-408, 1, 1],
    title: 'Playing the Greeks',
    text: 'The satraps of Asia Minor see a chance to recover the Ionian cities by paying one Greek power against the other.',
    cond: { exists: 'SPA' },
    options: [
      { text: 'Fund Sparta', ai: 3, fx: { gold: -250, rel: { SPA: 25, ATH: -20 } } },
      { text: 'Let them wear each other out', ai: 2, fx: { pp: 20 } }
    ] }
];
