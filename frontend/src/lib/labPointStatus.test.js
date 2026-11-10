import test from 'node:test';
import assert from 'node:assert/strict';
import { hbCutoff, labPointStatus } from './labPointStatus.js';

test('Hb colours use the trimester at specimen collection and preserve severe boundary', () => {
  const point = { unit: 'g/L', value: 107, ga_days: 20 * 7, ref_low: 100, ref_high: 150 };
  assert.equal(hbCutoff(point), 105);
  assert.equal(labPointStatus('hb', point).level, 'normal');
  assert.equal(labPointStatus('hb', { ...point, ga_days: 28 * 7 }).level, 'warning');
  assert.equal(labPointStatus('hb', { ...point, value: 69 }).level, 'critical');
  assert.equal(labPointStatus('hb', { ...point, value: 70 }).level, 'warning');
  assert.equal(labPointStatus('hb', { ...point, value: 6.9, unit: 'g/dL', ref_low: null, ref_high: null }).level, 'unknown');
});
test('references belong to the individual result; a missing range never implies normal, a printed one-sided limit does', () => {
  assert.equal(labPointStatus('wbc', { value: 5, ref_low: 4, ref_high: 11 }).level, 'normal');
  assert.equal(labPointStatus('wbc', { value: 3, ref_low: 4, ref_high: 11 }).level, 'warning');
  assert.equal(labPointStatus('wbc', { value: 15, ref_low: 4, ref_high: 11 }).level, 'warning');
  assert.equal(labPointStatus('wbc', { value: 5 }).level, 'unknown');
  assert.equal(labPointStatus('wbc', { value: 5, ref_low: 4 }).level, 'normal');
  assert.equal(labPointStatus('alt', { value: 8.7, ref_high: 35 }).reason, 'withinOneSided');
  assert.equal(labPointStatus('alt', { value: 40, ref_high: 35 }).level, 'warning');
});
test('existing pressure and glucose thresholds retain units and inclusive boundaries', () => {
  assert.equal(labPointStatus('bp_sys', { value: 160, unit: 'mmHg' }).level, 'critical');
  assert.equal(labPointStatus('bp_dia', { value: 90, unit: 'mmHg' }).level, 'warning');
  assert.equal(labPointStatus('ogtt_0', { value: 5.3, unit: 'mmol/L' }).level, 'warning');
  assert.equal(labPointStatus('glucose', { value: 4.5, unit: 'mmol/L' }).level, 'unknown');
});
