import test from 'node:test';
import assert from 'node:assert/strict';
import { earnings, distributed, splitEvenly, percentOf, roundPence, paymentState } from '../lib/money.js';

const job = (over = {}) => ({
  price_pence: 400000,
  costs_pence: 150000,
  tax_percent: 20,
  lead_fee_percent: 15,
  lead_fee_to: 'Sam',
  worker_fee_pence: 0,
  partners: ['Sam', 'Alex'],
  ...over,
});

test('rounding takes halves away from zero, both directions', () => {
  assert.equal(roundPence(0.5), 1);
  assert.equal(roundPence(-0.5), -1);
  assert.equal(roundPence(1.4999), 1);
  assert.equal(roundPence(-2.5), -3);
});

test('the lead fee is taken after tax and after materials', () => {
  // The worked example: 4,000 pound job, 1,500 pounds of materials.
  const e = earnings(job());
  assert.equal(e.tax, 80000);
  assert.equal(e.afterCosts, 400000 - 80000 - 150000);
  assert.equal(e.leadFee, percentOf(170000, 15));
  assert.equal(e.leadFee, 25500);
  // Not 15% of the price, which would be 60000 and would pay Sam out of money
  // already spent at a merchant.
  assert.notEqual(e.leadFee, 60000);
});

test('a job with unknown materials says so rather than treating it as zero', () => {
  const e = earnings(job({ costs_pence: null }));
  assert.equal(e.costsKnown, false);
  assert.equal(e.costs, 0);
});

test('everything distributed adds back to the price, across many combinations', () => {
  let checked = 0;
  for (const price of [0, 1, 99, 12345, 99999, 400000, 1234567, 9999999]) {
    for (const costs of [0, 1, 7777, 150000, 999999]) {
      for (const tax of [0, 17.5, 20, 25]) {
        for (const fee of [0, 10, 15, 33.33]) {
          for (const partners of [['A'], ['A', 'B'], ['A', 'B', 'C']]) {
            const j = job({
              price_pence: price,
              costs_pence: costs,
              tax_percent: tax,
              lead_fee_percent: fee,
              partners,
              worker_fee_pence: 2500,
            });
            assert.equal(distributed(j), price, `${price}/${costs}/${tax}/${fee}`);
            checked += 1;
          }
        }
      }
    }
  }
  assert.ok(checked > 200, `only ${checked} combinations checked`);
});

test('a job that lost money splits negative and is shown that way', () => {
  const e = earnings(job({ price_pence: 100000, costs_pence: 200000 }));
  assert.ok(e.remainder < 0);
  assert.equal(e.lossMaking, true);
  assert.equal(e.partnerShares.reduce((s, p) => s + p.pence, 0), e.remainder);
  assert.equal(distributed(job({ price_pence: 100000, costs_pence: 200000 })), 100000);
});

test('the odd penny goes to the first partner, in the direction the amount points', () => {
  assert.deepEqual(splitEvenly(10, 3), [4, 3, 3]);
  assert.deepEqual(splitEvenly(-10, 3), [-4, -3, -3]);
  assert.deepEqual(splitEvenly(7, 2), [4, 3]);
  for (const n of [1, 2, 3, 4, 5, 7]) {
    for (const amount of [-9999, -1, 0, 1, 12345, 100000]) {
      assert.equal(splitEvenly(amount, n).reduce((a, b) => a + b, 0), amount);
    }
  }
});

test('a job with no partners distributes nothing to nobody, and still balances', () => {
  const e = earnings(job({ partners: [] }));
  assert.deepEqual(e.partnerShares, []);
  // The remainder is simply not shared out, so it cannot silently vanish.
  assert.equal(e.remainder, e.afterCosts - e.leadFee - e.workerFee);
});

test('a job paid in three stages reaches paid in full exactly', () => {
  const payments = [
    { amount_pence: 120000, paid_on: '2026-04-01' },
    { amount_pence: 180000, paid_on: '2026-04-20' },
    { amount_pence: 100000, paid_on: '2026-05-06' },
  ];
  const state = paymentState({ price_pence: 400000 }, payments);
  assert.equal(state.received, 400000);
  assert.equal(state.outstanding, 0);
  assert.equal(state.paidInFull, true);
  assert.equal(state.lastPaidOn, '2026-05-06');

  const short = paymentState({ price_pence: 400000 }, payments.slice(0, 2));
  assert.equal(short.outstanding, 100000);
  assert.equal(short.paidInFull, false);
});

test('a deposit is never derived from the price', () => {
  // There is no function here that turns a price into a deposit, because that
  // is a fixed-price convention and it does not survive contact with quoted
  // work. Deposits are recorded as the payment that was actually agreed.
  const state = paymentState({ price_pence: 480000 }, [{ amount_pence: 120000, paid_on: '2026-04-01' }]);
  assert.equal(state.outstanding, 360000);
});
