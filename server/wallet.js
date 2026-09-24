const crypto = require("node:crypto");
const { ethers } = require("ethers");
const solana = require("@solana/kit");
const system = require("@solana-program/system");
const tokenProgram = require("@solana-program/token");
const store = require("./store");
const secrets = require("./secrets");

const PRIVATE_KEY_ENV = "SONDERR_WALLET_PRIVATE_KEY";
const SEED_ENV = "SONDERR_WALLET_SEED_PHRASE";
const SOLANA_SECRET_ENV = "SONDERR_WALLET_SOLANA_SECRET";
const DRAFT_TTL_MS = 10 * 60 * 1000;
const SWAP_DRAFT_TTL_MS = 60 * 1000;
// Pinned Uniswap V3 deployments. Swaps use only these contracts and the local RPC;
// no quote aggregator, hosted route service, bridge, or external trade API is used.
const UNISWAP_V3 = {
  1: { router: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984", quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e", wrappedNative: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" },
  8453: { router: "0x2626664c2603336E57B271c5C0b26F421741e481", factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD", quoter: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a", wrappedNative: "0x4200000000000000000000000000000000000006" }
};
const UNISWAP_V3_FEES = [100, 500, 3000, 10000];
const V3_FACTORY_ABI = ["function getPool(address tokenA,address tokenB,uint24 fee) view returns (address pool)"];
const V3_POOL_ABI = ["function liquidity() view returns (uint128)"];
const V3_QUOTER_ABI = ["function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) view returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)"];
const V3_ROUTER_ABI = [
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
  "function multicall(uint256 deadline,bytes[] data) payable returns (bytes[] results)",
  "function unwrapWETH9(uint256 amountMinimum,address recipient) payable"
];
const pending = new Map();
const priceCache = new Map();
const marketCache = new Map();
const PRICE_TTL_MS = 30 * 1000;
const BUILT_IN_NETWORKS = {
  evm: {
    "base-mainnet": { id: "base-mainnet", label: "Base Mainnet", rpcUrl: "https://mainnet.base.org", chainId: 8453, market: "base", testnet: false },
    "ethereum-mainnet": { id: "ethereum-mainnet", label: "Ethereum Mainnet", rpcUrl: "https://ethereum-rpc.publicnode.com", chainId: 1, market: "ethereum", testnet: false },
    "base-sepolia": { id: "base-sepolia", label: "Base Sepolia · testnet", rpcUrl: "https://sepolia.base.org", chainId: 84532, market: null, testnet: true },
    sepolia: { id: "sepolia", label: "Ethereum Sepolia · testnet", rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com", chainId: 11155111, market: null, testnet: true }
  },
  solana: {
    "solana-mainnet": { id: "solana-mainnet", label: "Solana Mainnet", rpcUrl: "https://api.mainnet.solana.com", cluster: "mainnet-beta", testnet: false },
    "solana-devnet": { id: "solana-devnet", label: "Solana Devnet · test tokens", rpcUrl: "https://api.devnet.solana.com", cluster: "devnet", testnet: true },
    "solana-testnet": { id: "solana-testnet", label: "Solana Testnet · validator testing", rpcUrl: "https://api.testnet.solana.com", cluster: "testnet", testnet: true }
  }
};
const MASK_64 = (1n << 64n) - 1n;
const ROTATION = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
const ROUND_CONSTANTS = [1n, 0x8082n, 0x800000000000808an, 0x8000000080008000n, 0x808bn, 0x80000001n, 0x8000000080008081n, 0x8000000000008009n, 0x8an, 0x88n, 0x80008009n, 0x8000000an, 0x8000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n, 0x800an, 0x800000008000000an, 0x8000000080008081n, 0x8000000000008080n, 0x80000001n, 0x8000000080008008n];
function rotl(value, shift) { const n = BigInt(shift); return ((value << n) | (value >> (64n - n))) & MASK_64; }
function keccak256(input) {
  const bytes = Buffer.from(input), rate = 136, padded = Buffer.concat([bytes, Buffer.from([1])]);
  const block = Buffer.concat([padded, Buffer.alloc((rate - (padded.length % rate)) % rate)]); block[block.length - 1] |= 0x80;
  const state = Array(25).fill(0n);
  for (let offset = 0; offset < block.length; offset += rate) {
    for (let i = 0; i < rate / 8; i++) state[i] ^= block.readBigUInt64LE(offset + i * 8);
    for (const rc of ROUND_CONSTANTS) {
      const c = Array(5).fill(0n); for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) c[x] ^= state[x + 5 * y];
      const d = c.map((_, x) => c[(x + 4) % 5] ^ rotl(c[(x + 1) % 5], 1)); for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) state[x + 5 * y] ^= d[x];
      const b = Array(25).fill(0n); for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(state[x + 5 * y], ROTATION[x + 5 * y]);
      for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) state[x + 5 * y] = b[x + 5 * y] ^ ((~b[(x + 1) % 5 + 5 * y]) & b[(x + 2) % 5 + 5 * y]); state[0] ^= rc;
    }
  }
  const output = Buffer.alloc(32); for (let i = 0; i < 4; i++) output.writeBigUInt64LE(state[i], i * 8); return output;
}
function networkCatalog(chain) { return Object.values(BUILT_IN_NETWORKS[chainOf(chain)]).map(item => ({ ...item })); }
function inferNetworkFromText(text, chainHint, requestedNetwork) {
  const source = String(text || "").toLowerCase(), candidates = new Set();
  if (/\bbase\s*(?:sepolia|testnet)\b/.test(source)) candidates.add("base-sepolia");
  else if (/\b(?:base\s+(?:mainnet|chain|network|balance|wallet)|on\s+base)\b/.test(source)) candidates.add("base-mainnet");
  if (/\b(?:ethereum|eth)\s*(?:sepolia|testnet)\b/.test(source)) candidates.add("sepolia");
  else if (/\b(?:ethereum|eth)\s+mainnet\b/.test(source)) candidates.add("ethereum-mainnet");
  if (/\bsolana\s+devnet\b|\bdevnet\s+solana\b/.test(source)) candidates.add("solana-devnet");
  else if (/\bsolana\s+testnet\b|\btestnet\s+solana\b/.test(source)) candidates.add("solana-testnet");
  else if (/\bsolana\s+mainnet(?:-beta)?\b/.test(source)) candidates.add("solana-mainnet");
  if (/\bsepolia\b/.test(source) && !/\bbase\s*(?:sepolia|testnet)\b/.test(source)) candidates.add("sepolia");
  if (/\bdevnet\b/.test(source)) candidates.add("solana-devnet");
  if (/\btestnet\b/.test(source) && !/\b(?:solana|ethereum|eth|base)\s*(?:testnet|sepolia)\b/.test(source) && !/\b(?:testnet)\s+(?:solana|ethereum|eth)\b/.test(source)) {
    const family = chainHint ? chainOf(chainHint) : null;
    if (family === "solana") candidates.add("solana-testnet");
    else throw new Error("Which testnet do you mean: Solana Testnet, Base Sepolia, or Ethereum Sepolia?");
  }
  if (/\bmainnet\b/.test(source) && ![...candidates].some(id => id.endsWith("mainnet"))) {
    const family = chainHint ? chainOf(chainHint) : null;
    if (family === "solana") candidates.add("solana-mainnet");
    else throw new Error("Which mainnet do you mean: Solana, Base, or Ethereum?");
  }
  if (!candidates.size) {
    const asksSolana = /\bsolana\b/.test(source), asksEvm = /\b(?:ethereum|eth|base)\b/.test(source);
    if (asksSolana && asksEvm) throw new Error("Your message mentions both EVM and Solana wallets. Use get_wallet_accounts for all balances, or ask for one network at a time.");
    if (asksSolana) return { chain: "solana", networkId: null };
    if (/\beth\b/.test(source)) throw new Error("ETH exists on multiple EVM networks. Specify Ethereum Mainnet, Base Mainnet, or the exact testnet.");
    if (/\bethereum\b/.test(source)) return { chain: "evm", networkId: "ethereum-mainnet" };
    return null;
  }
  let matches = [...candidates];
  if (requestedNetwork) {
    const requested = String(requestedNetwork).toLowerCase();
    const selected = matches.find(id => id === requested || BUILT_IN_NETWORKS.evm[id]?.label.toLowerCase() === requested || BUILT_IN_NETWORKS.solana[id]?.label.toLowerCase() === requested);
    if (selected) matches = [selected];
  }
  if (chainHint) {
    const family = chainOf(chainHint), sameChain = matches.filter(id => (BUILT_IN_NETWORKS.evm[id] ? "evm" : "solana") === family);
    if (sameChain.length) matches = sameChain;
  }
  if (matches.length !== 1) throw new Error("Your message mentions multiple wallet networks. Make a separate request for each, or specify the exact network for this lookup.");
  const id = matches[0];
  return { chain: BUILT_IN_NETWORKS.evm[id] ? "evm" : "solana", networkId: id };
}
function resolveExplicitToolNetwork(name, input, userText) {
  const inferred = inferNetworkFromText(userText, input?.chain, input?.network);
  if (!inferred?.networkId) return { name, input, inferred };
  const resolvedName = name === "get_wallet_accounts" ? "get_wallet_status" : name;
  return { name: resolvedName, inferred, input: { ...input, chain: inferred.chain, network: inferred.networkId } };
}
function builtInNetwork(chain, network) {
  const family = chainOf(chain), entries = Object.values(BUILT_IN_NETWORKS[family]);
  if (network == null || String(network).trim() === "") return entries[0];
  const key = String(network).trim().toLowerCase();
  const found = entries.find(item => item.id === key || item.label.toLowerCase() === key);
  if (found) return found;
  const aliases = family === "evm"
    ? { base: "base-mainnet", ethereum: "ethereum-mainnet", "ethereum mainnet · low fees": "ethereum-mainnet", "base mainnet · low fees": "base-mainnet", "ethereum sepolia": "sepolia", "ethereum sepolia testnet": "sepolia", "base sepolia testnet": "base-sepolia" }
    : { solana: "solana-mainnet", "solana mainnet · low fees": "solana-mainnet", mainnet: "solana-mainnet", "solana devnet": "solana-devnet", devnet: "solana-devnet", "solana testnet": "solana-testnet", testnet: "solana-testnet" };
  const id = aliases[key];
  if (id) return BUILT_IN_NETWORKS[family][id];
  throw new Error("Unsupported " + family + " network. Choose a built-in mainnet, devnet, or testnet network.");
}
function config(chainOverride, networkOverride) {
  const root = store.walletConfig(), chain = chainOf(chainOverride || root.activeChain || root.chain || "evm"), saved = root.wallets?.[chain] || (root.chain === chain ? root : {}), storedNetwork = String(saved.network || "").trim();
  const selected = builtInNetwork(chain, networkOverride || (storedNetwork && storedNetwork !== "Ethereum-compatible network" ? storedNetwork : null));
  const rpcUrl = networkOverride ? selected.rpcUrl : String(saved.rpcUrl || selected.rpcUrl).trim();
  let address = String(saved.address || "").trim();
  if (!address && chain === "evm") { const privateKey = secrets.get(PRIVATE_KEY_ENV); if (privateKey) { try { address = new ethers.Wallet(privateKey).address; } catch {} } }
  return { chain, rpcUrl, networkId: selected.id, network: selected.label, address, chainId: selected.chainId || null, cluster: selected.cluster || null, testnet: selected.testnet, market: selected.market || null, rpcSource: rpcUrl === selected.rpcUrl ? "Sonderr built-in" : "custom" };
}
function chainOf(value) { const chain = String(value || "").trim().toLowerCase(); if (!["evm", "solana"].includes(chain)) throw new Error("Chain must be evm or solana"); return chain; }
function validateAddress(value, label = "Wallet address", chain = "evm") { const address = String(value || "").trim(); if (chain === "solana") { try { return solana.address(address); } catch { throw new Error(label + " must be a valid Solana address"); } } if (!ethers.isAddress(address)) throw new Error(label + " must be a 0x address"); return ethers.getAddress(address); }
function isSupportedSwapRouter(chainId, address) { try { return Boolean(UNISWAP_V3[String(chainId)] && ethers.getAddress(address) === ethers.getAddress(UNISWAP_V3[String(chainId)].router)); } catch { return false; } }
function validateRpc(value) { let parsed; try { parsed = new URL(String(value || "").trim()); } catch { throw new Error("RPC URL is invalid"); } if (!["https:", "http:"].includes(parsed.protocol) || (parsed.protocol === "http:" && !["127.0.0.1", "localhost"].includes(parsed.hostname))) throw new Error("RPC URL must use HTTPS (or local HTTP)"); return parsed.toString(); }
function publicConfig() {
  const root = store.walletConfig(), active = config(), accounts = [];
  for (const chain of ["evm", "solana"]) {
    const item = config(chain), exists = Boolean(item.address && (chain === "evm" ? secrets.get(PRIVATE_KEY_ENV) : secrets.get(SOLANA_SECRET_ENV)));
    if (!exists) continue;
    for (const network of networkCatalog(chain)) accounts.push({ chain, networkId: network.id, network: network.label, testnet: network.testnet, address: item.address, addressModel: chain === "evm" ? "Shared EVM address; token contracts identify ERC-20 assets" : "One Solana wallet address; SPL token accounts are derived per mint" });
  }
  const generated = Boolean(active.chain === "solana" ? secrets.get(SOLANA_SECRET_ENV) : secrets.get(PRIVATE_KEY_ENV));
  return { chain: active.chain, network: active.network, networkId: active.networkId, activeNetworks: { evm: config("evm").networkId, solana: config("solana").networkId }, address: active.address, rpcSource: active.rpcSource, configured: accounts.some(item => item.chain === active.chain), generated, secretConfigured: Boolean(secrets.get(PRIVATE_KEY_ENV) || secrets.get(SOLANA_SECRET_ENV) || secrets.get(SEED_ENV)), accounts, supportedChains: ["evm", "solana"], supportedNetworks: [...networkCatalog("evm"), ...networkCatalog("solana")], supportedAssets: ["native", "erc20", "spl-token"], confirmationBoundary: "Every send requires a visible transaction review. Only Accept & send broadcasts; Decline invalidates the pending draft." };
}
function setNetwork(chainInput, networkInput) {
  const chain = chainOf(chainInput), selected = builtInNetwork(chain, networkInput), previous = store.walletConfig(), saved = previous.wallets?.[chain] || (previous.chain === chain ? previous : {});
  store.updateWalletConfig({ chain, network: selected.id, rpcUrl: selected.rpcUrl, ...(saved.address ? { address: saved.address } : {}) });
  return publicConfig();
}
function saveConfig() { throw new Error("Sonderr Wallet does not import or configure external wallets. Create its local wallet in Settings, then ask Sonderr for the public address or balance."); }
async function createWallet(input = {}) {
  const chain = chainOf(input.chain || "evm"), existing = config(chain);
  if (existing.address || (chain === "solana" ? secrets.get(SOLANA_SECRET_ENV) : secrets.get(PRIVATE_KEY_ENV))) throw new Error("A local wallet for this chain already exists. Export its encrypted backup before funding it.");
  const builtIn = builtInNetwork(chain, input.network || config(chain).networkId), network = builtIn.id, rpcUrl = input.rpcUrl ? validateRpc(input.rpcUrl) : builtIn.rpcUrl; let address;
  if (chain === "solana") { const signer = await solana.generateKeyPairSigner(true), [pkcs8, publicRaw] = await Promise.all([crypto.subtle.exportKey("pkcs8", signer.keyPair.privateKey), crypto.subtle.exportKey("raw", signer.keyPair.publicKey)]); const seed = Buffer.from(pkcs8).subarray(16); secrets.set(SOLANA_SECRET_ENV, Buffer.concat([seed, Buffer.from(publicRaw)]).toString("base64url")); address = signer.address; }
  else { const ecdh = crypto.createECDH("secp256k1"); ecdh.generateKeys(); const privateKey = "0x" + ecdh.getPrivateKey().toString("hex"), publicKey = ecdh.getPublicKey(undefined, "uncompressed").subarray(1); address = "0x" + keccak256(publicKey).subarray(-20).toString("hex"); secrets.set(PRIVATE_KEY_ENV, privateKey); }
  store.updateWalletConfig({ chain, rpcUrl, network, address }); return { chain, networkId: builtIn.id, network: builtIn.label, testnet: builtIn.testnet, address, generated: true, secretConfigured: true, backupRequired: true, warning: "The private key is stored locally and is never returned. Back up the protected local secret before funding this wallet." };
}
function exportBackup(password, chainOverride) { const chain = chainOf(chainOverride || config().chain), c = config(chain), secret = chain === "solana" ? secrets.get(SOLANA_SECRET_ENV) : secrets.get(PRIVATE_KEY_ENV); if (!secret) throw new Error("Only a generated local wallet can be exported"); const pass = String(password || ""); if (pass.length < 12) throw new Error("Backup password must be at least 12 characters"); const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12), key = crypto.scryptSync(pass, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }), cipher = crypto.createCipheriv("aes-256-gcm", key, iv), ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]); return { format: "sonderr-wallet-backup-v1", chain, network: c.network, address: c.address, createdAt: new Date().toISOString(), kdf: "scrypt", salt: salt.toString("base64url"), iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url"), ciphertext: ciphertext.toString("base64url") }; }
async function evmProvider(c = config()) { if (c.chain !== "evm" || !c.rpcUrl || !c.address) throw new Error("Create the local EVM wallet first; Sonderr supplies the network connection"); const privateKey = secrets.get(PRIVATE_KEY_ENV); if (privateKey && new ethers.Wallet(privateKey).address.toLowerCase() !== c.address.toLowerCase()) throw new Error("The protected EVM key does not match this wallet address"); const provider = new ethers.JsonRpcProvider(c.rpcUrl); await assertEvmNetwork(provider, c); return provider; }
function solanaRpc(c = config()) { if (c.chain !== "solana" || !c.rpcUrl || !c.address) throw new Error("Create the local Solana wallet first; Sonderr supplies the network connection"); return solana.createSolanaRpc(c.rpcUrl); }
async function solanaSigner() { const secret = secrets.get(SOLANA_SECRET_ENV); if (!secret) throw new Error("No protected Solana signing secret is configured"); const signer = await solana.createKeyPairSignerFromBytes(new Uint8Array(Buffer.from(secret, "base64url"))), expected = config("solana").address; if (expected && signer.address !== expected) throw new Error("The protected Solana key does not match this wallet address"); return signer; }
async function assertEvmNetwork(provider, c) { const network = await provider.getNetwork(), expected = BigInt(c.chainId); if (network.chainId !== expected) throw new Error("The selected wallet network does not match its RPC chain; nothing was prepared"); return network; }
async function status(input = {}) { const c = config(input.chain, input.network); if (c.chain === "solana") { const rpc = solanaRpc(c), [balance, slot] = await Promise.all([rpc.getBalance(solana.address(c.address)).send(), rpc.getSlot().send()]); const lamports = BigInt(balance.value); return { chain: "solana", networkId: c.networkId, network: c.network, testnet: c.testnet, address: c.address, slot: String(slot), balanceBaseUnits: String(lamports), balanceNative: (Number(lamports) / 1e9).toFixed(9).replace(/0+$/, "").replace(/\.$/, ""), nativeSymbol: "SOL" }; } const provider = await evmProvider(c), [network, balance, blockNumber] = await Promise.all([provider.getNetwork(), provider.getBalance(c.address), provider.getBlockNumber()]); return { chain: "evm", networkId: c.networkId, network: c.network, testnet: c.testnet, address: c.address, chainId: String(network.chainId), blockNumber, balanceWei: balance.toString(), balanceNative: ethers.formatEther(balance), nativeSymbol: "ETH" }; }
async function accounts() {
  const configured = publicConfig().accounts;
  const rows = await Promise.all(configured.map(async item => { try { return { ...await status({ chain: item.chain, network: item.networkId }), networkId: item.networkId, testnet: item.testnet }; } catch (error) { return { ...item, unavailableReason: String(error.message || "Network unavailable").slice(0, 180) }; } }));
  return { accounts: rows, fetchedAt: new Date().toISOString(), note: "EVM addresses are reused across networks and Solana has one address across clusters. Testnet tokens are valueless and are separate from mainnet balances. Verify the network label before funding or sending." };
}
async function fetchJson(url) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 7000); try { const response = await fetch(url, { headers: { accept: "application/json" }, signal: controller.signal }); if (!response.ok) throw new Error("Price service returned HTTP " + response.status); return await response.json(); } finally { clearTimeout(timer); } }
function priceNetwork(c) { return c.testnet ? null : c.chain === "solana" ? "solana" : c.market; }
async function latestPrice(input = {}) {
  const c = config(input.chain, input.network), tokenAddress = input.tokenAddress ? String(validateAddress(input.tokenAddress, "Token contract/mint", c.chain)).toLowerCase() : "", native = !tokenAddress, cacheKey = c.chain + ":" + c.network + ":" + (tokenAddress || "native"), cached = priceCache.get(cacheKey);
  if (c.testnet) return { chain: c.chain, network: c.network, networkId: c.networkId, tokenAddress: tokenAddress || null, symbol: input.symbol || (c.chain === "solana" ? "SOL" : "ETH"), priceUsd: null, change24h: null, source: "not applicable", fetchedAt: new Date().toISOString(), unavailableReason: "Testnet assets have no real-world market price or value." };
  if (cached && cached.expiresAt > Date.now()) return { ...cached.value, cached: true };
  const network = priceNetwork(c), url = native ? "https://api.coingecko.com/api/v3/simple/price?ids=" + (c.chain === "solana" ? "solana" : "ethereum") + "&vs_currencies=usd&include_24hr_change=true" : "https://api.coingecko.com/api/v3/simple/token_price/" + network + "?contract_addresses=" + encodeURIComponent(tokenAddress) + "&vs_currencies=usd&include_24hr_change=true";
  let data = {}; try { data = await fetchJson(url); } catch (error) { return { chain: c.chain, network: c.network, tokenAddress: tokenAddress || null, symbol: input.symbol || (c.chain === "solana" ? "SOL" : "ETH"), priceUsd: null, change24h: null, source: "CoinGecko", fetchedAt: new Date().toISOString(), unavailableReason: error.message }; }
  const row = native ? data[c.chain === "solana" ? "solana" : "ethereum"] : data[tokenAddress]; const value = { chain: c.chain, network: c.network, tokenAddress: tokenAddress || null, symbol: String(input.symbol || (native ? (c.chain === "solana" ? "SOL" : "ETH") : "token")).slice(0, 32), priceUsd: row?.usd == null ? null : Number(row.usd), change24h: row?.usd_24h_change == null ? null : Number(row.usd_24h_change), source: "CoinGecko", fetchedAt: new Date().toISOString(), unavailableReason: row ? null : "No price was returned for this exact contract/mint" }; priceCache.set(cacheKey, { value, expiresAt: Date.now() + PRICE_TTL_MS }); return value;
}
function marketNumber(value) { const number = Number(value); return Number.isFinite(number) && number >= 0 ? number : null; }
async function marketSnapshot(input = {}) {
  const c = config(input.chain, input.network), tokenAddress = validateAddress(input.tokenAddress, "Token contract/mint", c.chain);
  if (c.testnet) return { chain: c.chain, networkId: c.networkId, network: c.network, tokenAddress, fetchedAt: new Date().toISOString(), source: "DEX Screener", pairs: [], unavailableReason: "Market data is unavailable on testnets; testnet tokens have no real-world value." };
  const key = c.networkId + ":" + tokenAddress.toLowerCase(), cached = marketCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return { ...cached.value, cached: true };
  const dexChain = c.chain === "solana" ? "solana" : c.market;
  const rows = await fetchJson("https://api.dexscreener.com/token-pairs/v1/" + encodeURIComponent(dexChain) + "/" + encodeURIComponent(tokenAddress));
  if (!Array.isArray(rows)) throw new Error("Market service returned an unexpected pair list");
  const matches = rows.filter(pair => {
    if (String(pair?.chainId || "").toLowerCase() !== dexChain) return false;
    const base = String(pair?.baseToken?.address || ""), quote = String(pair?.quoteToken?.address || "");
    return c.chain === "evm" ? base.toLowerCase() === tokenAddress.toLowerCase() || quote.toLowerCase() === tokenAddress.toLowerCase() : base === tokenAddress || quote === tokenAddress;
  });
  const clean = matches.map(pair => {
    const isBase = c.chain === "evm" ? String(pair.baseToken?.address || "").toLowerCase() === tokenAddress.toLowerCase() : String(pair.baseToken?.address || "") === tokenAddress;
    const pairAddress = String(pair.pairAddress || "").slice(0, 128), createdAt = Number(pair.pairCreatedAt);
    return {
      dex: String(pair.dexId || "unknown").slice(0, 48), pairAddress,
      url: pairAddress ? "https://dexscreener.com/" + encodeURIComponent(dexChain) + "/" + encodeURIComponent(pairAddress) : null,
      assetSide: isBase ? "base" : "quote",
      baseToken: { address: String(pair.baseToken?.address || "").slice(0, 128), symbol: String(pair.baseToken?.symbol || "").slice(0, 32), name: String(pair.baseToken?.name || "").slice(0, 80) },
      quoteToken: { address: String(pair.quoteToken?.address || "").slice(0, 128), symbol: String(pair.quoteToken?.symbol || "").slice(0, 32), name: String(pair.quoteToken?.name || "").slice(0, 80) },
      assetPriceUsd: isBase ? marketNumber(pair.priceUsd) : null,
      liquidityUsd: marketNumber(pair.liquidity?.usd), volume24hUsd: marketNumber(pair.volume?.h24),
      marketCapUsd: marketNumber(pair.marketCap), fdvUsd: marketNumber(pair.fdv),
      priceChangePct: Object.fromEntries(["m5", "h1", "h6", "h24"].map(period => [period, marketNumber(pair.priceChange?.[period])])),
      swaps24h: { buys: marketNumber(pair.txns?.h24?.buys), sells: marketNumber(pair.txns?.h24?.sells) },
      pairCreatedAt: Number.isFinite(createdAt) && createdAt > 0 && createdAt <= 8.64e15 ? new Date(createdAt).toISOString() : null
    };
  }).filter(pair => pair.pairAddress).sort((a, b) => (b.liquidityUsd || 0) - (a.liquidityUsd || 0)).slice(0, 8);
  const value = { chain: c.chain, networkId: c.networkId, network: c.network, tokenAddress, pairs: clean, pairCount: matches.length, fetchedAt: new Date().toISOString(), source: "DEX Screener API", note: "Public DEX pool snapshots can be stale, thin, manipulated, or incomplete. Pool liquidity and volume are not guaranteed executable depth, token safety, or a trade recommendation." };
  marketCache.set(key, { value, expiresAt: Date.now() + PRICE_TTL_MS });
  return value;
}
async function tokenAllowance(input = {}) {
  const c = config(input.chain || "evm", input.network);
  if (c.chain !== "evm") throw new Error("Token allowance inspection currently supports EVM networks only");
  const tokenAddress = validateAddress(input.tokenAddress, "Token contract", "evm"), spender = validateAddress(input.spender, "Spender", "evm"), provider = await evmProvider(c);
  const contract = new ethers.Contract(tokenAddress, ["function allowance(address owner,address spender) view returns (uint256)", "function decimals() view returns (uint8)", "function symbol() view returns (string)"], provider);
  const [raw, decimalsResult, symbolResult] = await Promise.all([contract.allowance(c.address, spender), contract.decimals().catch(() => null), contract.symbol().catch(() => null)]);
  const decimals = decimalsResult == null ? null : Number(decimalsResult), unlimited = raw >= (1n << 255n);
  return { chain: c.chain, networkId: c.networkId, network: c.network, chainId: c.chainId, owner: c.address, tokenAddress, spender, symbol: symbolResult == null ? null : String(symbolResult).slice(0, 32), allowanceBaseUnits: raw.toString(), decimals, allowance: decimals == null ? null : ethers.formatUnits(raw, decimals), unlimited, fetchedAt: new Date().toISOString(), source: "Configured EVM RPC", note: "Read-only allowance inspection. A positive/unlimited allowance lets the exact spender move this token up to the approved amount. This call does not revoke or change approvals; verify the spender independently." };
}
async function discoverEvmTokens(c, strict = false) {
  if (c.testnet) { if (strict) throw new Error("Automatic token discovery is not configured for this EVM testnet"); return []; }
  const host = priceNetwork(c) === "ethereum" ? "https://eth.blockscout.com" : "https://base.blockscout.com";
  try { const rows = await fetchJson(host + "/api/v2/addresses/" + encodeURIComponent(c.address) + "/token-balances"); if (!Array.isArray(rows)) { if (strict) throw new Error("Token balance index returned an unexpected response"); return []; } return rows.slice(0, 20).map(row => { const token = row.token || row; const tokenAddress = token.address || row.token_address || row.contract_address; const decimals = Number(token.decimals ?? row.decimals ?? 0); const amountBaseUnits = String(row.value ?? row.balance ?? "0"); if (!tokenAddress || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(tokenAddress) && !ethers.isAddress(tokenAddress)) return null; return { kind: "erc20", tokenAddress: ethers.isAddress(tokenAddress) ? ethers.getAddress(tokenAddress) : tokenAddress, symbol: String(token.symbol || row.symbol || "ERC-20").slice(0, 32), decimals, amountBaseUnits, amount: ethers.formatUnits(amountBaseUnits, decimals) }; }).filter(Boolean).filter(asset => asset.amountBaseUnits !== "0"); } catch (error) { if (strict) throw error; return []; }
}
async function balanceSnapshot(input = {}) {
  const c = config(input.chain, input.network), native = await status(input), assets = [{ kind: "native", symbol: native.nativeSymbol, amountBaseUnits: c.chain === "solana" ? native.balanceBaseUnits : native.balanceWei, decimals: c.chain === "solana" ? 9 : 18 }];
  let tokenBalancesAvailable = true;
  if (c.chain === "evm") {
    try { assets.push(...(await discoverEvmTokens(c, true)).map(asset => ({ ...asset, amountBaseUnits: String(asset.amountBaseUnits) }))); }
    catch { tokenBalancesAvailable = false; }
  } else {
    try {
      const response = await solanaRpc(c).getTokenAccountsByOwner(solana.address(c.address), { programId: tokenProgram.TOKEN_PROGRAM_ADDRESS }, { encoding: "jsonParsed" }).send();
      for (const entry of response.value || []) {
        const parsed = entry.account?.data?.parsed?.info, amount = parsed?.tokenAmount;
        if (parsed?.mint && amount) assets.push({ kind: "spl-token", tokenAddress: String(parsed.mint), symbol: "SPL token", amountBaseUnits: String(amount.amount), decimals: Number(amount.decimals) });
      }
    } catch { tokenBalancesAvailable = false; }
  }
  return { chain: c.chain, network: c.network, address: c.address, fetchedAt: new Date().toISOString(), tokenBalancesAvailable, assets };
}
async function portfolio(input = {}) {
  const c = config(input.chain, input.network), wallet = await status(input), assets = [{ kind: "native", symbol: wallet.nativeSymbol, amount: wallet.balanceNative, amountBaseUnits: c.chain === "solana" ? wallet.balanceBaseUnits : wallet.balanceWei }], requested = Array.isArray(input.assets) ? input.assets.slice(0, 20) : [];
  if (c.chain === "evm" && !requested.length) assets.push(...await discoverEvmTokens(c));
  if (c.chain === "evm" && requested.length) { const provider = await evmProvider(c), abi = ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)", "function symbol() view returns (string)"]; for (const item of requested) { const tokenAddress = validateAddress(item.tokenAddress, "Token contract", "evm"), contract = new ethers.Contract(tokenAddress, abi, provider); try { const [raw, decimals, symbol] = await Promise.all([contract.balanceOf(c.address), contract.decimals(), contract.symbol()]); assets.push({ kind: "erc20", tokenAddress, symbol: String(item.symbol || symbol).slice(0, 32), decimals: Number(decimals), amountBaseUnits: raw.toString(), amount: ethers.formatUnits(raw, Number(decimals)) }); } catch (error) { assets.push({ kind: "erc20", tokenAddress, symbol: String(item.symbol || "token").slice(0, 32), unavailableReason: "Token balance could not be read: " + error.message }); } } }
  if (c.chain === "solana") { try { const response = await solanaRpc(c).getTokenAccountsByOwner(solana.address(c.address), { programId: tokenProgram.TOKEN_PROGRAM_ADDRESS }, { encoding: "jsonParsed" }).send(); for (const entry of response.value || []) { const parsed = entry.account?.data?.parsed?.info, amount = parsed?.tokenAmount; if (parsed?.mint && amount) assets.push({ kind: "spl-token", tokenAddress: parsed.mint, tokenAccount: entry.pubkey, symbol: "SPL token", decimals: Number(amount.decimals), amountBaseUnits: String(amount.amount), amount: String(amount.uiAmountString ?? amount.uiAmount ?? "0") }); } } catch (error) { assets.push({ kind: "spl-token", unavailableReason: "SPL token accounts unavailable: " + error.message }); } }
  let totalUsd = 0, pricedAssets = 0; for (const asset of assets) { const price = await latestPrice({ chain: c.chain, network: c.network, tokenAddress: asset.tokenAddress, symbol: asset.symbol }); asset.priceUsd = price.priceUsd; asset.change24h = price.change24h; asset.priceSource = price.source; if (asset.priceUsd != null && asset.amount != null) { asset.valueUsd = Number(asset.amount) * asset.priceUsd; if (Number.isFinite(asset.valueUsd)) { totalUsd += asset.valueUsd; pricedAssets++; } } }
  const snapshotKey = c.chain + ":" + c.network + ":" + c.address, previous = store.walletPortfolioSnapshot(snapshotKey), comparable = previous && previous.chain === c.chain && previous.network === c.network && previous.address === c.address, previousTotalUsd = comparable ? Number(previous.totalUsd) : NaN, deltaUsd = Number.isFinite(previousTotalUsd) ? totalUsd - previousTotalUsd : null, snapshot = { chain: c.chain, network: c.network, address: c.address, totalUsd, pricedAssets, assetCount: assets.length }; store.saveWalletPortfolioSnapshot(snapshot, snapshotKey);
  return { chain: c.chain, network: c.network, address: c.address, assets, totalUsd: pricedAssets ? Number(totalUsd.toFixed(2)) : null, previousTotalUsd: Number.isFinite(previousTotalUsd) ? Number(previousTotalUsd.toFixed(2)) : null, changeSinceLastUsd: deltaUsd == null ? null : Number(deltaUsd.toFixed(2)), changeSinceLastPercent: deltaUsd == null || !previousTotalUsd ? null : Number(((deltaUsd / previousTotalUsd) * 100).toFixed(2)), pricedAssets, assetCount: assets.length, fetchedAt: new Date().toISOString(), note: requested.length ? "Balances and prices are based on the exact contracts/mints supplied or discovered. USD total includes only assets with available prices; compare pricedAssets with assetCount." : "Native and discovered token balances are included when the chain's read-only index supports enumeration. USD total includes only assets with available prices; compare pricedAssets with assetCount." };
}
async function tokenInfo(input = {}) {
  const c = config(input.chain, input.network), tokenAddress = validateAddress(input?.tokenAddress, "Token contract/mint", c.chain);
  if (c.chain === "solana") {
    const rpc = solanaRpc(c), mint = await tokenProgram.fetchMint(rpc, tokenAddress), response = await rpc.getTokenAccountsByOwner(solana.address(c.address), { mint: solana.address(tokenAddress), programId: tokenProgram.TOKEN_PROGRAM_ADDRESS }, { encoding: "jsonParsed" }).send();
    const accounts = (response.value || []).map(entry => { const amount = entry.account?.data?.parsed?.info?.tokenAmount; return { address: entry.pubkey, amount: amount?.uiAmountString ?? amount?.uiAmount ?? null, amountBaseUnits: amount?.amount ?? null, decimals: amount?.decimals ?? mint.data.decimals }; });
    return { chain: c.chain, network: c.network, networkId: c.networkId, tokenAddress, decimals: mint.data.decimals, supplyBaseUnits: String(mint.data.supply), mintAuthority: mint.data.mintAuthority ?? null, freezeAuthority: mint.data.freezeAuthority ?? null, walletTokenAccounts: accounts, fetchedAt: new Date().toISOString(), source: c.network + " RPC", note: "Mint authorities are on-chain facts, not a safety or legitimacy certification. Token symbols and project identity are not inferred from a mint address." };
  }
  const provider = await evmProvider(c), contract = new ethers.Contract(tokenAddress, ["function name() view returns (string)", "function symbol() view returns (string)", "function decimals() view returns (uint8)", "function totalSupply() view returns (uint256)", "function balanceOf(address) view returns (uint256)", "function owner() view returns (address)"], provider);
  const [network, symbol, decimals, totalSupply, balance, name, owner] = await Promise.all([
    provider.getNetwork(), contract.symbol().catch(() => null), contract.decimals().catch(() => null), contract.totalSupply().catch(() => null), contract.balanceOf(c.address).catch(() => null), contract.name().catch(() => null), contract.owner().catch(() => null)
  ]);
  if (network.chainId !== BigInt(c.chainId)) throw new Error("Configured RPC network does not match the selected wallet network");
  const digits = decimals == null ? null : Number(decimals);
  return { chain: c.chain, networkId: c.networkId, network: c.network, testnet: c.testnet, chainId: String(network.chainId), tokenAddress, name: name == null ? null : String(name).slice(0, 100), symbol: symbol == null ? null : String(symbol).slice(0, 32), decimals: digits, totalSupply: totalSupply == null || digits == null ? null : ethers.formatUnits(totalSupply, digits), totalSupplyBaseUnits: totalSupply?.toString() ?? null, walletBalance: balance == null || digits == null ? null : ethers.formatUnits(balance, digits), walletBalanceBaseUnits: balance?.toString() ?? null, owner: owner == null ? null : String(owner), fetchedAt: new Date().toISOString(), source: c.network + " RPC", note: "On-chain metadata is not a safety, liquidity, or legitimacy certification. A token symbol/name is untrusted metadata and can be copied by unrelated contracts." };
}
async function activity(input = {}) {
  const c = config(input.chain, input.network), limit = Math.max(1, Math.min(20, Number.isInteger(Number(input.limit)) ? Number(input.limit) : 10));
  if (c.chain === "solana") {
    const rows = await solanaRpc(c).getSignaturesForAddress(solana.address(c.address), { limit }).send();
    const clusterQuery = c.cluster === "mainnet-beta" ? "" : "?cluster=" + encodeURIComponent(c.cluster);
    return { chain: c.chain, network: c.network, networkId: c.networkId, address: c.address, transactions: rows.map(row => ({ signature: row.signature, slot: String(row.slot), blockTime: row.blockTime == null ? null : new Date(Number(row.blockTime) * 1000).toISOString(), confirmationStatus: row.confirmationStatus || null, status: row.err != null ? "failed" : row.confirmationStatus || "reported", error: row.err == null ? null : "Transaction reported an on-chain error", explorerUrl: "https://explorer.solana.com/tx/" + encodeURIComponent(row.signature) + clusterQuery })), fetchedAt: new Date().toISOString(), source: c.network + " RPC", note: "Recent signatures only; token-level meaning is not inferred from transaction signatures." };
  }
  if (c.testnet) return { chain: c.chain, network: c.network, networkId: c.networkId, address: c.address, transactions: [], fetchedAt: new Date().toISOString(), source: "configured EVM RPC", unavailableReason: "A public testnet explorer index is not configured; inspect transactions using the selected network's explorer." };
  const host = priceNetwork(c) === "ethereum" ? "https://eth.blockscout.com" : "https://base.blockscout.com", data = await fetchJson(host + "/api/v2/addresses/" + encodeURIComponent(c.address) + "/transactions?limit=" + limit), rows = Array.isArray(data.items) ? data.items : [];
  return { chain: c.chain, network: c.network, address: c.address, transactions: rows.slice(0, limit).map(row => ({ hash: String(row.hash || ""), from: row.from?.hash || null, to: row.to?.hash || null, valueWei: String(row.value || "0"), valueNative: (() => { try { return ethers.formatEther(BigInt(row.value || "0")); } catch { return null; } })(), blockNumber: row.block_number == null ? null : Number(row.block_number), timestamp: row.timestamp || null, status: row.status === "error" ? "failed" : "reported", method: String(row.method || "").slice(0, 48) || null, explorerUrl: (priceNetwork(c) === "ethereum" ? "https://etherscan.io/tx/" : "https://basescan.org/tx/") + encodeURIComponent(String(row.hash || "")) })), fetchedAt: new Date().toISOString(), source: "Blockscout public index", note: "Recent indexed transactions; indexer labels may lag and are not a transaction simulation." };
}
function baseAmount(input, label = "Amount") { const value = String(input || "").trim(); if (!/^[1-9][0-9]*$/.test(value) || value.length > 78) throw new Error(label + " must be a positive integer in base units"); return value; }
async function prepareEvm(input, c) {
  const provider = await evmProvider(c), recipient = validateAddress(input.to, "Recipient address", "evm"), kind = String(input.assetKind || "native").toLowerCase();
  let tx = { to: recipient, value: 0n, data: "0x" }, asset;
  if (kind === "erc20") {
    const token = validateAddress(input.tokenAddress, "Token contract", "evm"), amount = baseAmount(input.amount, "Token amount"), contract = new ethers.Contract(token, ["function transfer(address to,uint256 amount)", "function decimals() view returns (uint8)", "function symbol() view returns (string)"], provider);
    const [decimalsResult, symbolResult] = await Promise.all([contract.decimals(), contract.symbol().catch(() => null)]), decimals = Number(decimalsResult);
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) throw new Error("Token returned invalid decimals; no transaction was prepared");
    const iface = new ethers.Interface(["function transfer(address to,uint256 amount)"]);
    tx = { to: token, value: 0n, data: iface.encodeFunctionData("transfer", [recipient, amount]) };
    asset = { kind, tokenAddress: token, symbol: String(symbolResult || input.symbol || "ERC-20").slice(0, 20), amountBaseUnits: amount, amountFormatted: ethers.formatUnits(amount, decimals), decimals };
  } else if (kind === "native") {
    const amountBaseUnits = baseAmount(input.amount || input.value, "Amount");
    tx.value = BigInt(amountBaseUnits);
    asset = { kind: "native", symbol: "ETH", amountBaseUnits, amountFormatted: ethers.formatEther(amountBaseUnits), decimals: 18 };
  } else throw new Error("EVM assetKind must be native or erc20");
  const feeData = await provider.getFeeData(), gasLimit = await provider.estimateGas({ from: c.address, to: tx.to, value: tx.value, data: tx.data }), feePerGas = feeData.maxFeePerGas || feeData.gasPrice || 0n, network = await assertEvmNetwork(provider, c);
  return { chain: "evm", kind: "transaction", networkId: c.networkId, network: c.network, testnet: c.testnet, chainId: String(network.chainId), from: c.address, to: tx.to, data: tx.data, value: tx.value.toString(), asset, gasLimit: gasLimit.toString(), gasPriceWei: feeData.gasPrice?.toString() || null, maxFeePerGasWei: feeData.maxFeePerGas?.toString() || null, maxPriorityFeePerGasWei: feeData.maxPriorityFeePerGas?.toString() || null, estimatedFeeWei: (gasLimit * feePerGas).toString(), estimatedFeeNative: ethers.formatEther(gasLimit * feePerGas), confirmationRequired: true, signing: false, note: c.testnet ? "TESTNET ONLY: assets have no real-world value. Prepared only; press Accept & send to sign and broadcast on this test network." : "Prepared only. Press Accept & send to sign and broadcast this exact transaction." };
}
async function prepareSolana(input, c) {
  const rpc = solanaRpc(c), signer = await solanaSigner(), from = solana.address(c.address), to = validateAddress(input.to, "Recipient address", "solana"), kind = String(input.assetKind || "native").toLowerCase(); if (kind !== "native" && kind !== "spl-token") throw new Error("Solana assetKind must be native or spl-token");
  const amount = baseAmount(input.amount, "Amount"), instructions = []; let asset = { kind: "native", symbol: "SOL", amountBaseUnits: amount, amountFormatted: ethers.formatUnits(amount, 9), decimals: 9 };
  if (kind === "native") instructions.push(system.getTransferSolInstruction({ source: signer, destination: to, amount: BigInt(amount) }));
  else { const mint = validateAddress(input.tokenAddress, "Token mint", "solana"), mintInfo = await tokenProgram.fetchMint(rpc, mint), [sourceAta] = await tokenProgram.findAssociatedTokenPda({ owner: from, tokenProgram: tokenProgram.TOKEN_PROGRAM_ADDRESS, mint }), [destinationAta] = await tokenProgram.findAssociatedTokenPda({ owner: to, tokenProgram: tokenProgram.TOKEN_PROGRAM_ADDRESS, mint }); instructions.push(tokenProgram.getCreateAssociatedTokenIdempotentInstruction({ payer: signer, ata: destinationAta, owner: to, mint })); instructions.push(tokenProgram.getTransferCheckedInstruction({ source: sourceAta, mint, destination: destinationAta, authority: signer, amount: BigInt(amount), decimals: mintInfo.data.decimals })); asset = { kind, tokenAddress: mint, symbol: String(input.symbol || "SPL token").slice(0, 20), amountBaseUnits: amount, amountFormatted: ethers.formatUnits(amount, mintInfo.data.decimals), decimals: mintInfo.data.decimals, sourceAta, destinationAta }; }
  const { value: latest } = await rpc.getLatestBlockhash().send(); let message = solana.createTransactionMessage({ version: 0 }); message = solana.setTransactionMessageFeePayerSigner(signer, message); message = solana.setTransactionMessageLifetimeUsingBlockhash(latest, message); message = solana.appendTransactionMessageInstructions(instructions, message); const compiled = solana.compileTransaction(message); let estimatedFeeLamports = null; try { const encodedMessage = Buffer.from(compiled.messageBytes).toString("base64"); const fee = await rpc.getFeeForMessage(encodedMessage).send(); estimatedFeeLamports = fee.value == null ? null : String(fee.value); } catch { /* some RPCs do not expose fee simulation */ }
  return { chain: "solana", kind: "transaction", networkId: c.networkId, network: c.network, testnet: c.testnet, from: c.address, to, asset, amountBaseUnits: amount, recentBlockhash: latest.blockhash, lastValidBlockHeight: String(latest.lastValidBlockHeight), estimatedFeeLamports, estimatedFeeNative: estimatedFeeLamports == null ? null : (Number(estimatedFeeLamports) / 1e9).toFixed(9).replace(/0+$/, "").replace(/\.$/, ""), instructionCount: instructions.length, confirmationRequired: true, signing: false, note: c.testnet ? "TESTNET ONLY: tokens have no real-world value. Prepared only; press Accept & send to sign and broadcast on this test cluster." : "Prepared only. Press Accept & send to sign and broadcast this exact transaction." };
}
async function prepareTransaction(input) { const requestedChain = input?.chain ? chainOf(input.chain) : config().chain, c = config(requestedChain, input?.network); for (const [token, item] of pending) if (item.expiresAt < Date.now()) pending.delete(token); if (pending.size >= 20) throw new Error("Too many pending wallet confirmations; finish or let an existing review expire first"); const prepared = c.chain === "solana" ? await prepareSolana(input, c) : await prepareEvm(input, c), token = crypto.randomBytes(24).toString("hex"), expiresAt = Date.now() + DRAFT_TTL_MS; pending.set(token, { token, input: { ...input, chain: c.chain, network: c.network }, prepared, expiresAt }); return { token, expiresAt, ...prepared }; }
async function confirmTransaction(token) {
  const item = pending.get(String(token || "")); if (!item) throw new Error("Wallet confirmation expired or was already used"); if (item.type) throw new Error("This draft requires its matching confirmation action"); pending.delete(item.token); if (item.expiresAt < Date.now()) throw new Error("Wallet confirmation expired"); const c = config(item.input.chain, item.input.network);
  if (c.chain === "solana") { const rpc = solanaRpc(c), signer = await solanaSigner(); if (signer.address !== c.address) throw new Error("The local Solana key does not match the reviewed address; nothing was sent"); const prepared = await prepareSolana(item.input, c), latest = { blockhash: prepared.recentBlockhash, lastValidBlockHeight: BigInt(prepared.lastValidBlockHeight) }; let message = solana.createTransactionMessage({ version: 0 }); message = solana.setTransactionMessageFeePayerSigner(signer, message); message = solana.setTransactionMessageLifetimeUsingBlockhash(latest, message); const to = solana.address(prepared.to), instructions = []; if (prepared.asset.kind === "native") instructions.push(system.getTransferSolInstruction({ source: signer, destination: to, amount: BigInt(prepared.amountBaseUnits) })); else { const mint = solana.address(prepared.asset.tokenAddress), [destinationAta] = await tokenProgram.findAssociatedTokenPda({ owner: to, tokenProgram: tokenProgram.TOKEN_PROGRAM_ADDRESS, mint }), [sourceAta] = await tokenProgram.findAssociatedTokenPda({ owner: signer.address, tokenProgram: tokenProgram.TOKEN_PROGRAM_ADDRESS, mint }); instructions.push(tokenProgram.getCreateAssociatedTokenIdempotentInstruction({ payer: signer, ata: destinationAta, owner: to, mint })); instructions.push(tokenProgram.getTransferCheckedInstruction({ source: sourceAta, mint, destination: destinationAta, authority: signer, amount: BigInt(prepared.amountBaseUnits), decimals: prepared.asset.decimals })); } message = solana.appendTransactionMessageInstructions(instructions, message); const signed = await solana.signTransaction([signer.keyPair], solana.compileTransaction(message)); await solana.sendTransactionWithoutConfirmingFactory({ rpc })(signed, { commitment: "confirmed" }); return { accepted: true, provider: "solana", transactionHash: Object.keys(signed.signatures)[0], network: c.network }; }
  const privateKey = secrets.get(PRIVATE_KEY_ENV); if (!privateKey) throw new Error("No protected EVM signing secret is configured"); const provider = await evmProvider(c), currentNetwork = await provider.getNetwork(); if (item.prepared.chainId && String(currentNetwork.chainId) !== String(item.prepared.chainId)) throw new Error("The configured RPC chain changed since this transaction was reviewed; prepare it again"); const signer = new ethers.Wallet(privateKey, provider); if (signer.address.toLowerCase() !== String(item.prepared.from || "").toLowerCase()) throw new Error("The local EVM key does not match the reviewed address; nothing was sent"); const tx = { to: item.prepared.to, value: BigInt(item.prepared.value || "0"), data: item.prepared.data || "0x", gasLimit: BigInt(item.prepared.gasLimit), ...(item.prepared.maxFeePerGasWei ? { maxFeePerGas: BigInt(item.prepared.maxFeePerGasWei) } : {}), ...(item.prepared.maxPriorityFeePerGasWei ? { maxPriorityFeePerGas: BigInt(item.prepared.maxPriorityFeePerGasWei) } : {}) }, sent = await signer.sendTransaction(tx); return { accepted: true, provider: "evm", transactionHash: sent.hash, network: c.network, chainId: item.prepared.chainId || null };
}
function declineTransaction(token) {
  const key = String(token || "");
  return key ? pending.delete(key) : false;
}
async function prepareSwap(input) {
  for (const [key, item] of pending) if (item.expiresAt < Date.now()) pending.delete(key);
  if (pending.size >= 20) throw new Error("Too many pending wallet confirmations; finish or let an existing review expire first");
  const chain = input?.chain ? chainOf(input.chain) : config().chain, c = config(chain, input?.network);
  if (chain !== "evm" || c.testnet || !UNISWAP_V3[String(c.chainId)]) throw new Error("Direct spot swaps currently support Ethereum and Base mainnet only; testnets and Solana are not supported.");
  const sellToken = validateAddress(input?.sellToken, "Sell token", "evm"), buyToken = validateAddress(input?.buyToken, "Buy token", "evm");
  if (sellToken.toLowerCase() === buyToken.toLowerCase()) throw new Error("Sell and buy tokens must be different");
  const amount = baseAmount(input?.amount, "Swap amount"), slippageBps = Number(input?.slippageBps ?? 50);
  if (!Number.isInteger(slippageBps) || slippageBps < 1 || slippageBps > 100) throw new Error("Slippage must be between 1 and 100 basis points (1%)");
  const provider = await evmProvider(c), net = await provider.getNetwork(), expectedChainId = BigInt(c.chainId), deployments = UNISWAP_V3[String(c.chainId)];
  if (net.chainId !== expectedChainId) throw new Error("Configured RPC network does not match the selected wallet network");
  const nativeInput = sellToken === ethers.ZeroAddress;
  const nativeOutput = buyToken === ethers.ZeroAddress, poolTokenIn = nativeInput ? deployments.wrappedNative : sellToken, poolTokenOut = nativeOutput ? deployments.wrappedNative : buyToken;
  if (poolTokenIn.toLowerCase() === poolTokenOut.toLowerCase()) throw new Error("Sell and buy resolve to the same on-chain asset");
  const [sellInfo, buyInfo] = await Promise.all([
    nativeInput ? Promise.resolve({ name: "Ether", symbol: "ETH", decimals: 18, walletBalance: null, walletBalanceBaseUnits: null }) : tokenInfo({ chain, network: c.network, tokenAddress: sellToken }),
    nativeOutput ? Promise.resolve({ name: "Ether", symbol: "ETH", decimals: 18, walletBalance: null, walletBalanceBaseUnits: null }) : tokenInfo({ chain, network: c.network, tokenAddress: buyToken })
  ]);
  const fromDecimals = Number(sellInfo.decimals), toDecimals = Number(buyInfo.decimals);
  if (!Number.isInteger(fromDecimals) || !Number.isInteger(toDecimals) || fromDecimals < 0 || toDecimals < 0 || fromDecimals > 255 || toDecimals > 255) throw new Error("Exact token decimals could not be read from this network; no swap was staged");
  if (!nativeInput && BigInt(sellInfo.walletBalanceBaseUnits || "0") < BigInt(amount)) throw new Error("Wallet token balance is lower than the requested swap amount; no trade was staged");

  // Discover and compare all canonical Uniswap V3 fee tiers directly on-chain.
  const factory = new ethers.Contract(deployments.factory, V3_FACTORY_ABI, provider);
  const quoter = new ethers.Contract(deployments.quoter, V3_QUOTER_ABI, provider);
  const feeQuotes = await Promise.all(UNISWAP_V3_FEES.map(async fee => {
    try {
      const poolAddress = await factory.getPool(poolTokenIn, poolTokenOut, fee);
      if (poolAddress === ethers.ZeroAddress) return null;
      const pool = new ethers.Contract(poolAddress, V3_POOL_ABI, provider), liquidity = await pool.liquidity();
      if (liquidity === 0n) return null;
      const result = await quoter.quoteExactInputSingle.staticCall({ tokenIn: poolTokenIn, tokenOut: poolTokenOut, amountIn: BigInt(amount), fee, sqrtPriceLimitX96: 0 });
      return { fee, poolAddress, liquidity: liquidity.toString(), amountOut: BigInt(result.amountOut ?? result[0]), gasEstimate: String(result.gasEstimate ?? result[3]) };
    } catch { return null; }
  }));
  const pools = feeQuotes.filter(Boolean).sort((a, b) => a.amountOut === b.amountOut ? a.fee - b.fee : a.amountOut > b.amountOut ? -1 : 1);
  const best = pools[0];
  if (!best) throw new Error("No liquid direct Uniswap V3 pool could quote this exact pair on the selected network; no aggregator or alternate venue is used");
  const referenceAmount = BigInt(amount) > 1000n ? BigInt(amount) / 1000n : BigInt(amount);
  let priceImpactBps = null;
  if (referenceAmount < BigInt(amount)) {
    try {
      const reference = await quoter.quoteExactInputSingle.staticCall({ tokenIn: poolTokenIn, tokenOut: poolTokenOut, amountIn: referenceAmount, fee: best.fee, sqrtPriceLimitX96: 0 });
      const referenceOut = BigInt(reference.amountOut ?? reference[0]);
      const currentRateNumerator = best.amountOut * referenceAmount, referenceRateNumerator = referenceOut * BigInt(amount);
      priceImpactBps = referenceRateNumerator > 0n ? Math.max(0, Number(((referenceRateNumerator - currentRateNumerator) * 10000n) / referenceRateNumerator)) : null;
      if (priceImpactBps != null && priceImpactBps > 100) throw new Error("Direct pool quote implies more than 1% price impact; no swap was staged");
    } catch (error) { if (/more than 1%/.test(error.message)) throw error; throw new Error("Could not complete the direct pool price-impact check; no swap was staged"); }
  }
  const estimatedBuyAmount = best.amountOut, minimumBuyAmount = estimatedBuyAmount * BigInt(10000 - slippageBps) / 10000n;
  if (minimumBuyAmount <= 0n) throw new Error("Minimum output rounded to zero; no trade was staged");
  const router = ethers.getAddress(deployments.router), routerInterface = new ethers.Interface(V3_ROUTER_ABI), deadline = Math.floor(Date.now() / 1000) + 60;
  const swapRecipient = nativeOutput ? router : c.address;
  const swapCall = routerInterface.encodeFunctionData("exactInputSingle", [{ tokenIn: poolTokenIn, tokenOut: poolTokenOut, fee: best.fee, recipient: swapRecipient, amountIn: BigInt(amount), amountOutMinimum: minimumBuyAmount, sqrtPriceLimitX96: 0 }]);
  const calls = [swapCall];
  if (nativeOutput) calls.push(routerInterface.encodeFunctionData("unwrapWETH9", [minimumBuyAmount, c.address]));
  const callData = routerInterface.encodeFunctionData("multicall(uint256,bytes[])", [deadline, calls]);
  const txValue = nativeInput ? BigInt(amount) : 0n, nativeBalance = await provider.getBalance(c.address);
  const feeCosts = [{ name: "Uniswap V3 pool fee", amount: String(best.fee / 10000) + "%", token: "sell asset", amountUsd: null }], gasCosts = [];
  const base = { chain, network: c.network, networkId: c.networkId, chainId: String(net.chainId), from: c.address, sellToken, buyToken, amount, sellAmountFormatted: ethers.formatUnits(amount, fromDecimals), slippageBps, priceImpactBps, poolFee: best.fee, route: "Uniswap V3 · direct pool · " + (best.fee / 10000) + "% pool fee", sellAsset: { symbol: String(sellInfo.symbol || (nativeInput ? "ETH" : "token")).slice(0, 32), name: String(sellInfo.name || "").slice(0, 80), decimals: fromDecimals }, buyAsset: { symbol: String(buyInfo.symbol || (nativeOutput ? "ETH" : "token")).slice(0, 32), name: String(buyInfo.name || "").slice(0, 80), decimals: toDecimals }, estimatedBuyAmount: estimatedBuyAmount.toString(), estimatedBuyAmountFormatted: ethers.formatUnits(estimatedBuyAmount, toDecimals), minimumBuyAmount: minimumBuyAmount.toString(), minimumBuyAmountFormatted: ethers.formatUnits(minimumBuyAmount, toDecimals), approvalSpender: nativeInput ? null : router, feeCosts, gasCosts, transactionTarget: router, transactionValueWei: txValue.toString(), transactionDataBytes: (callData.length - 2) / 2, transactionDataSha256: crypto.createHash("sha256").update(callData).digest("hex"), quoteFetchedAt: new Date().toISOString(), research: { fetchedAt: new Date().toISOString(), source: "Configured RPC · Uniswap V3 factory, pools and QuoterV2", sellToken: { address: sellToken, name: sellInfo.name || "Ether", symbol: sellInfo.symbol || "ETH", decimals: fromDecimals, walletBalance: nativeInput ? ethers.formatEther(nativeBalance) : sellInfo.walletBalance }, buyToken: { address: buyToken, name: buyInfo.name || "Ether", symbol: buyInfo.symbol || "ETH", decimals: toDecimals }, pools: pools.map(pool => ({ address: pool.poolAddress, fee: pool.fee, liquidity: pool.liquidity, quotedOutput: pool.amountOut.toString(), gasEstimate: pool.gasEstimate })) } };
  if (!nativeInput) {
    const token = new ethers.Contract(sellToken, ["function allowance(address owner,address spender) view returns (uint256)", "function approve(address spender,uint256 amount) returns (bool)"], provider), allowance = await token.allowance(c.address, router);
    if (allowance < BigInt(amount)) {
      const approvalData = new ethers.Interface(["function approve(address spender,uint256 amount) returns (bool)"]).encodeFunctionData("approve", [router, amount]), approvalTx = { from: c.address, to: sellToken, data: approvalData, value: 0n };
      await provider.call(approvalTx);
      const gasLimit = await provider.estimateGas(approvalTx), feeData = await provider.getFeeData(), maxFee = feeData.maxFeePerGas || feeData.gasPrice;
      if (!maxFee) throw new Error("Live network fee unavailable; no approval was staged");
      const approvalGasLimit = gasLimit * 120n / 100n, feeCap = approvalGasLimit * maxFee;
      if (nativeBalance < feeCap) throw new Error("Native balance may not cover the approval gas fee; no approval was staged");
      const expiresAt = Date.now() + SWAP_DRAFT_TTL_MS, tokenId = crypto.randomBytes(24).toString("hex"), approval = { kind: "swap_approval", ...base, approvalAmount: amount, approvalAmountFormatted: ethers.formatUnits(amount, fromDecimals), approvalData, gasLimit: approvalGasLimit.toString(), maxFeePerGasWei: maxFee.toString(), maxPriorityFeePerGasWei: feeData.maxPriorityFeePerGas?.toString() || null, estimatedFeeWei: feeCap.toString(), estimatedFeeNative: ethers.formatEther(feeCap), signing: false, executable: true, note: "This card approves only the exact amount shown for the pinned Uniswap router. Accepting sends the approval only; no swap happens. Request a fresh quote after approval and confirm the swap on its own card." };
      pending.set(tokenId, { token: tokenId, type: "approval", input: { chain, network: c.network }, prepared: approval, expiresAt });
      return { token: tokenId, expiresAt, ...approval };
    }
  }
  const tx = { from: c.address, to: router, data: callData, value: txValue }, gasLimit = await provider.estimateGas(tx), feeData = await provider.getFeeData(), maxFee = feeData.maxFeePerGas || feeData.gasPrice;
  if (!maxFee) throw new Error("Live network fee unavailable; no swap was staged");
  const swapGasLimit = gasLimit * 120n / 100n, feeCap = swapGasLimit * maxFee;
  if (nativeBalance < txValue + feeCap) throw new Error("Native balance may not cover the swap value plus maximum network fee; no trade was staged");
  await provider.call(tx);
  const expiresAt = Date.now() + SWAP_DRAFT_TTL_MS, tokenId = crypto.randomBytes(24).toString("hex"), swap = { kind: "swap", ...base, transactionValueWei: txValue.toString(), gasLimit: swapGasLimit.toString(), maxFeePerGasWei: maxFee.toString(), maxPriorityFeePerGasWei: feeData.maxPriorityFeePerGas?.toString() || null, estimatedFeeWei: feeCap.toString(), estimatedFeeNative: ethers.formatEther(feeCap), signing: false, executable: true, confirmationRequired: true, deadline, note: "Quoted directly from Uniswap V3 pools using your configured RPC; no hosted swap API or aggregator was used. This is a spot swap, not a profit prediction. Accept & swap broadcasts only this reviewed, expiring route. Sonderr will not automate follow-up trades." };
  pending.set(tokenId, { token: tokenId, type: "swap", input: { chain, network: c.network }, prepared: swap, transaction: { to: router, data: callData, value: txValue.toString() }, expiresAt });
  return { token: tokenId, expiresAt, ...swap };
}

async function confirmSwap(token) {
  const item = pending.get(String(token || ""));
  if (!item || !["swap", "approval"].includes(item.type)) throw new Error("Swap confirmation expired or was already used");
  pending.delete(item.token);
  if (item.expiresAt < Date.now()) throw new Error("Swap quote expired; research and request a fresh quote");
  const c = config("evm", item.input.network), prepared = item.prepared, privateKey = secrets.get(PRIVATE_KEY_ENV);
  if (!privateKey) throw new Error("No protected EVM signing secret is configured");
  const provider = await evmProvider(c), network = await provider.getNetwork();
  if (String(network.chainId) !== String(prepared.chainId)) throw new Error("Network changed since review; nothing was signed");
  const signer = new ethers.Wallet(privateKey, provider);
  if (signer.address.toLowerCase() !== String(prepared.from).toLowerCase()) throw new Error("Local wallet key does not match the reviewed address; nothing was signed");
  let tx;
  if (item.type === "approval") {
    tx = { from: c.address, to: prepared.sellToken, data: prepared.approvalData, value: 0n };
    const iface = new ethers.Interface(["function approve(address spender,uint256 amount) returns (bool)"]);
    const [spender, amount] = iface.decodeFunctionData("approve", tx.data);
    if (ethers.getAddress(spender) !== ethers.getAddress(prepared.approvalSpender) || BigInt(amount) !== BigInt(prepared.approvalAmount)) throw new Error("Approval payload does not match its review card; nothing was signed");
  } else {
    if (Date.now() - Date.parse(prepared.quoteFetchedAt) > SWAP_DRAFT_TTL_MS) throw new Error("Swap quote expired; nothing was signed");
    if (Date.now() / 1000 >= Number(prepared.deadline)) throw new Error("Swap call deadline passed; request a fresh quote");
    const deployments = UNISWAP_V3[String(prepared.chainId)], router = ethers.getAddress(deployments.router), routerInterface = new ethers.Interface(V3_ROUTER_ABI), txData = item.transaction.data;
    if (ethers.getAddress(item.transaction.to) !== router || !isSupportedSwapRouter(prepared.chainId, item.transaction.to)) throw new Error("Swap target is not the pinned on-chain DEX router; nothing was signed");
    const [encodedDeadline, calls] = routerInterface.decodeFunctionData("multicall(uint256,bytes[])", txData);
    const nativeInput = prepared.sellToken === ethers.ZeroAddress, nativeOutput = prepared.buyToken === ethers.ZeroAddress, expectedTokenIn = nativeInput ? deployments.wrappedNative : prepared.sellToken, expectedTokenOut = nativeOutput ? deployments.wrappedNative : prepared.buyToken;
    if (Number(encodedDeadline) !== Number(prepared.deadline) || calls.length !== (nativeOutput ? 2 : 1)) throw new Error("Swap call structure differs from the review card; nothing was signed");
    const [params] = routerInterface.decodeFunctionData("exactInputSingle", calls[0]);
    const expectedRecipient = nativeOutput ? router : c.address;
    if (ethers.getAddress(params.tokenIn) !== ethers.getAddress(expectedTokenIn) || ethers.getAddress(params.tokenOut) !== ethers.getAddress(expectedTokenOut) || Number(params.fee) !== Number(prepared.poolFee) || ethers.getAddress(params.recipient) !== ethers.getAddress(expectedRecipient) || BigInt(params.amountIn) !== BigInt(prepared.amount) || BigInt(params.amountOutMinimum) !== BigInt(prepared.minimumBuyAmount) || BigInt(params.sqrtPriceLimitX96) !== 0n) throw new Error("Swap token, amount, fee tier, recipient, or minimum output differs from the review; nothing was signed");
    if (nativeOutput) {
      const [unwrapMin, unwrapTo] = routerInterface.decodeFunctionData("unwrapWETH9", calls[1]);
      if (BigInt(unwrapMin) !== BigInt(prepared.minimumBuyAmount) || ethers.getAddress(unwrapTo) !== c.address) throw new Error("Native output recipient or minimum differs from the review; nothing was signed");
    }
    if (!nativeInput) {
      const allowance = await new ethers.Contract(prepared.sellToken, ["function allowance(address owner,address spender) view returns (uint256)"], provider).allowance(c.address, router);
      if (allowance < BigInt(prepared.amount)) throw new Error("Token approval is no longer sufficient; nothing was signed");
    }
    tx = { to: item.transaction.to, data: item.transaction.data, value: BigInt(item.transaction.value), from: c.address };
  }
  await provider.call(tx);
  const liveGas = await provider.estimateGas(tx), feeData = await provider.getFeeData(), liveFee = feeData.maxFeePerGas || feeData.gasPrice;
  if (!liveFee || liveFee > BigInt(prepared.maxFeePerGasWei) || liveGas * liveFee > BigInt(prepared.estimatedFeeWei)) throw new Error("Current estimated network fee exceeds the amount shown on the card; prepare a fresh review");
  const nativeBalance = await provider.getBalance(c.address), requiredNative = (tx.value || 0n) + BigInt(prepared.estimatedFeeWei);
  if (nativeBalance < requiredNative) throw new Error("Current native balance no longer covers this action and its reviewed fee cap; nothing was signed");
  if (item.type === "swap" && prepared.sellToken !== ethers.ZeroAddress) {
    const sellBalance = await new ethers.Contract(prepared.sellToken, ["function balanceOf(address owner) view returns (uint256)"], provider).balanceOf(c.address);
    if (sellBalance < BigInt(prepared.amount)) throw new Error("Current token balance no longer covers the reviewed sell amount; nothing was signed");
  }
  const sent = await signer.sendTransaction({ to: tx.to, data: tx.data, value: tx.value, gasLimit: BigInt(prepared.gasLimit), maxFeePerGas: BigInt(prepared.maxFeePerGasWei), ...(prepared.maxPriorityFeePerGasWei ? { maxPriorityFeePerGas: BigInt(prepared.maxPriorityFeePerGasWei) } : {}) });
  return { accepted: true, provider: "evm", transactionHash: sent.hash, network: c.network, chainId: prepared.chainId, action: item.type === "approval" ? "approval" : "swap", status: "broadcast" };
}

module.exports = { PRIVATE_KEY_ENV, SEED_ENV, SOLANA_SECRET_ENV, saveConfig, publicConfig, networkCatalog, inferNetworkFromText, resolveExplicitToolNetwork, setNetwork, builtInNetwork, isSupportedSwapRouter, createWallet, exportBackup, status, balanceSnapshot, latestPrice, marketSnapshot, tokenAllowance, portfolio, tokenInfo, activity, prepareTransaction, confirmTransaction, declineTransaction, prepareSwap, confirmSwap, keccak256 };
