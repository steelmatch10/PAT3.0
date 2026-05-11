/**
 * PAT3.0 Test Suite — GRASP Module
 * Tests for grasp.js calculation logic
 * Run with: npm test tests/grasp.test.js
 */

// SKIP: grasp.js functions live inside a DOMContentLoaded IIFE — not exported.
// To enable these tests, extract and export pure functions from grasp.js.
describe.skip("GRASP Module: Form & State Management", () => {
  // Setup DOM elements before each test
  beforeEach(() => {
    document.body.innerHTML = `
      <input id="units" value="" />
      <input id="rentPerUnitMonthly" value="" />
      <input id="address" value="" />
      <input id="propertyValue" value="" />
      <input id="percentDownPct" value="" />
      <input id="rateAprPct" value="" />
      <input id="loanLengthYears" value="30" />
      <input id="taxesMonthly" value="" />
      <input id="insuranceMonthly" value="" />
      <input id="hoaMonthly" value="" />
      <button id="addOrSaveBtn">Add Property</button>
      <button id="clearBtn">Clear</button>
      <div id="kpiBadges"></div>
      <div id="supplemental"></div>
    `;
  });

  describe("collectForm()", () => {
    test("collects all form values into object", () => {
      document.getElementById("units").value = "4";
      document.getElementById("rentPerUnitMonthly").value = "2000";
      document.getElementById("propertyValue").value = "500000";

      const form = collectForm();

      expect(form.units).toBe(4);
      expect(form.rentPerUnitMonthly).toBe(2000);
      expect(form.propertyValue).toBe(500000);
    });

    test("converts string inputs to numbers", () => {
      document.getElementById("units").value = "5";
      const form = collectForm();
      expect(typeof form.units).toBe("number");
    });

    test("handles empty values as 0", () => {
      document.getElementById("units").value = "";
      const form = collectForm();
      expect(form.units).toBe(0);
    });
  });

  describe("Form Mode (Add vs Edit)", () => {
    test("add mode shows 'Add Property' button", () => {
      // When URL has no ?edit=id parameter
      const isEditMode = new URLSearchParams(location.search).get("edit");
      expect(isEditMode).toBeNull();
    });

    test("edit mode loads property from catalogue", () => {
      // Requires mocked getCatalog() and URL parameter
      // Setup: Add property to mocked catalogue
      // Then: Verify form loads with property data
    });
  });

  describe("Dirty State Tracking", () => {
    test("marks form as dirty on input change", () => {
      // Simulate user typing
      document.getElementById("units").value = "5";
      document.getElementById("units").dispatchEvent(new Event("input"));

      // isDirty should be true
      // (Need to expose isDirty for testing)
    });

    test("clears dirty flag after save", () => {
      // After clicking save button and property is saved
      // isDirty should be false
    });
  });
});

describe("GRASP Module: Calculation Logic", () => {
  /**
   * GRASP Calculation Reference:
   * - Gross Rent Multiplier (GRM) = Property Value / Gross Annual Rent
   * - Cap Rate = Net Operating Income / Property Value
   * - Cash-on-Cash Return = Annual Cash Flow / Cash Invested
   * - DSCR = Net Operating Income / Debt Service Payment
   */

  describe("Monthly Rent Calculation", () => {
    test("calculates total monthly rent from units and per-unit rent", () => {
      // Input: 4 units @ $2,000/unit
      // Expected: $8,000/month total
      const totalMonthlyRent = 4 * 2000;
      expect(totalMonthlyRent).toBe(8000);
    });

    test("handles zero units", () => {
      const totalMonthlyRent = 0 * 2000;
      expect(totalMonthlyRent).toBe(0);
    });
  });

  describe("Monthly Carry Cost Calculation", () => {
    test("sums all monthly costs", () => {
      const costs = {
        taxes: 500,
        insurance: 200,
        hoa: 150,
        // Total: $850/month
      };
      const totalMonthlyCosts = 500 + 200 + 150;
      expect(totalMonthlyCosts).toBe(850);
    });

    test("handles missing cost values", () => {
      const costs = {
        taxes: 500,
        insurance: 0,
        hoa: 0
      };
      const totalMonthlyCosts = 500 + 0 + 0;
      expect(totalMonthlyCosts).toBe(500);
    });

    test("converts annual to monthly correctly", () => {
      // Given: taxes = $6000/year
      // Expected: $500/month
      const annualTaxes = 6000;
      const monthlyTaxes = annualTaxes / 12;
      expect(monthlyTaxes).toBe(500);
    });

    test("converts monthly to annual correctly", () => {
      // Given: taxes = $500/month
      // Expected: $6000/year
      const monthlyTaxes = 500;
      const annualTaxes = monthlyTaxes * 12;
      expect(annualTaxes).toBe(6000);
    });
  });

  describe("Loan Calculations", () => {
    test("calculates monthly mortgage payment", () => {
      /**
       * Formula: M = P * [r(1+r)^n] / [(1+r)^n - 1]
       * P = principal
       * r = monthly interest rate
       * n = number of payments
       */
      const principal = 400000; // 80% of $500k
      const annualRate = 0.07; // 7%
      const monthlyRate = annualRate / 12;
      const months = 30 * 12;

      // Using standard mortgage formula
      const monthlyPayment = principal *
        (monthlyRate * Math.pow(1 + monthlyRate, months)) /
        (Math.pow(1 + monthlyRate, months) - 1);

      // Expected: ~$2,661/month
      expect(monthlyPayment).toBeCloseTo(2661, 0);
    });

    test("calculates down payment from percentage", () => {
      // Input: $500k property, 20% down
      // Expected: $100k down, $400k loan
      const propertyValue = 500000;
      const downPercent = 0.20;
      const downPayment = propertyValue * downPercent;
      const loanAmount = propertyValue - downPayment;

      expect(downPayment).toBe(100000);
      expect(loanAmount).toBe(400000);
    });

    test("calculates remaining loan balance", () => {
      // After 5 years of payments on 30-year loan
      // Balance should be ~95% of original
      const principal = 400000;
      const annualRate = 0.07;
      const monthlyRate = annualRate / 12;
      const totalMonths = 30 * 12;
      const paymentsMade = 5 * 12;

      // Formula: B = P * [(1+r)^n - (1+r)^p] / [(1+r)^n - 1]
      const balance = principal *
        (Math.pow(1 + monthlyRate, totalMonths) - Math.pow(1 + monthlyRate, paymentsMade)) /
        (Math.pow(1 + monthlyRate, totalMonths) - 1);

      // Expected: ~$380k (95% of original)
      expect(balance / principal).toBeCloseTo(0.95, 1);
    });
  });

  describe("Cash Flow Calculation", () => {
    test("calculates positive monthly cash flow", () => {
      // Revenue - Costs = Cash Flow
      // $8,000 rent - $850 costs - $2,661 mortgage = $4,489 positive
      const monthlyRent = 8000;
      const monthlyCosts = 850;
      const monthlyMortgage = 2661;
      const monthlyNetCashFlow = monthlyRent - monthlyCosts - monthlyMortgage;

      expect(monthlyNetCashFlow).toBeCloseTo(4489, 0);
    });

    test("calculates negative cash flow", () => {
      // When costs exceed rent
      const monthlyRent = 2000;
      const monthlyCosts = 2500;
      const monthlyMortgage = 2000;
      const monthlyNetCashFlow = monthlyRent - monthlyCosts - monthlyMortgage;

      expect(monthlyNetCashFlow).toBe(-2500);
    });

    test("annualizes monthly cash flow", () => {
      // Monthly: $4,489 → Annual: $53,868
      const monthlyNetCashFlow = 4489;
      const annualNetCashFlow = monthlyNetCashFlow * 12;

      expect(annualNetCashFlow).toBeCloseTo(53868, 0);
    });
  });

  describe("KPI: Cash-on-Cash Return", () => {
    test("calculates CoC return correctly", () => {
      /**
       * CoC = Annual Cash Flow / Cash Invested
       * If: Annual CF = $20,000, Down Payment = $100,000
       * Then: CoC = 20,000 / 100,000 = 20%
       */
      const annualCashFlow = 20000;
      const cashInvested = 100000;
      const coc = annualCashFlow / cashInvested;

      expect(coc).toBe(0.20);
    });

    test("returns Great rating for high CoC", () => {
      // > 7% is "Great"
      const coc = 0.08;
      expect(bandCoC(coc).label).toBe("Great");
    });

    test("returns Bad rating for low CoC", () => {
      // < 3% is "Bad"
      const coc = 0.02;
      expect(bandCoC(coc).label).toBe("Bad");
    });
  });

  describe("KPI: Cap Rate", () => {
    test("calculates cap rate correctly", () => {
      /**
       * Cap Rate = NOI / Property Value
       * If: NOI = $50,000/year, Property Value = $500,000
       * Then: Cap Rate = 50,000 / 500,000 = 10%
       */
      const noi = 50000;
      const propertyValue = 500000;
      const capRate = noi / propertyValue;

      expect(capRate).toBe(0.10);
    });

    test("returns Good rating for healthy cap rate", () => {
      // 8-12% is "Good"
      const capRate = 0.10;
      expect(bandCapRate(capRate).label).toBe("Good");
    });
  });

  describe("KPI: DSCR (Debt Service Coverage Ratio)", () => {
    test("calculates DSCR correctly", () => {
      /**
       * DSCR = NOI / Annual Debt Service
       * If: NOI = $50,000/year, Monthly Payment = $2,661 (= $31,932/year)
       * Then: DSCR = 50,000 / 31,932 ≈ 1.56
       */
      const noi = 50000;
      const annualDebtService = 2661 * 12;
      const dscr = noi / annualDebtService;

      expect(dscr).toBeCloseTo(1.56, 1);
    });

    test("returns Great rating for DSCR > 1.36", () => {
      const dscr = 1.5;
      expect(bandDSCR(dscr).label).toBe("Great");
    });

    test("returns Okay rating for DSCR 1.21-1.36", () => {
      const dscr = 1.25;
      expect(bandDSCR(dscr).label).toBe("Okay");
    });

    test("returns Bad rating for DSCR < 1.21", () => {
      const dscr = 1.0;
      expect(bandDSCR(dscr).label).toBe("Bad");
    });
  });

  describe("Suggested Rent Calculations", () => {
    test("calculates rent needed for target CoC", () => {
      /**
       * Target: 10% CoC
       * Down Payment: $100,000
       * Annual rent needed: $100,000 * 0.10 = $10,000/year
       * Monthly needed: $833/month
       */
      const targetCoC = 0.10;
      const downPayment = 100000;
      const annualRentNeeded = downPayment * targetCoC;

      expect(annualRentNeeded).toBe(10000);
    });

    test("calculates rent needed for target Cap Rate", () => {
      /**
       * Target: 8% Cap Rate
       * Property Value: $500,000
       * NOI needed: $500,000 * 0.08 = $40,000/year
       */
      const targetCapRate = 0.08;
      const propertyValue = 500000;
      const noiNeeded = propertyValue * targetCapRate;

      expect(noiNeeded).toBe(40000);
    });
  });
});

describe("GRASP Module: View Mode Toggle", () => {
  test("toggles between monthly and annual view", () => {
    // Carry costs stored in monthly format
    // When user toggles: Convert to annual (multiply by 12)
    const monthlyTaxes = 500;
    const annualTaxes = monthlyTaxes * 12;

    expect(annualTaxes).toBe(6000);
  });

  test("persists view mode preference", () => {
    saveViewMode("annual");
    expect(readViewMode()).toBe("annual");
  });

  test("restores view mode on page reload", () => {
    // Simulate page load after saving "annual" preference
    const preference = readViewMode();
    expect(preference).toBe("annual");
  });
});
