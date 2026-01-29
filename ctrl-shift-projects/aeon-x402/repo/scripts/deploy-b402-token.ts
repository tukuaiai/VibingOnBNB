import { ethers } from 'ethers';
import * as solc from 'solc';
import * as fs from 'fs';
import * as path from 'path';

// BSC Testnet Configuration
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
  console.log('📦 Compiling B402Token contract...\n');

  const contractPath = path.join(__dirname, '..', 'contracts', 'B402Token.sol');
  const source = fs.readFileSync(contractPath, 'utf8');

  const input = {
    language: 'Solidity',
    sources: {
      'B402Token.sol': {
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

  const compiledContract = output.contracts['B402Token.sol']['B402Token'];

  return {
    abi: compiledContract.abi,
    bytecode: compiledContract.evm.bytecode.object,
  };
}

async function deployB402Token() {
  console.log('🚀 Deploying B402Token to BSC Testnet\n');
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
  console.log('✅ B402Token deployed successfully!');
  console.log('═'.repeat(60));
  console.log(`\n📍 Contract Address: ${contractAddress}`);
  console.log(`🔗 BSCScan: https://testnet.bscscan.com/address/${contractAddress}`);

  // Get token details
  const name = await contract.name();
  const symbol = await contract.symbol();
  const totalSupply = await contract.totalSupply();
  const maxSupply = await contract.MAX_SUPPLY();
  const earlyUserAllocation = await contract.EARLY_USER_ALLOCATION();
  const tokensPerUSDT = await contract.tokensPerUSDT();

  console.log('\n📊 Token Details:');
  console.log('─'.repeat(60));
  console.log(`Name:                ${name}`);
  console.log(`Symbol:              ${symbol}`);
  console.log(`Total Supply:        ${ethers.formatEther(totalSupply)} B402`);
  console.log(`Max Supply:          ${ethers.formatEther(maxSupply)} B402`);
  console.log(`User Allocation:     ${ethers.formatEther(earlyUserAllocation)} B402 (40%)`);
  console.log(`Reward Rate:         ${ethers.formatEther(tokensPerUSDT)} B402 per 1 USDT`);

  // Save deployment info
  const deploymentInfo = {
    network: 'BSC Testnet',
    contractAddress,
    deployerAddress: wallet.address,
    deploymentTx: contract.deploymentTransaction()?.hash,
    timestamp: new Date().toISOString(),
    tokenDetails: {
      name,
      symbol,
      totalSupply: ethers.formatEther(totalSupply),
      maxSupply: ethers.formatEther(maxSupply),
      earlyUserAllocation: ethers.formatEther(earlyUserAllocation),
      tokensPerUSDT: ethers.formatEther(tokensPerUSDT),
    },
    bscscanUrl: `https://testnet.bscscan.com/address/${contractAddress}`,
    abi,
  };

  const deploymentPath = path.join(__dirname, '..', 'b402-token-deployment.json');
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));

  console.log(`\n💾 Deployment info saved to: ${deploymentPath}`);

  console.log('\n📝 Next Steps:');
  console.log('─'.repeat(60));
  console.log('1. Verify contract on BSCScan:');
  console.log(`   https://testnet.bscscan.com/address/${contractAddress}#code`);
  console.log('');
  console.log('2. Update agent service with new token address:');
  console.log(`   export B402_TOKEN_ADDRESS=${contractAddress}`);
  console.log('');
  console.log('3. Create PancakeSwap liquidity pool:');
  console.log('   https://pancakeswap.finance/add');
  console.log(`   Add: B402 (${contractAddress}) + USDT`);
  console.log('');
  console.log('4. Users can now:');
  console.log('   - Pay 1 USDT → Get 100 B402 tokens (gasless!)');
  console.log('   - Trade B402 on PancakeSwap');
  console.log('   - Stake 10k B402 to become facilitator');
  console.log('');
  console.log('═'.repeat(60));
  console.log('🎉 B402 Protocol is ready to launch!');
  console.log('═'.repeat(60));

  return {
    contractAddress,
    abi,
  };
}

// Run deployment
if (require.main === module) {
  deployB402Token()
    .then(() => {
      console.log('\n✅ Deployment complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Deployment failed:', error);
      process.exit(1);
    });
}

export { deployB402Token };
