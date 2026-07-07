export type PolicyEventName = "PayoutExecuted" | "ReadingRecorded";

export interface PolicyEvent {
  eventName: PolicyEventName;
  timestamp: string | null;
  policyId: string | null;
  reading: string | null;
  payoutAmount: string | null;
  dataSourceHash: string | null;
  deployHash: string | null;
}

export interface EventsResponse {
  configured: boolean;
  events: PolicyEvent[];
  error?: string;
}
