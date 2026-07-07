import { NextResponse } from "next/server";
import type { EventsResponse, PolicyEvent, PolicyEventName } from "@/lib/events";

export const dynamic = "force-dynamic";

const CSPR_CLOUD_BASE = "https://api.testnet.cspr.cloud";
const TRACKED_EVENTS: PolicyEventName[] = ["PayoutExecuted", "ReadingRecorded"];

/**
 * CSPR.cloud contract-events payloads are not fully pinned down in the docs we could
 * verify (see BUILDING_NOTES.md section 5); different deployments have been observed
 * returning the event body either as a plain object keyed by field name, or as an
 * array of `{ name, parsed | value }` named-arg entries. This reads both shapes so the
 * proof table stays correct regardless of which one CSPR.cloud sends for this contract.
 */
function readField(rawData: unknown, key: string): string | null {
  if (rawData == null) return null;

  if (Array.isArray(rawData)) {
    const entry = rawData.find(
      (item) => item && typeof item === "object" && (item.name === key || item.key === key)
    );
    if (!entry) return null;
    const value = entry.parsed ?? entry.value ?? entry.cl_value?.parsed ?? entry.clValue?.parsed;
    return value === undefined || value === null ? null : String(value);
  }

  if (typeof rawData === "object") {
    const record = rawData as Record<string, unknown>;
    const value = record[key] ?? record[toCamelCase(key)];
    return value === undefined || value === null ? null : String(value);
  }

  return null;
}

function toCamelCase(snake: string): string {
  return snake.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function normalizeEvent(item: Record<string, unknown>): PolicyEvent | null {
  const eventName = String(item.event_name ?? item.name ?? item.eventName ?? "");
  if (!TRACKED_EVENTS.includes(eventName as PolicyEventName)) return null;

  const rawData = item.data ?? item.raw_data ?? item.rawData ?? item;

  return {
    eventName: eventName as PolicyEventName,
    timestamp:
      (item.timestamp as string) ??
      (item.execution_time_stamp as string) ??
      (item.block_timestamp as string) ??
      null,
    policyId: readField(rawData, "policy_id"),
    reading: readField(rawData, "reading"),
    payoutAmount: readField(rawData, "payout_amount"),
    dataSourceHash: readField(rawData, "data_source_hash"),
    deployHash:
      (item.deploy_hash as string) ??
      (item.deployHash as string) ??
      (item.transaction_hash as string) ??
      null,
  };
}

export async function GET() {
  const contractHash = process.env.CONTRACT_HASH;
  const accessKey = process.env.CSPR_CLOUD_ACCESS_KEY;

  if (!contractHash || !accessKey) {
    console.error(
      "[api/events] CONTRACT_HASH or CSPR_CLOUD_ACCESS_KEY is not set; returning empty proof table"
    );
    const body: EventsResponse = { configured: false, events: [] };
    return NextResponse.json(body);
  }

  const normalizedHash = contractHash.replace(/^(hash-|contract-)/, "");

  try {
    const res = await fetch(
      `${CSPR_CLOUD_BASE}/contracts/${normalizedHash}/events?page=1&limit=25`,
      {
        headers: { authorization: accessKey },
        cache: "no-store",
      }
    );

    if (!res.ok) {
      console.error(`[api/events] CSPR.cloud responded ${res.status} for contract ${normalizedHash}`);
      const body: EventsResponse = {
        configured: true,
        events: [],
        error: `CSPR.cloud returned ${res.status}`,
      };
      return NextResponse.json(body, { status: 502 });
    }

    const json = await res.json();
    const items: Record<string, unknown>[] = Array.isArray(json?.data) ? json.data : [];
    const events = items
      .map(normalizeEvent)
      .filter((event): event is PolicyEvent => event !== null);

    const body: EventsResponse = { configured: true, events };
    return NextResponse.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/events] fetch to CSPR.cloud failed:", message);
    const body: EventsResponse = { configured: true, events: [], error: message };
    return NextResponse.json(body, { status: 502 });
  }
}
