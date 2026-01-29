#!/usr/bin/env tsx
// Quick Script for Users to Send USDT (Gasless!)
// Usage: tsx send-usdt.ts <recipient> <amount>
// Example: tsx send-usdt.ts 0xa23beff60ad1b91f35e91476475f9e3eba0897d7 0.1

import { ethers } from 'ethers';

// Configuration
const FACILITATOR_URL = process.env.FACILITATOR_URL || 'http://localhost:3402';
const RELAYER_CONTRACT = '0xE1C2830d5DDd6B49E9c46EbE03a98Cb44CD8eA5a';
const USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
const BSC_MAINNET_RPC = 'https://bsc-dataseed.binance.org';

const USDT_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
];

async function sendUSDT() {
  // Get arguments
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('\n❌ Usage: tsx send-usdt.ts <recipient> <amount>');
    console.log('\nExample:');
    console.log('  tsx send-usdt.ts 0xa23beff60ad1b91f35e91476475f9e3eba0897d7 0.1');
    console.log('\nEnvironment Variables:');
    console.log('  PRIVATE_KEY=0x...           (Required: Your wallet private key)');
    console.log('  FACILITATOR_URL=https://... (Optional: Facilitator URL)');
    console.log('');
    process.exit(1);
  }

  const recipient = args[0];
  const amount = args[1];

  // Validate inputs
  if (!ethers.isAddress(recipient)) {
    console.error('\n❌ Invalid recipient address!');
    process.exit(1);
  }

  if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    console.error('\n❌ Invalid amount!');
    process.exit(1);
  }

  // Get private key
  const privateKey = process.env.PRIVATE_KEY || process.env.TEST_USER_PK;
  if (!privateKey) {
    console.error('\n❌ PRIVATE_KEY environment variable not set!');
    console.error('\nSet it with:');
    console.error('  export PRIVATE_KEY=0x...');
    console.error('or');
    console.error('  PRIVATE_KEY=0x... tsx send-usdt.ts <recipient> <amount>');
    process.exit(1);
  }

  console.log('\n🚀 B402 Gasless USDT Transfer');
  console.log('═'.repeat(60));

  try {
    // Setup
    const provider = new ethers.JsonRpcProvider(BSC_MAINNET_RPC);
    const wallet = new ethers.Wallet(privateKey, provider);
    const usdt = new ethers.Contract(USDT_ADDRESS, USDT_ABI, wallet);

    console.log('\n📋 Transaction Details:');
    console.log(`   From:       ${wallet.address}`);
    console.log(`   To:         ${recipient}`);
    console.log(`   Amount:     ${amount} USDT`);
    console.log(`   Network:    BSC Mainnet`);
    console.log(`   Gas Cost:   $0.00 (facilitator pays!)`);

    // Get token info
    const [decimals, symbol, balance] = await Promise.all([
      usdt.decimals(),
      usdt.symbol(),
      usdt.balanceOf(wallet.address)
    ]);

    console.log('\n💰 Your Balance:');
    console.log(`   ${ethers.formatUnits(balance, decimals)} ${symbol}`);

    const value = ethers.parseUnits(amount, decimals);

    if (balance < value) {
      console.error(`\n❌ Insufficient balance!`);
      console.error(`   Need: ${amount} ${symbol}`);
      console.error(`   Have: ${ethers.formatUnits(balance, decimals)} ${symbol}`);
      process.exit(1);
    }

    // Check approval
    console.log('\n🔍 Checking approval...');
    const allowance = await usdt.allowance(wallet.address, RELAYER_CONTRACT);

    if (allowance < value) {
      console.log('⚠️  Need to approve relayer first (one-time setup)');
      console.log('💰 This will cost ~$0.10 in BNB gas');
      console.log('⏳ Approving...');

      const approveTx = await usdt.approve(
        RELAYER_CONTRACT,
        ethers.parseUnits('1000000', decimals)
      );

      console.log(`   Tx: ${approveTx.hash}`);
      await approveTx.wait();
      console.log('   ✅ Approved!');
    } else {
      console.log('   ✅ Already approved');
    }

    // Sign payment authorization
    console.log('\n✍️  Signing payment (no gas!)...');

    const now = Math.floor(Date.now() / 1000);
    const authorization = {
      from: wallet.address,
      to: recipient,
      value: value.toString(),
      validAfter: now - 60,
      validBefore: now + 3600,
      nonce: ethers.hexlify(ethers.randomBytes(32))
    };

    const domain = {
      name: 'B402',
      version: '1',
      chainId: 56,
      verifyingContract: RELAYER_CONTRACT
    };

    const types = {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' }
      ]
    };

    const signature = await wallet.signTypedData(domain, types, authorization);
    console.log(`   ✅ Signed!`);

    // Verify with facilitator
    console.log('\n🔍 Verifying with facilitator...');

    const payload = {
      paymentPayload: {
        token: USDT_ADDRESS,
        payload: { authorization, signature }
      },
      paymentRequirements: {
        relayerContract: RELAYER_CONTRACT,
        network: 'bsc'
      }
    };

    const verifyResponse = await fetch(`${FACILITATOR_URL}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const verifyResult = await verifyResponse.json();

    if (!verifyResult.isValid) {
      console.error(`\n❌ Verification failed: ${verifyResult.invalidReason}`);
      process.exit(1);
    }

    console.log('   ✅ Verified!');

    // Execute payment
    console.log('\n💸 Executing payment (facilitator pays gas!)...');

    const settleResponse = await fetch(`${FACILITATOR_URL}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const settleResult = await settleResponse.json();

    if (!settleResult.success) {
      console.error(`\n❌ Settlement failed: ${settleResult.errorReason}`);
      process.exit(1);
    }

    console.log('   ✅ Success!');

    console.log('\n🎉 Payment Complete!');
    console.log('═'.repeat(60));
    console.log(`\n📊 Transaction:`);
    console.log(`   Hash:       ${settleResult.transaction}`);
    console.log(`   Block:      ${settleResult.blockNumber}`);
    console.log(`   BSCScan:    https://bscscan.com/tx/${settleResult.transaction}`);

    console.log(`\n💡 You paid $0 in gas!`);
    console.log(`   Facilitator covered all fees for you.\n`);

  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
}

sendUSDT();
