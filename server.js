/**
 * ===============================================================================
 * APEX PREDATOR v207.3 - FIXED (REFERENCE ERROR)
 * ===============================================================================
 */

require('dotenv').config();
const fs = require('fs');
const http = require('http');

try {
    global.colors = require('colors');
    global.ethers = require('ethers');
    global.colors.enable();
} catch (e) { process.exit(1); }

const { ethers, getAddress, isAddress } = global.ethers;
const colors = global.colors;

// --- 1. CAPTURE ENV VARIABLES GLOBALLY ---
// This ensures they are available to all class methods
const PRIVATE_KEY = process.env.PRIVATE_KEY; 
const EXECUTOR_ADDRESS = process.env.EXECUTOR_ADDRESS;

const NETWORKS = {
    ETHEREUM: { chainId: 1, rpcs: [process.env.ETH_RPC, "https://eth.llamarpc.com"].filter(Boolean), multicall: "0xcA11bde05977b3631167028862bE2a173976CA11", moat: "0.01" },
    BASE: { chainId: 8453, rpcs: [process.env.BASE_RPC, "https://mainnet.base.org"].filter(Boolean), multicall: "0xcA11bde05977b3631167028862bE2a173976CA11", moat: "0.005" }
};

class ApexOmniGovernor {
    constructor() {
        this.providers = {};
        this.wallets = {};
        this.rpcIndex = { ETHEREUM: 0, BASE: 0 };
        this.isRotating = { ETHEREUM: false, BASE: false };
        
        // Validate keys before starting
        if (!PRIVATE_KEY || PRIVATE_KEY.length < 64) {
            console.log(colors.red("[FATAL] PRIVATE_KEY is missing or invalid in .env"));
            process.exit(1);
        }

        for (const name of Object.keys(NETWORKS)) this.rotateProvider(name);
    }

    async rotateProvider(name) {
        if (this.isRotating[name]) return;
        this.isRotating[name] = true;

        const config = NETWORKS[name];
        const url = config.rpcs[this.rpcIndex[name] % config.rpcs.length];
        
        try {
            this.providers[name] = new ethers.JsonRpcProvider(url, config.chainId, { staticNetwork: true });
            
            // FIXED: Using the constant defined at the top of the script
            this.wallets[name] = new ethers.Wallet(PRIVATE_KEY, this.providers[name]);
            
            console.log(colors.green(`[RPC] ${name} connected: ${url.split('/')[2]}`));
            await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
            console.log(colors.red(`[RPC] ${name} Rotation Error: ${e.message}`));
        } finally {
            this.isRotating[name] = false;
        }
    }

    // ... (rest of your scan and run methods)
}

const governor = new ApexOmniGovernor();
governor.run();
