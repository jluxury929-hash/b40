/**
 * ===============================================================================
 * APEX PREDATOR v207.6 - RESILIENT AGGREGATE (NON-BLOCKING SCAN)
 * ===============================================================================
 */

require('dotenv').config();
const http = require('http');

try {
    global.colors = require('colors');
    global.ethers = require('ethers');
    global.colors.enable();
} catch (e) { process.exit(1); }

const { ethers, getAddress, isAddress } = global.ethers;
const colors = global.colors;

const PRIVATE_KEY = process.env.PRIVATE_KEY;

// --- 1. REFINED POOL MAP (Verified Addresses) ---
const POOL_MAP = {
    ETHEREUM: [
        "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", // WETH/DAI
        "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"  // WETH/USDC
    ],
    BASE: [
        "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24", // WETH/USDC
        "0xc96F9866576839350630799784e889F999819669"  // WETH/DAI
    ]
};

const NETWORKS = {
    ETHEREUM: { chainId: 1, rpcs: [process.env.ETH_RPC, "https://eth.llamarpc.com"].filter(Boolean), multicall: "0xcA11bde05977b3631167028862bE2a173976CA11" },
    BASE: { chainId: 8453, rpcs: [process.env.BASE_RPC, "https://mainnet.base.org"].filter(Boolean), multicall: "0xcA11bde05977b3631167028862bE2a173976CA11" }
};

class ApexOmniGovernor {
    constructor() {
        this.providers = {};
        this.rpcIndex = { ETHEREUM: 0, BASE: 0 };
        // NEW ABI: Using 'tryAggregate' which doesn't revert if one call fails
        this.multiAbi = [
            "function tryAggregate(bool requireSuccess, tuple(address target, bytes callData)[] calls) public view returns (tuple(bool success, bytes returnData)[] returnData)"
        ];
        this.pairAbi = ["function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)"];

        for (const name of Object.keys(NETWORKS)) this.rotateProvider(name);
    }

    async rotateProvider(name) {
        const config = NETWORKS[name];
        const url = config.rpcs[this.rpcIndex[name] % config.rpcs.length];
        try {
            this.providers[name] = new ethers.JsonRpcProvider(url, config.chainId, { staticNetwork: true });
            console.log(colors.green(`[RPC] ${name} -> ${url.split('/')[2]}`));
        } catch (e) { console.log(colors.red(`[RPC] ${name} Error`)); }
    }

    async scan(name) {
        const config = NETWORKS[name];
        const poolAddrs = (POOL_MAP[name] || []).filter(isAddress);
        if (poolAddrs.length === 0) return;

        try {
            const multi = new ethers.Contract(config.multicall, this.multiAbi, this.providers[name]);
            const itf = new ethers.Interface(this.pairAbi);
            const calls = poolAddrs.map(addr => ({ target: getAddress(addr), callData: itf.encodeFunctionData("getReserves") }));

            // tryAggregate(false, ...) means "don't crash if one pool is missing"
            const results = await multi.tryAggregate(false, calls);

            const validReserves = results
                .filter(res => res.success && res.returnData !== "0x")
                .map(res => itf.decodeFunctionResult("getReserves", res.returnData));

            console.log(colors.cyan(`[${name}] Sync Success: ${validReserves.length}/${poolAddrs.length} pools alive.`));
            
        } catch (e) {
            // If we get a 404 or Timeout, it's an RPC issue. Rotate.
            if (e.message.includes("404") || e.message.includes("TIMEOUT")) {
                console.log(colors.yellow(`[${name}] RPC Endpoint Invalid (404/Timeout). Rotating...`));
                this.rpcIndex[name]++;
                this.rotateProvider(name);
            } else {
                console.log(colors.gray(`[${name}] Skip: ${e.message.slice(0, 35)}`));
            }
        }
    }

    async run() {
        console.log(colors.bold(colors.yellow("\n⚡ APEX TITAN v207.6 | TRY-AGGREGATE ACTIVE\n")));
        while (true) {
            for (const name of Object.keys(NETWORKS)) await this.scan(name);
            await new Promise(r => setTimeout(r, 5000));
        }
    }
}

const governor = new ApexOmniGovernor();
governor.run();
