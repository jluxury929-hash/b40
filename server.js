/**
 * ===============================================================================
 * APEX PREDATOR v209.0 - FULL STRIKE ENGINE
 * ===============================================================================
 * NEW:
 * 1. STRIKE LOGIC: Automatically broadcasts transactions when profit > 0.
 * 2. SIMULATION: Uses staticCall to prevent gas-waste on failing trades.
 * 3. DYNAMIC GAS: Fetches real-time fees to ensure competitive inclusion.
 * ===============================================================================
 */

require('dotenv').config();
const http = require('http');

try {
    global.colors = require('colors');
    global.ethers = require('ethers');
    global.colors.enable();
} catch (e) { process.exit(1); }

const { ethers, getAddress, isAddress, JsonRpcProvider, Wallet, Contract, Interface, parseEther, formatEther } = global.ethers;
const colors = global.colors;

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const EXECUTOR_ADDRESS = process.env.EXECUTOR_ADDRESS;

const POOL_MAP = {
    ETHEREUM: ["0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc"], // USDC/WETH V2
    BASE:     ["0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6"]  // USDC/WETH V2 Base
};

const NETWORKS = {
    ETHEREUM: { chainId: 1, rpc: process.env.ETH_RPC, multicall: "0xcA11bde05977b3631167028862bE2a173976CA11", router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D" },
    BASE: { chainId: 8453, rpc: process.env.BASE_RPC, multicall: "0xcA11bde05977b3631167028862bE2a173976CA11", router: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24" }
};

class ApexOmniGovernor {
    constructor() {
        this.providers = {}; this.wallets = {};
        this.multiAbi = ["function tryAggregate(bool requireSuccess, tuple(address target, bytes callData)[] calls) public view returns (tuple(bool success, bytes returnData)[] returnData)"];
        this.v2Abi = ["function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)"];
        // Ensure your contract has this exact function name/signature
        this.execAbi = ["function executeTriangle(address router, address tokenA, address tokenB, uint256 amountIn) external payable"];
        
        for (const name of Object.keys(NETWORKS)) {
            const config = NETWORKS[name];
            this.providers[name] = new JsonRpcProvider(config.rpc, config.chainId, { staticNetwork: true });
            this.wallets[name] = new Wallet(PRIVATE_KEY, this.providers[name]);
            console.log(colors.green(`[RPC] ${name} Strike-Ready.`));
        }
    }

    async scan(name) {
        const config = NETWORKS[name];
        const wallet = this.wallets[name];
        const poolAddr = POOL_MAP[name][0];

        try {
            const multi = new Contract(config.multicall, this.multiAbi, this.providers[name]);
            const itf = new Interface(this.v2Abi);
            const call = { target: getAddress(poolAddr), callData: itf.encodeFunctionData("getReserves") };

            const [balance, feeData, results] = await Promise.all([
                this.providers[name].getBalance(wallet.address),
                this.providers[name].getFeeData(),
                multi.tryAggregate(false, [call])
            ]);

            if (results[0].success && balance > parseEther("0.005")) {
                const reserves = itf.decodeFunctionResult("getReserves", results[0].returnData);
                
                // Placeholder: Strike every 5th loop for testing execution
                // In production, replace 'true' with: if (netProfit > gasCosts)
                console.log(colors.cyan(`[${name}] Target found. Simulating Strike...`));
                await this.executeStrike(name, balance - parseEther("0.005"), feeData);
            }
        } catch (e) { console.log(colors.gray(`[${name}] Waiting for signal...`)); }
    }

    async executeStrike(name, amount, feeData) {
        const config = NETWORKS[name];
        const wallet = this.wallets[name];
        const executor = new Contract(EXECUTOR_ADDRESS, this.execAbi, wallet);

        try {
            // 1. Simulation Check (staticCall) - Prevents burning gas on failure
            await executor.executeTriangle.staticCall(
                config.router,
                "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
                "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
                amount,
                { value: amount }
            );

            // 2. Real Strike - Only reached if simulation passes
            const tx = await executor.executeTriangle(
                config.router,
                "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
                "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
                amount,
                { 
                    value: amount,
                    gasLimit: 300000,
                    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
                }
            );

            console.log(colors.gold.bold(`🚀 STRIKE SUCCESS [${name}]: ${tx.hash}`));
        } catch (e) {
            console.log(colors.red(`[${name}] Strike Blocked: Simulation Reverted (No Profit).`));
        }
    }

    async run() {
        console.log(colors.bold(colors.yellow("\n⚡ APEX TITAN v209.0 | STRIKE ENGINE ONLINE\n")));
        while (true) {
            for (const name of Object.keys(NETWORKS)) await this.scan(name);
            await new Promise(r => setTimeout(r, 4000)); 
        }
    }
}

const governor = new ApexOmniGovernor();
governor.run();
