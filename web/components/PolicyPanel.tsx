"use client";

import { useState } from "react";
import {
  buildCreatePolicyDeploy,
  buildFundPoolDeploy,
  explorerDeployUrl,
  isOwnerPublicKey,
} from "@/lib/casper";
import {
  csprToMotes,
  csprToMotesString,
  parsePolicyId,
  parseThreshold,
  PolicyFormState,
} from "@/lib/policy";
import { useWallet } from "@/lib/wallet";
import styles from "./PolicyPanel.module.css";

interface PolicyPanelProps {
  value: PolicyFormState;
  onChange: (next: PolicyFormState) => void;
  onPolicyCreated?: (deployHash: string) => void;
  onPoolFunded?: (deployHash: string) => void;
}

type DeployStatus =
  | { state: "idle" }
  | { state: "pending" }
  | { state: "sent"; deployHash: string }
  | { state: "error"; message: string }
  | { state: "cancelled" };

const CONTRACT_HASH = process.env.NEXT_PUBLIC_CONTRACT_HASH;
const CONTRACT_PACKAGE_HASH = process.env.NEXT_PUBLIC_CONTRACT_PACKAGE_HASH;
const OWNER_PUBLIC_KEY = process.env.NEXT_PUBLIC_OWNER_PUBLIC_KEY;

export default function PolicyPanel({
  value,
  onChange,
  onPolicyCreated,
  onPoolFunded,
}: PolicyPanelProps) {
  const wallet = useWallet();
  const [createDeploy, setCreateDeploy] = useState<DeployStatus>({ state: "idle" });
  const [fundDeploy, setFundDeploy] = useState<DeployStatus>({ state: "idle" });

  const isOwner = isOwnerPublicKey(wallet.publicKeyHex, OWNER_PUBLIC_KEY);

  const update = (patch: Partial<PolicyFormState>) => onChange({ ...value, ...patch });

  const submitCreatePolicy = async () => {
    const policyId = parsePolicyId(value.policyId);
    const threshold = parseThreshold(value.threshold);
    if (policyId === null) {
      setCreateDeploy({ state: "error", message: "Policy ID must be a non-negative integer." });
      return;
    }
    if (threshold === null) {
      setCreateDeploy({ state: "error", message: "Enter a valid threshold before creating a policy." });
      return;
    }
    if (!value.insured.trim()) {
      setCreateDeploy({ state: "error", message: "Insured address is required." });
      return;
    }
    if (!CONTRACT_HASH) {
      setCreateDeploy({ state: "error", message: "NEXT_PUBLIC_CONTRACT_HASH is not configured." });
      return;
    }
    if (!wallet.publicKeyHex) {
      setCreateDeploy({ state: "error", message: "Connect a wallet before creating a policy." });
      return;
    }
    if (!isOwner) {
      setCreateDeploy({
        state: "error",
        message: "create_policy is owner-gated. Connect the contract owner key.",
      });
      return;
    }

    setCreateDeploy({ state: "pending" });
    try {
      const { deployJson, deployHashHex } = buildCreatePolicyDeploy(
        CONTRACT_HASH,
        wallet.publicKeyHex,
        {
          policyId,
          insuredPublicKeyHex: value.insured.trim(),
          payoutAmountMotes: csprToMotesString(value.payoutAmountCspr),
          threshold: Math.round(threshold),
        }
      );

      const outcome = await wallet.sendDeploy(deployJson, wallet.publicKeyHex);
      if (outcome.cancelled) {
        setCreateDeploy({ state: "cancelled" });
      } else if (outcome.error) {
        setCreateDeploy({ state: "error", message: outcome.error });
      } else {
        const hash = outcome.deployHash ?? deployHashHex;
        setCreateDeploy({ state: "sent", deployHash: hash });
        onPolicyCreated?.(hash);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[policy-panel] failed to build create_policy deploy:", message);
      setCreateDeploy({ state: "error", message });
    }
  };

  const submitFundPool = async () => {
    if (!CONTRACT_PACKAGE_HASH) {
      setFundDeploy({
        state: "error",
        message: "NEXT_PUBLIC_CONTRACT_PACKAGE_HASH is not configured.",
      });
      return;
    }
    if (!wallet.publicKeyHex) {
      setFundDeploy({ state: "error", message: "Connect a wallet before funding the pool." });
      return;
    }
    if (!isOwner) {
      setFundDeploy({
        state: "error",
        message: "fund_pool is owner-gated. Connect the contract owner key.",
      });
      return;
    }

    setFundDeploy({ state: "pending" });
    try {
      const { deployJson, deployHashHex } = await buildFundPoolDeploy(
        CONTRACT_PACKAGE_HASH,
        wallet.publicKeyHex,
        { amountMotes: csprToMotesString(value.payoutAmountCspr) }
      );

      const outcome = await wallet.sendDeploy(deployJson, wallet.publicKeyHex);
      if (outcome.cancelled) {
        setFundDeploy({ state: "cancelled" });
      } else if (outcome.error) {
        setFundDeploy({ state: "error", message: outcome.error });
      } else {
        const hash = outcome.deployHash ?? deployHashHex;
        setFundDeploy({ state: "sent", deployHash: hash });
        onPoolFunded?.(hash);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[policy-panel] failed to build fund_pool deploy:", message);
      setFundDeploy({ state: "error", message });
    }
  };

  return (
    <section className={styles.card}>
      <div className={styles.heading}>
        <h2>Policy</h2>
        <span>on-chain Policy struct</span>
      </div>

      <div className={styles.grid}>
        <div className={styles.field}>
          <label htmlFor="policyId">Policy ID</label>
          <input
            id="policyId"
            inputMode="numeric"
            value={value.policyId}
            onChange={(e) => update({ policyId: e.target.value })}
            placeholder="1"
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="threshold">Threshold ({"meters"})</label>
          <input
            id="threshold"
            inputMode="decimal"
            value={value.threshold}
            onChange={(e) => update({ threshold: e.target.value })}
            placeholder="6.0"
          />
        </div>

        <div className={`${styles.field} ${styles.full}`}>
          <label htmlFor="insured">Insured address</label>
          <input
            id="insured"
            value={value.insured}
            onChange={(e) => update({ insured: e.target.value })}
            placeholder="01a1b2c3... (hex public key)"
          />
          {wallet.publicKeyHex && (
            <button
              type="button"
              className={styles.useWalletButton}
              onClick={() => update({ insured: wallet.publicKeyHex ?? "" })}
            >
              Use connected wallet
            </button>
          )}
        </div>

        <div className={styles.field}>
          <label htmlFor="payoutAmount">Payout amount (CSPR)</label>
          <input
            id="payoutAmount"
            inputMode="decimal"
            value={value.payoutAmountCspr}
            onChange={(e) => update({ payoutAmountCspr: e.target.value })}
            placeholder="1000"
          />
        </div>
      </div>

      <p className={`${styles.hint} mono`}>
        {csprToMotes(value.payoutAmountCspr)} motes reserved from the pool if the reading
        crosses {value.threshold || "?"} {"meters"}.
      </p>

      <div className={styles.chainSection}>
        <p className={styles.chainNote}>
          Policy setup is owner-gated on-chain. Connect the wallet that deployed the contract
          {OWNER_PUBLIC_KEY ? " (configured owner key)" : ""} to call{" "}
          <span className="mono">create_policy</span> and{" "}
          <span className="mono">fund_pool</span>. Other signers will see{" "}
          <span className="mono">NotOwner</span> on testnet.cspr.live.
        </p>

        <div className={styles.actionRow}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={submitCreatePolicy}
            disabled={createDeploy.state === "pending" || !isOwner}
          >
            {createDeploy.state === "pending" ? "Awaiting wallet..." : "Create policy on-chain"}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={submitFundPool}
            disabled={fundDeploy.state === "pending" || !isOwner}
          >
            {fundDeploy.state === "pending" ? "Awaiting wallet..." : "Fund pool on-chain"}
          </button>
        </div>

        {!isOwner && wallet.publicKeyHex && (
          <div className={styles.ownerHint}>
            Connected wallet is not the contract owner. Owner actions are disabled.
          </div>
        )}

        {createDeploy.state === "sent" && (
          <div className={styles.deployResult}>
            <span>Policy created.</span>
            <a href={explorerDeployUrl(createDeploy.deployHash)} target="_blank" rel="noreferrer">
              {explorerDeployUrl(createDeploy.deployHash)}
            </a>
          </div>
        )}
        {createDeploy.state === "cancelled" && (
          <div className={styles.deployResult}>Policy creation cancelled in wallet.</div>
        )}
        {createDeploy.state === "error" && (
          <div className={styles.deployError}>{createDeploy.message}</div>
        )}

        {fundDeploy.state === "sent" && (
          <div className={styles.deployResult}>
            <span>Pool funded.</span>
            <a href={explorerDeployUrl(fundDeploy.deployHash)} target="_blank" rel="noreferrer">
              {explorerDeployUrl(fundDeploy.deployHash)}
            </a>
          </div>
        )}
        {fundDeploy.state === "cancelled" && (
          <div className={styles.deployResult}>Pool funding cancelled in wallet.</div>
        )}
        {fundDeploy.state === "error" && (
          <div className={styles.deployError}>{fundDeploy.message}</div>
        )}
      </div>
    </section>
  );
}
