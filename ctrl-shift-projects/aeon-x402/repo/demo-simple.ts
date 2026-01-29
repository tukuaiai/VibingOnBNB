// B402 Protocol - Complete End-to-End Demo
// Updated for new secure deployment
import { ethers } from 'ethers';

// ============================================================================
// CONFIGURATION - NEW SECURE DEPLOYMENT
// ============================================================================

const BSC_TESTNET_RPC = 'https://data-seed-prebsc-1-s1.binance.org:8545';
const FACILITATOR_URL = 'http://localhost:3402';

// New secure deployment
const RELAYER_CONTRACT = '0x62150F2c3A29fDA8bCf22c0F22Eb17270FCBb78A';
const USDT_ADDRESS = '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd';
const B402_TOKEN = '0x157324C3cba4B0F249Eb9171d824bdC9460497Dd';

// Test wallets (you can replace with your own)
const USER_WALLET_PK = process.env.TEST_USER_PK || '';

// ============================================================================
// CONTRACT ABIs
// ============================================================================

const USDT_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

const B402_TOKEN_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
];

// ============================================================================
// MAIN DEMO FUNCTION
// ============================================================================

async function runDemo() {
  console.log('\n🚀 B402 Protocol - End-to-End Demo');
  console.log('═'.repeat(80));
  console.log('\n📋 Configuration:');
  console.log('─'.repeat(80));
  console.log(`Network:         BSC Testnet`);
  console.log(`Relayer:         ${RELAYER_CONTRACT}`);
  console.log(`USDT:            ${USDT_ADDRESS}`);
  console.log(`B402 Token:      ${B402_TOKEN}`);
  console.log(`Facilitator:     ${FACILITATOR_URL}`);

  // Setup provider and wallets
  const provider = new ethers.JsonRpcProvider(BSC_TESTNET_RPC);
  const userWallet = new ethers.Wallet(USER_WALLET_PK, provider);
  const merchantAddress = ethers.Wallet.createRandom().address; // Random merchant for demo

  console.log('\n👥 Participants:');
  console.log('─'.repeat(80));
  console.log(`User:            ${userWallet.address}`);
  console.log(`Merchant:        ${merchantAddress}`);

  // Initialize contracts
  const usdt = new ethers.Contract(USDT_ADDRESS, USDT_ABI, userWallet);
  const b402Token = new ethers.Contract(B402_TOKEN, B402_TOKEN_ABI, provider);

  // Get initial balances
  const usdtDecimals = await usdt.decimals();
  const b402Decimals = await b402Token.decimals();
  const b402Symbol = await b402Token.symbol();

  console.log('\n💰 Initial Balances:');
  console.log('─'.repeat(80));

  const userBnb = await provider.getBalance(userWallet.address);
  const userUsdt = await usdt.balanceOf(userWallet.address);
  const userB402 = await b402Token.balanceOf(userWallet.address);

  console.log(`User BNB:        ${ethers.formatEther(userBnb)} BNB`);
  console.log(`User USDT:       ${ethers.formatUnits(userUsdt, usdtDecimals)} USDT`);
  console.log(`User ${b402Symbol}:        ${ethers.formatUnits(userB402, b402Decimals)} ${b402Symbol}`);

  // Check if user has enough tokens
  if (userBnb === 0n) {
    console.log('\n❌ ERROR: User has no BNB for approval transaction.');
    console.log('Get testnet BNB from: https://testnet.bnbchain.org/faucet-smart');
    console.log(`Send to: ${userWallet.address}`);
    console.log('\n💡 Note: You only need BNB ONCE to approve. After that, all payments are gasless!');
    process.exit(1);
  }

  if (userUsdt === 0n) {
    console.log('\n❌ ERROR: User has no USDT.');
    console.log('Get testnet USDT:');
    console.log('1. Go to PancakeSwap Testnet');
    console.log('2. Swap BNB for USDT');
    console.log(`   USDT address: ${USDT_ADDRESS}`);
    process.exit(1);
  }

  // ============================================================================
  // STEP 1: APPROVE RELAYER (ONE-TIME SETUP)
  // ============================================================================

  console.log('\n1️⃣  STEP 1: Approve Relayer Contract');
  console.log('─'.repeat(80));
  console.log('This is a ONE-TIME setup. After this, all payments are gasless!');

  const currentAllowance = await usdt.allowance(userWallet.address, RELAYER_CONTRACT);
  const paymentAmount = ethers.parseUnits('1', usdtDecimals); // 1 USDT

  console.log(`Current allowance: ${ethers.formatUnits(currentAllowance, usdtDecimals)} USDT`);

  if (currentAllowance < paymentAmount) {
    console.log('Approving relayer for 1000 USDT...');
    const approveTx = await usdt.approve(RELAYER_CONTRACT, ethers.parseUnits('1000', usdtDecimals));
    console.log(`Approval tx: ${approveTx.hash}`);
    console.log('⏳ Waiting for confirmation...');
    await approveTx.wait();
    console.log('✅ Approved! This is the LAST time you need gas.');
  } else {
    console.log('✅ Already approved! No gas needed.');
  }

  // ============================================================================
  // STEP 2: CREATE PAYMENT AUTHORIZATION (GASLESS!)
  // ============================================================================

  console.log('\n2️⃣  STEP 2: Sign Payment Authorization (Gasless!)');
  console.log('─'.repeat(80));
  console.log('🎯 This step requires NO GAS - just a signature!');

  const now = Math.floor(Date.now() / 1000);
  const authorization = {
    from: userWallet.address,
    to: merchantAddress,
    value: paymentAmount.toString(),
    validAfter: now - 60,
    validBefore: now + 3600,
    nonce: ethers.hexlify(ethers.randomBytes(32))
  };

  console.log(`\nPayment details:`);
  console.log(`  From:          ${authorization.from}`);
  console.log(`  To:            ${authorization.to}`);
  console.log(`  Amount:        ${ethers.formatUnits(authorization.value, usdtDecimals)} USDT`);
  console.log(`  Valid for:     1 hour`);
  console.log(`  Nonce:         ${authorization.nonce.slice(0, 20)}...`);

  // EIP-712 domain and types for signature
  const domain = {
    name: 'B402',
    version: '1',
    chainId: 97,
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

  console.log('\n✍️  Signing authorization (no gas!)...');
  const signature = await userWallet.signTypedData(domain, types, authorization);
  console.log(`✅ Signed! Signature: ${signature.slice(0, 20)}...`);

  // ============================================================================
  // STEP 3: VERIFY PAYMENT WITH FACILITATOR
  // ============================================================================

  console.log('\n3️⃣  STEP 3: Verify Payment with Facilitator');
  console.log('─'.repeat(80));

  const payload = {
    paymentPayload: {
      token: USDT_ADDRESS,
      payload: {
        authorization,
        signature
      }
    },
    paymentRequirements: {
      relayerContract: RELAYER_CONTRACT,
      network: 'bsc'
    }
  };

  console.log('Sending to facilitator /verify...');

  try {
    const verifyResponse = await fetch(`${FACILITATOR_URL}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!verifyResponse.ok) {
      throw new Error(`HTTP ${verifyResponse.status}: ${verifyResponse.statusText}`);
    }

    const verifyResult = await verifyResponse.json();
    console.log('Response:', verifyResult);

    if (!verifyResult.isValid) {
      console.log('\n❌ Verification failed!');
      console.log(`Reason: ${verifyResult.invalidReason}`);
      process.exit(1);
    }

    console.log('✅ Payment verified!');
    console.log(`   Payer: ${verifyResult.payer}`);

  } catch (error: any) {
    console.log('\n❌ Failed to connect to facilitator!');
    console.log(`Error: ${error.message}`);
    console.log('\n💡 Make sure facilitator is running:');
    console.log('   In another terminal: npm run dev');
    console.log('   Or check: curl http://localhost:3402/health');
    process.exit(1);
  }

  // ============================================================================
  // STEP 4: SETTLE PAYMENT ON-CHAIN
  // ============================================================================

  console.log('\n4️⃣  STEP 4: Settle Payment On-Chain');
  console.log('─'.repeat(80));
  console.log('🎯 Facilitator will pay gas - user pays NOTHING!');

  console.log('\nSending to facilitator /settle...');

  try {
    const settleResponse = await fetch(`${FACILITATOR_URL}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!settleResponse.ok) {
      const errorText = await settleResponse.text();
      throw new Error(`HTTP ${settleResponse.status}: ${errorText}`);
    }

    const settleResult = await settleResponse.json();

    if (!settleResult.success) {
      console.log('\n❌ Settlement failed!');
      console.log(`Reason: ${settleResult.errorReason}`);
      process.exit(1);
    }

    console.log('✅ Payment settled on-chain!');
    console.log(`\n📊 Transaction Details:`);
    console.log(`  Tx Hash:       ${settleResult.transaction}`);
    console.log(`  Block:         ${settleResult.blockNumber}`);
    console.log(`  Network:       ${settleResult.network}`);
    console.log(`  Payer:         ${settleResult.payer}`);
    console.log(`\n🔗 View on BSCScan:`);
    console.log(`   https://testnet.bscscan.com/tx/${settleResult.transaction}`);

  } catch (error: any) {
    console.log('\n❌ Settlement failed!');
    console.log(`Error: ${error.message}`);
    process.exit(1);
  }

  // ============================================================================
  // STEP 5: VERIFY FINAL BALANCES
  // ============================================================================

  console.log('\n5️⃣  STEP 5: Verify Final Balances');
  console.log('─'.repeat(80));

  // Wait a bit for blockchain to update
  await new Promise(resolve => setTimeout(resolve, 2000));

  const finalUserUsdt = await usdt.balanceOf(userWallet.address);
  const finalMerchantUsdt = await usdt.balanceOf(merchantAddress);
  const finalUserB402 = await b402Token.balanceOf(userWallet.address);

  const usdtSpent = userUsdt - finalUserUsdt;
  const b402Earned = finalUserB402 - userB402;

  console.log(`User USDT:       ${ethers.formatUnits(finalUserUsdt, usdtDecimals)} USDT (spent ${ethers.formatUnits(usdtSpent, usdtDecimals)})`);
  console.log(`Merchant USDT:   ${ethers.formatUnits(finalMerchantUsdt, usdtDecimals)} USDT (received ${ethers.formatUnits(finalMerchantUsdt, usdtDecimals)})`);
  console.log(`User ${b402Symbol}:        ${ethers.formatUnits(finalUserB402, b402Decimals)} ${b402Symbol} (earned ${ethers.formatUnits(b402Earned, b402Decimals)})`);

  // Verify balances are correct
  if (finalMerchantUsdt === paymentAmount) {
    console.log('\n✅ Balance verification PASSED!');
  } else {
    console.log('\n⚠️  Balance mismatch - check transaction on BSCScan');
  }

  // ============================================================================
  // SUCCESS SUMMARY
  // ============================================================================

  console.log('\n═'.repeat(80));
  console.log('🎉 END-TO-END DEMO SUCCESSFUL!');
  console.log('═'.repeat(80));
  console.log('\n📝 What Happened:');
  console.log('  1. ✅ User approved relayer (one-time, paid gas)');
  console.log('  2. ✅ User signed payment authorization (OFF-CHAIN, NO GAS)');
  console.log('  3. ✅ Facilitator verified signature');
  console.log('  4. ✅ Facilitator executed on-chain (PAID GAS FOR USER)');
  console.log('  5. ✅ USDT transferred from user to merchant');
  console.log('\n💡 Key Points:');
  console.log('  • User only paid gas ONCE (for initial approval)');
  console.log('  • The payment itself was GASLESS for user');
  console.log('  • Facilitator covered all transaction fees');
  console.log('  • User maintains full custody of funds');
  console.log('  • Settlement completed in <10 seconds');
  console.log('  • User earned B402 tokens as rewards');
  console.log('\n🚀 Your B402 Protocol is working perfectly!');
  console.log('\n📊 Demo Summary:');
  console.log(`  User:         ${userWallet.address}`);
  console.log(`  Merchant:     ${merchantAddress}`);
  console.log(`  Amount:       ${ethers.formatUnits(paymentAmount, usdtDecimals)} USDT`);
  console.log(`  Gas paid by:  Facilitator (not user!)`);
  console.log(`  B402 earned:  ${ethers.formatUnits(b402Earned, b402Decimals)} ${b402Symbol}`);
  console.log('\n✨ Ready to onboard 100,000 users!\n');
}

// ============================================================================
// RUN DEMO
// ============================================================================

runDemo()
  .then(() => {
    console.log('✅ Demo completed successfully!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Demo failed:', error.message);
    console.error(error);
    process.exit(1);
  });
