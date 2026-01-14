/**
 * ===============================================================================
 * APEX PREDATOR v207.2 - ROTATION SHIELD & COOL-DOWN
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

// --- CONFIGURATION ---
const EXECUTOR_ADDRESS = process.env.EXECUTOR_ADDRESS;
const POOL_MAP = {
    ETHEREUM: ["0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"],
    BASE: ["0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24", "0x25d887Ce7a35172C62FeBFD67a1856F20FaEbb00"]
};

const NETWORKS = {
    ETHEREUM: { chainId: 1, rpcs: [process.env.ETH_RPC, "https://eth.llamarpc.com", "https://rpc.ankr.com/eth"].filter(Boolean), multicall: "0xcA11bde05977b3631167028862bE2a173976CA11", moat: "0.01" },
    BASE: { chainId: 8453, rpcs: [process.env.BASE_RPC, "https://mainnet.base.org", "https://base.llamarpc.com"].filter(Boolean), multicall: "0xcA11bde05977b3631167028862bE2a173976CA11", moat: "0.005" }
};

class ApexOmniGovernor {
    constructor() {
        this.providers = {}; this.wallets = {}; this.rpcIndex = { ETHEREUM: 0, BASE: 0 };
        this.isRotating = { ETHEREUM: false, BASE: false };
        this.multiAbi = ["function aggregate(tuple(address target, bytes callData)[] calls) view returns (uint256 blockNumber, bytes[] returnData)"];
        this.pairAbi = ["function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)"];
        this.execAbi = ["function executeTriangle(address router, address tokenA, address tokenB, uint256 amountIn) external payable"];
        
        for (const name of Object.keys(NETWORKS)) this.rotateProvider(name);
    }

    async rotateProvider(name) {
        if (this.isRotating[name]) return;
        this.isRotating[name] = true;

        const config = NETWORKS[name];
        const url = config.rpcs[this.rpcIndex[name] % config.rpcs.length];
        
        console.log(colors.yellow(`[RPC] ${name} rotating to: ${url.split('/')[2]}`));
        
        try {
            this.providers[name] = new ethers.JsonRpcProvider(url, config.chainId, { staticNetwork: true });
            if (process.env.PRIVATE_KEY) this.wallets[name] = new ethers.Wallet(PRIVATE_KEY, this.providers[name]);
            
            // Wait 2 seconds for connection to stabilize before next scan
            await new Promise(r => setTimeout(r, 2000));
        } finally {
            this.isRotating[name] = false;
        }
    }

    async scan(name) {
        if (this.isRotating[name]) return;

        const config = NETWORKS[name];
        const pools = POOL_MAP[name];
        
        try {
            const provider = this.providers[name];
            const multi = new ethers.Contract(config.multicall, this.multiAbi, provider);
            const itf = new ethers.Interface(this.pairAbi);
            const calls = pools.map(addr => ({ target: getAddress(addr), callData: itf.encodeFunctionData("getReserves") }));

            // Race the RPC call with a 3s timeout to detect instability early
            const multicallPromise = multi.aggregate(calls);
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("RPC_TIMEOUT")), 3000));

            const [, returnData] = await Promise.race([multicallPromise, timeoutPromise]);
            
            console.log(colors.gray(`[${name}] Pulse Check: ${returnData.length} Pools Sync.`));
            // Strike logic remains here...
            
        } catch (e) {
            console.log(colors.red(`[${name}] Network Error: ${e.message.slice(0, 30)}`));
            this.rpcIndex[name]++;
            await this.rotateProvider(name);
        }
    }

    async run() {
        console.log(colors.bold(colors.yellow("\n⚡ APEX TITAN v207.2 | ROTATION SHIELD ACTIVE\n")));
        while (true) {
            for (const net of Object.keys(NETWORKS)) await this.scan(net);
            // Increased global loop delay to 5 seconds to prevent rate-limit exhaustion
            await new Promise(r => setTimeout(r, 5000));
        }
    }
}

const governor = new ApexOmniGovernor();
governor.run();
