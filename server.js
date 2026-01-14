/**
 * ===============================================================================
 * APEX PREDATOR v207.5 - CASCADE PROTECTION & VALIDATION
 * ===============================================================================
 */

require('dotenv').config();
const fs = require('fs');
const http = require('http');

try {
    global.colors = require('colors');
    global.ethers = require('ethers');
    global.colors.enable();
} catch (e) { process.exit(1); }

const { ethers, getAddress, isAddress } = global.ethers;
const colors = global.colors;

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const EXECUTOR_ADDRESS = process.env.EXECUTOR_ADDRESS;

// --- 1. VALIDATED POOL MAPPING ---
// DO NOT USE PLACEHOLDERS. Use real V2 Pair addresses.
const POOL_MAP = {
    ETHEREUM: [
        "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", 
        "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
    ],
    BASE: [
        "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
        "0x25d887Ce7a35172C62FeBFD67a1856F20FaEbb00"
    ]
};

const NETWORKS = {
    ETHEREUM: { chainId: 1, rpcs: [process.env.ETH_RPC, "https://eth.llamarpc.com"].filter(Boolean), multicall: "0xcA11bde05977b3631167028862bE2a173976CA11", moat: "0.01", priority: "500.0" },
    BASE: { chainId: 8453, rpcs: [process.env.BASE_RPC, "https://mainnet.base.org"].filter(Boolean), multicall: "0xcA11bde05977b3631167028862bE2a173976CA11", moat: "0.005", priority: "1.6" }
};

class ApexOmniGovernor {
    constructor() {
        this.providers = {};
        this.wallets = {};
        this.rpcIndex = { ETHEREUM: 0, BASE: 0 };
        this.isCoolingDown = { ETHEREUM: false, BASE: false };
        
        this.multiAbi = ["function aggregate(tuple(address target, bytes callData)[] calls) view returns (uint256 blockNumber, bytes[] returnData)"];
        this.pairAbi = ["function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)"];

        for (const name of Object.keys(NETWORKS)) this.rotateProvider(name);
    }

    async rotateProvider(name) {
        if (this.isCoolingDown[name]) return;
        this.isCoolingDown[name] = true;

        const config = NETWORKS[name];
        const url = config.rpcs[this.rpcIndex[name] % config.rpcs.length];
        
        try {
            this.providers[name] = new ethers.JsonRpcProvider(url, config.chainId, { staticNetwork: true });
            if (PRIVATE_KEY) this.wallets[name] = new ethers.Wallet(PRIVATE_KEY, this.providers[name]);
            console.log(colors.green(`[RPC] ${name} -> ${url.split('/')[2]}`));
            
            // Mandatory 5s wait after rotation to prevent spamming new provider
            await new Promise(r => setTimeout(r, 5000));
        } finally {
            this.isCoolingDown[name] = false;
        }
    }

    async scanAndStrike(name) {
        if (this.isCoolingDown[name]) return;
        
        const config = NETWORKS[name];
        const pools = (POOL_MAP[name] || []).filter(addr => isAddress(addr));

        if (pools.length === 0) {
            console.log(colors.red(`[${name}] No valid pools. Skipping.`));
            return;
        }

        try {
            const multi = new ethers.Contract(config.multicall, this.multiAbi, this.providers[name]);
            const itf = new ethers.Interface(this.pairAbi);
            const calls = pools.map(addr => ({ target: getAddress(addr), callData: itf.encodeFunctionData("getReserves") }));

            // Race the call to prevent hanging the whole engine
            const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("RPC_TIMEOUT")), 4000));
            const [, returnData] = await Promise.race([multi.aggregate(calls), timeout]);

            console.log(colors.gray(`[${name}] Market Pulse: ${returnData.length} Pools Synchronized.`));

        } catch (e) {
            console.log(colors.yellow(`[${name}] Exception: ${e.message.slice(0, 40)}`));
            
            // Only rotate if it's a timeout or rate limit, not a logical error
            if (e.message.includes("TIMEOUT") || e.message.includes("429")) {
                this.rpcIndex[name]++;
                await this.rotateProvider(name);
            }
        }
    }

    async run() {
        console.log(colors.bold(colors.yellow("\n⚡ APEX TITAN v207.5 | CASCADE PROTECTION ACTIVE\n")));

        while (true) {
            const tasks = Object.keys(NETWORKS).map(name => this.scanAndStrike(name));
            await Promise.allSettled(tasks);
            // Global Loop Cool-down (5 seconds)
            await new Promise(r => setTimeout(r, 5000));
        }
    }
}

// --- Ignition ---
const governor = new ApexOmniGovernor();
governor.run();
