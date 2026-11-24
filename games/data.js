/**
 * Game content - ALL Kingshot. Edit freely, add your own.
 *
 * Each trivia item: { q: question, a: correct answer, w: [3 wrong answers] }
 * Facts were checked against community guides/wikis (Nov 2026). Kingshot gets
 * patched often, so re-check numbers (levels, durations, schedules) from time to time.
 *
 * The bot remembers what each player has already seen and won't repeat a
 * question or word until they've been through the whole pool.
 */
const crypto = require('crypto');
const TROOPS = [{
	q: 'Which troop type is strongest against Cavalry?',
	a: 'Infantry',
	w: ['Archers', 'Cavalry', 'Scouts']
}, {
	q: 'Which troop type is strongest against Archers?',
	a: 'Cavalry',
	w: ['Infantry', 'Archers', 'Scouts']
}, {
	q: 'Which troop type is strongest against Infantry?',
	a: 'Archers',
	w: ['Cavalry', 'Infantry', 'Scouts']
}, {
	q: 'Which building trains Infantry?',
	a: 'Barracks',
	w: ['Range', 'Stable', 'Embassy']
}, {
	q: 'Which building trains Archers?',
	a: 'Range',
	w: ['Barracks', 'Stable', 'Academy']
}, {
	q: 'Which building trains Cavalry?',
	a: 'Stable',
	w: ['Barracks', 'Range', 'Command Center']
}, {
	q: 'Which troop type has the fastest march speed?',
	a: 'Cavalry',
	w: ['Infantry', 'Archers', 'They are all the same']
}, {
	q: 'In battle, which troop type attacks first?',
	a: 'Infantry',
	w: ['Cavalry', 'Archers', 'All at once']
}, {
	q: 'Which troop type is your front-line tank?',
	a: 'Infantry',
	w: ['Archers', 'Cavalry', 'Scouts']
}, {
	q: 'Which troop type is the main back-line damage dealer?',
	a: 'Archers',
	w: ['Infantry', 'Cavalry', 'Scouts']
}, {
	q: 'Which troop type should dominate a Bear Hunt march (about 80%)?',
	a: 'Archers',
	w: ['Infantry', 'Cavalry', 'All equal']
}, {
	q: 'Which troop type usually makes up the biggest share of a defending garrison?',
	a: 'Infantry',
	w: ['Archers', 'Cavalry', 'Scouts']
}, {
	q: 'In a formation written 50/20/30, what order are the numbers in?',
	a: 'Infantry / Cavalry / Archers',
	w: ['Archers / Cavalry / Infantry', 'Cavalry / Infantry / Archers', 'Infantry / Archers / Cavalry']
}, {
	q: 'What is the highest troop tier in Kingshot?',
	a: 'T11',
	w: ['T9', 'T10', 'T12']
}, {
	q: 'How many main troop types are there?',
	a: '3',
	w: ['2', '4', '5']
}, {
	q: 'What minimum share of each troop type is generally recommended in a march?',
	a: '5%',
	w: ['1%', '15%', '25%']
}, ].map((x) => ({
	...x,
	cat: 'Troops'
}));
const RESOURCES = [{
	q: 'Which of these is NOT one of the four basic resources?',
	a: 'Truegold',
	w: ['Bread', 'Stone', 'Iron']
}, {
	q: 'Which Bread-Wood-Stone-Iron ratio do players commonly aim to keep?',
	a: '20-20-4-1',
	w: ['1-1-1-1', '10-5-2-1', '4-4-2-1']
}, {
	q: 'Which building turns Bread, Wood, Stone and Iron into Truegold?',
	a: 'Truegold Crucible',
	w: ['Storehouse', 'Academy', 'Command Center']
}, {
	q: 'How many refinement rounds does one Truegold Crucible cycle have?',
	a: '5',
	w: ['3', '7', '10']
}, {
	q: 'Truegold is mainly used for...',
	a: 'Upgrading buildings',
	w: ['Training troops', 'Hero skins', 'Buying gold']
}, {
	q: 'Above which building level do upgrades need Truegold?',
	a: '30',
	w: ['20', '25', '35']
}, {
	q: 'What resource is mainly used for research?',
	a: 'Truegold Dust',
	w: ['Wood', 'Bread', 'Stone']
}, {
	q: 'Which extra material shows up in the later Truegold (TG) stages?',
	a: 'Tempered Truegold',
	w: ['Mithril', 'Pet Food', 'Charm Design']
}, {
	q: 'Which item do you need to join a Bear Hunt?',
	a: 'Hunting Arrows',
	w: ['Taming Marks', 'Forgehammers', 'Hero Shards']
}, {
	q: 'Where do you earn Hunting Arrows?',
	a: 'Intelligence Missions',
	w: ['Arena', 'Truegold Crucible', 'Pet Training']
}, {
	q: 'Which valuable item drops from Bear Hunt?',
	a: 'Forge Hammers',
	w: ['Taming Marks', 'Hero Shards', 'Truegold Dust']
}, {
	q: 'Which of these is a Hero Gear upgrade item?',
	a: 'Forgehammer',
	w: ['Taming Mark', 'Hunting Arrow', 'Pet Food']
}, {
	q: 'What do you use Widgets for?',
	a: 'Hero gear',
	w: ['Troop training', 'Building speedups', 'Pet evolution']
}, ].map((x) => ({
	...x,
	cat: 'Resources'
}));
const BUILDINGS = [{
	q: "Which building's level limits all your other buildings?",
	a: 'Town Center',
	w: ['Embassy', 'Academy', 'Storehouse']
}, {
	q: 'Which building is needed for most Town Center upgrades, alongside a military building?',
	a: 'Embassy',
	w: ['Storehouse', 'Infirmary', 'Guard Station']
}, {
	q: 'Which building raises your rally capacity and march troop limit?',
	a: 'Command Center',
	w: ['Embassy', 'Barracks', 'Infirmary']
}, {
	q: 'At which Town Center level does the Command Center unlock?',
	a: '10',
	w: ['8', '12', '15']
}, {
	q: 'Which building heals wounded troops?',
	a: 'Infirmary',
	w: ['Barracks', 'Storehouse', 'Embassy']
}, {
	q: 'Which building protects part of your resources from being looted?',
	a: 'Storehouse',
	w: ['Academy', 'Embassy', 'Command Center']
}, {
	q: 'Which building improves your research speed?',
	a: 'Academy',
	w: ['Stable', 'Infirmary', 'Storehouse']
}, {
	q: 'Which building holds the late-game, Truegold-era research?',
	a: 'War Academy',
	w: ['Academy', 'Command Center', 'Embassy']
}, {
	q: 'At which Town Center level does Governor Gear unlock?',
	a: '22',
	w: ['15', '18', '25']
}, ].map((x) => ({
	...x,
	cat: 'Buildings'
}));
const HEROES = [{
	q: 'How many Expedition skills does a Mythic hero have?',
	a: '3',
	w: ['1', '2', '4']
}, {
	q: 'Which hero rarity can use Widgets (exclusive gear)?',
	a: 'Mythic',
	w: ['Rare', 'Epic', 'Common']
}, {
	q: 'Which of these is a Generation 1 Mythic hero?',
	a: 'Amadeus',
	w: ['Zoe', 'Petra', 'Marlin']
}, {
	q: 'How many Mythic heroes are in Generation 1?',
	a: '4',
	w: ['2', '3', '6']
}, {
	q: 'Which of these is NOT a Generation 1 Mythic hero?',
	a: 'Marlin',
	w: ['Jabel', 'Helga', 'Saul']
}, {
	q: 'Which hero arrived in Generation 2?',
	a: 'Zoe',
	w: ['Amadeus', 'Petra', 'Helga']
}, {
	q: 'Which hero belongs to Generation 3?',
	a: 'Petra',
	w: ['Marlin', 'Saul', 'Jabel']
}, {
	q: 'Which hero belongs to Generation 4?',
	a: 'Margot',
	w: ['Zoe', 'Petra', 'Jabel']
}, {
	q: 'Which hero belongs to Generation 5?',
	a: 'Thrud',
	w: ['Rosa', 'Eric', 'Hilde']
}, {
	q: 'Which Epic Cavalry hero is famous as a rally joiner for her +25% Lethality?',
	a: 'Chenko',
	w: ['Howard', 'Gordon', 'Diana']
}, {
	q: 'Which Epic Archer hero boosts Research Speed?',
	a: 'Yeonwoo',
	w: ['Chenko', 'Howard', 'Gordon']
}, {
	q: 'Which Epic hero is an Infantry hero?',
	a: 'Howard',
	w: ['Chenko', 'Yeonwoo', 'Amane']
}, {
	q: 'Amadeus belongs to which troop class?',
	a: 'Infantry',
	w: ['Cavalry', 'Archers', 'Scouts']
}, {
	q: 'Which Epic hero is used in garrisons for his health buff?',
	a: 'Gordon',
	w: ['Chenko', 'Yeonwoo', 'Amane']
}, ].map((x) => ({
	...x,
	cat: 'Heroes'
}));
const EVENTS = [{
	q: 'Which event is Kingdom vs Kingdom?',
	a: 'KvK',
	w: ['Arena', 'Bear Hunt', 'Swordland Showdown']
}, {
	q: 'What does KvK stand for?',
	a: 'Kingdom vs Kingdom',
	w: ['King vs King', 'Knight vs Knight', 'Keep vs Keep']
}, {
	q: 'What does SG stand for?',
	a: 'Strongest Governor',
	w: ['Super Guild', 'Siege Group', 'Supreme General']
}, {
	q: 'What does AB stand for in events?',
	a: 'Alliance Brawl',
	w: ['Arena Battle', 'Armor Boost', 'All-Out Battle']
}, {
	q: 'How often does Bear Hunt run?',
	a: 'Every 2 days',
	w: ['Every day', 'Every week', 'Every 2 weeks']
}, {
	q: 'How long is a Bear Hunt?',
	a: '30 minutes',
	w: ['10 minutes', '60 minutes', '2 hours']
}, {
	q: 'On which day is Swordland Showdown held?',
	a: 'Sunday',
	w: ['Monday', 'Wednesday', 'Saturday']
}, {
	q: 'How long is the Swordland Showdown battle?',
	a: '1 hour',
	w: ['10 minutes', '30 minutes', '3 hours']
}, {
	q: 'On which day is the Tri-Alliance Clash battle?',
	a: 'Saturday',
	w: ['Monday', 'Wednesday', 'Sunday']
}, {
	q: 'How many alliances fight in the Tri-Alliance Clash?',
	a: '3',
	w: ['2', '4', '5']
}, {
	q: 'How long does a Strongest Governor event last?',
	a: '7 days',
	w: ['1 day', '3 days', '14 days']
}, {
	q: 'How many daily challenges do you get in the Arena?',
	a: '5',
	w: ['3', '7', '10']
}, {
	q: 'What attacks you during Viking Vengeance?',
	a: 'Waves of Viking troops',
	w: ['A rival alliance', 'Wild beasts', 'Another kingdom']
}, {
	q: 'Viking Vengeance rewards help you progress which gear?',
	a: 'Governor Gear',
	w: ['Hero Gear', 'Pet Gear', 'Alliance Gear']
}, {
	q: 'On which days do the Alliance Championship phases run?',
	a: 'Monday to Saturday',
	w: ['Monday to Friday', 'Friday to Sunday', 'Sunday only']
}, {
	q: 'What do you mainly win from Hero Roulette?',
	a: 'Hero Shards',
	w: ['Forgehammers', 'Taming Marks', 'Truegold']
}, ].map((x) => ({
	...x,
	cat: 'Events'
}));
const PETS = [{
	q: "What is the pet system's currency mark called?",
	a: 'Taming Mark',
	w: ['Hero Shard', 'Gold Coin', 'Speedup Token']
}, {
	q: 'What do pets level up with?',
	a: 'Pet Food',
	w: ['Taming Marks', 'Forgehammers', 'Widgets']
}, {
	q: 'What do Taming Marks do?',
	a: 'Refine a pet'
	s secondary stats ',
	w: ['Level up pets', 'Train troops', 'Unlock heroes']
}, {
	q: 'How many secondary stats does pet refinement affect?',
	a: '6',
	w: ['3', '4', '8']
}, ].map((x) => ({
	...x,
	cat: 'Pets'
}));
const TRIVIA = [...TROOPS, ...RESOURCES, ...BUILDINGS, ...HEROES, ...EVENTS, ...PETS];
// Hangman + Scramble words - all Kingshot terms (A-Z only, 5+ letters, no spaces)
const WORDS = [
	// troops & buildings
	'CAVALRY', 'INFANTRY', 'ARCHER', 'BARRACKS', 'STABLE', 'EMBASSY', 'INFIRMARY', 'STOREHOUSE', 'ACADEMY', 'CRUCIBLE', 'TOWNCENTER', 'GARRISON', 'LETHALITY', 'TERROR',
	// resources & gear
	'TRUEGOLD', 'TEMPERED', 'MITHRIL', 'WIDGETS', 'FORGEHAMMER', 'BREAD', 'STONE', 'SHARDS', 'CHARMS', 'TAMING', 'SPEEDUP', 'RESEARCH', 'TRAINING',
	// events & alliance
	'ALLIANCE', 'GOVERNOR', 'KINGDOM', 'RALLY', 'JOINER', 'EXPEDITION', 'CONQUEST', 'ARENA', 'SWORDLAND', 'SHOWDOWN', 'VIKING', 'VENGEANCE', 'CESARE', 'MYSTIC', 'ROULETTE', 'CHAMPIONSHIP', 'BRAWL', 'CASTLE', 'HUNTING', 'ARROWS', 'MISSIONS',
	// heroes
	'AMADEUS', 'JABEL', 'HELGA', 'HILDE', 'MARLIN', 'PETRA', 'JAEGER', 'CHENKO', 'YEONWOO', 'HOWARD', 'GORDON', 'AMANE', 'MARGOT', 'THRUD', 'ALCAR', 'VIVIAN',
];
/** Stable short id for "already seen" tracking (a word is its own id). */
const idOf = (x) => typeof x === 'string' ? x : crypto.createHash('md5').update(x.q).digest('hex').slice(0, 8);
module.exports = {
	TRIVIA,
	WORDS,
	idOf
};
