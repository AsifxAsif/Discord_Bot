/**
 * Shared game helpers + active game sessions
 */
const activeGames = new Map(); // channelId or userId -> game state
function setGame(key, state) {
	activeGames.set(key, state);
}

function getGame(key) {
	return activeGames.get(key) || null;
}

function endGame(key) {
	activeGames.delete(key);
}

function hasActiveGame(key) {
	return activeGames.has(key);
}
/** Simple seeded-ish random */
function randomInt(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
	return arr[Math.floor(Math.random() * arr.length)];
}
const TRIVIA_QUESTIONS = [{
	q: 'What is the highest troop tier in Kingshot?',
	a: ['11', 't11', 'tier 11']
}, {
	q: 'What resource is mainly used for research?',
	a: ['truegold dust', 'dust']
}, {
	q: 'Which event is Kingdom vs Kingdom?',
	a: ['kvk', 'kingdom vs kingdom']
}, {
	q: 'What does SG stand for?',
	a: ['strongest governor']
}, {
	q: 'What building trains troops?',
	a: ['barracks', 'training grounds']
}, {
	q: 'What is the name of the pet system currency mark?',
	a: ['taming mark', 'advanced taming mark']
}, {
	q: 'Which troop type is strongest against Cavalry?',
	a: ['infantry', 'spear']
}, {
	q: 'What does AB stand for in events?',
	a: ['alliance brawl']
}, {
	q: 'Truegold is mainly used for?',
	a: ['building', 'buildings', 'upgrade']
}, {
	q: 'What do you use Widgets for?',
	a: ['hero gear', 'exclusive gear', 'hero exclusive gear']
}, ];
const SCRAMBLE_WORDS = ['TRUEGOLD', 'BARRACKS', 'ALLIANCE', 'GOVERNOR', 'CAVALRY', 'INFANTRY', 'ARCHER', 'MITHRIL', 'WIDGETS', 'HAMMER', 'KINGDOM', 'STRONGHOLD', 'RESEARCH', 'TRAINING', 'SPEEDUP', 'EMBLEM', 'MANUSCRIPT', 'TERROR', ];
module.exports = {
	setGame,
	getGame,
	endGame,
	hasActiveGame,
	randomInt,
	pick,
	TRIVIA_QUESTIONS,
	SCRAMBLE_WORDS,
};
