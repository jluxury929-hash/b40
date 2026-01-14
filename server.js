/**
 * ===============================================================================
 * APEX PREDATOR v207.1 - NEURAL STRIKE & SIMULATION
 * ===============================================================================
 */

require('dotenv').config();
const fs = require('fs');
const http = require('http');

// --- 1. GLOBAL SCOPE ---
try {
    global.colors = require('colors');
    global.ethers = require('ethers');
    global.colors.enable();
} catch (e) { process.exit(1); }

const { ethers, getAddress, isAddress } = global.ethers;
const colors = global.colors;

// --- 2. CONFIGURATION ---
const EXECUTOR_ADDRESS = process.env.EXECUTOR_ADDRESS;
const POOL_MAP = {
    ETHEREUM: [
        "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", // WETH/DAI
        "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"  // USDC/ETH
    ],
    BASE: [
        "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24", // WETH/USDC
        "0x25d887Ce7a35172C62FeBFD67a1856F20FaEbb00"  // cbETH/WETH
    ]
};

const NETWORKS = {
    ETHEREUM: { chainId: 1, rpcs: [process.env.ETH_RPC, "https://eth.llamarpc.com"].filter(Boolean), multicall: "0xcA11bde05977b3631167028862bE2a173976CA11", moat: "0.01" },
    BASE: { chainId: 8453, rpcs: [process.env.BASE_RPC, "https://mainnet.base.org"].filter(Boolean), multicall: "0xcA11bde05977b3631167028862bE2a173976CA11", moat: "0.005" }
};

class ApexOmniGovernor {
    constructor() {
        this.providers = {}; this.wallets = {}; this.rpcIndex = { ETHEREUM: 0, BASE: 0 };
        this.multiAbi = ["function aggregate(tuple(address target, bytes callData)[] calls) view returns (uint256 blockNumber, bytes[] returnData)"];
        this.pairAbi = ["function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)"];
        this.execAbi = ["function executeTriangle(address router, address tokenA, address tokenB, uint256 amountIn) external payable"];
        
        for (const name of Object.keys(NETWORKS)) this.rotateProvider(name);
    }

    rotateProvider(name) {
        const config = NETWORKS[name];
        const url = config.rpcs[this.rpcIndex[name] % config.rpcs.length];
        this.providers[name] = new ethers.JsonRpcProvider(url, config.chainId, { staticNetwork: true });
        if (process.env.PRIVATE_KEY) this.wallets[name] = new ethers.Wallet(process.env.PRIVATE_KEY, this.providers[name]);
        console.log(colors.green(`[RPC] ${name} -> ${url.split('/')[2]}`));
    }

    calculateProfit(amountIn, reserves) {
        let current = amountIn;
        for (const res of reserves) {
            const [r0, r1] = [BigInt(res[0]), BigInt(res[1])];
            const amtWithFee = current * 997n;
            current = (amtWithFee * r1) / ((r0 * 1000n) + amtWithFee);
        }
        return current - amountIn;
    }

    async scan(name) {
        const config = NETWORKS[name];
        const pools = POOL_MAP[name];
        try {
            const multi = new ethers.Contract(config.multicall, this.multiAbi, this.providers[name]);
            const itf = new ethers.Interface(this.pairAbi);
            const calls = pools.map(addr => ({ target: getAddress(addr), callData: itf.encodeFunctionData("getReserves") }));

            const [balance, [, returnData]] = await Promise.all([
                this.providers[name].getBalance(this.wallets[name].address),
                multi.aggregate(calls)
            ]);

            const reserves = returnData.map(d => itf.decodeFunctionResult("getReserves", d));
            const tradeSize = balance - ethers.parseEther(config.moat);
            
            if (tradeSize > 0n) {
                const profit = this.calculateProfit(tradeSize, reserves);
                if (profit > 0n) {
                    console.log(colors.gold(`[${name}] 💰 NEURAL SIGNAL: +${ethers.formatEther(profit)} ETH`));
                    await this.simulateAndStrike(name, tradeSize, pools[0], profit);
                }
            }
        } catch (e) { this.rpcIndex[name]++; this.rotateProvider(name); }
    }

    async simulateAndStrike(name, amount, tokenA, expectedProfit) {
        const wallet = this.wallets[name];
        const contract = new ethers.Contract(EXECUTOR_ADDRESS, this.execAbi, wallet);
        
        try {
            // 1. Simulation Guard (eth_call)
            console.log(colors.cyan(`[${name}] Simulating Strike...`));
            await contract.executeTriangle.staticCall(NETWORKS[name].router, tokenA, "0x...", amount, { value: amount });
            
            // 2. Real Strike
            const tx = await contract.executeTriangle(NETWORKS[name].router, tokenA, "0x...", amount, { value: amount, gasLimit: 800000 });
            console.log(colors.green(`🚀 STRIKE SUCCESS: ${tx.hash}`));
        } catch (e) {
            console.log(colors.red(`[${name}] Simulation Reverted: Ghost Profit Prevented.`));
        }
    }

    async run() {
        console.log(colors.bold(colors.yellow("\n⚡ APEX TITAN v207.1 | NEURAL STRIKE ACTIVE\n")));
        while (true) {
            for (const net of Object.keys(NETWORKS)) await this.scan(net);
            await new Promise(r => setTimeout(r, 3000));
        }
    }
}

const governor = new ApexOmniGovernor();
governor.run();
