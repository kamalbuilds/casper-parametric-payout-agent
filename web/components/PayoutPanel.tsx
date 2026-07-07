"use client";

import { useState } from "react";
import { PayoutCheckResult, runPayoutCheck } from "@/lib/agent-client";
import { buildSubmitReadingDeploy, explorerDeployUrl, truncateHex } from "@/lib/casper";
import { parsePolicyId, parseThreshold, PolicyFormState } from "@/lib/policy";
import { useWallet } from "@/lib/wallet";
import styles from "./PayoutPanel.module.css";

interface PayoutPanelProps {
  policy: PolicyFormState;
  onEvaluated?: (result: PayoutCheckResult) => void;
  onSubmitted?: (deployHash: string) => void;
}

type DeployStatus =
  | { state: "idle" }
  | { state: "pending" }
  | { state: "sent"; deployHash: string }
  | { state: "error"; message: string }
  | { state: "cancelled" };

const CONTRACT_HASH = process.env.NEXT_PUBLIC_CONTRACT_HASH;

export default function PayoutPanel({ policy, onEvaluated, onSubmitted }: PayoutPanelProps) {
  const wallet = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PayoutCheckResult | null>(null);
  const [deploy, setDeploy] = useState<DeployStatus>({ state: "idle" });

  const runEvaluation = async () => {
    const threshold = parseThreshold(policy.threshold);
    if (threshold === null) {
      setError("Enter a valid threshold before evaluating.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setDeploy({ state: "idle" });

    try {
      const outcome = await runPayoutCheck(policy.policyId || "1", threshold);
      setResult(outcome);
      onEvaluated?.(outcome);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[payout-panel] payout-check request failed:", message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const submitOnChain = async () => {
    if (!result) return;

    const policyId = parsePolicyId(policy.policyId);
    if (policyId === null) {
      setDeploy({ state: "error", message: "Policy ID must be a non-negative integer." });
      return;
    }
    if (!CONTRACT_HASH) {
      setDeploy({ state: "error", message: "NEXT_PUBLIC_CONTRACT_HASH is not configured." });
      return;
    }
    if (!wallet.publicKeyHex) {
      setDeploy({ state: "error", message: "Connect a wallet before submitting on-chain." });
      return;
    }

    setDeploy({ state: "pending" });
    try {
      const { deployJson, deployHashHex } = buildSubmitReadingDeploy(
        CONTRACT_HASH,
        wallet.publicKeyHex,
        {
          policyId,
          // The contract's `reading` field is u64; sensor readings are decimals, so the
          // on-chain call rounds to the nearest whole meter (see note below the button).
          reading: Math.round(result.reading),
          dataSourceHash: result.dataSourceHash,
        }
      );

      const outcome = await wallet.sendDeploy(deployJson, wallet.publicKeyHex);
      if (outcome.cancelled) {
        setDeploy({ state: "cancelled" });
      } else if (outcome.error) {
        setDeploy({ state: "error", message: outcome.error });
      } else {
        setDeploy({ state: "sent", deployHash: outcome.deployHash ?? deployHashHex });
        onSubmitted?.(outcome.deployHash ?? deployHashHex);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[payout-panel] failed to build submit_reading deploy:", message);
      setDeploy({ state: "error", message });
    }
  };

  return (
    <section className={styles.card}>
      <div className={styles.heading}>
        <h2>Fetch signed reading &amp; evaluate</h2>
        <span>x402 paid data, HMAC verify, AI threshold check</span>
      </div>

      <button
        type="button"
        className={styles.primaryButton}
        onClick={runEvaluation}
        disabled={loading}
      >
        {loading ? "Evaluating..." : "Fetch signed reading & evaluate"}
      </button>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {result && (
        <>
          <div className={styles.pipeline}>
            <div className={styles.pipelineTitle}>Paid data request</div>
            <div className={styles.pipelineStep}>
              <span className={styles.mark}>1</span>
              <span>HTTP 402 Payment Required returned by the data provider</span>
            </div>
            <div className={styles.pipelineStep}>
              <span className={styles.mark}>2</span>
              <span>Agent paid the reference and re-requested the reading</span>
            </div>
            <div className={styles.pipelineStep}>
              <span className={styles.mark}>3</span>
              <span>Signed reading received</span>
              <span className={`${styles.detail} mono`}>
                {truncateHex(result.dataSourceHash, 10, 8)}
              </span>
            </div>
            <div className={styles.badgeRow}>
              <span
                className={`${styles.badge} ${
                  result.dataSignatureValid ? styles.badgePass : styles.badgeFail
                }`}
              >
                {result.dataSignatureValid ? "SIGNATURE PASS" : "SIGNATURE FAIL"}
              </span>
            </div>
          </div>

          <div className={styles.comparison}>
            <div className={styles.comparisonCell}>
              <span className={styles.label}>Reading</span>
              <span className={`${styles.value} mono`}>
                {result.reading} <small>{result.unit}</small>
              </span>
            </div>
            <span className={styles.comparisonOperator}>
              {result.thresholdCrossed ? ">=" : "<"}
            </span>
            <div className={styles.comparisonCell}>
              <span className={styles.label}>Threshold</span>
              <span className={`${styles.value} mono`}>
                {result.threshold} <small>{result.unit}</small>
              </span>
            </div>
          </div>

          <div
            className={`${styles.outcome} ${
              result.thresholdCrossed ? styles.outcomeTriggered : styles.outcomeNotTriggered
            }`}
          >
            <span className={styles.outcomeLabel}>
              {result.thresholdCrossed ? "Payout triggers" : "No payout, reading recorded"}
            </span>
            <p className={styles.outcomeExplanation}>{result.aiExplanation}</p>
            <div className={styles.metaRow}>
              <span>Recommendation: {result.recommendation}</span>
              <span>{new Date(result.timestamp).toLocaleTimeString()}</span>
            </div>
          </div>

          <div className={styles.chainSection}>
            <p className={styles.chainNote}>
              submit_reading is owner-gated on-chain: only the wallet holding the contract
              owner key (the oracle authority for this MVP) can execute it, and the policy ID
              must already exist. Connect that key to submit; any other signer or an unknown
              policy will see the contract revert on testnet.cspr.live. Readings and
              thresholds round to the nearest whole meter for the contract's u64 fields.
            </p>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={submitOnChain}
              disabled={deploy.state === "pending"}
            >
              {deploy.state === "pending" ? "Awaiting wallet..." : "Submit reading on-chain"}
            </button>

            {deploy.state === "sent" && (
              <div className={styles.deployResult}>
                <span>Deploy submitted.</span>
                <a href={explorerDeployUrl(deploy.deployHash)} target="_blank" rel="noreferrer">
                  {explorerDeployUrl(deploy.deployHash)}
                </a>
              </div>
            )}
            {deploy.state === "cancelled" && (
              <div className={styles.deployResult}>Signing was cancelled in the wallet.</div>
            )}
            {deploy.state === "error" && (
              <div className={styles.deployError}>{deploy.message}</div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
