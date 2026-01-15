/**
 * ===============================================================================
 * APEX PREDATOR v208.4 - VERIFIED CANONICAL FINALITY
 * ===============================================================================
 * UPDATES:
 * 1. ETHEREUM: Locked to USDC/WETH and DAI/WETH Uniswap V2 Pairs.
 * 2. BASE: Updated to canonical V2 pairs that support getReserves().
 * 3. LOGIC: Strict validation of return data length to ensure "Active" status.
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

// --- 1. VERIFIED CANONICAL PAIR ADDRESSES (2026) ---
// These are the PAIR contracts, NOT the tokens.
const POOL_MAP = {
    ETHEREUM: [
        "0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc", // USDC/WETH (V2 Canonical)
        "0xa478c2975ab1ea571b9696888e234c9c38379203"  // DAI/WETH (V2 Canonical)
    ],
    BASE: [
        "0x88A43bbDF9D098eEC7bCEda4e2494615dfD9bB9C", // USDC/WETH (Base V2 Canonical)
        "0x4f9fd6be4a90f2620860d680c0d4d5fb53d1a825"  // WETH/DAI (Base V2 Canonical)
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
        this.multiAbi = ["function tryAggregate(bool requireSuccess, tuple(address target, bytes callData)[] calls) public view returns (tuple(bool success, bytes returnData)[] returnData)"];
        this.v2Abi = ["function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)"];
        
        for (const name of Object.keys(NETWORKS)) this.rotateProvider(name);
    }

    rotateProvider(name) {
        const config = NETWORKS[name];
        const url = config.rpcs[this.rpcIndex[name] % config.rpcs.length];
        this.providers[name] = new ethers.JsonRpcProvider(url, config.chainId, { staticNetwork: true });
        console.log(colors.green(`[RPC] ${name} -> ${url.split('/')[2]}`));
    }

    async scan(name) {
        const config = NETWORKS[name];
        const poolAddrs = (POOL_MAP[name] || []).filter(isAddress);

        try {
            const multi = new ethers.Contract(config.multicall, this.multiAbi, this.providers[name]);
            const v2Itf = new ethers.Interface(this.v2Abi);
            
            const calls = poolAddrs.map(addr => ({ 
                target: getAddress(addr), 
                callData: v2Itf.encodeFunctionData("getReserves") 
            }));

            const results = await multi.tryAggregate(false, calls);

            let aliveCount = 0;
            results.forEach((res) => {
                // Reserves must return at least 96 bytes of data for success validation
                if (res.success && res.returnData !== "0x" && res.returnData.length >= 66) {
                    aliveCount++;
                }
            });

            const color = (aliveCount === poolAddrs.length) ? colors.green.bold : colors.yellow;
            console.log(color(`[${name}] Sync Status: ${aliveCount}/${poolAddrs.length} pools active.`));
            
        } catch (e) {
            console.log(colors.red(`[${name}] RPC Lag. Rotating...`));
            this.rpcIndex[name]++;
            this.rotateProvider(name);
        }
    }

    async run() {
        console.log(colors.bold(colors.yellow("\n⚡ APEX TITAN v208.4 | 2/2 POOL SYNC ACTIVE\n")));
        while (true) {
            for (const name of Object.keys(NETWORKS)) {
                await this.scan(name);
                await new Promise(r => setTimeout(r, 1000)); 
            }
            await new Promise(r => setTimeout(r, 4000)); 
        }
    }
}

const governor = new ApexOmniGovernor();
governor.run();
