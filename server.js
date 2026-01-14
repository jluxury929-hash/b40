/**
 * ===============================================================================
 * APEX PREDATOR v206.6 (FIXED - ARGUMENT VALIDATION)
 * ===============================================================================
 */

require('dotenv').config();
const { ethers, getAddress, isAddress } = require('ethers');
const http = require('http');
const colors = require('colors');

colors.enable();

// --- CONFIGURATION ---
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const EXECUTOR = process.env.EXECUTOR_ADDRESS;

// !!! REPLACE THESE WITH ACTUAL POOL ADDRESSES !!!
// Use checksummed addresses from Etherscan/Basescan
const TARGET_POOLS = [
    "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", // Example Checksummed Address
    "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", 
    "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24"
];

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

    async shield() {
        const now = Date.now();
        if (now - this.lastCall < 500) await new Promise(r => setTimeout(r, 500));
        this.lastCall = Date.now();
    }

    async scan(networkName, poolAddresses) {
        // Validation: Ensure addresses are valid before calling
        const validPools = poolAddresses.filter(addr => {
            if (!isAddress(addr)) {
                console.log(colors.red(`[ERROR] Invalid Address skipped: ${addr}`));
                return false;
            }
            return true;
        });

        if (validPools.length === 0) return;

        const config = NETWORKS[networkName];
        try {
            await this.shield();
            const multi = new ethers.Contract(config.multicall, this.multiAbi, this.providers[networkName]);
            const itf = new ethers.Interface(this.pairAbi);
            
            // Format calls correctly for the Multicall tuple
            const calls = validPools.map(addr => ({
                target: getAddress(addr), // Enforce Checksum
                callData: itf.encodeFunctionData("getReserves")
            }));

            const [balance, [, returnData]] = await Promise.all([
                this.providers[networkName].getBalance(this.wallets[networkName].address),
                multi.aggregate(calls)
            ]);

            // Logic for profit processing here...
            console.log(colors.gray(`[${networkName}] Scan Complete. Balance: ${ethers.formatEther(balance)} ETH`));

        } catch (e) {
            console.log(colors.yellow(`[${networkName}] Idle: ${e.code || e.message.slice(0, 50)}`));
        }
    }

    async run() {
        console.log(colors.bold(colors.yellow("\n╔════════════════════════════════════════════════════════╗")));
        console.log(colors.bold(colors.yellow("║    ⚡ APEX TITAN v206.6 | ARGUMENT SHIELD ACTIVE      ║")));
        console.log(colors.bold(colors.yellow("╚════════════════════════════════════════════════════════╝\n")));

        while (true) {
            for (const name of Object.keys(NETWORKS)) {
                await this.scan(name, TARGET_POOLS);
            }
            await new Promise(r => setTimeout(r, 4000));
        }
    }
}

// Ignition
const governor = new ApexOmniGovernor();
governor.run();
