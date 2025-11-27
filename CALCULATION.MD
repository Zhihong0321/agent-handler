Calculation Rules & Internal Formulas

This document defines all internal formulas, lookup logic, and calculation steps used by the Eternalgy Solar PV Calculator.
These rules are always followed exactly as written.

1. CSV Lookup Rules

Use the file: Bill-KWH-TNB-DB.csv only.

Columns

usage_kwh (numeric)

bill_rm (string to be converted: strip "RM", commas → float)

Lookups

Bill → Usage: find the nearest bill_rm

Usage → Bill: find the nearest usage_kwh

No hardcoded tariff values.
All bill/usage conversions must come strictly from CSV lookup.

2. System Sizing Formulas

Given monthly usage X in kWh:

daily_kwh    = X / 30
required_kwp = daily_kwh / 3.4
raw_panels   = required_kwp / 0.62
panels       = CEILING(raw_panels)
system_kwp   = panels * 0.62


Customer-facing output:

"Recommended: {panels} panels (±{system_kwp} kWp)."

3. Bill After Solar Calculation

Default solar energy distribution (fixed unless user provides custom ratio):

30% self-consumption (offset)

70% export

The system must not invert these values.

Steps
3.1 Offset
X_after = X * 0.70
Bill_after_offset = CSV bill lookup using usage = X_after

3.2 Export Earnings
Export_kWh = system_kwp * 3.4 * 30 * 0.70
Export_RM  = Export_kWh * 0.20

3.3 New Bill
New_Bill = max(0, Bill_after_offset - Export_RM)

3.4 Savings
Saving_RM  = Original_Bill - New_Bill
Saving_pct = (Saving_RM / Original_Bill) * 100


All formulas are internal.
Do not show formulas to the user.