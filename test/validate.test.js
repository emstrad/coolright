import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLead, normalisePostcode, validFilePath, trapped } from '../lib/validate.js';

const base = {
  session_id: 'abcd1234efgh',
  name: 'Sam',
  email: 'sam@example.com',
  postcode: 'sw11 3ab',
  job_types: ['Servicing'],
  property_type: 'House',
};

test('postcodes are normalised, and rubbish is rejected', () => {
  assert.equal(normalisePostcode('sw113ab'), 'SW11 3AB');
  assert.equal(normalisePostcode('N1 3GZ'), 'N1 3GZ');
  assert.equal(normalisePostcode('not a postcode'), null);
  assert.equal(normalisePostcode(''), null);
});

test('a complete lead passes and comes back tidied', () => {
  const { ok, lead } = validateLead(base);
  assert.equal(ok, true);
  assert.equal(lead.postcode, 'SW11 3AB');
  assert.equal(lead.stage, 'complete');
  assert.deepEqual(lead.files, []);
});

test('field errors use the copy already in the markup', () => {
  const { ok, errors } = validateLead({ ...base, name: '', email: 'nope', postcode: 'x' });
  assert.equal(ok, false);
  assert.equal(errors.name, 'Please enter your first name.');
  assert.equal(errors.email, 'Please enter a valid email address.');
  assert.equal(errors.postcode, 'Please enter your postcode.');
});

test('a partial is held to step one only', () => {
  const { ok } = validateLead(
    { session_id: base.session_id, name: 'Sam', email: base.email, postcode: 'N1 3GZ' },
    { stage: 'partial' },
  );
  assert.equal(ok, true);
});

test('a job type outside the offered list is dropped', () => {
  const { ok, errors, lead } = validateLead({ ...base, job_types: ['Roof repair', 'Servicing'] });
  assert.equal(ok, true);
  assert.deepEqual(lead.job_types, ['Servicing']);
  assert.equal(errors.job_types, undefined);
});

test('a lead with only invented job types fails rather than storing nothing', () => {
  const { ok, errors } = validateLead({ ...base, job_types: ['Roof repair'] });
  assert.equal(ok, false);
  assert.equal(errors.job_types, 'Pick at least one, "Not sure yet" is fine.');
});

test('attachment paths must match the shape this app writes', () => {
  assert.equal(validFilePath('leads/3f1c2a44-5b6d-4e7f-8a9b-0c1d2e3f4a5b/photo.jpg'), true);
  assert.equal(validFilePath('leads/../../secret.pdf'), false);
  assert.equal(validFilePath('https://elsewhere.example/blob'), false);
});

test('the honeypot is only tripped when it is filled', () => {
  assert.equal(trapped({ website: 'http://spam.example' }), true);
  assert.equal(trapped({ website: '' }), false);
  assert.equal(trapped({}), false);
});
