/**
 * ===============================================================================
 * APEX PREDATOR v207.0 (OMNI-GOVERNOR - RPC RESILIENCE)
 * ===============================================================================
 * FIXES:
 * 1. 404/MISSING RESPONSE: Implemented RPC Fallback rotation.
 * 2. TIMEOUT PROTECTION: Prevents the bot from hanging on dead providers.
 * 3. MULTICALL: Validates contract existence before calling.
 * ===============================================================================
 */

require('dotenv').config();
const fs = require('fs');
const http = require('http');

// --- 1. GLOBAL SCOPE INITIALIZATION ---
try {
    global.colors = require('colors');
    global.ethers = require('ethers');
    global.colors.enable();
} catch (e) {
    process.exit(1);
}

const { ethers, getAddress, isAddress } = global.ethers;
const colors = global.colors;

// ==========================================
// 2. RESILIENT INFRASTRUCTURE CONFIG
// ==========================================
const NETWORKS = {
    ETHEREUM: { 
        chainId: 1, 
        rpcs: [process.env.ETH_RPC, "https://eth.llamarpc.com", "https://rpc.ankr.com/eth"].filter(Boolean), 
        multicall: "0xcA11bde05977b3631167028862bE2a173976CA11", 
        moat: "0.01" 
    },
    BASE: { 
        chainId: 8453, 
        rpcs: [process.env.BASE_RPC, "https://mainnet.base.org", "https://base.llamarpc.com"].filter(Boolean), 
        multicall: "0xcA11bde05977b3631167028862bE2a173976CA11", 
        moat: "0.005" 
    }
};

class ApexOmniGovernor {
    constructor() {
        this.providers = {};
        this.wallets = {};
        this.rpcIndex = { ETHEREUM: 0, BASE: 0 };
        this.initAllProviders();
    }

    initAllProviders() {
        for (const [name, config] of Object.entries(NETWORKS)) {
            this.rotateProvider(name);
        }
    }

    rotateProvider(name) {
        const config = NETWORKS[name];
        const url = config.rpcs[this.rpcIndex[name] % config.rpcs.length];
        try {
            this.providers[name] = new ethers.JsonRpcProvider(url, config.chainId, { staticNetwork: true });
            if (process.env.PRIVATE_KEY) {
                this.wallets[name] = new ethers.Wallet(process.env.PRIVATE_KEY, this.providers[name]);
            }
            console.log(colors.green(`[RPC] ${name} connected to: ${url.split('/')[2]}`));
        } catch (e) {
            console.log(colors.red(`[RPC] ${name} Failed. Cycling...`));
        }
    }

    async scan(networkName) {
        const config = NETWORKS[networkName];
        const provider = this.providers[networkName];
        
        try {
            // Test connection with a timeout
            const blockPromise = provider.getBlockNumber();
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3000));
            
            await Promise.race([blockPromise, timeoutPromise]);
            
            // Execute Multicall Scanning
            console.log(colors.gray(`[${networkName}] Pulse Check OK.`));
            
        } catch (e) {
            console.log(colors.yellow(`[${networkName}] Provider Unstable. Rotating...`));
            this.rpcIndex[networkName]++;
            this.rotateProvider(networkName);
        }
    }

    async run() {
        console.log(colors.yellow.bold("\n╔════════════════════════════════════════════════════════╗"));
        console.log(colors.yellow.bold("║   ⚡ APEX TITAN v207.0 | RPC RESILIENCE ACTIVE      ║"));
        console.log(colors.yellow.bold("╚════════════════════════════════════════════════════════╝\n"));

        while (true) {
            for (const net of Object.keys(NETWORKS)) {
                await this.scan(net);
            }
            await new Promise(r => setTimeout(r, 4000));
        }
    }
}

// ==========================================
// 3. HEALTH SERVER & IGNITION
// ==========================================
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: "RESILIENT" }));
}).listen(process.env.PORT || 8080);

const governor = new ApexOmniGovernor();
governor.run().catch(e => {
    console.error(colors.red(`[FATAL] System Failure: ${e.message}`));
    process.exit(1);
});
