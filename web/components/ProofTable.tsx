"use client";

import { useCallback, useEffect, useState } from "react";
import { explorerDeployUrl, truncateHex } from "@/lib/casper";
import type { EventsResponse, PolicyEvent } from "@/lib/events";
import styles from "./ProofTable.module.css";

type LoadState = "loading" | "ready" | "error";

interface ProofTableProps {
  onEventsLoaded?: (count: number) => void;
}

export default function ProofTable({ onEventsLoaded }: ProofTableProps) {
  const [state, setState] = useState<LoadState>("loading");
  const [events, setEvents] = useState<PolicyEvent[]>([]);
  const [configured, setConfigured] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch("/api/events", { cache: "no-store" });
      const body = (await res.json()) as EventsResponse;
      setConfigured(body.configured);
      setEvents(body.events);
      onEventsLoaded?.(body.events.length);
      if (!res.ok || body.error) {
        console.error("[proof-table] events fetch returned an error:", body.error);
        setErrorMessage(body.error ?? `Request failed with status ${res.status}`);
        setState("error");
      } else {
        setErrorMessage(null);
        setState("ready");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[proof-table] failed to load events:", message);
      setErrorMessage(message);
      setState("error");
    }
  }, [onEventsLoaded]);

  useEffect(() => {
    load();
  }, [onEventsLoaded]);

  return (
    <section className={styles.card}>
      <div className={styles.heading}>
        <h2>On-chain proof</h2>
        <span>PayoutExecuted &amp; ReadingRecorded events from CSPR.cloud</span>
        <button
          type="button"
          className={styles.refresh}
          onClick={load}
          disabled={state === "loading"}
        >
          {state === "loading" ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {state === "error" && (
        <div className={styles.errorState}>
          Could not load on-chain events: {errorMessage}
        </div>
      )}

      {state !== "error" && !configured && (
        <div className={styles.empty}>
          Configure CONTRACT_HASH and CSPR_CLOUD_ACCESS_KEY on the server to stream proof
          events from CSPR.cloud. No policy has been checked on-chain yet.
        </div>
      )}

      {state !== "error" && configured && events.length === 0 && (
        <div className={styles.empty}>
          No settlements recorded yet. Run an evaluation above and submit it on-chain to
          populate this table.
        </div>
      )}

      {state !== "error" && configured && events.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.eventsTable}>
            <thead>
              <tr>
                <th className={styles.headerCell}>Time</th>
                <th className={styles.headerCell}>Event</th>
                <th className={styles.headerCell}>Policy</th>
                <th className={styles.headerCell}>Reading</th>
                <th className={styles.headerCell}>Payout amount</th>
                <th className={styles.headerCell}>Data source hash</th>
                <th className={styles.headerCell}>Deploy</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event, index) => (
                <tr key={`${event.deployHash ?? "unknown"}-${index}`} className={styles.bodyRow}>
                  <td className={`${styles.bodyCell} mono`}>
                    {event.timestamp ? new Date(event.timestamp).toLocaleString() : "-"}
                  </td>
                  <td className={styles.bodyCell}>
                    <span
                      className={`${styles.eventBadge} ${
                        event.eventName === "PayoutExecuted"
                          ? styles.eventPayout
                          : styles.eventReading
                      }`}
                    >
                      {event.eventName}
                    </span>
                  </td>
                  <td className={`${styles.bodyCell} mono`}>{event.policyId ?? "-"}</td>
                  <td className={`${styles.bodyCell} mono`}>{event.reading ?? "-"}</td>
                  <td className={`${styles.bodyCell} mono`}>{event.payoutAmount ?? "-"}</td>
                  <td className={`${styles.bodyCell} mono`}>
                    {event.dataSourceHash ? truncateHex(event.dataSourceHash, 8, 6) : "-"}
                  </td>
                  <td className={styles.bodyCell}>
                    {event.deployHash ? (
                      <a
                        className={styles.link}
                        href={explorerDeployUrl(event.deployHash)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {truncateHex(event.deployHash, 8, 6)}
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
