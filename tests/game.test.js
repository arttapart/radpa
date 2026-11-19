import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HostGame, newState } from '../src/game.js';

function setup() {
  const g = new HostGame(newState('1234', 'h'));
  for (const id of ['h', 'a', 'b', 'c']) g.join(id, { name: id });
  // h,b -> team0 ; a,c -> team1 by alternation
  return g;
}

test('full turn with dup, strikes, correct guess', () => {
  const g = setup();
  assert.equal(g.canStart(), null);
  g.start();
  const s = g.s, t = s.turn;
  assert.equal(s.phase, 'clue');
  const team = Object.values(s.players).filter((p) => p.team === t.team && p.id !== t.guesserId);
  // add an extra teammate to test dups
  g.join('d', { name: 'd' }); s.players.d.team = t.team;
  const cl = [...team.map((p) => p.id), 'd'];
  assert.equal(g.handle(cl[0], { type: 'clue', text: t.word }), false);
  g.handle(cl[0], { type: 'clue', text: 'زیبا' });
  g.handle(cl[1], { type: 'clue', text: 'زيبا' });
  assert.equal(s.phase, 'filter');
  assert.ok(t.list.every((c) => c.dup && c.removed));
  const opp = Object.values(s.players).filter((p) => p.team !== t.team).map((p) => p.id);
  opp.forEach((id) => g.handle(id, { type: 'confirm' }));
  assert.equal(s.phase, 'guess');
  g.handle(t.guesserId, { type: 'guess', text: t.word });
  assert.equal(s.phase, 'reveal');
  assert.equal(s.scores[t.team], 1);
});

test('strike requires all opponents; vote path', () => {
  const g = setup();
  g.start();
  const s = g.s, t = s.turn;
  const cl = Object.values(s.players).filter((p) => p.team === t.team && p.id !== t.guesserId);
  cl.forEach((p, i) => g.handle(p.id, { type: 'clue', text: ['اول', 'دوم'][i] }));
  assert.equal(s.phase, 'filter');
  const opp = Object.values(s.players).filter((p) => p.team !== t.team).map((p) => p.id);
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

test('game ends after rounds and awards computed', () => {
  const g = setup();
  g.updateSettings({ rounds: 1 });
  g.start();
  for (let k = 0; k < 2; k++) {
    const t = g.s.turn;
    g.handle(t.guesserId, { type: 'guess', text: 'x' });
    // still in clue phase, so guess ignored; force timeouts
    t.deadline = 1; g.tick();
    if (g.s.phase === 'filter') { Object.values(g.s.players).filter((p) => p.team !== t.team).forEach((p) => g.handle(p.id, { type: 'confirm' })); }
    g.handle(t.guesserId, { type: 'giveup' });
    assert.equal(g.s.phase, 'reveal');
    g.next();
  }
  assert.equal(g.s.phase, 'end');
  assert.ok(Array.isArray(g.s.awards));
});
