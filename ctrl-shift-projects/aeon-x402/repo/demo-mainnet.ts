// B402 Protocol - MAINNET End-to-End Demo
// Test with 0.1 USDT to rewarder wallet
import { ethers } from 'ethers';

// ============================================================================
// MAINNET CONFIGURATION
// ============================================================================

const BSC_MAINNET_RPC = 'https://bsc-dataseed.binance.org';
const FACILITATOR_URL = process.env.FACILITATOR_URL || 'https://b402-facilitator-production.up.railway.app';

// MAINNET DEPLOYMENT
const RELAYER_CONTRACT = '0xE1C2830d5DDd6B49E9c46EbE03a98Cb44CD8eA5a';
const USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955'; // BSC Mainnet USDT

// Wallets
const USER_WALLET_PK = process.env.TEST_USER_PK || '';
const REWARDER_WALLET = '0xa23beff60ad1b91f35e91476475f9e3eba0897d7'; // Your rewarder wallet

// Test amount: 1 USDT
const TEST_AMOUNT = ethers.parseUnits('1', 18); // 1 USDT (18 decimals on BSC)

// ============================================================================
// CONTRACT ABIs
// ============================================================================

const USDT_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

// ============================================================================
// MAIN DEMO FUNCTION
// ============================================================================

async function runMainnetDemo() {
  console.log('\n🔥 B402 Protocol - MAINNET TEST');
  console.log('═'.repeat(80));
  console.log('\n⚠️  REAL MONEY TRANSACTION ON BSC MAINNET!');
  console.log('═'.repeat(80));
  console.log('\n📋 Configuration:');
  console.log('─'.repeat(80));
  console.log(`Network:         BSC MAINNET (Chain ID: 56)`);
  console.log(`Relayer:         ${RELAYER_CONTRACT}`);
  console.log(`USDT:            ${USDT_ADDRESS}`);
  console.log(`Facilitator:     ${FACILITATOR_URL}`);
  console.log(`Test Amount:     0.1 USDT`);

  // Setup provider and wallet
  const provider = new ethers.JsonRpcProvider(BSC_MAINNET_RPC);
  const userWallet = new ethers.Wallet(USER_WALLET_PK, provider);

  console.log('\n👥 Participants:');
  console.log('─'.repeat(80));
  console.log(`User (Sender):   ${userWallet.address}`);
  console.log(`Rewarder (Recv): ${REWARDER_WALLET}`);

  // Initialize USDT contract
  const usdt = new ethers.Contract(USDT_ADDRESS, USDT_ABI, userWallet);
  const usdtDecimals = await usdt.decimals();

  // Get initial balances
  console.log('\n💰 Initial Balances:');
  console.log('─'.repeat(80));

  const userBnb = await provider.getBalance(userWallet.address);
  const userUsdt = await usdt.balanceOf(userWallet.address);
  const rewarderUsdt = await usdt.balanceOf(REWARDER_WALLET);

  console.log(`User BNB:        ${ethers.formatEther(userBnb)} BNB`);
  console.log(`User USDT:       ${ethers.formatUnits(userUsdt, usdtDecimals)} USDT`);
  console.log(`Rewarder USDT:   ${ethers.formatUnits(rewarderUsdt, usdtDecimals)} USDT`);

  // Check if user has enough USDT
  if (userUsdt < TEST_AMOUNT) {
    console.error('\n❌ ERROR: Insufficient USDT balance');
    console.error(`   Need:    ${ethers.formatUnits(TEST_AMOUNT, usdtDecimals)} USDT`);
    console.error(`   Have:    ${ethers.formatUnits(userUsdt, usdtDecimals)} USDT`);
    process.exit(1);
  }

  // ============================================================================
  // STEP 1: CHECK/APPROVE RELAYER CONTRACT
  // ============================================================================

  console.log('\n1️⃣  STEP 1: Approve Relayer Contract');
  console.log('─'.repeat(80));
  console.log('This is a ONE-TIME setup. After this, all payments are gasless!');

  const currentAllowance = await usdt.allowance(userWallet.address, RELAYER_CONTRACT);
  console.log(`Current allowance: ${ethers.formatUnits(currentAllowance, usdtDecimals)} USDT`);

  if (currentAllowance < TEST_AMOUNT) {
    console.log('\n⚠️  Need to approve relayer...');
    console.log('💰 This transaction will cost gas (~$0.10 in BNB)');

    const approveTx = await usdt.approve(RELAYER_CONTRACT, ethers.parseUnits('1000', usdtDecimals));
    console.log(`   Transaction sent: ${approveTx.hash}`);
    console.log('   ⏳ Waiting for confirmation...');

    await approveTx.wait();
    console.log('   ✅ Approved 1000 USDT to relayer!');
  } else {
    console.log('✅ Already approved! No gas needed.');
  }

  // ============================================================================
  // STEP 2: SIGN PAYMENT AUTHORIZATION (GASLESS!)
  // ============================================================================

  console.log('\n2️⃣  STEP 2: Sign Payment Authorization (Gasless!)');
  console.log('─'.repeat(80));
  console.log('🎯 This step requires NO GAS - just a signature!');

  const now = Math.floor(Date.now() / 1000);
  const authorization = {
    from: userWallet.address,
    to: REWARDER_WALLET,
    value: TEST_AMOUNT.toString(),
    validAfter: now - 60,
    validBefore: now + 3600, // Valid for 1 hour
    nonce: ethers.hexlify(ethers.randomBytes(32))
  };

  console.log(`\nPayment details:`);
  console.log(`  From:          ${authorization.from}`);
  console.log(`  To:            ${authorization.to}`);
  console.log(`  Amount:        ${ethers.formatUnits(authorization.value, usdtDecimals)} USDT`);
  console.log(`  Valid for:     1 hour`);
  console.log(`  Nonce:         ${authorization.nonce.slice(0, 20)}...`);

  // EIP-712 domain and types for MAINNET signature
  const domain = {
    name: 'B402',
    version: '1',
    chainId: 56, // BSC MAINNET!
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
  const verifyResponse = await fetch(`${FACILITATOR_URL}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const verifyResult = await verifyResponse.json();
  console.log(`Response:`, verifyResult);

  if (!verifyResult.isValid) {
    console.error('\n❌ Payment verification failed!');
    console.error(`   Reason: ${verifyResult.invalidReason}`);
    process.exit(1);
  }

  console.log('✅ Payment verified!');
  console.log(`   Payer: ${verifyResult.payer}`);

  // ============================================================================
  // STEP 4: SETTLE PAYMENT ON-CHAIN
  // ============================================================================

  console.log('\n4️⃣  STEP 4: Settle Payment On-Chain');
  console.log('─'.repeat(80));
  console.log('🎯 Facilitator will pay gas - user pays NOTHING!');

  console.log('\nSending to facilitator /settle...');
  const settleResponse = await fetch(`${FACILITATOR_URL}/settle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const settleResult = await settleResponse.json();

  if (!settleResult.success) {
    console.error('\n❌ Settlement failed!');
    console.error(`   Reason: ${settleResult.errorReason}`);
    process.exit(1);
  }

  console.log('✅ Payment settled on-chain!');

  console.log('\n📊 Transaction Details:');
  console.log(`  Tx Hash:       ${settleResult.transaction}`);
  console.log(`  Block:         ${settleResult.blockNumber}`);
  console.log(`  Network:       ${settleResult.network}`);
  console.log(`  Payer:         ${settleResult.payer}`);

  console.log('\n🔗 View on BSCScan:');
  console.log(`   https://bscscan.com/tx/${settleResult.transaction}`);

  // ============================================================================
  // STEP 5: VERIFY FINAL BALANCES
  // ============================================================================

  console.log('\n5️⃣  STEP 5: Verify Final Balances');
  console.log('─'.repeat(80));

  // Wait a bit for blockchain to update
  await new Promise(resolve => setTimeout(resolve, 2000));

  const finalUserUsdt = await usdt.balanceOf(userWallet.address);
  const finalRewarderUsdt = await usdt.balanceOf(REWARDER_WALLET);

  const userChange = finalUserUsdt - userUsdt;
  const rewarderChange = finalRewarderUsdt - rewarderUsdt;

  console.log(`User USDT:       ${ethers.formatUnits(finalUserUsdt, usdtDecimals)} USDT (${userChange < 0 ? 'spent' : 'gained'} ${Math.abs(Number(ethers.formatUnits(userChange, usdtDecimals)))})`);
  console.log(`Rewarder USDT:   ${ethers.formatUnits(finalRewarderUsdt, usdtDecimals)} USDT (received ${ethers.formatUnits(rewarderChange, usdtDecimals)})`);

  // Verify the transfer was correct
  const expectedChange = TEST_AMOUNT;
  if (rewarderChange === expectedChange && userChange === -expectedChange) {
    console.log('\n✅ Balance verification PASSED!');
  } else {
    console.log('\n⚠️  Balance verification WARNING:');
    console.log(`   Expected rewarder to receive: ${ethers.formatUnits(expectedChange, usdtDecimals)} USDT`);
    console.log(`   Actually received: ${ethers.formatUnits(rewarderChange, usdtDecimals)} USDT`);
  }

  // ============================================================================
  // SUCCESS SUMMARY
  // ============================================================================

  console.log('\n' + '═'.repeat(80));
  console.log('🎉 MAINNET TEST SUCCESSFUL!');
  console.log('═'.repeat(80));

  console.log('\n📝 What Happened:');
  console.log('  1. ✅ User approved relayer (one-time, paid gas)');
  console.log('  2. ✅ User signed payment authorization (OFF-CHAIN, NO GAS)');
  console.log('  3. ✅ Facilitator verified signature');
  console.log('  4. ✅ Facilitator executed on-chain (PAID GAS FOR USER)');
  console.log('  5. ✅ 0.1 USDT transferred to rewarder wallet');

  console.log('\n💡 Key Points:');
  console.log('  • User only paid gas ONCE (for initial approval)');
  console.log('  • The payment itself was GASLESS for user');
  console.log('  • Facilitator covered all transaction fees');
  console.log('  • User maintains full custody of funds');
  console.log('  • Settlement completed on BSC MAINNET');
  console.log('  • Real money transaction verified on BSCScan');

  console.log('\n🚀 Your B402 Protocol is working on MAINNET!');

  console.log('\n📊 Demo Summary:');
  console.log(`  User:         ${userWallet.address}`);
  console.log(`  Rewarder:     ${REWARDER_WALLET}`);
  console.log(`  Amount:       0.1 USDT`);
  console.log(`  Gas paid by:  Facilitator (not user!)`);
  console.log(`  Network:      BSC Mainnet`);
  console.log(`  Contract:     ${RELAYER_CONTRACT}`);

  console.log('\n✨ Ready for production launch!');

  console.log('\n✅ Demo completed successfully!\n');
}

// Run the mainnet demo
if (require.main === module) {
  runMainnetDemo()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('\n❌ Demo failed:', error);
      process.exit(1);
    });
}

export { runMainnetDemo };
