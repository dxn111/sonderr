"use strict";

// Small, evidence-labeled starter catalog. It is deliberately not a scraper
// or claim runner: site policy, availability, reward, and payout can change.
const CHECKED_AT = "2026-09-25";
const SOURCES = Object.freeze([
  {
    id: "togatech-sol-faucet",
    name: "SOL Faucet (TogaTech)",
    network: "Solana Mainnet",
    reward: "Advertises 0.00001 SOL per claim",
    cadence: "One claim per 24 hours per IP and wallet",
    access: "Claim page asks for a public address; login is described as optional autofill",
    requirements: "New addresses must maintain 0.00089088 SOL",
    policy: "No AI/automation permission found in the pages checked; treat as manual-only",
    evidence: "Current home page lists amount/cooldown. A payment-proof page is linked, but direct verification timed out; do not treat this as a verified payout.",
    status: "Manual review candidate",
    claimUrl: "https://solfaucet.togatech.org/",
    sources: ["https://solfaucet.togatech.org/", "https://solfaucet.togatech.org/proofs"],
    canOpenClaim: true
  },
  {
    id: "solfaucet-fun",
    name: "The Solana Faucet (solfaucet.fun)",
    network: "Solana Mainnet-Beta (site claim)",
    reward: "Advertises 0.001 SOL per request",
    cadence: "One request per address every 24 hours",
    access: "Public address + CAPTCHA",
    requirements: "Site states purpose is testing and development only",
    policy: "Do not use for this earning workflow; CAPTCHA is never automated",
    evidence: "The site's own description limits its purpose to testing/development; successful payout was not verified.",
    status: "Excluded for earning",
    claimUrl: "https://solfaucet.fun/",
    sources: ["https://solfaucet.fun/"],
    canOpenClaim: false
  },
  {
    id: "stakely-sol-faucet",
    name: "Stakely Solana Faucet",
    network: "Solana Mainnet / Testnet selector",
    reward: "Page showed about 0.0009 SOL; no reliable fixed reward verified",
    cadence: "Not verified",
    access: "CAPTCHA and public X post/link required",
    requirements: "Page says inactive/unavailable; required statement says faucet is for gas, not free money",
    policy: "Incompatible with this earning purpose; never post publicly on the user's behalf",
    evidence: "Page showed inactive status at check time and required an X post affirming gas use.",
    status: "Excluded · inactive / purpose mismatch",
    claimUrl: "https://stakely.io/faucet/solana-sol",
    sources: ["https://stakely.io/faucet/solana-sol"],
    canOpenClaim: false
  },
  {
    id: "solana-official-faucet",
    name: "Official Solana Faucet",
    network: "Devnet only",
    reward: "Test SOL; no real-world value",
    cadence: "Two requests per eight hours on the page",
    access: "GitHub sign-in for web UI",
    requirements: "Development/testing only; page says AI agents should not use it",
    policy: "Never include as Mainnet income or route around its AI-agent notice",
    evidence: "Official page explicitly says it does not distribute Mainnet SOL.",
    status: "Excluded · testnet",
    claimUrl: "https://faucet.solana.com/",
    sources: ["https://faucet.solana.com/", "https://solana.com/docs/references/clusters"],
    canOpenClaim: false
  },
  {
    id: "togatech-external-directory",
    name: "TogaTech ‘More Faucets’ directory",
    network: "Mixed / third-party withdrawals",
    reward: "No common payout amount verified",
    cadence: "Varies by listed provider",
    access: "Directory says signup for a separate microwallet is required",
    requirements: "Directory explicitly says listed providers are not endorsed by its operator",
    policy: "Lead list only; do not present as direct, no-login, verified SOL faucets",
    evidence: "The directory describes a microwallet withdrawal path and disclaims endorsement. Review of linked destinations found signup requirements, referral redirects, and parked/unsafe destinations; none was verified as a direct no-login claim.",
    status: "Research leads only · not claim-ready",
    claimUrl: "https://solfaucet.togatech.org/more-faucets",
    sources: ["https://solfaucet.togatech.org/more-faucets"],
    canOpenClaim: false
  }
]);

function listSolFaucets() {
  return {
    checkedAt: CHECKED_AT,
    networkFilter: "Mainnet SOL earning; testnet entries are shown only as explicit exclusions",
    sources: SOURCES.map(source => ({ ...source, sources: [...source.sources] })),
    note: "Research starter list, not an exhaustive directory. The Claim SOL button only opens the manual page for the one listed manual-review candidate; Sonderr does not fill forms, submit claims, solve CAPTCHA, bypass policies, or verify payout. Recheck terms and current page before every claim."
  };
}

module.exports = { CHECKED_AT, SOURCES, listSolFaucets };
