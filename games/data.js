/**
 * Game content. Edit freely — add your own questions / words here.
 *
 * Each trivia item: { q: question, a: correct answer, w: [3 wrong answers] }
 *  - KINGSHOT questions are mixed into every round (2 per round).
 *  - The other categories fill the rest, so rounds stay varied.
 *  - Questions marked  // verify  are from general game knowledge — please
 *    double-check them against the real game before you keep them.
 *
 * The bot remembers what each player has already seen and won't repeat a
 * question or word until they've been through the whole pool.
 */
const crypto = require('crypto');

const KINGSHOT = [
  { q: 'What is the highest troop tier in Kingshot?', a: 'T11', w: ['T9', 'T10', 'T12'] },
  { q: 'What resource is mainly used for research?', a: 'Truegold Dust', w: ['Wood', 'Bread', 'Stone'] },
  { q: 'Which event is Kingdom vs Kingdom?', a: 'KvK', w: ['Arena', 'Bear Trap', 'Swordland'] },
  { q: 'What does SG stand for?', a: 'Strongest Governor', w: ['Super Guild', 'Siege Group', 'Supreme General'] },
  { q: 'Which building trains troops?', a: 'Barracks', w: ['Embassy', 'Storehouse', 'Market'] },
  { q: "What is the pet system's currency mark called?", a: 'Taming Mark', w: ['Hero Shard', 'Gold Coin', 'Speedup Token'] },
  { q: 'Which troop type is strongest against Cavalry?', a: 'Infantry', w: ['Archers', 'Cavalry', 'Scouts'] },
  { q: 'What does AB stand for in events?', a: 'Alliance Brawl', w: ['Arena Battle', 'Armor Boost', 'All-Out Battle'] },
  { q: 'Truegold is mainly used for…', a: 'Upgrading buildings', w: ['Training troops', 'Hero skins', 'Buying gold'] },
  { q: 'What do you use Widgets for?', a: 'Hero gear', w: ['Troop training', 'Building speedups', 'Pet evolution'] },
  // ---- new (verify) ----
  { q: 'How many main troop types are there?', a: '3', w: ['2', '4', '5'] }, // verify
  { q: 'What is the lowest troop tier?', a: 'T1', w: ['T2', 'T3', 'T5'] }, // verify
  { q: 'What does KvK stand for?', a: 'Kingdom vs Kingdom', w: ['King vs King', 'Knight vs Knight', 'Keep vs Keep'] },
  { q: 'Which troop type is strongest against Archers?', a: 'Cavalry', w: ['Infantry', 'Scouts', 'Siege Engines'] }, // verify
  { q: 'Which troop type is strongest against Infantry?', a: 'Archers', w: ['Cavalry', 'Scouts', 'Siege Engines'] }, // verify
  { q: 'Which of these is a basic resource?', a: 'Wood', w: ['Mana', 'Oil', 'Uranium'] },
  { q: 'Joining alliance members to attack one target together is called a…', a: 'Rally', w: ['Raid', 'Parade', 'Convoy'] },
  { q: 'Troops stationed inside a city to defend it are called a…', a: 'Garrison', w: ['Convoy', 'Caravan', 'Vanguard'] },
];

const STRATEGY = [
  { q: 'What does RTS stand for?', a: 'Real-Time Strategy', w: ['Rapid Troop System', 'Random Tactical Sim', 'Royal Tower Siege'] },
  { q: 'What does PvP stand for?', a: 'Player versus Player', w: ['Power versus Power', 'Player via Proxy', 'Points versus Points'] },
  { q: 'What does PvE stand for?', a: 'Player versus Environment', w: ['Player versus Elite', 'Power versus Enemy', 'Points versus Events'] },
  { q: 'What does RNG stand for in games?', a: 'Random Number Generator', w: ['Raid Net Gain', 'Rapid Node Growth', 'Reward Name Guide'] },
  { q: 'What does AFK mean?', a: 'Away From Keyboard', w: ['After First Kill', 'Always For Kings', 'All Forces Killed'] },
  { q: 'What does "GG" mean after a match?', a: 'Good Game', w: ['Great Gold', 'Get Going', 'Guild Gathering'] },
  { q: 'What does XP stand for?', a: 'Experience Points', w: ['Extra Power', 'Expert Player', 'Extended Play'] },
  { q: 'What does DPS stand for?', a: 'Damage Per Second', w: ['Defense Per Soldier', 'Duels Per Season', 'Drops Per Stage'] },
  { q: 'What does F2P stand for?', a: 'Free to Play', w: ['Fast to Promote', 'Fight to Protect', 'Fort to Plunder'] },
  { q: 'In games, what is a "buff"?', a: 'A temporary boost to stats', w: ['A type of armor', 'A hidden map area', 'A loot box'] },
  { q: 'In games, what is a "nerf"?', a: 'A reduction in power', w: ['A new hero', 'A free reward', 'A map reset'] },
  { q: 'What is "fog of war" in strategy games?', a: 'Unexplored areas hidden from view', w: ['A weather event', 'A boss ability', 'A damage penalty'] },
  { q: 'Attacking an enemy from the side is called…', a: 'Flanking', w: ['Garrisoning', 'Sieging', 'Rallying'] },
  { q: 'A surprise attack launched from hiding is an…', a: 'Ambush', w: ['Audit', 'Alliance', 'Armistice'] },
  { q: 'An early, all-in attack strategy is called a…', a: 'Rush', w: ['Drift', 'Tribute', 'Retreat'] },
  { q: 'Which ancient book on strategy begins with "The Art of…"?', a: 'War', w: ['Peace', 'Gold', 'Trade'] },
  { q: 'Who wrote "The Art of War"?', a: 'Sun Tzu', w: ['Confucius', 'Machiavelli', 'Clausewitz'] },
  { q: 'Who wrote "The Prince"?', a: 'Machiavelli', w: ['Sun Tzu', 'Dante', 'Voltaire'] },
];

const MEDIEVAL = [
  { q: 'What is the main fortified tower of a castle called?', a: 'Keep', w: ['Moat', 'Bailey', 'Portcullis'] },
  { q: 'What is the water-filled ditch around a castle called?', a: 'Moat', w: ['Keep', 'Barbican', 'Parapet'] },
  { q: 'What is the heavy grating lowered to block a castle gate?', a: 'Portcullis', w: ['Drawbridge', 'Turret', 'Rampart'] },
  { q: 'Which siege machine hurls huge stones using a counterweight?', a: 'Trebuchet', w: ['Battering Ram', 'Siege Tower', 'Caltrop'] },
  { q: 'Which siege weapon is used to smash down gates?', a: 'Battering Ram', w: ['Longbow', 'Trebuchet', 'Crossbow'] },
  { q: 'What is a knight\'s chest armor called?', a: 'Cuirass', w: ['Gauntlet', 'Greave', 'Visor'] },
  { q: 'Which piece of armor protects the hand?', a: 'Gauntlet', w: ['Greave', 'Cuirass', 'Helm'] },
  { q: 'Which piece of armor protects the shin?', a: 'Greave', w: ['Gauntlet', 'Cuirass', 'Visor'] },
  { q: 'What is the study of coats of arms called?', a: 'Heraldry', w: ['Genealogy', 'Cartography', 'Numismatics'] },
  { q: 'Medieval books were often written on…', a: 'Parchment', w: ['Plastic', 'Glass', 'Cotton'] },
  { q: 'Which 1415 battle was famously won by English longbowmen?', a: 'Agincourt', w: ['Hastings', 'Waterloo', 'Bannockburn'] },
  { q: 'In which year was the Battle of Hastings?', a: '1066', w: ['1215', '1096', '1415'] },
  { q: 'In which year was Magna Carta sealed?', a: '1215', w: ['1066', '1315', '1415'] },
  { q: 'Which people sailed in longships?', a: 'Vikings', w: ['Romans', 'Aztecs', 'Samurai'] },
  { q: 'Which region did the Vikings come from?', a: 'Scandinavia', w: ['Iberia', 'The Balkans', 'Anatolia'] },
  { q: 'Who founded the Mongol Empire?', a: 'Genghis Khan', w: ['Attila', 'Kublai Khan', 'Tamerlane'] },
  { q: 'What is the traditional sword of a samurai called?', a: 'Katana', w: ['Claymore', 'Rapier', 'Scimitar'] },
  { q: 'Which ancient soldiers fought in a tight "phalanx" with long spears?', a: 'Ancient Greeks', w: ['Vikings', 'Mongols', 'Samurai'] },
  { q: 'What was a young noble training to become a knight called?', a: 'Squire', w: ['Herald', 'Steward', 'Jester'] },
  { q: 'Lords granting land in exchange for loyalty was called…', a: 'Feudalism', w: ['Mercantilism', 'Republicanism', 'Colonialism'] },
  { q: 'A sworn promise of loyalty to a lord is called…', a: 'Fealty', w: ['Tithe', 'Charter', 'Decree'] },
  { q: 'Which pandemic, the Black Death, struck Europe in the…', a: '14th century', w: ['10th century', '12th century', '16th century'] },
  { q: 'Which style of pointed arches defines many medieval cathedrals?', a: 'Gothic', w: ['Baroque', 'Modern', 'Doric'] },
  { q: 'What do we call the period between ancient and modern history?', a: 'The Middle Ages', w: ['The Renaissance', 'The Stone Age', 'The Bronze Age'] },
  { q: 'Which metal is an alloy of copper and tin?', a: 'Bronze', w: ['Brass', 'Steel', 'Pewter'] },
  { q: 'Steel is mainly iron mixed with which element?', a: 'Carbon', w: ['Silicon', 'Helium', 'Sulfur'] },
  { q: 'Which Norman duke conquered England in 1066?', a: 'William the Conqueror', w: ['Richard the Lionheart', 'King Arthur', 'Charlemagne'] },
  { q: 'Who was crowned Emperor of the Romans in the year 800?', a: 'Charlemagne', w: ['Julius Caesar', 'Attila', 'Napoleon'] },
  { q: 'Which country did Joan of Arc fight for?', a: 'France', w: ['England', 'Spain', 'Portugal'] },
  { q: 'What was a medieval entertainer in a bell-covered cap called?', a: 'Jester', w: ['Squire', 'Herald', 'Scribe'] },
];

const LEGENDS = [
  { q: 'Which legendary king owned the sword Excalibur?', a: 'King Arthur', w: ['Charlemagne', 'Richard the Lionheart', 'King Midas'] },
  { q: "Who was King Arthur's wizard advisor?", a: 'Merlin', w: ['Gandalf', 'Morgan', 'Lancelot'] },
  { q: "What did King Arthur's knights sit around?", a: 'The Round Table', w: ['The Long Table', 'The Golden Throne', 'The Great Hall'] },
  { q: 'Which ancient wonder stood in Alexandria?', a: 'The Lighthouse (Pharos)', w: ['Hanging Gardens', 'Colossus', 'Temple of Artemis'] },
  { q: 'Which mythical creature is famous for guarding treasure?', a: 'Dragon', w: ['Unicorn', 'Mermaid', 'Centaur'] },
  { q: 'Which mythical bird is reborn from its own ashes?', a: 'Phoenix', w: ['Griffin', 'Roc', 'Harpy'] },
];

const CHESS = [
  { q: 'Which chess piece moves in an L-shape?', a: 'Knight', w: ['Bishop', 'Rook', 'Pawn'] },
  { q: 'Which chess piece moves any distance diagonally?', a: 'Bishop', w: ['Knight', 'Rook', 'Pawn'] },
  { q: 'Which chess piece is the most powerful?', a: 'Queen', w: ['King', 'Rook', 'Bishop'] },
  { q: 'How many squares are on a chessboard?', a: '64', w: ['32', '48', '81'] },
];

const withCat = (cat) => (item) => ({ ...item, cat });
const TRIVIA = [
  ...KINGSHOT.map(withCat('Kingshot')),
  ...STRATEGY.map(withCat('Strategy')),
  ...MEDIEVAL.map(withCat('Medieval')),
  ...LEGENDS.map(withCat('Legends')),
  ...CHESS.map(withCat('Chess')),
];

// Hangman + Scramble words (A–Z only, 5+ letters, no spaces or hyphens)
const WORDS = [
  'TRUEGOLD', 'BARRACKS', 'ALLIANCE', 'GOVERNOR', 'CAVALRY', 'INFANTRY',
  'ARCHER', 'MITHRIL', 'WIDGETS', 'HAMMER', 'KINGDOM', 'STRONGHOLD',
  'RESEARCH', 'TRAINING', 'SPEEDUP', 'EMBLEM', 'MANUSCRIPT', 'TERROR',
  // war & strategy
  'BATTLE', 'VICTORY', 'CONQUEST', 'DOMINION', 'VANGUARD', 'GARRISON', 'AMBUSH', 'FLANKING',
  'SIEGE', 'RALLY', 'TRIBUTE', 'COMMANDER', 'GENERAL', 'MARSHAL', 'SCOUT', 'SENTINEL',
  'FORTRESS', 'BASTION', 'RAMPART', 'FORTIFY', 'BEACON', 'TOWER', 'DEFENDER', 'WARRIOR',
  // castle life
  'CASTLE', 'DRAWBRIDGE', 'PORTCULLIS', 'BANNER', 'THRONE', 'CROWN', 'SCEPTER', 'REALM',
  'MONARCH', 'EMPEROR', 'DYNASTY', 'SOVEREIGN', 'HERALD', 'SQUIRE', 'KNIGHT', 'JESTER',
  'MINSTREL', 'SCRIBE', 'PARCHMENT', 'BANQUET', 'TAVERN', 'ARMORY', 'GRANARY', 'HARVEST',
  'BLACKSMITH', 'ANVIL', 'FORGE', 'QUARRY', 'LUMBER', 'TOURNAMENT',
  // gear
  'SHIELD', 'ARMOR', 'HELMET', 'GAUNTLET', 'CUIRASS', 'CHAINMAIL', 'DAGGER', 'HALBERD',
  'LANCE', 'CROSSBOW', 'LONGBOW', 'QUIVER', 'ARROW', 'CATAPULT', 'TREBUCHET', 'SADDLE', 'STALLION',
  // troops & legends
  'VIKING', 'LONGSHIP', 'LEGION', 'PHALANX', 'SPEARMAN', 'DRAGON', 'GRIFFIN', 'WYVERN',
  'PHOENIX', 'WIZARD', 'SORCERER', 'TREASURE', 'LEGEND', 'ARENA', 'CESARES', 'SWORDLAND',
];

/** Stable short id for "already seen" tracking (a word is its own id). */
const idOf = (x) =>
  typeof x === 'string' ? x : crypto.createHash('md5').update(x.q).digest('hex').slice(0, 8);

module.exports = { TRIVIA, WORDS, idOf };
