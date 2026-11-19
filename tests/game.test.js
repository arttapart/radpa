import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HostGame, newState } from '../src/game.js';
import { parseWords, pickThree } from '../src/words.js';

const WORDS = parseWords(readFileSync(new URL('../public/words.txt', import.meta.url), 'utf8'));

function setup(ids = ['h', 'a', 'b', 'c']) {
  const g = new HostGame(newState('1234', 'h'), WORDS);
  for (const id of ids) g.join(id, { name: id });
  return g;
}
function pickAll(g) {
  const t = g.s.turn;
  assert.equal(g.s.phase, 'pick');
  assert.equal(t.options.length, 3);
  for (const p of g.pickers()) { g.handle(p.id, { type: 'pick', index: 1 }); g.handle(p.id, { type: 'pickok' }); }
  assert.equal(g.s.phase, 'clue');
  assert.equal(t.word, t.options[1]);
}

test('word bank parsed, nouns with bot clues', () => {
  assert.ok(WORDS.length > 800, String(WORDS.length));
  assert.ok(WORDS.filter((w) => w.c.length >= 2).length > 200);
});

test('three options are diverse', () => {
  for (let i = 0; i < 200; i++) {
    const o = pickThree(WORDS, [], i % 2 === 0);
    assert.equal(o.length, 3);
    assert.equal(new Set(o.map((x) => x.g)).size, 3);
  }
});

test('full turn with dup, strikes, correct guess', () => {
  const g = setup();
  assert.equal(g.canStart(), null);
  g.start();
  const s = g.s, t = s.turn;
  g.join('d', { name: 'd' }); s.players.d.team = t.team;
  pickAll(g);
  const cl = g.cluers().map((p) => p.id);
  assert.equal(g.handle(cl[0], { type: 'clue', text: t.word }), false);
  g.handle(cl[0], { type: 'clue', text: 'زیبا' });
  g.handle(cl[1], { type: 'clue', text: 'زيبا' });
  assert.equal(s.phase, 'filter');
  assert.ok(t.list.every((c) => c.dup && c.removed));
  g.opponents().forEach((p) => g.handle(p.id, { type: 'confirm' }));
  assert.equal(s.phase, 'guess');
  g.handle(t.guesserId, { type: 'guess', text: t.word });
  assert.equal(s.phase, 'reveal');
  assert.equal(s.scores[t.team], 1);
});

test('strike requires all opponents; vote path', () => {
  const g = setup();
  g.start();
  const s = g.s, t = s.turn;
  pickAll(g);
  g.cluers().forEach((p, i) => g.handle(p.id, { type: 'clue', text: ['اول', 'دوم'][i] }));
  assert.equal(s.phase, 'filter');
  const opp = g.opponents().map((p) => p.id);
  const c = t.list[0];
  g.handle(opp[0], { type: 'strike', id: c.id });
  assert.equal(c.removed, false);
  g.handle(opp[1], { type: 'strike', id: c.id });
  assert.equal(c.removed, true);
  opp.forEach((id) => g.handle(id, { type: 'confirm' }));
  t.word = 'پرتقال';
  g.handle(t.guesserId, { type: 'guess', text: 'پرتغال' });
  assert.equal(s.phase, 'vote');
  Object.keys(s.players).forEach((id, i) => g.handle(id, { type: 'vote', ok: i < 3 }));
  assert.equal(s.phase, 'reveal');
  assert.equal(t.verdict, 'correct');
});

test('bots give clues, never guess, opponents bots do not block', () => {
  const g = setup(['h', 'a']); // h team0, a team1
  g.addBot(0); g.addBot(1);
  assert.equal(g.canStart(), null);
  g.start();
  const s = g.s, t = s.turn;
  assert.ok(!s.players[t.guesserId].bot);
  // no human pickers → auto-picked
  assert.equal(s.phase, 'clue');
  assert.ok(t.word);
  const bot = g.cluers()[0];
  assert.ok(bot.bot);
  t.botPlan[bot.id] = 0;
  g.tick();
  assert.ok(t.clues[bot.id]);
  // opponent team has 1 human → filter phase with that human
  assert.equal(s.phase, 'filter');
  g.opponents().forEach((p) => g.handle(p.id, { type: 'confirm' }));
  assert.equal(s.phase, 'guess');
});

test('game ends after rounds and awards computed', () => {
  const g = setup();
  g.updateSettings({ rounds: 1 });
  g.start();
  for (let k = 0; k < 2; k++) {
    const t = g.s.turn;
    pickAll(g);
    t.deadline = 1; g.tick();
    if (g.s.phase === 'filter') g.opponents().forEach((p) => g.handle(p.id, { type: 'confirm' }));
    g.handle(t.guesserId, { type: 'giveup' });
    assert.equal(g.s.phase, 'reveal');
    g.next();
  }
  assert.equal(g.s.phase, 'end');
  assert.ok(Array.isArray(g.s.awards));
});
