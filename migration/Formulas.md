# PAT 2.0 GRASP Formulas — Reference for PAT 3.0 Implementation

Purpose: Ensure mathematical consistency between PAT 2.0 (Google Sheets) and PAT 3.0 (JavaScript). All formulas below are transcribed from the official PAT 2.0 workbook.

---

## Input Fields (User-Provided)

| Field | Cell | Example Value | Notes |
|-------|------|---|---|
| Property Value / Negotiated Value | E | $370,000 | Purchase price |
| Percent Down | H | 10% | Down payment percentage |
| Loan Length | K | 30 | Years |
| Rate (APR %) | L | 6.2% | Annual interest rate |
| Taxes (Monthly) | O | $368.75 | Monthly property taxes |
| Insurance (Monthly) | Q | $84.38 | Monthly insurance |
| HOA (Monthly) | R | $250.00 | Monthly HOA fees |
| Est. Improvement Cost | U | $60,000 | Renovation/improvement budget |
| Property Closing Costs | T | $15,000 | Closing cost estimate |
| Annual Misc. Cost | W | $7,400 | Annual miscellaneous expenses |
| Bedrooms/Unit | Z | 6 | Number of rental units |
| Realistic Rent Avg Per Bedroom/Unit | AE | $1,000 | Average monthly rent per unit |

---

## Calculated Fields (Formulas)

### Step 1: Loan & Down Payment Calculations

Money Down (I) = Property Value (E) × Percent Down (H) = E × H

Loan Amount (J) = Property Value (E) - Money Down (I) = E - I

Compound Rate Constant (M) = 1 - POW((1 - (Rate/12)), Loan_Length × 12) = 1 - POW((1 - (L/12)), K × 12)

### Step 2: Monthly Mortgage Payment

Mortgage Payments (N) = -PMT(Rate/12, Loan_Length × 12, Loan_Amount) = -PMT(L/12, 30×12, J)

Note: The PMT formula in Google Sheets is: PMT(rate_per_period, number_periods, present_value) where rate_per_period = L/12 (monthly rate), number_periods = K×12 (total months), present_value = J (loan amount)

### Step 3: Operating Expenses (Monthly)

Misc Monthly (W_monthly) = (Annual Misc Cost (W) / 12) / Property Value (E) = (W / 12) / E

Note: This appears to be calculated as a rate, then multiplied back: Misc Monthly = Annual Misc Cost / 12 = W / 12

Recurring Payments (S) = Taxes (O) + Insurance (Q) + HOA (R) + Misc Monthly = O + Q + R + (W / 12)

Annual Operating Expenses (X) = Recurring Payments (S) × 12 = S × 12

Ownership Cost (Monthly) = S + Mortgage (N) = S + N

### Step 4: Rental Income (Monthly & Annual)

Total Realistic Rent (AH) = Bedrooms/Units (Z) × Rent per Unit (AE) = Z × AE

Gross Rent Monthly = Total Realistic Rent (AH) = AH

**PAT 3.0 — Property Management Cut replaces Vacancy Factor:** PAT 2.0 used a fixed 10% vacancy discount. PAT 3.0 replaces this with a per-property `property_management_cut` field (stored in `properties.property_management_cut`, default 10%). Vacancy factor as a separate concept no longer exists — the PM cut captures the same income reduction.

Effective Rent Monthly = Gross Rent (AH) × (1 - propertyManagementCut)

NOI Annual (AG) = (Effective Rent - Recurring Payments (S)) × 12

Annual Cash Flow (AI) = (Effective Rent - Ownership Cost (Monthly)) × 12 = (Effective Rent - S - N) × 12

Annual Mortgage Payments (AL) = Mortgage Payment (N) × 12 = N × 12

### Step 5: Investment & Cash Flow Metrics

Total Investment (V) = Money Down (I) + Est. Improvement Cost (U) + Closing Costs (T) = I + U + T

### Step 6: Key Performance Indicators (KPIs)

Cap Rate (AF) = NOI Annual (AG) / Property Value (E) = AG / E

Cash-On-Cash Return = Annual Cash Flow (AI) / Total Investment (V) = AI / V

**DSCR uses 80% of NOI (conservative lending standard):**

NOI 80% (AK) = NOI Annual (AG) × 80% = AG × 0.8

DSCR (AM) = NOI 80% (AK) / Annual Mortgage Payments (AL) = (AG × 0.8) / (N × 12)

Value for DSCR = 1.5 (AO): Uses the formula PRODUCT(1/L, AK/1.5, M) + I, where ADS = (incomeEfficiency × NOI Annual) / 1.5

Value for DSCR = 1.2 (AP): Uses the formula PRODUCT(1/L, AK/1.2, M) + I, where ADS = (incomeEfficiency × NOI Annual) / 1.2

Note: incomeEfficiency defaults to 80% (stored per-property in Supabase as `properties.income_efficiency`). PAT 2.0 used 85% — PAT 3.0 corrects this to 80% to match the DSCR calculation standard (same 80% as line 82).

### Step 8: Suggested Rent Per Unit (for Target Returns)

Rent Per Unit for 7% CoC (AC_7) = (0.07 × Total Investment (V) + 12 × Ownership Cost (S + N)) / (12 × Z) = (0.07 × V + 12 × (S + N)) / (12 × Z)

Rent Per Unit for 10% Cap Rate (AC_10) = (0.10 × Property Value (E) + 12 × Recurring (S)) / (12 × Z) = (0.10 × E + 12 × S) / (12 × Z)

Rent Per Unit for 12% Cap Rate (AC_12) = (0.12 × Property Value (E) + 12 × Recurring (S)) / (12 × Z) = (0.12 × E + 12 × S) / (12 × Z)

Rent Per Unit for 1.2 DSCR: Uses the formula DIVIDE(SUM(DIVIDE(PRODUCT(12,1.2,N),0.85),Y),PRODUCT(12,Z))

---

## Implementation Notes for PAT 3.0

Constants (Defined in PAT 2.0, Must Be Replicated):

```javascript
CONSTANTS = {
  CLOSING_COSTS: 0,              // fallback only — new scenarios default to 2.5% of property value (auto-calculated)
  INCOME_EFFICIENCY: 80,         // % of NOI used for DSCR guidance; stored per-property in properties.income_efficiency
  MISC_RATE_ANNUAL: 0.01,
  DSCR_TARGETS: [1.5, 1.2],
  COC_BANDS: [0.07, 0.05, 0.03],
  CAP_RATE_BANDS: [0.12, 0.08, 0.05]
}
```

PAT 3.0 changes from PAT 2.0:
- `CLOSING_COSTS` removed as a fixed constant ($15,000). New scenarios auto-calculate as 2.5% of property value. Users can override; the override is stored in `inputs.closingCosts`.
- `INCOME_EFFICIENCY` added (default 80%). Stored per-property in Supabase `properties.income_efficiency`. PAT 2.0 used 85% — PAT 3.0 corrects this to 80% to match the DSCR lending standard.

Tax Handling (Critical Difference: PAT 2.0 vs PAT 3.0):

PAT 2.0 stores Taxes Monthly in column O (monthly value from Zillow)

PAT 3.0 stores taxesAnnual in inputs JSONB (annual value = monthly × 12)

Conversion in migration: CSV column O (Taxes Monthly) × 12 = inputs.taxesAnnual

Before calling computeAll(): taxesMonthly = inputs.taxesAnnual / 12

Rounding & Precision:

PAT 2.0 behavior: Currency displays to 2 decimal places (e.g., $1,000.00), Percentages display to 2 decimal places (e.g., 7.35%), Floating-point calculations preserved internally (e.g., 0.2777034369971548 for CoC)

PAT 3.0 must match: Use toFixed(2) for currency display, Use toFixed(2) or toPrecision(4) for percentages (catches the 7.000000000001% bug), Store full precision in JSONB, round only on display

---

## Formula Validation Checklist

When implementing computeAll() in PAT 3.0, verify:

- Mortgage calculation matches PMT formula (monthly payment, 30-year loan)
- Operating expenses = taxes + insurance + HOA + (annual misc / 12)
- Cap Rate = NOI / Property Value (not divided by 12)
- CoC = Annual Cash Flow / Total Investment
- DSCR uses 80% of NOI (NOI × 0.8) for conservative lending
- Suggested rents for CoC/Cap Rate targets use correct numerator/denominator
- Tax field conversion: monthly → annual for storage, annual → monthly for computeAll()

---

## Example Validation

Using the first property (97 Throop Avenue, row 3):

| Field | Calculation | Expected PAT 2.0 | Notes |
|-------|-------------|---|---|
| Mortgage Monthly | PMT(6.2%/12, 360, 333000) | $2,039.52 | ✓ |
| Gross Rent Monthly | 6 × $1,000 | $6,000.00 | ✓ |
| Operating Expenses (monthly) | $368.75 + $84.38 + $250 + $616.67 | $1,319.80 | taxes+ins+HOA+misc(7400/12) |
| Effective Rent (90%) | $6,000 × 0.90 | $5,400.00 | 10% vacancy factor |
| NOI Annual | ($5,400 - $1,319.80) × 12 | $48,962.44 | ✓ matches CSV |
| Cap Rate | $48,962.44 / $370,000 | 13.23% | ✓ matches CSV |
| Annual Cash Flow | ($5,400 - $1,319.80 - $2,039.52) × 12 | $24,488.18 | vacancy applies to cash flow too |
| CoC | $24,488.18 / $112,000 | 21.86% | ✓ matches CSV |
| DSCR | ($48,962.44 × 0.80) / ($2,039.52 × 12) | 1.60 | ✓ matches CSV |

---

## Questions for Claude Code

1. Misc Rate handling: Should it be stored per-scenario or globally? (Currently stored per-scenario in CSV, suggest keeping it scenario-level)

2. Rounding precision: Should CoC/Cap Rate use toFixed(2) or toPrecision(3) for display?

3. DSCR guidance: The "Value for DSCR" formulas are complex — should these be helper functions in computeAll() or separated?

# PAT 2.0 FRAT Formulas — Reference for PAT 3.0 Implementation

Purpose: Ensure mathematical consistency between PAT 2.0 (Google Sheets) and PAT 3.0 (JavaScript) for the FRAT (Flipping/Fixer Risk Assessment Tool). All formulas below are transcribed from the official PAT 2.0 workbook.

---

## Input Fields (User-Provided)

| Field | Cell | Example Value | Notes |
|-------|------|---|---|
| Acquisition Value | C | $275,000 | Purchase price |
| Flipping Estimate | D | $100,000 | Estimated renovation cost |
| Percent Down | F | 20% | Down payment percentage |
| Loan Length | K | 30 | Years |
| Rate (APR %) | L | 8% | Annual interest rate |
| Taxes (Monthly) | O | $437.75 | Monthly property taxes |
| Insurance (Monthly) | Q | $0.00 | Monthly insurance |
| HOA (Monthly) | R | $0.00 | Monthly HOA fees |
| Months Till Resale | S | 5 | Time to completion and sale |
| Desired Resale Value | V | $500,000 | Target selling price |

---

## Calculated Fields (Formulas)

### Step 1: Purchase & Financing Calculations

Money Down (G) = Acquisition Value (C) × Percent Down (F) = C × F

Property Closing Costs (H) = Acquisition Value (C) × 5% = C × 0.05

Total Purchase Capital Required (I) = Money Down (G) + Property Closing Costs (H) = G + H

Note: Flipping Estimate (D) is financed into the Loan Amount — it is NOT added to upfront cash outlay.

Loan Amount (J) = Acquisition Value (C) + Flipping Estimate (D) - Money Down (G) = C + D - G

Compound Rate Constant (M) = 1 - POW((1 - (Rate/12)), Loan_Length × 12) = 1 - POW((1 - (L/12)), K × 12)

### Step 2: Monthly Mortgage Payment

Mortgage Payments (N) = -PMT(Rate/12, Loan_Length × 12, Loan_Amount) = -PMT(L/12, 30×12, J)

Note: The PMT formula in Google Sheets is: PMT(rate_per_period, number_periods, present_value) where rate_per_period = L/12 (monthly rate), number_periods = K×12 (total months), present_value = J (loan amount)

### Step 3: Operating Expenses (Monthly)

Recurring Payments (S) = Taxes (O) + Insurance (Q) + HOA (R) + Mortgage (N) = O + Q + R + N

Note: For FRAT, recurring payments include the mortgage since this is a short-term hold, not a rental property.

### Step 4: Total Investment & Hold Period Costs

Total Investment (T) = (Recurring Payments (S) × Months Till Resale) + Total Purchase Capital Required (I) = (S × Months) + I

### Step 5: Profit & Return Calculations

Net Profit (W) = Desired Resale Value (V) - Total Investment (T) - Loan Amount (J) = V - T - J

Estimated Return On Investment (X) = Net Profit (W) / (Total Investment (T) + Loan Amount (J)) = W / (T + J)

### Step 6: Target Resale Values for Different ROI Targets

Resale Value For 40% ROI (Y) = (Total Investment (T) + Loan Amount (J)) × 0.4 + (Total Investment (T) + Loan Amount (J)) = (T + J) × 1.4

Resale Value For 30% ROI (Z) = (Total Investment (T) + Loan Amount (J)) × 0.3 + (Total Investment (T) + Loan Amount (J)) = (T + J) × 1.3

Resale Value For 20% ROI (AA) = (Total Investment (T) + Loan Amount (J)) × 0.2 + (Total Investment (T) + Loan Amount (J)) = (T + J) × 1.2

Resale Value For 10% ROI (AB) = (Total Investment (T) + Loan Amount (J)) × 0.1 + (Total Investment (T) + Loan Amount (J)) = (T + J) × 1.1

---

## Implementation Notes for PAT 3.0

Constants (Defined in PAT 2.0, Must Be Replicated):

```javascript
CONSTANTS_FRAT = {
  CLOSING_COSTS_PERCENT: 0.05,  // 5% of acquisition value
  DEFAULT_LOAN_LENGTH: 30,      // Years
  ROI_TARGETS: [0.40, 0.30, 0.20, 0.10]  // 40%, 30%, 20%, 10%
}
```

Tax Handling (Same as GRASP):

FRAT stores Taxes (Monthly) in column O (monthly value from property data)

PAT 3.0 should store taxesAnnual in inputs JSONB (annual value = monthly × 12)

Conversion in migration: CSV column O (Taxes Monthly) × 12 = inputs.taxesAnnual

Before calling computeAll(): taxesMonthly = inputs.taxesAnnual / 12

Hold Period Impact:

The Months Till Resale (S) field is critical to FRAT calculations. It multiplies monthly carrying costs by the hold duration.

Total Investment includes both upfront capital (down payment + closing + renovation) AND ongoing carrying costs (mortgage + taxes + insurance for the hold period).

Rounding & Precision:

FRAT displays ROI as percentages to 2 decimal places (e.g., 23.45%)

Currency displays to 2 decimal places (e.g., $500,000.00)

Store full precision in JSONB, round only on display

---

## Key Differences: FRAT vs GRASP

| Aspect | GRASP | FRAT |
|--------|-------|------|
| Purpose | Long-term rental analysis | Short-term flip analysis |
| Hold Period | Indefinite | 3-24 months (user-specified) |
| Income | Monthly rental revenue | One-time resale value |
| Carrying Costs | Monthly operating expenses | Mortgage + taxes + insurance for hold months |
| Success Metric | Cap Rate, CoC, DSCR | ROI (Estimated Return) |
| Key Output | Annual cash flow | Target resale values for ROI goals |

---

## Formula Validation Checklist

When implementing computeAll() for FRAT in PAT 3.0, verify:

- Down payment calculation: Acquisition Value × Percent Down
- Closing costs: 5% of Acquisition Value
- Loan amount includes both acquisition + flipping estimate, minus down payment
- Mortgage calculation matches PMT formula (monthly payment, 30-year loan)
- Total investment = upfront costs + (monthly carrying costs × hold months)
- Net profit = resale value - total investment - loan amount (this is the actual cash profit)
- ROI formula = net profit / (total investment + loan amount)
- Target resale values multiply the denominator by (1 + ROI percentage)
- Tax field conversion: monthly → annual for storage, annual → monthly for calculations

---

## Example Validation

Using the first property (11 Randolphville Road, row 3):

| Field | Calculation | Expected PAT 2.0 | Notes |
|-------|-------------|---|---|
| Money Down | $275,000 × 20% | $55,000 | ✓ |
| Closing Costs | $275,000 × 5% | $13,750 | ✓ |
| Total Purchase Capital | $55,000 + $13,750 (no flipping — it's in the loan) | $68,750 | ✓ |
| Loan Amount | $275,000 + $100,000 - $55,000 | $320,000 | ✓ |
| Mortgage Monthly | PMT(8%/12, 360, 320000) | $2,348.05 | ✓ |
| Monthly Carrying | $438.58 + $0 + $0 + $2,348.05 | $2,786.63 | ✓ |
| Hold Costs (5 months) | $2,786.63 × 5 | $13,933.15 | ✓ |
| Total Investment | $68,750 + $13,933 | $82,683 | ✓ |
| Net Profit | $500,000 - $82,683 - $320,000 | $97,317 | ✓ |
| Estimated ROI | $97,317 / ($82,683 + $320,000) | 24.17% | ✓ matches CSV |
| Resale for 40% ROI | ($82,683 + $320,000) × 1.4 | $563,756 | ✓ |

---

## Questions for Claude Code

1. Hold Period Flexibility: Should months till resale be flexible (user-editable per scenario) or should there be standard hold periods (3, 6, 12 months)?

2. Negative ROI Handling: If the flip is unprofitable (as in the validation example), how should this be displayed? As negative percentage, warning banner, or visual indicator?

3. Rounding for ROI: Should ROI percentages use toFixed(2) for display?

4. Loan Term: Should loan length be editable per scenario, or locked at 30 years for FRAT? (PAT 2.0 shows 30 throughout.)