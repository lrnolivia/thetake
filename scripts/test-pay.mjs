import assert from 'node:assert/strict';
import { annualFederalTax, calculatePay } from '../src/pay.ts';

const brackets = [
  { upTo: 10_000, rate: 0.10 },
  { upTo: 40_000, rate: 0.20 },
  { upTo: null, rate: 0.30 }
];

const policy = {
  workerType: 'full-time',
  minimumWage: 10.98,
  ficaRate: 0.0765,
  standardDeduction: 16_100,
  tipsDeductionCap: 25_000,
  tipsDeductionAssumed: 3_000,
  brackets
};

assert.equal(annualFederalTax(0, brackets), 0);
assert.equal(annualFederalTax(10_000, brackets), 1_000);
assert.equal(annualFederalTax(50_000, brackets), 10_000);
assert.equal(annualFederalTax(50_000, [{ upTo: 1, rate: 0.10 }]), 5_000);

const atThreshold = calculatePay(
  { hours: 0, serviceRevenue: 1_200, tips: 0, productSales: 0 },
  policy
);
assert.equal(atThreshold.serviceCommission, 540);

const aboveThreshold = calculatePay(
  { hours: 0, serviceRevenue: 1_300, tips: 50, productSales: 100 },
  policy
);
assert.equal(aboveThreshold.serviceTierOne, 540);
assert.equal(aboveThreshold.serviceTierTwo, 70);
assert.equal(aboveThreshold.productCommission, 10);
assert.equal(aboveThreshold.grossWeekly, 670);

const floorPay = calculatePay(
  { hours: 10, serviceRevenue: 0, tips: 20, productSales: 0 },
  { ...policy, workerType: 'part-time' }
);
assert.equal(floorPay.floorApplies, true);
assert.ok(Math.abs(floorPay.base - 109.8) < 0.001);
assert.ok(Math.abs(floorPay.grossWeekly - 129.8) < 0.001);

const corruptedRates = calculatePay(
  { hours: 0, serviceRevenue: 100, tips: 0, productSales: 0 },
  { ...policy, ficaRate: 7.65, brackets: [{ upTo: null, rate: 12 }] }
);
assert.equal(corruptedRates.ficaWeekly, corruptedRates.grossWeekly);
assert.ok(Number.isFinite(corruptedRates.netWeekly));

const corruptedInputs = calculatePay(
  { hours: Number.NaN, serviceRevenue: Number.POSITIVE_INFINITY, tips: -20, productSales: -1 },
  policy
);
assert.equal(corruptedInputs.grossWeekly, 0);
assert.equal(corruptedInputs.netWeekly, 0);

console.log('Pay calculation checks passed.');
