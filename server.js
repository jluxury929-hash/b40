/**
 * ===============================================================================
 * APEX PREDATOR v206.5 (JS-UNIFIED - STABILIZED FINALITY)
 * ===============================================================================
 * FIXES: 
 * 1. 429 ERRORS: Added request throttling & Infura back-off logic.
 * 2. UNDEFINED LOGS: Hardened .env loading sequence.
 * 3. COLORS: Functional API for container compatibility.
 * 4. MULTICALL: Atomic reserve snapshots for cyclic paths.
 * ===============================================================================
 */

// 1. IMMEDIATE BOOT (Ensure Env is first)
require('dotenv').config();
const { ethers } = require('ethers');
const http = require('http');
const colors = require('colors');

// Force-enable colors for container logs
colors.enable();

// --- CONFIGURATION VALIDATION ---
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const EXECUTOR = process.env.EXECUTOR_ADDRESS;

if (!PRIVATE_KEY || !EXECUTOR) {
    console.log(colors.red("[CRITICAL] .env variables missing. Process Halted."));
    process.exit(1);
}

// ==========================================
// 2. INFRASTRUCTURE & MULTICALL CONFIG
// ==========================================
const NETWORKS = {
    ETHEREUM: { 
        chainId: 1, 
        rpc: process.env.ETH_RPC || "https://eth.llamarpc.com", 
        multicall: "0xcA11bde05977b3631167028862bE2a173976CA11", 
        moat: "0.01",
        router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
    },
    BASE: { 
        chainId: 8453, 
        rpc: process.env.BASE_RPC || "https://mainnet.base.org", 
        multicall: "0xcA11bde05977b3631167028862bE2a173976CA11", 
        moat: "0.005",
        router: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24"
    }
};

// ==========================================
// 3. CORE ENGINE
// ==========================================
class ApexOmniGovernor {
    constructor() {
        this.providers = {};
        this.wallets = {};
        this.lastCall = 0;
        
        // ABI definitions for Multicall and Uniswap V2 Pairs
        this.multiAbi = ["function aggregate(tuple(address target, bytes callData)[] calls) view returns (uint256 blockNumber, bytes[] returnData)"];
        this.pairAbi = ["function getReserves() external view returns (uint112, uint112, uint32)"];

        for (const [name, config] of Object.entries(NETWORKS)) {
            try {
                const provider = new ethers.JsonRpcProvider(config.rpc, config.chainId, { staticNetwork: true });
                this.providers[name] = provider;
                this.wallets[name] = new ethers.Wallet(PRIVATE_KEY, provider);
                console.log(colors.green(`[INIT] ${name} Provider Online.`));
            } catch (e) {
                console.log(colors.red(`[INIT] ${name} Fail: ${e.message}`));
            }
        }
    }

    /**
     * RATE-LIMIT SHIELD
     * Prevents Infura/Alchemy "Too Many Requests" (429) errors.
     */
    async shield() {
        const now = Date.now();
        if (now - this.lastCall < 350) { // 350ms delay between RPC clusters
            await new Promise(r => setTimeout(r, 350));
        }
        this.lastCall = Date.now();
    }

    /**
     * CYCLIC MATH: 0.3% Fee Per Hop
     */
    calculateProfit(amountIn, reserves) {
        let current = amountIn;
        for (const res of reserves) {
            const [resIn, resOut] = [BigInt(res[0]), BigInt(res[1])];
            const amountInWithFee = current * 997n;
            const numerator = amountInWithFee * resOut;
            const denominator = (resIn * 1000n) + amountInWithFee;
            current = numerator / denominator;
        }
        return current - amountIn;
    }

    async scan(networkName, poolAddresses) {
        const config = NETWORKS[networkName];
        const provider = this.providers[networkName];
        const wallet = this.wallets[networkName];
        
        try {
            await this.shield();
            
            // 1. Multicall Snapshot
            const multi = new ethers.Contract(config.multicall, this.multiAbi, provider);
            const itf = new ethers.Interface(this.pairAbi);
            
            const calls = poolAddresses.map(addr => ({
                target: addr,
                callData: itf.encodeFunctionData("getReserves")
            }));

            const [balance, [, returnData]] = await Promise.all([
                provider.getBalance(wallet.address),
                multi.aggregate(calls)
            ]);

            const reserves = returnData.map(d => itf.decodeFunctionResult("getReserves", d));
            const tradeAmount = balance - ethers.parseEther(config.moat);

            if (tradeAmount > 0n) {
                const netProfit = this.calculateProfit(tradeAmount, reserves);
                if (netProfit > 0n) {
                    console.log(colors.gold(`[${networkName}] ARB DETECTED: +${ethers.formatEther(netProfit)} ETH`));
                    // Strike logic would trigger here
                }
            }
        } catch (e) {
            if (e.message.includes("429")) {
                console.log(colors.yellow(`[${networkName}] Throttled. Increasing back-off...`));
                await new Promise(r => setTimeout(r, 2000));
            } else {
                console.log(colors.gray(`[${networkName}] Idle: ${e.code || "Network Sync"}`));
            }
        }
    }

    async run() {
        console.log(colors.bold(colors.yellow("\n╔════════════════════════════════════════════════════════╗")));
        console.log(colors.bold(colors.yellow("║    ⚡ APEX TITAN v206.5 | MULTICALL STABILITY ACTIVE  ║")));
        console.log(colors.bold(colors.yellow("╚════════════════════════════════════════════════════════╝\n")));

        const targetPools = [
            "0xPoolAddress_1", 
            "0xPoolAddress_2", 
            "0xPoolAddress_3"
        ];

        while (true) {
            for (const name of Object.keys(NETWORKS)) {
                await this.scan(name, targetPools);
            }
            await new Promise(r => setTimeout(r, 3000)); // Standard loop delay
        }
    }
}

// --- 4. HEALTH MONITOR ---
const runHealthServer = () => {
    http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: "OPERATIONAL", timestamp: Date.now() }));
    }).listen(process.env.PORT || 8080);
};

// --- 5. IGNITION ---
runHealthServer();
const governor = new ApexOmniGovernor();
governor.run().catch(err => {
    console.error(colors.red("FATAL CRASH:"), err);
    process.exit(1);
});
