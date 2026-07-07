import {
  Args,
  CLValue,
  ContractCallBuilder,
  Deploy,
  Key,
  PublicKey,
  SessionBuilder,
} from "casper-js-sdk";

/**
 * Casper testnet chain name. This project targets testnet only (see PRD non-goals).
 */
export const CHAIN_NAME = "casper-test";

/**
 * Payment budget (in motes) attached to a `submit_reading` call. 1 CSPR = 1,000,000,000 motes.
 * 3 CSPR is a safe ceiling for a contract call with three primitive args.
 */
export const SUBMIT_READING_PAYMENT_MOTES = 3_000_000_000;

/** Gas budget for owner-gated `create_policy` (3 CSPR). */
export const CREATE_POLICY_PAYMENT_MOTES = 3_000_000_000;

/** Gas budget for payable `fund_pool` via Odra proxy caller (5 CSPR). */
export const FUND_POOL_PAYMENT_MOTES = 5_000_000_000;

const PROXY_CALLER_WASM_URL = "/wasm/proxy_caller.wasm";

let cachedProxyWasm: Uint8Array | null = null;

export interface SubmitReadingArgs {
  policyId: number;
  reading: number;
  dataSourceHash: string;
}

export interface CreatePolicyArgs {
  policyId: number;
  insuredPublicKeyHex: string;
  payoutAmountMotes: string;
  threshold: number;
}

export interface FundPoolArgs {
  amountMotes: string;
}

export interface PreparedDeploy {
  /** JSON body accepted by `CSPRClickSDK.send(deployJson, signingPublicKey)`. */
  deployJson: unknown;
  /** Hex deploy hash, known before signing so the UI can link to the explorer immediately. */
  deployHashHex: string;
}

/**
 * Strips a `hash-` or `contract-` prefix some UIs display contract hashes with; the
 * SDK's `ContractCallBuilder.byHash` expects the bare hex hash.
 */
function normalizeContractHash(hash: string): string {
  return hash.replace(/^(hash-|contract-)/, "").trim();
}

function normalizePackageHash(hash: string): string {
  return hash
    .replace(/^(contract-package-wasm-|contract-package-|hash-)/, "")
    .trim();
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.replace(/^0x/, "");
  if (normalized.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(normalized)) {
    throw new Error("Expected a hex-encoded hash");
  }
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Odra `Address` serializes as a Casper `Key`. Accepts a hex public key or
 * `account-hash-...` prefixed account hash string.
 */
export function insuredToAddressKey(insured: string): Key {
  const trimmed = insured.trim();
  if (trimmed.startsWith("account-hash-")) {
    return Key.newKey(trimmed);
  }
  const publicKey = PublicKey.fromHex(trimmed);
  return Key.newKey(publicKey.accountHash().toJSON());
}

function legacyDeployFromTransaction(transaction: ReturnType<ContractCallBuilder["buildFor1_5"]>): PreparedDeploy {
  const deploy = transaction.getDeploy();
  if (!deploy) {
    throw new Error("casper-js-sdk did not produce a legacy deploy");
  }
  return {
    deployJson: Deploy.toJSON(deploy),
    deployHashHex: deploy.hash.toHex(),
  };
}

async function loadProxyCallerWasm(): Promise<Uint8Array> {
  if (cachedProxyWasm) return cachedProxyWasm;
  const res = await fetch(PROXY_CALLER_WASM_URL);
  if (!res.ok) {
    throw new Error(`Failed to load proxy caller wasm (${res.status})`);
  }
  const buffer = await res.arrayBuffer();
  cachedProxyWasm = new Uint8Array(buffer);
  return cachedProxyWasm;
}

/**
 * Builds a real, signable `submit_reading` deploy against the deployed `ParametricPolicy`
 * Odra contract. Entry point signature (see contract/src/parametric_policy.rs):
 *
 *   pub fn submit_reading(&mut self, policy_id: u64, reading: u64, data_source_hash: String)
 *
 * The contract enforces `assert_owner()` on this entrypoint: only the wallet holding the
 * contract owner's key can execute it successfully (the owner key plays the oracle/agent
 * role for this MVP). A non-owner signer will see the deploy revert with `NotOwner` on
 * testnet.cspr.live; that revert is itself the enforced-policy proof the PRD asks for.
 *
 * Uses the legacy (Casper 1.5) deploy encoding via `buildFor1_5()` because CSPR.click's
 * `sign`/`send` methods take a legacy deploy JSON string, not a TransactionV1 payload.
 */
export function buildSubmitReadingDeploy(
  contractHash: string,
  callerPublicKeyHex: string,
  args: SubmitReadingArgs
): PreparedDeploy {
  const publicKey = PublicKey.fromHex(callerPublicKeyHex);

  const runtimeArgs = Args.fromMap({
    policy_id: CLValue.newCLUint64(args.policyId),
    reading: CLValue.newCLUint64(args.reading),
    data_source_hash: CLValue.newCLString(args.dataSourceHash),
  });

  const transaction = new ContractCallBuilder()
    .from(publicKey)
    .byHash(normalizeContractHash(contractHash))
    .entryPoint("submit_reading")
    .runtimeArgs(runtimeArgs)
    .chainName(CHAIN_NAME)
    .payment(SUBMIT_READING_PAYMENT_MOTES)
    .buildFor1_5();

  return legacyDeployFromTransaction(transaction);
}

/**
 * Owner-only `create_policy(policy_id, insured, payout_amount, threshold)` deploy.
 */
export function buildCreatePolicyDeploy(
  contractHash: string,
  callerPublicKeyHex: string,
  args: CreatePolicyArgs
): PreparedDeploy {
  const publicKey = PublicKey.fromHex(callerPublicKeyHex);
  const insured = insuredToAddressKey(args.insuredPublicKeyHex);

  const runtimeArgs = Args.fromMap({
    policy_id: CLValue.newCLUint64(args.policyId),
    insured: CLValue.newCLKey(insured),
    payout_amount: CLValue.newCLUInt512(args.payoutAmountMotes),
    threshold: CLValue.newCLUint64(args.threshold),
  });

  const transaction = new ContractCallBuilder()
    .from(publicKey)
    .byHash(normalizeContractHash(contractHash))
    .entryPoint("create_policy")
    .runtimeArgs(runtimeArgs)
    .chainName(CHAIN_NAME)
    .payment(CREATE_POLICY_PAYMENT_MOTES)
    .buildFor1_5();

  return legacyDeployFromTransaction(transaction);
}

/**
 * Owner-only payable `fund_pool()` deploy. Odra payable entrypoints require the
 * `proxy_caller.wasm` session shim so native CSPR can be attached from an account.
 *
 * Requires `NEXT_PUBLIC_CONTRACT_PACKAGE_HASH` (32-byte package hash from deploy receipt).
 */
export async function buildFundPoolDeploy(
  contractPackageHash: string,
  callerPublicKeyHex: string,
  args: FundPoolArgs
): Promise<PreparedDeploy> {
  const publicKey = PublicKey.fromHex(callerPublicKeyHex);
  const packageHashBytes = hexToBytes(normalizePackageHash(contractPackageHash));
  const innerArgs = Args.fromMap({});
  const innerArgsBytes = innerArgs.toBytes();

  const proxyArgs = Args.fromMap({
    package_hash: CLValue.newCLByteArray(packageHashBytes),
    entry_point: CLValue.newCLString("fund_pool"),
    args: CLValue.newCLByteArray(innerArgsBytes),
    attached_value: CLValue.newCLUInt512(args.amountMotes),
    amount: CLValue.newCLUInt512(args.amountMotes),
  });

  const wasm = await loadProxyCallerWasm();
  const transaction = new SessionBuilder()
    .from(publicKey)
    .wasm(wasm)
    .runtimeArgs(proxyArgs)
    .chainName(CHAIN_NAME)
    .payment(FUND_POOL_PAYMENT_MOTES)
    .buildFor1_5();

  return legacyDeployFromTransaction(transaction);
}

export function explorerDeployUrl(deployHashHex: string): string {
  return `https://testnet.cspr.live/deploy/${deployHashHex}`;
}

export function explorerContractUrl(contractHash: string): string {
  return `https://testnet.cspr.live/contract-package/${normalizeContractHash(contractHash)}`;
}

export function truncateHex(hex: string, lead = 8, tail = 6): string {
  if (hex.length <= lead + tail + 3) return hex;
  return `${hex.slice(0, lead)}...${hex.slice(-tail)}`;
}

/** True when the connected wallet matches the configured contract owner public key. */
export function isOwnerPublicKey(
  walletPublicKeyHex: string | null | undefined,
  ownerPublicKeyHex: string | undefined
): boolean {
  if (!walletPublicKeyHex || !ownerPublicKeyHex) return false;
  return walletPublicKeyHex.toLowerCase() === ownerPublicKeyHex.toLowerCase();
}
