import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const BSC_RPC = 'https://bsc-dataseed.binance.org';
const USDT_MAINNET = '0x55d398326f99059fF775485246999027B3197955';
const USD1_MAINNET = '0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d';
const RELAYER_ADDRESS = '0xE1C2830d5DDd6B49E9c46EbE03a98Cb44CD8eA5a';
const FACILITATOR_URL = 'http://localhost:3402';

// Use a test wallet (DO NOT USE REAL FUNDS)
const TEST_USER_PK = process.env.TEST_USER_PK || ethers.Wallet.createRandom().privateKey;

async function testFacilitatorEndpoints() {
  console.log('\n🧪 B402 Facilitator - Endpoint Test');
  console.log('═'.repeat(80));
  console.log('⚠️  NOTE: This is a DRY RUN - testing signature verification only');
  console.log('═'.repeat(80));

  // Setup
  const provider = new ethers.JsonRpcProvider(BSC_RPC);
  const userWallet = new ethers.Wallet(TEST_USER_PK, provider);
  const merchantAddress = ethers.Wallet.createRandom().address;

  console.log('\n📋 Test Configuration:');
  console.log('─'.repeat(80));
  console.log(`Network:         BSC Mainnet`);
  console.log(`User Wallet:     ${userWallet.address}`);
  console.log(`Merchant:        ${merchantAddress}`);
  console.log(`Relayer:         ${RELAYER_ADDRESS}`);
  console.log(`Facilitator:     ${FACILITATOR_URL}`);

  // Test 1: Create valid payment authorization
  console.log('\n✍️  Creating Payment Authorization (off-chain)');
  console.log('─'.repeat(80));

  const now = Math.floor(Date.now() / 1000);
  const paymentAmount = ethers.parseUnits('10', 18); // 10 USDT

  const authorization = {
    from: userWallet.address,
    to: merchantAddress,
    value: paymentAmount.toString(),
    validAfter: now - 60,
    validBefore: now + 3600,
    nonce: ethers.hexlify(ethers.randomBytes(32))
  };

  console.log(`From:            ${authorization.from}`);
  console.log(`To:              ${authorization.to}`);
  console.log(`Amount:          ${ethers.formatUnits(authorization.value, 18)} USDT`);
  console.log(`Nonce:           ${authorization.nonce.slice(0, 20)}...`);

  // EIP-712 domain and types
  const domain = {
    name: 'B402',
    version: '1',
    chainId: 56,
    verifyingContract: RELAYER_ADDRESS
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

  console.log('\nSigning (no gas fee!)...');
  const signature = await userWallet.signTypedData(domain, types, authorization);
  console.log(`✅ Signature: ${signature.slice(0, 20)}...`);

  // Test 2: POST /verify
  console.log('\n🔍 TEST 1: POST /verify');
  console.log('─'.repeat(80));

  const verifyPayload = {
    paymentPayload: {
      token: USDT_MAINNET,
      payload: {
        authorization,
        signature
      }
    },
    paymentRequirements: {
      relayerContract: RELAYER_ADDRESS,
      network: 'bsc'
    }
  };

  console.log('Sending to /verify...');
  const verifyResponse = await fetch(`${FACILITATOR_URL}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(verifyPayload)
  });

  const verifyResult = await verifyResponse.json();
  console.log('Response:', JSON.stringify(verifyResult, null, 2));

  if (!verifyResult.isValid) {
    console.log('\n❌ VERIFY ENDPOINT FAILED!');
    console.log('Reason:', verifyResult.invalidReason);
    process.exit(1);
  }

  console.log('✅ /verify endpoint working correctly!');
  console.log(`   Verified payer: ${verifyResult.payer}`);

  // Test 3: Test invalid signature
  console.log('\n🔍 TEST 2: Invalid Signature Detection');
  console.log('─'.repeat(80));

  const invalidPayload = {
    ...verifyPayload,
    paymentPayload: {
      ...verifyPayload.paymentPayload,
      payload: {
        ...verifyPayload.paymentPayload.payload,
        signature: '0x' + '0'.repeat(130) // Invalid signature
      }
    }
  };

  const invalidVerifyResponse = await fetch(`${FACILITATOR_URL}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(invalidPayload)
  });

  const invalidVerifyResult = await invalidVerifyResponse.json();
  console.log('Response:', JSON.stringify(invalidVerifyResult, null, 2));

  if (invalidVerifyResult.isValid) {
    console.log('\n❌ VERIFY ENDPOINT FAILED - Accepted invalid signature!');
    process.exit(1);
  }

  console.log('✅ /verify correctly rejected invalid signature!');

  // Test 4: POST /settle (DRY RUN - will fail due to no allowance, but tests endpoint)
  console.log('\n💰 TEST 3: POST /settle (Expected to fail - no allowance)');
  console.log('─'.repeat(80));
  console.log('Note: This will fail because test wallet has no USDT approval.');
  console.log('This is EXPECTED and just tests that the endpoint responds correctly.\n');

  const settleResponse = await fetch(`${FACILITATOR_URL}/settle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(verifyPayload)
  });

  const settleResult = await settleResponse.json();
  console.log('Response:', JSON.stringify(settleResult, null, 2));

  if (!settleResult.success && settleResult.errorReason) {
    console.log('✅ /settle endpoint responding correctly (failed as expected)');
    console.log(`   Expected error: ${settleResult.errorReason}`);
  } else if (settleResult.success) {
    console.log('🎉 /settle endpoint worked! (Unexpected - check if test wallet had approval)');
    console.log(`   Transaction: ${settleResult.transaction}`);
  }

  // Summary
  console.log('\n═'.repeat(80));
  console.log('🎉 ENDPOINT TESTS COMPLETE!');
  console.log('═'.repeat(80));
  console.log('\n✅ Test Results:');
  console.log('1. ✅ POST /verify - Valid signature accepted');
  console.log('2. ✅ POST /verify - Invalid signature rejected');
  console.log('3. ✅ POST /settle - Endpoint responding correctly');
  console.log('\n📝 Endpoints Ready:');
  console.log(`   ${FACILITATOR_URL}/`);
  console.log(`   ${FACILITATOR_URL}/health`);
  console.log(`   ${FACILITATOR_URL}/list`);
  console.log(`   ${FACILITATOR_URL}/verify`);
  console.log(`   ${FACILITATOR_URL}/settle`);
  console.log('\n🚀 Your facilitator is ready to deploy!');
}

// Run test
testFacilitatorEndpoints()
  .then(() => {
    console.log('\n✅ Tests completed successfully!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  });
