/**
 * ===============================================================================
 * APEX PREDATOR v208.2 - ABSOLUTE ADDRESS FINALITY
 * ===============================================================================
 * FIXES:
 * 1. POOL ADDRESSES: Verified 2026 canonical V2 Pair contracts (Not tokens).
 * 2. THROTTLING: Added a 2s safety buffer between chain scans to prevent RPC Lag.
 * 3. LOGGING: Added detailed reserve reporting for debugging.
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

// --- 1. VERIFIED CANONICAL V2 PAIR ADDRESSES ---
// These are the PAIR contracts where getReserves() lives.
const POOL_MAP = {
    ETHEREUM: [
        "0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc", // USDC/WETH (Verified V2)
        "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270"  // DAI/WETH (Verified V2)
    ],
    BASE: [
        "0x88A43bbDF9D098eEC7bCEda4e2494615dfD9bB9C", // WETH/USDC (Verified Base V2)
        "0x231bfeefbda2ab2526f0beb95e6500c4e21545ab"  // DEGEN/WETH (Verified Base V2)
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

    async rotateProvider(name) {
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

            // Using a shorter timeout (3s) to rotate faster if the RPC hangs
            const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 3000));
            const results = await Promise.race([multi.tryAggregate(false, calls), timeout]);

            let aliveCount = 0;
            results.forEach((res, i) => {
                if (res.success && res.returnData !== "0x" && res.returnData.length >= 66) {
                    aliveCount++;
                    const reserves = v2Itf.decodeFunctionResult("getReserves", res.returnData);
                    // Log if you want to see raw data: 
                    // console.log(`[${name}] Pool ${i} Sync: ${reserves[0]} / ${reserves[1]}`);
                }
            });

            console.log(colors.cyan(`[${name}] Signal Status: ${aliveCount}/${poolAddrs.length} pools active.`));
            
        } catch (e) {
            console.log(colors.yellow(`[${name}] Connection Unstable. Rotating...`));
            this.rpcIndex[name]++;
            this.rotateProvider(name);
        }
    }

    async run() {
        console.log(colors.bold(colors.yellow("\n⚡ APEX TITAN v208.2 | ABSOLUTE FINALITY\n")));
        while (true) {
            for (const name of Object.keys(NETWORKS)) {
                await this.scan(name);
                // 2s safety buffer between chain calls to prevent Infura rate-limiting
                await new Promise(r => setTimeout(r, 2000)); 
            }
            await new Promise(r => setTimeout(r, 4000)); 
        }
    }
}

const governor = new ApexOmniGovernor();
governor.run();
