import { ethers } from "hardhat";

async function main() {
  console.log("\n🚀 ════════════════════════════════════════════════════════");
  console.log("   B402 RELAYER V2 - MAINNET DEPLOYMENT");
  console.log("════════════════════════════════════════════════════════\n");

  // Get deployer
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  const network = await ethers.provider.getNetwork();

  console.log("📋 Deployment Info:");
  console.log(`   Deployer:  ${deployer.address}`);
  console.log(`   Balance:   ${ethers.formatEther(balance)} BNB`);
  console.log(`   Network:   ${network.name} (chainId: ${network.chainId})`);
  console.log("");

  // Safety checks
  if (network.chainId !== 56n) {
    console.error("❌ ERROR: Not on BSC Mainnet!");
    console.error(`   Current chainId: ${network.chainId}`);
    console.error(`   Expected: 56`);
    console.error("");
    console.error("   Set correct RPC URL in hardhat.config.ts");
    process.exit(1);
  }

  if (balance < ethers.parseEther("0.01")) {
    console.error("❌ ERROR: Insufficient BNB for deployment");
    console.error(`   Current: ${ethers.formatEther(balance)} BNB`);
    console.error(`   Required: 0.01 BNB (~$5)`);
    process.exit(1);
  }

  console.log("⚠️  WARNING: DEPLOYING TO MAINNET!");
  console.log("   This will cost real BNB and deploy a production contract.");
  console.log("");
  console.log("   Press Ctrl+C to cancel...");
  console.log("   Proceeding in 5 seconds...");
  console.log("");

  // Wait 5 seconds
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log("📦 Deploying B402RelayerV2...");
  console.log("");

  // Deploy
  const B402RelayerV2 = await ethers.getContractFactory("B402RelayerV2");
  const relayer = await B402RelayerV2.deploy();

  console.log("⏳ Waiting for deployment transaction...");
  const deployTx = relayer.deploymentTransaction();
  if (!deployTx) {
    console.error("❌ Deployment transaction not found");
    process.exit(1);
  }

  console.log(`   Tx Hash: ${deployTx.hash}`);
  console.log("");

  // Wait for confirmations
  console.log("⏳ Waiting for 3 block confirmations...");
  await relayer.waitForDeployment();
  const receipt = await deployTx.wait(3); // 3 confirmations for safety

  const contractAddress = await relayer.getAddress();

  console.log("");
  console.log("✅ ════════════════════════════════════════════════════════");
  console.log("   DEPLOYMENT SUCCESSFUL!");
  console.log("════════════════════════════════════════════════════════\n");

  console.log("📝 Contract Details:");
  console.log(`   Address:     ${contractAddress}`);
  console.log(`   Deployer:    ${deployer.address}`);
  console.log(`   Block:       ${receipt?.blockNumber}`);
  console.log(`   Gas Used:    ${receipt?.gasUsed.toString()}`);
  console.log(`   Tx Hash:     ${deployTx.hash}`);
  console.log("");

  console.log("🔗 Links:");
  console.log(`   BSCScan:     https://bscscan.com/address/${contractAddress}`);
  console.log(`   Transaction: https://bscscan.com/tx/${deployTx.hash}`);
  console.log("");

  console.log("🔐 Whitelisted Tokens:");
  console.log("   USDT (Mainnet): 0x55d398326f99059fF775485246999027B3197955");
  console.log("   USDT (Testnet): 0x337610d27c682E347C9cD60BD4b3b107C9d34dDd");
  console.log("");

  console.log("📋 Next Steps:");
  console.log("   1. Verify contract on BSCScan:");
  console.log(`      npx hardhat verify --network bsc ${contractAddress}`);
  console.log("");
  console.log("   2. Update facilitator config:");
  console.log(`      B402_RELAYER_ADDRESS=${contractAddress}`);
  console.log("      NETWORK=mainnet");
  console.log("");
  console.log("   3. Update server.ts:");
  console.log("      const chainId = 56; // Mainnet");
  console.log("");
  console.log("   4. Whitelist additional tokens (if needed):");
  console.log("      USDC: 0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d");
  console.log("      BUSD: 0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56");
  console.log("      DAI:  0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3");
  console.log("");
  console.log("   5. Fund facilitator wallet with BNB (1+ BNB recommended)");
  console.log("");
  console.log("   6. Run mainnet test with small amount ($1 USDT)");
  console.log("");

  console.log("🚀 Ready for production!");
  console.log("");

  // Save deployment info
  const fs = require('fs');
  const deploymentInfo = {
    network: "bsc-mainnet",
    chainId: Number(network.chainId),
    contractAddress: contractAddress,
    deployer: deployer.address,
    blockNumber: receipt?.blockNumber,
    gasUsed: receipt?.gasUsed.toString(),
    txHash: deployTx.hash,
    timestamp: new Date().toISOString(),
    bscscanUrl: `https://bscscan.com/address/${contractAddress}`,
    whitelistedTokens: {
      USDT_Mainnet: "0x55d398326f99059fF775485246999027B3197955",
      USDT_Testnet: "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd"
    }
  };

  fs.writeFileSync(
    'deployment-mainnet.json',
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log("💾 Deployment info saved to deployment-mainnet.json");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });
