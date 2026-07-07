"use client";

import { explorerDeployUrl } from "@/lib/casper";
import styles from "./ActivityTimeline.module.css";

export type StepStatus = "pending" | "active" | "complete" | "error";

export interface ActivityStep {
  id: string;
  title: string;
  detail?: string;
  status: StepStatus;
  href?: string;
}

interface ActivityTimelineProps {
  steps: ActivityStep[];
}

export default function ActivityTimeline({ steps }: ActivityTimelineProps) {
  return (
    <section className={styles.card}>
      <div className={styles.heading}>
        <h2>Agent activity</h2>
        <span>End-to-end pipeline from policy setup to on-chain proof</span>
      </div>

      <ol className={styles.list}>
        {steps.map((step, index) => (
          <li key={step.id} className={styles.item}>
            <div className={`${styles.marker} ${styles[step.status]}`}>
              {step.status === "complete" ? "✓" : index + 1}
            </div>
            <div className={styles.body}>
              <div className={styles.titleRow}>
                <span className={styles.title}>{step.title}</span>
                <span className={`${styles.statusLabel} ${styles[`status_${step.status}`]}`}>
                  {step.status}
                </span>
              </div>
              {step.detail && <p className={styles.detail}>{step.detail}</p>}
              {step.href && (
                <a className={styles.link} href={step.href} target="_blank" rel="noreferrer">
                  {step.href}
                </a>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function deployStepDetail(hash: string): string {
  return `Deploy ${hash.slice(0, 10)}... submitted`;
}

export function deployStepHref(hash: string): string {
  return explorerDeployUrl(hash);
}
