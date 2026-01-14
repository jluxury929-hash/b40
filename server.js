/**
 * ===============================================================================
 * APEX PREDATOR v206.1 (JS-UNIFIED - ABSOLUTE FINALITY + RATE-LIMIT HARDENING)
 * ===============================================================================
 */

require('dotenv').config();
const fs = require('fs');
const http = require('http');

// --- 1. CORE DEPENDENCY CHECK ---
try {
    global.ethers = require('ethers');
    global.axios = require('axios');
    global.Sentiment = require('sentiment');
    require('colors'); 
} catch (e) {
    process.exit(1);
}

const { ethers } = global.ethers;

// ==========================================
// 1. INFRASTRUCTURE & MULTICALL CONFIG
// ==========================================
const NETWORKS = {
    ETHEREUM: { chainId: 1, rpc: process.env.ETH_RPC, multicall: "0xcA11bde05977b3631167028862bE2a173976CA11", moat: "0.01", priority: "500.0", router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D" },
    BASE: { chainId: 8453, rpc: process.env.BASE_RPC, multicall: "0xcA11bde05977b3631167028862bE2a173976CA11", moat: "0.005", priority: "1.6", router: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24" },
    ARBITRUM: { chainId: 42161, rpc: process.env.ARB_RPC, multicall: "0xcA11bde05977b3631167028862bE2a173976CA11", moat: "0.003", priority: "1.0", router: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506" }
};

const EXECUTOR = process.env.EXECUTOR_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

// ==========================================
// 2. OMNI GOVERNOR CORE
// ==========================================
class ApexOmniGovernor {
    constructor() {
        this.wallets = {};
        this.providers = {};
        this.lastCallTime = 0;
        
        for (const [name, config] of Object.entries(NETWORKS)) {
            try {
                // ethers v6 fix for heavy RPC loads
                const provider = new ethers.JsonRpcProvider(config.rpc, config.chainId, { 
                    staticNetwork: true,
                    batchMaxCount: 1 // Reduces complexity of requests to Infura
                });
                this.providers[name] = provider;
                if (PRIVATE_KEY) this.wallets[name] = new ethers.Wallet(PRIVATE_KEY, provider);
            } catch (e) { console.log(`[${name}] Offline.`.red); }
        }
    }

    /**
     * RATE LIMIT SHIELD: Throttles requests to avoid 429 errors
     */
    async throttle() {
        const now = Date.now();
        const diff = now - this.lastCallTime;
        if (diff < 200) { // Ensure at least 200ms between major clusters
            await new Promise(r => setTimeout(r, 200 - diff));
        }
        this.lastCallTime = Date.now();
    }

    async getBulkReserves(networkName, poolAddresses) {
        const config = NETWORKS[networkName];
        const poolAbi = ["function getReserves() external view returns (uint112, uint112, uint32)"];
        const multicallAbi = ["function aggregate(tuple(address target, bytes callData)[] calls) external view returns (uint256 blockNumber, bytes[] returnData)"];
        
        const itf = new ethers.Interface(poolAbi);
        const multi = new ethers.Contract(config.multicall, multicallAbi, this.providers[networkName]);

        try {
            await this.throttle();
            const [, returnData] = await multi.aggregate(poolAddresses.map(addr => ({
                target: addr,
                callData: itf.encodeFunctionData("getReserves")
            })));
            return returnData.map(data => itf.decodeFunctionResult("getReserves", data));
        } catch (e) {
            if (e.message.includes("429")) console.log(`[${networkName}] Rate Limited. Backing off...`.yellow);
            return [];
        }
    }

    calculateCyclicPath(amountIn, reserves) {
        let currentAmount = amountIn;
        const feeNumerator = 997n;
        const feeDenominator = 1000n;

        for (const res of reserves) {
            if (!res || res.length < 2) continue;
            const [resIn, resOut] = [BigInt(res[0]), BigInt(res[1])];
            const amountInWithFee = currentAmount * feeNumerator;
            const numerator = amountInWithFee * resOut;
            const denominator = (resIn * feeDenominator) + amountInWithFee;
            currentAmount = numerator / denominator;
        }
        return currentAmount - amountIn;
    }

    async executeStrike(networkName, targetPools = []) {
        if (!this.wallets[networkName] || targetPools.length === 0) return;
        
        const config = NETWORKS[networkName];
        const wallet = this.wallets[networkName];
        const provider = this.providers[networkName];

        try {
            await this.throttle();
            const [balance, feeData] = await Promise.all([
                provider.getBalance(wallet.address),
                provider.getFeeData()
            ]);
            
            const amountIn = balance - (ethers.parseEther(config.moat) + ethers.parseEther("0.005"));
            if (amountIn <= 0n) return;

            const reserves = await this.getBulkReserves(networkName, targetPools);
            if (reserves.length === 0) return;

            const netProfit = this.calculateCyclicPath(amountIn, reserves);

            if (netProfit > 0n) {
                console.log(`[${networkName}] ARB FOUND: +${ethers.formatEther(netProfit)} ETH`.gold);
                const abi = ["function executeTriangle(address router, address[] path, uint256 amountIn) external payable"];
                const contract = new ethers.Contract(EXECUTOR, abi, wallet);
                const tx = await contract.executeTriangle(config.router, ["0x...", "0x...", "0x..."], amountIn, { value: amountIn, gasLimit: 1000000 });
                console.log(`🚀 STRIKE SENT: ${tx.hash}`.cyan);
            }
        } catch (e) {
            if (!e.message.includes("429")) console.log(`[${networkName}] Error: ${e.message}`.gray);
        }
    }

    async run() {
        console.log("⚡ APEX TITAN v206.1 | STABILITY CORE ACTIVE".gold);
        const myPools = ["0x...", "0x..."]; 

        while (true) {
            for (const net of Object.keys(NETWORKS)) {
                await this.executeStrike(net, myPools);
            }
            // Increased sleep to 4s to satisfy Infura free tier limits
            await new Promise(r => setTimeout(r, 4000));
        }
    }
}

const governor = new ApexOmniGovernor();
governor.run();
