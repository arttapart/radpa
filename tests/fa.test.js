import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, isSingleWord, validateClue, nearSame, judgeGuess } from '../src/fa.js';

test('normalize', () => {
  assert.equal(normalize('كتاب'), normalize('کتاب'));
  assert.equal(normalize('مي‌روم'), normalize('میروم'));
  assert.equal(normalize('آب'), normalize('اب'));
});
test('single word', () => {
  assert.ok(isSingleWord('کتاب‌خانه'));
  assert.ok(!isSingleWord('کتاب خانه'));
  assert.ok(!isSingleWord('  '));
});
test('clue validation', () => {
  assert.ok(validateClue('گربه', 'گربه'));
  assert.ok(validateClue('گربه‌ها', 'گربه'));
  assert.ok(validateClue('دو کلمه', 'گربه'));
  assert.equal(validateClue('موش', 'گربه'), null);
});
test('duplicates', () => {
  assert.ok(nearSame('درخت', 'درختها'));
  assert.ok(nearSame('ميز', 'میز'));
  assert.ok(nearSame('آسمان', 'اسمان'));
  assert.ok(!nearSame('سیب', 'موز'));
});
test('guess judging', () => {
  assert.equal(judgeGuess('پرتقال', 'پرتقال'), 'exact');
  assert.equal(judgeGuess('پرتغال', 'پرتقال'), 'maybe');
  assert.equal(judgeGuess('پرتقال‌ها', 'پرتقال'), 'maybe');
  assert.equal(judgeGuess('سیب', 'پرتقال'), 'wrong');
});
