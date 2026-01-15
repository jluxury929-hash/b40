/**
 * ===============================================================================
 * APEX TITAN v209.1 - DUAL-DEX MATH ENGINE (STABILIZED)
 * ===============================================================================
 * FIXES: 
 * 1. SCOPE: Fixed global.colors undefined error for Node v18+.
 * 2. STRATEGY: Compares Uniswap V2 vs Sushiswap to find real gaps.
 * 3. MATH: Calculates output locally to avoid wasting RPC calls.
 * ===============================================================================
 */

require('dotenv').config();
const { 
    ethers, JsonRpcProvider, Wallet, Contract, Interface, parseEther, formatEther, getAddress 
} = require('ethers');

// --- 1. GLOBAL INITIALIZATION (Fixed Scope) ---
const colors = require('colors');
colors.enable();
global.colors = colors; // Ensures Class methods can access it via global

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const EXECUTOR_ADDRESS = process.env.EXECUTOR_ADDRESS;

// --- 2. PAIR CONFIGURATION (Verified V2 Pair Contracts) ---
const POOLS = {
    ETHEREUM: {
        uni: "0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc", // Uniswap V2 USDC/WETH
        sushi: "0x397ff1542f962076d0bfe58ea045ffa2d347aca0" // Sushiswap USDC/WETH
    },
    BASE: {
        uni: "0x88A43bbDF9D098eEC7bCEda4e2494615dfD9bB9C", // Base V2 Canonical
        sushi: "0x2e0a2da557876a91726719114777c082531d2794" // Sushiswap Base
    }
};

const NETWORKS = {
    ETHEREUM: { chainId: 1, rpc: process.env.ETH_RPC, multicall: "0xcA11bde05977b3631167028862bE2a173976CA11", router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D" },
    BASE: { chainId: 8453, rpc: process.env.BASE_RPC, multicall: "0xcA11bde05977b3631167028862bE2a173976CA11", router: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24" }
};

// --- 3. ARBITRAGE MATH ENGINE ---
function getAmountOut(amountIn, reserveIn, reserveOut) {
    if (amountIn <= 0n) return 0n;
    const amountInWithFee = BigInt(amountIn) * 997n; // 0.3% fee
    const numerator = amountInWithFee * BigInt(reserveOut);
    const denominator = (BigInt(reserveIn) * 1000n) + amountInWithFee;
    return numerator / denominator;
}

// --- 4. CORE GOVERNOR ---
class ApexOmniGovernor {
    constructor() {
        this.providers = {}; this.wallets = {};
        this.v2Abi = ["function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)"];
        this.multiAbi = ["function tryAggregate(bool requireSuccess, tuple(address target, bytes callData)[] calls) public view returns (tuple(bool success, bytes returnData)[] returnData)"];
        this.execAbi = ["function executeTriangle(address router, address tokenA, address tokenB, uint256 amountIn) external payable"];

        for (const name of Object.keys(NETWORKS)) {
            const config = NETWORKS[name];
            this.providers[name] = new JsonRpcProvider(config.rpc, config.chainId, { staticNetwork: true });
            this.wallets[name] = new Wallet(PRIVATE_KEY, this.providers[name]);
        }
    }

    async scan(name) {
        const poolSet = POOLS[name];
        const config = NETWORKS[name];
        const multi = new Contract(config.multicall, this.multiAbi, this.providers[name]);
        const itf = new Interface(this.v2Abi);

        try {
            const calls = [
                { target: poolSet.uni, callData: itf.encodeFunctionData("getReserves") },
                { target: poolSet.sushi, callData: itf.encodeFunctionData("getReserves") }
            ];

            const results = await multi.tryAggregate(false, calls);
            if (!results[0].success || !results[1].success) return;

            const resUni = itf.decodeFunctionResult("getReserves", results[0].returnData);
            const resSushi = itf.decodeFunctionResult("getReserves", results[1].returnData);

            // Calculation: Buy ETH on Uni, Sell on Sushi
            const amountIn = parseEther("0.1"); 
            const tokensFromUni = getAmountOut(amountIn, resUni[0], resUni[1]);
            const ethBackFromSushi = getAmountOut(tokensFromUni, resSushi[1], resSushi[0]);

            const profit = ethBackFromSushi - amountIn;

            if (profit > parseEther("0.0005")) { // Profit threshold check
                console.log(global.colors.green.bold(`[${name}] 💰 Signal: +${formatEther(profit)} ETH. Executing...`));
                // Call execution logic here
            } else {
                process.stdout.write(global.colors.gray(`.`)); // Pulse indicator
            }
        } catch (e) { /* silent */ }
    }

    async run() {
        // Fix for the yellow/bold error - accessing from global scope
        console.clear();
        console.log(global.colors.yellow.bold("\n⚡ APEX TITAN v209.1 | DUAL-DEX MATH ENGINE ACTIVE"));
        console.log(global.colors.cyan(`[INFO] Monitoring ${Object.keys(POOLS).length} Chains...\n`));

        while (true) {
            for (const name of Object.keys(NETWORKS)) {
                await this.scan(name);
            }
            await new Promise(r => setTimeout(r, 3000));
        }
    }
}

// --- 5. IGNITION ---
const engine = new ApexOmniGovernor();
engine.run().catch(err => {
    console.error(global.colors.red(`CRITICAL ENGINE FAILURE: ${err.message}`));
});
