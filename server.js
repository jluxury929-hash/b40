/**
 * ===============================================================================
 * APEX PREDATOR v207.3 - FINAL RECONCILIATION
 * ===============================================================================
 */

require('dotenv').config();
const fs = require('fs');
const http = require('http');

// --- 1. GLOBAL SCOPE INITIALIZATION ---
try {
    global.colors = require('colors');
    global.ethers = require('ethers');
    global.colors.enable();
} catch (e) {
    console.log("CRITICAL: Modules missing. Run 'npm install ethers colors dotenv'");
    process.exit(1);
}

const { ethers, getAddress, isAddress } = global.ethers;
const colors = global.colors;

// Hard-capture env variables to prevent ReferenceErrors
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const EXECUTOR_ADDRESS = process.env.EXECUTOR_ADDRESS;

// --- 2. CONFIGURATION ---
const POOL_MAP = {
    ETHEREUM: ["0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"],
    BASE: ["0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24", "0x25d887Ce7a35172C62FeBFD67a1856F20FaEbb00"]
};

const NETWORKS = {
    ETHEREUM: { chainId: 1, rpcs: [process.env.ETH_RPC, "https://eth.llamarpc.com"].filter(Boolean), multicall: "0xcA11bde05977b3631167028862bE2a173976CA11", moat: "0.01" },
    BASE: { chainId: 8453, rpcs: [process.env.BASE_RPC, "https://mainnet.base.org"].filter(Boolean), multicall: "0xcA11bde05977b3631167028862bE2a173976CA11", moat: "0.005" }
};

// ==========================================
// 3. OMNI GOVERNOR CORE
// ==========================================
class ApexOmniGovernor {
    constructor() {
        this.providers = {};
        this.wallets = {};
        this.rpcIndex = { ETHEREUM: 0, BASE: 0 };
        this.isRotating = { ETHEREUM: false, BASE: false };
        
        // ABI definitions
        this.multiAbi = ["function aggregate(tuple(address target, bytes callData)[] calls) view returns (uint256 blockNumber, bytes[] returnData)"];
        this.pairAbi = ["function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)"];

        for (const name of Object.keys(NETWORKS)) {
            this.rotateProvider(name);
        }
    }

    rotateProvider(name) {
        if (this.isRotating[name]) return;
        this.isRotating[name] = true;

        const config = NETWORKS[name];
        const url = config.rpcs[this.rpcIndex[name] % config.rpcs.length];
        
        try {
            this.providers[name] = new ethers.JsonRpcProvider(url, config.chainId, { staticNetwork: true });
            if (PRIVATE_KEY) {
                this.wallets[name] = new ethers.Wallet(PRIVATE_KEY, this.providers[name]);
            }
            console.log(colors.green(`[RPC] ${name} connected: ${url.split('/')[2]}`));
        } catch (e) {
            console.log(colors.red(`[RPC] ${name} Init Error: ${e.message}`));
        } finally {
            this.isRotating[name] = false;
        }
    }

    async scan(name) {
        if (this.isRotating[name]) return;
        const config = NETWORKS[name];
        const pools = POOL_MAP[name];

        try {
            const multi = new ethers.Contract(config.multicall, this.multiAbi, this.providers[name]);
            const itf = new ethers.Interface(this.pairAbi);
            const calls = pools.map(addr => ({ target: getAddress(addr), callData: itf.encodeFunctionData("getReserves") }));

            const [, returnData] = await multi.aggregate(calls);
            console.log(colors.gray(`[${name}] Market Snapshot OK (${returnData.length} pools).`));
        } catch (e) {
            this.rpcIndex[name]++;
            this.rotateProvider(name);
        }
    }

    // MANDATORY: The 'run' method must be defined as an async function inside the class
    async run() {
        console.log(colors.bold(colors.yellow("\n╔════════════════════════════════════════════════════════╗")));
        console.log(colors.bold(colors.yellow("║   ⚡ APEX TITAN v207.3 | TOTAL RECONCILIATION      ║")));
        console.log(colors.bold(colors.yellow("╚════════════════════════════════════════════════════════╝\n")));

        if (!PRIVATE_KEY || !EXECUTOR_ADDRESS) {
            console.error(colors.red("[FATAL] Environment Variables missing. Check .env"));
            return;
        }

        while (true) {
            for (const name of Object.keys(NETWORKS)) {
                await this.scan(name);
            }
            await new Promise(r => setTimeout(r, 5000));
        }
    }
}

// --- 4. IGNITION ---
const governor = new ApexOmniGovernor();

// Start the health server
http.createServer((req, res) => {
    res.writeHead(200);
    res.end(JSON.stringify({ status: "FINALITY_ACTIVE" }));
}).listen(process.env.PORT || 8080);

// Call the run function
governor.run().catch(e => {
    console.error(colors.red(`[FATAL] Loop Crash: ${e.message}`));
    process.exit(1);
});
