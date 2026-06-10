import { describe, expect, test } from "bun:test";
import {
  addCents,
  calculatePayoutCents,
  centsToDecimal,
  compareCents,
  decimalToCents,
  InvalidMoneyError,
  isCents,
  multiplierToDecimal,
  subtractCents,
} from "../src/money";

describe("decimalToCents", () => {
  test("parses whole units", () => {
    expect(decimalToCents("10")).toBe("1000");
  });

  test("parses one fraction digit as tens of cents", () => {
    expect(decimalToCents("10.5")).toBe("1050");
  });

  test("parses two fraction digits", () => {
    expect(decimalToCents("10.50")).toBe("1050");
    expect(decimalToCents("0.01")).toBe("1");
  });

  test("rejects more than two fraction digits", () => {
    expect(() => decimalToCents("1.001")).toThrow(InvalidMoneyError);
  });

  test("rejects negative amounts", () => {
    expect(() => decimalToCents("-1")).toThrow(InvalidMoneyError);
  });

  test("rejects non-numeric input", () => {
    expect(() => decimalToCents("abc")).toThrow(InvalidMoneyError);
    expect(() => decimalToCents("")).toThrow(InvalidMoneyError);
    expect(() => decimalToCents("1,50")).toThrow(InvalidMoneyError);
  });
});

describe("centsToDecimal", () => {
  test("formats cents with two fraction digits", () => {
    expect(centsToDecimal("1050")).toBe("10.50");
    expect(centsToDecimal("1")).toBe("0.01");
    expect(centsToDecimal("0")).toBe("0.00");
  });

  test("handles values beyond Number.MAX_SAFE_INTEGER", () => {
    expect(centsToDecimal("9007199254740993")).toBe("90071992547409.93");
  });

  test("rejects invalid cents strings", () => {
    expect(() => centsToDecimal("10.5")).toThrow(InvalidMoneyError);
    expect(() => centsToDecimal("01")).toThrow(InvalidMoneyError);
  });
});

describe("addCents / subtractCents", () => {
  test("adds exactly", () => {
    expect(addCents("1050", "950")).toBe("2000");
  });

  test("subtracts exactly", () => {
    expect(subtractCents("2000", "950")).toBe("1050");
  });

  test("refuses to go negative", () => {
    expect(() => subtractCents("100", "101")).toThrow(InvalidMoneyError);
  });
});

describe("compareCents", () => {
  test("orders numerically, not lexicographically", () => {
    expect(compareCents("900", "1000")).toBe(-1);
    expect(compareCents("1000", "900")).toBe(1);
    expect(compareCents("1000", "1000")).toBe(0);
  });
});

describe("calculatePayoutCents", () => {
  test("multiplies bet by multiplier hundredths", () => {
    expect(calculatePayoutCents("1000", 254)).toBe("2540");
  });

  test("floors to the cent", () => {
    // 333 * 1.51 = 502.83 -> 502 cents, never rounded up
    expect(calculatePayoutCents("333", 151)).toBe("502");
  });

  test("identity at 1.00x", () => {
    expect(calculatePayoutCents("1000", 100)).toBe("1000");
  });

  test("rejects multipliers below 1.00x", () => {
    expect(() => calculatePayoutCents("1000", 99)).toThrow(InvalidMoneyError);
  });

  test("rejects non-integer multipliers", () => {
    expect(() => calculatePayoutCents("1000", 150.5)).toThrow(InvalidMoneyError);
  });
});

describe("multiplierToDecimal", () => {
  test("formats hundredths as display value", () => {
    expect(multiplierToDecimal(100)).toBe("1.00");
    expect(multiplierToDecimal(254)).toBe("2.54");
    expect(multiplierToDecimal(1000)).toBe("10.00");
  });
});

describe("isCents", () => {
  test("accepts canonical integer strings", () => {
    expect(isCents("0")).toBe(true);
    expect(isCents("100")).toBe(true);
  });

  test("rejects signs, decimals and leading zeros", () => {
    expect(isCents("-1")).toBe(false);
    expect(isCents("1.5")).toBe(false);
    expect(isCents("01")).toBe(false);
    expect(isCents("")).toBe(false);
  });
});
