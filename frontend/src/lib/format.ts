import {
  centsToDecimal,
  multiplierToDecimal,
  type CentsString,
  type MultiplierHundredths,
} from "@crash/contracts";

export function formatMoney(cents: CentsString): string {
  return `$ ${centsToDecimal(cents)}`;
}

export function formatMultiplier(multiplier: MultiplierHundredths): string {
  return `${multiplierToDecimal(multiplier)}×`;
}
