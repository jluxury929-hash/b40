/**
 * ===============================================================================
 * APEX PREDATOR v206.7 (FIXED - CHAIN-SPECIFIC ROUTING)
 * ===============================================================================
 */

require('dotenv').config();
const { ethers, getAddress, isAddress } = require('ethers');
const http = require('http');
const colors = require('colors');

colors.enable();

const PRIVATE_KEY = process.env.PRIVATE_KEY;

// --- CRITICAL: SEPARATE POOLS BY CHAIN ---
const POOL_MAP = {
    ETHEREUM: [
        "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640", // ETH/USDC Uniswap V3 (Example)
        "0xCBCdF9626bC03E24f779434178A73a0B4bad62eD"  // WBTC/ETH
    ],
    BASE: [
        "0xd0b53D9277af2a1239b70BD72B516d3C45527310", // WETH/USDC (Example)
        "0x4C36388bE6F6521943841B2583d91971438b8289"  // cbETH/WETH
    ]
};

const NETWORKS = {
    ETHEREUM: { 
        chainId: 1, 
        rpc: process.env.ETH_RPC || "https://eth.llamarpc.com", 
        multicall: "0xcA11bde05977b3631167028862bE2a173976CA11", 
        moat: "0.01"
    },
    BASE: { 
        chainId: 8453, 
        rpc: process.env.BASE_RPC || "https://mainnet.base.org", 
        multicall: "0xcA11bde05977b3631167028862bE2a173976CA11", 
        moat: "0.005"
    }
};

class ApexOmniGovernor {
    constructor() {
        this.providers = {};
        this.wallets = {};
        this.lastCall = 0;
        this.multiAbi = ["function aggregate(tuple(address target, bytes callData)[] calls) view returns (uint256 blockNumber, bytes[] returnData)"];
        this.pairAbi = ["function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)"];

        for (const [name, config] of Object.entries(NETWORKS)) {
            try {
                const provider = new ethers.JsonRpcProvider(config.rpc, config.chainId, { staticNetwork: true });
                this.providers[name] = provider;
                this.wallets[name] = new ethers.Wallet(PRIVATE_KEY, provider);
                console.log(colors.green(`[INIT] ${name} Provider Online.`));
            } catch (e) { console.log(colors.red(`[INIT] ${name} Fail: ${e.message}`)); }
        }
    }

    async scan(networkName) {
        const config = NETWORKS[networkName];
        const poolAddresses = POOL_MAP[networkName] || [];

        // Skip if no pools defined for this chain
        if (poolAddresses.length === 0) return;

        try {
            const multi = new ethers.Contract(config.multicall, this.multiAbi, this.providers[networkName]);
            const itf = new ethers.Interface(this.pairAbi);
            
            const calls = poolAddresses.filter(isAddress).map(addr => ({
                target: getAddress(addr),
                callData: itf.encodeFunctionData("getReserves")
            }));

            // Added Timeout to prevent SERVER_ERROR hanging
            const multicallPromise = multi.aggregate(calls);
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000));

            const [, returnData] = await Promise.race([multicallPromise, timeoutPromise]);

            console.log(colors.cyan(`[${networkName}] Successful Scan: ${returnData.length} pools.`));

        } catch (e) {
            // Detailed Logging for Debugging
            if (e.code === 'CALL_EXCEPTION') {
                console.log(colors.yellow(`[${networkName}] Error: Check if pools exist on this chain.`));
            } else {
                console.log(colors.gray(`[${networkName}] Connection: ${e.code || "Busy"}`));
            }
        }
    }

    async run() {
        console.log(colors.bold(colors.yellow("\n╔════════════════════════════════════════════════════════╗")));
        console.log(colors.bold(colors.yellow("║    ⚡ APEX TITAN v206.7 | MULTI-CHAIN ROUTER ACTIVE   ║")));
        console.log(colors.bold(colors.yellow("╚════════════════════════════════════════════════════════╝\n")));

        while (true) {
            const tasks = Object.keys(NETWORKS).map(name => this.scan(name));
            await Promise.allSettled(tasks);
            await new Promise(r => setTimeout(r, 5000));
        }
    }
}

const governor = new ApexOmniGovernor();
governor.run();
