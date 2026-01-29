import { ethers } from 'ethers';
import * as solc from 'solc';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
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
  console.log('📦 Compiling B402Relayer contract...\n');

  const contractPath = path.join(__dirname, '..', 'contracts', 'B402Relayer.sol');
  const source = fs.readFileSync(contractPath, 'utf8');

  const input = {
    language: 'Solidity',
    sources: {
      'B402Relayer.sol': {
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
  }

  const compiledContract = output.contracts['B402Relayer.sol']['B402Relayer'];

  return {
    abi: compiledContract.abi,
    bytecode: compiledContract.evm.bytecode.object,
  };
}

async function deployRelayer() {
  console.log('🚀 Deploying B402Relayer to BSC Testnet\n');
  console.log('═'.repeat(60));

  // Setup provider and wallet
  const provider = new ethers.JsonRpcProvider(BSC_TESTNET_RPC);
  const wallet = new ethers.Wallet(DEPLOYER_PRIVATE_KEY!, provider);

  console.log('\n📋 Deployment Configuration:');
  console.log('─'.repeat(60));
  console.log(`Network:         BSC Testnet`);
  console.log(`RPC:             ${BSC_TESTNET_RPC}`);
  console.log(`Deployer:        ${wallet.address}`);

  const balance = await provider.getBalance(wallet.address);
  console.log(`Balance:         ${ethers.formatEther(balance)} BNB`);

  if (balance === 0n) {
    throw new Error('Deployer wallet has no BNB. Get testnet BNB from https://testnet.bnbchain.org/faucet-smart');
  }

  // Compile contract
  const { abi, bytecode } = await compileContract();

  console.log('\n✅ Compilation successful!');
  console.log(`Bytecode size:   ${bytecode.length / 2} bytes`);

  // Deploy contract
  console.log('\n🚀 Deploying contract...');

  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy();

  console.log(`📤 Transaction sent: ${contract.deploymentTransaction()?.hash}`);
  console.log('⏳ Waiting for confirmation...');

  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();

  console.log('\n═'.repeat(60));
  console.log('✅ B402Relayer deployed successfully!');
  console.log('═'.repeat(60));
  console.log(`\n📍 Contract Address: ${contractAddress}`);
  console.log(`🔗 BSCScan: https://testnet.bscscan.com/address/${contractAddress}`);

  // Get contract details
  const domainSeparator = await contract.DOMAIN_SEPARATOR();
  const chainId = await provider.getNetwork();

  console.log('\n📊 Contract Details:');
  console.log('─'.repeat(60));
  console.log(`Domain Separator: ${domainSeparator}`);
  console.log(`Chain ID:         ${chainId.chainId}`);

  // Save deployment info
  const deploymentInfo = {
    network: 'BSC Testnet',
    contractAddress,
    deployerAddress: wallet.address,
    deploymentTx: contract.deploymentTransaction()?.hash,
    timestamp: new Date().toISOString(),
    chainId: chainId.chainId,
    domainSeparator,
    abi,
  };

  const deploymentPath = path.join(__dirname, '..', 'b402-relayer-deployment.json');
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));

  console.log(`\n💾 Deployment info saved to: ${deploymentPath}`);

  console.log('\n📝 Next Steps:');
  console.log('─'.repeat(60));
  console.log('1. Verify contract on BSCScan:');
  console.log(`   https://testnet.bscscan.com/address/${contractAddress}#code`);
  console.log('');
  console.log('2. Update .env with:');
  console.log(`   B402_RELAYER_ADDRESS=${contractAddress}`);
  console.log('');
  console.log('3. Users need to approve USDT to relayer');
  console.log('');
  console.log('4. Start facilitator service');
  console.log('');
  console.log('═'.repeat(60));
  console.log('🎉 B402Relayer is ready!');
  console.log('═'.repeat(60));

  return {
    contractAddress,
    abi,
  };
}

// Run deployment
if (require.main === module) {
  deployRelayer()
    .then(() => {
      console.log('\n✅ Deployment complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Deployment failed:', error);
      process.exit(1);
    });
}

export { deployRelayer };


