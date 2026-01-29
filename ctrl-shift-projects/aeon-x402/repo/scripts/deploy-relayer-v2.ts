import { ethers } from 'ethers';
import * as solc from 'solc';
import * as fs from 'fs';
import * as path from 'path';

// Configuration - SET THESE BEFORE RUNNING
const NETWORK = process.env.NETWORK || 'testnet'; // 'testnet' or 'mainnet'
const BSC_MAINNET_RPC = 'https://bsc-dataseed.binance.org';
const BSC_TESTNET_RPC = 'https://data-seed-prebsc-1-s1.binance.org:8545/';
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

if (!DEPLOYER_PRIVATE_KEY) {
  throw new Error('DEPLOYER_PRIVATE_KEY environment variable is required');
}

function findImports(importPath: string): { contents?: string; error?: string } {
  try {
    // Handle OpenZeppelin imports
    if (importPath.startsWith('@openzeppelin/')) {
      const actualPath = path.join(
        __dirname,
        '..',
        'node_modules',
        importPath
      );

      if (fs.existsSync(actualPath)) {
        return { contents: fs.readFileSync(actualPath, 'utf8') };
      }
    }

    // Try relative path
    const relativePath = path.join(__dirname, '..', 'contracts', importPath);
    if (fs.existsSync(relativePath)) {
      return { contents: fs.readFileSync(relativePath, 'utf8') };
    }

    return { error: `File not found: ${importPath}` };
  } catch (error) {
    return { error: String(error) };
  }
}

async function compileContract() {
  console.log('📦 Compiling B402RelayerV2 contract...\n');

  const contractPath = path.join(__dirname, '..', 'contracts', 'B402RelayerV2.sol');
  const source = fs.readFileSync(contractPath, 'utf8');

  const input = {
    language: 'Solidity',
    sources: {
      'B402RelayerV2.sol': {
        content: source,
      },
    },
    settings: {
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode'],
        },
      },
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  };

  const output = JSON.parse(
    solc.compile(JSON.stringify(input), { import: findImports })
  );

  // Check for errors
  if (output.errors) {
    const errors = output.errors.filter((e: any) => e.severity === 'error');
    if (errors.length > 0) {
      console.error('❌ Compilation errors:');
      errors.forEach((err: any) => console.error(err.formattedMessage));
      throw new Error('Compilation failed');
    }

    // Show warnings
    const warnings = output.errors.filter((e: any) => e.severity === 'warning');
    if (warnings.length > 0) {
      console.log('⚠️  Compilation warnings:');
      warnings.forEach((warn: any) => console.log(warn.formattedMessage));
    }
  }

  const compiledContract = output.contracts['B402RelayerV2.sol']['B402RelayerV2'];

  return {
    abi: compiledContract.abi,
    bytecode: compiledContract.evm.bytecode.object,
  };
}

async function deployRelayer() {
  const isMainnet = NETWORK === 'mainnet';
  const rpcUrl = isMainnet ? BSC_MAINNET_RPC : BSC_TESTNET_RPC;
  const chainId = isMainnet ? 56 : 97;

  console.log('\n🚀 B402RelayerV2 DEPLOYMENT');
  console.log('═'.repeat(80));
  console.log(`\n⚠️  NETWORK: ${NETWORK.toUpperCase()} (Chain ID: ${chainId})`);

  if (isMainnet) {
    console.log('\n🔴 MAINNET DEPLOYMENT - REAL MONEY AT RISK!');
    console.log('═'.repeat(80));
    console.log('Please confirm the following:');
    console.log('1. You have reviewed the contract code');
    console.log('2. You have sufficient BNB for deployment (~$5-10)');
    console.log('3. You understand this is irreversible');
    console.log('4. You have backed up your private key');
    console.log('\nPress Ctrl+C to cancel, or wait 10 seconds to continue...\n');
    await new Promise(resolve => setTimeout(resolve, 10000));
  }

  // Setup provider and wallet
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(DEPLOYER_PRIVATE_KEY!, provider);

  console.log('\n📋 Deployment Configuration:');
  console.log('─'.repeat(80));
  console.log(`Network:         BSC ${isMainnet ? 'MAINNET' : 'TESTNET'}`);
  console.log(`RPC:             ${rpcUrl}`);
  console.log(`Chain ID:        ${chainId}`);
  console.log(`Deployer:        ${wallet.address}`);

  const balance = await provider.getBalance(wallet.address);
  console.log(`Balance:         ${ethers.formatEther(balance)} BNB`);

  if (balance === 0n) {
    throw new Error(`Deployer wallet has no BNB. ${isMainnet ? 'Buy BNB on an exchange.' : 'Get testnet BNB from https://testnet.bnbchain.org/faucet-smart'}`);
  }

  if (balance < ethers.parseEther('0.01')) {
    console.log('\n⚠️  WARNING: Low balance. Deployment may fail.');
  }

  // Compile contract
  const { abi, bytecode } = await compileContract();

  console.log('\n✅ Compilation successful!');
  console.log(`Bytecode size:   ${bytecode.length / 2} bytes`);
  console.log(`Estimated cost:  ~0.005-0.01 BNB`);

  // Deploy contract
  console.log('\n🚀 Deploying contract...');

  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy();

  console.log(`📤 Transaction sent: ${contract.deploymentTransaction()?.hash}`);
  console.log('⏳ Waiting for confirmation (this may take 1-2 minutes)...');

  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();

  console.log('\n═'.repeat(80));
  console.log('✅ B402RelayerV2 DEPLOYED SUCCESSFULLY!');
  console.log('═'.repeat(80));
  console.log(`\n📍 Contract Address: ${contractAddress}`);
  console.log(`🔗 BSCScan: https://${isMainnet ? '' : 'testnet.'}bscscan.com/address/${contractAddress}`);

  // Get contract details
  const domainSeparator = await contract.getDomainSeparator();
  const owner = await contract.owner();
  const usdtMainnet = '0x55d398326f99059fF775485246999027B3197955';
  const usdtTestnet = '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd';
  const isWhitelisted = await contract.whitelistedTokens(isMainnet ? usdtMainnet : usdtTestnet);

  console.log('\n📊 Contract Details:');
  console.log('─'.repeat(80));
  console.log(`Domain Separator: ${domainSeparator}`);
  console.log(`Owner:            ${owner}`);
  console.log(`USDT Whitelisted: ${isWhitelisted ? '✅' : '❌'}`);
  console.log(`Paused:           ${await contract.paused() ? '🔴 YES' : '🟢 NO'}`);

  // Save deployment info
  const deploymentInfo = {
    network: isMainnet ? 'BSC Mainnet' : 'BSC Testnet',
    contractAddress,
    deployerAddress: wallet.address,
    deploymentTx: contract.deploymentTransaction()?.hash,
    timestamp: new Date().toISOString(),
    chainId,
    domainSeparator,
    owner,
    whitelistedTokens: {
      USDT: isMainnet ? usdtMainnet : usdtTestnet,
      isWhitelisted
    },
    bscscanUrl: `https://${isMainnet ? '' : 'testnet.'}bscscan.com/address/${contractAddress}`,
    abi,
  };

  const deploymentPath = path.join(__dirname, '..', `b402-relayer-v2-${NETWORK}-deployment.json`);
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));

  console.log(`\n💾 Deployment info saved to: ${deploymentPath}`);

  console.log('\n📝 Next Steps:');
  console.log('─'.repeat(80));
  console.log('1. Verify contract on BSCScan:');
  console.log(`   ${deploymentInfo.bscscanUrl}#code`);
  console.log('');
  console.log('2. Update .env files with:');
  console.log(`   B402_RELAYER_ADDRESS=${contractAddress}`);
  console.log('');
  console.log('3. Users must approve USDT to relayer:');
  console.log(`   USDT.approve("${contractAddress}", amount)`);
  console.log('');
  console.log('4. Start facilitator service:');
  console.log('   cd b402-facilitator && npm run dev');
  console.log('');

  if (isMainnet) {
    console.log('5. 🔴 MAINNET CHECKLIST:');
    console.log('   [ ] Contract verified on BSCScan');
    console.log('   [ ] Add liquidity to PancakeSwap (B402/BNB)');
    console.log('   [ ] Update frontend with contract address');
    console.log('   [ ] Monitor first transactions closely');
    console.log('   [ ] Have emergency pause plan ready');
    console.log('');
  }

  console.log('═'.repeat(80));
  console.log(`🎉 B402RelayerV2 is ready on ${NETWORK.toUpperCase()}!`);
  console.log('═'.repeat(80));

  return {
    contractAddress,
    abi,
    deploymentInfo,
  };
}

// Run deployment
if (require.main === module) {
  deployRelayer()
    .then(({ deploymentInfo }) => {
      console.log('\n✅ Deployment complete!');
      console.log(`\n📋 Contract: ${deploymentInfo.contractAddress}`);
      console.log(`🔗 Explorer: ${deploymentInfo.bscscanUrl}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Deployment failed:', error.message);
      process.exit(1);
    });
}

export { deployRelayer };
