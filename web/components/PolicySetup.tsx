"use client";

import { useState } from "react";
import {
  buildCreatePolicyDeploy,
  buildFundPoolDeploy,
  explorerDeployUrl,
} from "@/lib/casper";
import {
  csprToMotes,
  parsePolicyId,
  parseThreshold,
  PolicyFormState,
} from "@/lib/policy";
import { useWallet } from "@/lib/wallet";
import styles from "./PolicyPanel.module.css";

const CONTRACT_HASH = process.env.NEXT_PUBLIC_CONTRACT_HASH;

interface PolicySetupProps {
  policy: PolicyFormState;
}

export default function PolicySetup({ policy }: PolicySetupProps) {
  const wallet = useWallet();
  const [fundCspr, setFundCspr] = useState("2000");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<"create" | "fund" | null>(null);

  async function createPolicy() {
    if (!CONTRACT_HASH || !wallet.publicKeyHex) {
      setStatus("Connect wallet and set NEXT_PUBLIC_CONTRACT_HASH.");
      return;
    }
    const policyId = parsePolicyId(policy.policyId);
    const threshold = parseThreshold(policy.threshold);
    if (policyId === null || threshold === null || !policy.insured) {
      setStatus("Fill policy ID, threshold, and insured address.");
      return;
    }

    setBusy("create");
    setStatus(null);
    try {
      const { deployJson, deployHashHex } = buildCreatePolicyDeploy(
        CONTRACT_HASH,
        wallet.publicKeyHex,
        {
          policyId,
          insuredPublicKeyHex: policy.insured,
          payoutAmountMotes: csprToMotes(policy.payoutAmountCspr).replace(/,/g, ""),
          threshold: Math.round(threshold),
        }
      );
      const outcome = await wallet.sendDeploy(deployJson, wallet.publicKeyHex);
      if (outcome.cancelled) {
        setStatus("Create policy cancelled in wallet.");
        return;
      }
      if (outcome.error) {
        setStatus(outcome.error);
        return;
      }
      const hash = outcome.deployHash || deployHashHex;
      setStatus(`Policy created. ${explorerDeployUrl(hash)}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function fundPool() {
    if (!CONTRACT_HASH || !wallet.publicKeyHex) {
      setStatus("Connect wallet and set NEXT_PUBLIC_CONTRACT_HASH.");
      return;
    }
    const motes = csprToMotes(fundCspr).replace(/,/g, "");
    if (motes === "0") {
      setStatus("Enter a positive fund amount.");
      return;
    }

    setBusy("fund");
    setStatus(null);
    try {
      const { deployJson, deployHashHex } = buildFundPoolDeploy(
        CONTRACT_HASH,
        wallet.publicKeyHex,
        motes
      );
      const outcome = await wallet.sendDeploy(deployJson, wallet.publicKeyHex);
      if (outcome.cancelled) {
        setStatus("Fund pool cancelled in wallet.");
        return;
      }
      if (outcome.error) {
        setStatus(outcome.error);
        return;
      }
      const hash = outcome.deployHash || deployHashHex;
      setStatus(`Pool funded. ${explorerDeployUrl(hash)}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={styles.card}>
      <div className={styles.heading}>
        <h2>On-chain setup</h2>
        <span>owner only</span>
      </div>
      <p className={styles.hint}>
        Deploy the contract first, connect the owner wallet, then create the policy
        and fund the native pool before running payout checks.
      </p>
      <div className={styles.grid}>
        <button
          type="button"
          className={styles.useWalletButton}
          disabled={busy !== null}
          onClick={createPolicy}
        >
          {busy === "create" ? "Signing..." : "Create policy on-chain"}
        </button>
        <div className={styles.field}>
          <label htmlFor="fundAmount">Fund pool (CSPR)</label>
          <input
            id="fundAmount"
            value={fundCspr}
            onChange={(e) => setFundCspr(e.target.value)}
          />
        </div>
        <button
          type="button"
          className={styles.useWalletButton}
          disabled={busy !== null}
          onClick={fundPool}
        >
          {busy === "fund" ? "Signing..." : "Fund pool"}
        </button>
      </div>
      {status ? <p className={styles.hint}>{status}</p> : null}
    </section>
  );
}
