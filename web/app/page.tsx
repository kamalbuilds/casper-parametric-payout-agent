"use client";

import { useCallback, useMemo, useState } from "react";
import ActivityTimeline, {
  ActivityStep,
  deployStepDetail,
  deployStepHref,
} from "@/components/ActivityTimeline";
import PayoutPanel from "@/components/PayoutPanel";
import PolicyPanel from "@/components/PolicyPanel";
import ProofTable from "@/components/ProofTable";
import WalletButton from "@/components/WalletButton";
import { truncateHex } from "@/lib/casper";
import { DEFAULT_POLICY } from "@/lib/policy";
import { useWallet } from "@/lib/wallet";
import styles from "./page.module.css";

const CONTRACT_HASH = process.env.NEXT_PUBLIC_CONTRACT_HASH;

export default function Home() {
  const wallet = useWallet();
  const [policy, setPolicy] = useState(DEFAULT_POLICY);
  const [policyDeployHash, setPolicyDeployHash] = useState<string | null>(null);
  const [poolDeployHash, setPoolDeployHash] = useState<string | null>(null);
  const [evaluated, setEvaluated] = useState(false);
  const [submitDeployHash, setSubmitDeployHash] = useState<string | null>(null);
  const [proofCount, setProofCount] = useState(0);

  const onProofEvents = useCallback((count: number) => setProofCount(count), []);

  const activitySteps = useMemo((): ActivityStep[] => {
    const walletConnected = Boolean(wallet.publicKeyHex);
    return [
      {
        id: "wallet",
        title: "Connect wallet on Casper testnet",
        detail: walletConnected
          ? `Signer ${truncateHex(wallet.publicKeyHex ?? "", 10, 8)}`
          : "CSPR.click session required before any on-chain action",
        status: walletConnected ? "complete" : "active",
      },
      {
        id: "create_policy",
        title: "Create policy on-chain (owner)",
        detail: policyDeployHash ? deployStepDetail(policyDeployHash) : "Owner calls create_policy with insured + threshold",
        status: policyDeployHash ? "complete" : walletConnected ? "pending" : "pending",
        href: policyDeployHash ? deployStepHref(policyDeployHash) : undefined,
      },
      {
        id: "fund_pool",
        title: "Fund reserve pool (owner)",
        detail: poolDeployHash
          ? deployStepDetail(poolDeployHash)
          : "Owner deposits payout CSPR via payable fund_pool",
        status: poolDeployHash ? "complete" : policyDeployHash ? "pending" : "pending",
        href: poolDeployHash ? deployStepHref(poolDeployHash) : undefined,
      },
      {
        id: "fetch_reading",
        title: "Agent pays data endpoint (x402)",
        detail: evaluated
          ? "Signed sensor reading fetched and HMAC verified"
          : "Agent requests flood reading through paid data path",
        status: evaluated ? "complete" : poolDeployHash ? "pending" : "pending",
      },
      {
        id: "evaluate",
        title: "Threshold evaluation + AI explanation",
        detail: evaluated
          ? "Reading compared to policy threshold with recommendation"
          : "Waiting for evaluation",
        status: evaluated ? "complete" : "pending",
      },
      {
        id: "submit_on_chain",
        title: "Submit reading on-chain (owner oracle)",
        detail: submitDeployHash
          ? deployStepDetail(submitDeployHash)
          : "Owner key calls submit_reading with data_source_hash",
        status: submitDeployHash ? "complete" : evaluated ? "pending" : "pending",
        href: submitDeployHash ? deployStepHref(submitDeployHash) : undefined,
      },
      {
        id: "proof",
        title: "On-chain proof events",
        detail:
          proofCount > 0
            ? `${proofCount} PayoutExecuted / ReadingRecorded event(s) from CSPR.cloud`
            : "Proof table streams contract events after settlement",
        status: proofCount > 0 ? "complete" : submitDeployHash ? "pending" : "pending",
      },
    ];
  }, [
    evaluated,
    policyDeployHash,
    poolDeployHash,
    proofCount,
    submitDeployHash,
    wallet.publicKeyHex,
  ]);

  return (
    <div className={styles.shell}>
      <header className={styles.topBar}>
        <div className={styles.brand}>
          <strong>Parametric Payout Agent</strong>
          <span>Autonomous parametric insurance on Casper</span>
        </div>
        <WalletButton />
      </header>

      <section className={styles.hero}>
        <h1>Payouts that fire on facts, not paperwork.</h1>
        <p>
          An agent pays a data endpoint for a signed sensor reading and triggers an
          on-chain payout the moment the reading crosses the policy threshold, and
          records the honest non-trigger case just as visibly when it does not.
        </p>
        <div className={styles.metaRow}>
          <span className={styles.metaChip}>
            <span className={styles.metaDot} aria-hidden />
            Casper testnet
          </span>
          <span className={styles.metaChip}>
            Contract
            <span className={styles.metaValue}>
              {CONTRACT_HASH ? truncateHex(CONTRACT_HASH) : "not configured"}
            </span>
          </span>
        </div>
      </section>

      <ActivityTimeline steps={activitySteps} />

      <div className={styles.grid}>
        <PolicyPanel
          value={policy}
          onChange={setPolicy}
          onPolicyCreated={setPolicyDeployHash}
          onPoolFunded={setPoolDeployHash}
        />
        <PayoutPanel
          policy={policy}
          onEvaluated={() => setEvaluated(true)}
          onSubmitted={setSubmitDeployHash}
        />
      </div>

      <ProofTable onEventsLoaded={onProofEvents} />

      <footer className={styles.footer}>
        Reads signed sensor data through an x402 paid endpoint, verifies the HMAC
        signature, and settles through the ParametricPolicy Odra contract. Testnet only.
      </footer>
    </div>
  );
}
