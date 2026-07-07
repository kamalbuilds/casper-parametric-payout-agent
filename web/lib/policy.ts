export interface PolicyFormState {
  policyId: string;
  insured: string;
  payoutAmountCspr: string;
  threshold: string;
}

export const DEFAULT_POLICY: PolicyFormState = {
  policyId: "1",
  insured: "",
  payoutAmountCspr: "1000",
  threshold: "6.0",
};

export const READING_UNIT = "meters";

export function parseThreshold(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function parsePolicyId(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function csprToMotes(cspr: string): string {
  const parsed = Number(cspr);
  if (!Number.isFinite(parsed) || parsed < 0) return "0";
  return Math.round(parsed * 1_000_000_000).toLocaleString("en-US");
}

/** CSPR string to motes as a decimal string for CLUInt512 deploy args. */
export function csprToMotesString(cspr: string): string {
  const parsed = Number(cspr);
  if (!Number.isFinite(parsed) || parsed < 0) return "0";
  return String(Math.round(parsed * 1_000_000_000));
}
