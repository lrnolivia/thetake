export type WorkerType = 'full-time' | 'part-time';

export interface TaxBracket {
  upTo: number | null;
  rate: number;
}

export interface PayPolicy {
  workerType: WorkerType;
  minimumWage: number;
  ficaRate: number;
  standardDeduction: number;
  tipsDeductionCap: number;
  tipsDeductionAssumed: number;
  brackets: TaxBracket[];
}

export interface PayInput {
  hours: number;
  serviceRevenue: number;
  tips: number;
  productSales: number;
  forceHours?: boolean;
}

export interface PayResult {
  serviceTierOne: number;
  serviceTierTwo: number;
  serviceCommission: number;
  productSales: number;
  productCommission: number;
  commission: number;
  floor: number;
  hoursKnown: boolean;
  base: number;
  floorApplies: boolean;
  tips: number;
  grossWeekly: number;
  ficaWeekly: number;
  afterFicaWeekly: number;
  fedWeekly: number;
  netWeekly: number;
}

const finitePositive = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, value) : 0;

export function annualFederalTax(taxableIncome: number, brackets: TaxBracket[]): number {
  let tax = 0;
  let previousCap = 0;

  for (const bracket of brackets) {
    const cap = bracket.upTo ?? Number.POSITIVE_INFINITY;
    if (taxableIncome <= previousCap) break;
    const dollarsInBracket = Math.min(taxableIncome, cap) - previousCap;
    tax += dollarsInBracket * bracket.rate;
    previousCap = cap;
  }

  return tax;
}

export function calculatePay(input: PayInput, policy: PayPolicy): PayResult {
  const hours = finitePositive(input.hours);
  const serviceRevenue = finitePositive(input.serviceRevenue);
  const tips = finitePositive(input.tips);
  const productSales = finitePositive(input.productSales);

  const serviceTierOne = Math.min(serviceRevenue, 1_200) * 0.45;
  const serviceTierTwo = Math.max(0, serviceRevenue - 1_200) * 0.70;
  const serviceCommission = serviceTierOne + serviceTierTwo;
  const productCommission = productSales * 0.10;
  const commission = serviceCommission + productCommission;

  const hoursKnown = Boolean(input.forceHours) || (policy.workerType === 'part-time' && hours > 0);
  const floor = hoursKnown ? finitePositive(policy.minimumWage) * hours : 0;
  const base = hoursKnown ? Math.max(commission, floor) : commission;
  const floorApplies = hoursKnown && floor > commission;
  const grossWeekly = base + tips;
  const ficaWeekly = grossWeekly * finitePositive(policy.ficaRate);
  const afterFicaWeekly = grossWeekly - ficaWeekly;

  const annualGross = grossWeekly * 52;
  const annualTips = tips * 52;
  const tipsDeductionApplied = Math.max(
    0,
    Math.min(policy.tipsDeductionAssumed, annualTips, policy.tipsDeductionCap)
  );
  const taxableIncome = Math.max(
    0,
    annualGross - policy.standardDeduction - tipsDeductionApplied
  );
  const fedWeekly = annualFederalTax(taxableIncome, policy.brackets) / 52;

  return {
    serviceTierOne,
    serviceTierTwo,
    serviceCommission,
    productSales,
    productCommission,
    commission,
    floor,
    hoursKnown,
    base,
    floorApplies,
    tips,
    grossWeekly,
    ficaWeekly,
    afterFicaWeekly,
    fedWeekly,
    netWeekly: afterFicaWeekly - fedWeekly
  };
}
