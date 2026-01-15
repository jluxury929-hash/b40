/**
 * ===============================================================================
 * APEX PREDATOR v208.1 - BASE V2 CANONICAL FIX
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

// --- 1. VERIFIED CANONICAL PAIR ADDRESSES (Early 2026) ---
// These are strictly Uniswap V2 Pair contracts that support getReserves()
const POOL_MAP = {
    ETHEREUM: [
        "0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc", // USDC/WETH (V2)
        "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270"  // DAI/WETH (V2)
    ],
    BASE: [
        "0x88A43bbDF9D098eEC7bCEda4e2494615dfD9bB9C", // WETH/USDC (Uniswap V2 Canonical)
        "0x1689E7B1F10000AE47eBfE339a4f69dECd19F602"  // Base V2 Router-linked Pair
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

            // tryAggregate(false) prevents whole-call failure
            const results = await multi.tryAggregate(false, calls);

            let aliveCount = 0;
            results.forEach((res, i) => {
                if (res.success && res.returnData !== "0x" && res.returnData.length >= 66) {
                    aliveCount++;
                }
            });

            if (aliveCount > 0) {
                console.log(colors.green(`[${name}] Sync Successful: ${aliveCount}/${poolAddrs.length} pools alive.`));
            } else {
                console.log(colors.red(`[${name}] CRITICAL: 0/${poolAddrs.length} pairs responded. Check if addresses are V2.`));
            }
            
        } catch (e) {
            console.log(colors.yellow(`[${name}] RPC Lag. Rotating...`));
            this.rpcIndex[name]++;
            this.rotateProvider(name);
        }
    }

    async run() {
        console.log(colors.bold(colors.yellow("\n⚡ APEX TITAN v208.1 | BASE V2 FINAL FIX\n")));
        while (true) {
            for (const name of Object.keys(NETWORKS)) await this.scan(name);
            await new Promise(r => setTimeout(r, 5000)); 
        }
    }
}

const governor = new ApexOmniGovernor();
governor.run();
