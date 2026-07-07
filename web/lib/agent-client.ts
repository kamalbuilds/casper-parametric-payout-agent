export interface PayoutCheckResult {
  policyId: string;
  threshold: number;
  reading: number;
  unit: string;
  thresholdCrossed: boolean;
  recommendation: "EXECUTE_PAYOUT" | "REJECT_CLAIM";
  aiExplanation: string;
  dataSignatureValid: boolean;
  dataSourceHash: string;
  timestamp: string;
}

export const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL || "http://localhost:4020";

export async function runPayoutCheck(
  policyId: string,
  threshold: number,
  readingId?: string
): Promise<PayoutCheckResult> {
  const res = await fetch(`${AGENT_URL}/api/payout-check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ policyId, threshold, readingId }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = body?.message || body?.error || `Agent responded ${res.status}`;
    throw new Error(message);
  }

  return (await res.json()) as PayoutCheckResult;
}
