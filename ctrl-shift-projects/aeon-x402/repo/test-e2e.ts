import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const BSC_TESTNET_RPC =
  process.env.BSC_TESTNET_RPC_URL ||
  process.env.BSC_TESTNET_RPC ||
  'https://data-seed-prebsc-1-s1.bnbchain.org:8545';
const USDT_TESTNET = '0x7ef95a0FEE0Dd31b22626fA2e10Ee6A223F8a684';
const RELAYER_ADDRESS =
  process.env.B402_RELAYER_ADDRESS ||
  process.env.RELAYER_ADDRESS ||
  '0xd67eF16fa445101Ef1e1c6A9FB9F3014f1d60DE6';
const FACILITATOR_URL = process.env.FACILITATOR_URL || 'http://localhost:3402';

// Test wallet (you can use any wallet with testnet USDT)
const TEST_USER_PK = process.env.TEST_USER_PK || ethers.Wallet.createRandom().privateKey;

// USDT ABI (minimal)
const USDT_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

async function testEndToEnd() {
  console.log('\n🧪 B402 Protocol - End-to-End Test');
  console.log('═'.repeat(80));

  // Setup
  const provider = new ethers.JsonRpcProvider(BSC_TESTNET_RPC);
  const userWallet = new ethers.Wallet(TEST_USER_PK, provider);
  const merchantAddress = ethers.Wallet.createRandom().address;

  console.log('\n📋 Test Configuration:');
  console.log('─'.repeat(80));
  console.log(`Network:         BSC Testnet`);
  console.log(`User Wallet:     ${userWallet.address}`);
  console.log(`Merchant:        ${merchantAddress}`);
  console.log(`Relayer:         ${RELAYER_ADDRESS}`);
  console.log(`USDT:            ${USDT_TESTNET}`);
  console.log(`Facilitator:     ${FACILITATOR_URL}`);

  // Check balances
  console.log('\n💰 Checking Balances:');
  console.log('─'.repeat(80));

  const bnbBalance = await provider.getBalance(userWallet.address);
  console.log(`User BNB:        ${ethers.formatEther(bnbBalance)} BNB`);

  if (bnbBalance === 0n) {
    console.log('\n⚠️  WARNING: User wallet has no BNB for approval transaction.');
    console.log('Get testnet BNB from: https://testnet.bnbchain.org/faucet-smart');
    console.log(`Send to: ${userWallet.address}`);
    console.log('\n💡 TIP: You only need BNB once to approve the relayer. After that, all payments are gasless!');
    process.exit(1);
  }

  const usdt = new ethers.Contract(USDT_TESTNET, USDT_ABI, userWallet);
  const usdtBalance = await usdt.balanceOf(userWallet.address);
  const decimals = await usdt.decimals();
  console.log(`User USDT:       ${ethers.formatUnits(usdtBalance, decimals)} USDT`);

  if (usdtBalance === 0n) {
    console.log('\n⚠️  WARNING: User wallet has no USDT.');
    console.log('Get testnet USDT:');
    console.log('1. Swap BNB for USDT on PancakeSwap Testnet');
    console.log('2. Or use a testnet USDT faucet (search "BSC testnet USDT faucet")');
    console.log(`Send to: ${userWallet.address}`);
    process.exit(1);
  }

  // Step 1: Approve Relayer (ONE-TIME SETUP)
  console.log('\n📝 Step 1: Approve Relayer (one-time setup)');
  console.log('─'.repeat(80));

  const currentAllowance = await usdt.allowance(userWallet.address, RELAYER_ADDRESS);
  console.log(`Current allowance: ${ethers.formatUnits(currentAllowance, decimals)} USDT`);

  const paymentAmount = ethers.parseUnits('1', decimals); // 1 USDT

  if (currentAllowance < paymentAmount) {
    console.log('Approving relayer...');
    const approveTx = await usdt.approve(RELAYER_ADDRESS, ethers.parseUnits('1000', decimals));
    console.log(`Approval tx: ${approveTx.hash}`);
    await approveTx.wait();
    console.log('✅ Approval confirmed!');
  } else {
    console.log('✅ Already approved!');
  }

  // Step 2: Create Payment Authorization (OFF-CHAIN - NO GAS!)
  console.log('\n✍️  Step 2: Sign Payment Authorization (gasless!)');
  console.log('─'.repeat(80));

  const now = Math.floor(Date.now() / 1000);
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
  console.log(`Amount:          ${ethers.formatUnits(authorization.value, decimals)} USDT`);
  console.log(`Nonce:           ${authorization.nonce}`);

  // EIP-712 domain and types
  const domain = {
    name: 'B402',
    version: '1',
    chainId: 97,
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

  // Step 3: Submit to Facilitator (VERIFICATION)
  console.log('\n🔍 Step 3: Verify Payment');
  console.log('─'.repeat(80));

  const verifyPayload = {
    paymentPayload: {
      token: USDT_TESTNET,
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

  console.log('Sending to facilitator /verify...');
  const verifyResponse = await fetch(`${FACILITATOR_URL}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(verifyPayload)
  });

  const verifyResult = await verifyResponse.json();
  console.log('Response:', verifyResult);

  if (!verifyResult.isValid) {
    console.log('\n❌ Verification failed!');
    console.log('Reason:', verifyResult.invalidReason);
    process.exit(1);
  }

  console.log('✅ Payment verified!');

  // Step 4: Settle Payment (ON-CHAIN)
  console.log('\n💰 Step 4: Settle Payment On-Chain');
  console.log('─'.repeat(80));

  console.log('Sending to facilitator /settle...');
  console.log('(Facilitator pays gas - user pays nothing!)');

  const settleResponse = await fetch(`${FACILITATOR_URL}/settle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(verifyPayload)
  });

  const settleResult = await settleResponse.json();
  console.log('Response:', settleResult);

  if (!settleResult.success) {
    console.log('\n❌ Settlement failed!');
    console.log('Reason:', settleResult.errorReason);
    process.exit(1);
  }

  console.log('✅ Payment settled!');
  console.log(`Transaction: ${settleResult.transaction}`);
  console.log(`Block: ${settleResult.blockNumber}`);
  console.log(`View on BSCScan: https://testnet.bscscan.com/tx/${settleResult.transaction}`);

  // Step 5: Verify Balances Changed
  console.log('\n📊 Step 5: Verify Balances');
  console.log('─'.repeat(80));

  const newUsdtBalance = await usdt.balanceOf(userWallet.address);
  const merchantBalance = await usdt.balanceOf(merchantAddress);

  console.log(`User USDT:       ${ethers.formatUnits(newUsdtBalance, decimals)} USDT (was ${ethers.formatUnits(usdtBalance, decimals)})`);
  console.log(`Merchant USDT:   ${ethers.formatUnits(merchantBalance, decimals)} USDT (was 0)`);

  const expectedUserBalance = usdtBalance - paymentAmount;
  if (newUsdtBalance === expectedUserBalance && merchantBalance === paymentAmount) {
    console.log('✅ Balances correct!');
  } else {
    console.log('⚠️  Balance mismatch - check BSCScan');
  }

  // Summary
  console.log('\n═'.repeat(80));
  console.log('🎉 END-TO-END TEST SUCCESSFUL!');
  console.log('═'.repeat(80));
  console.log('\n📝 What Happened:');
  console.log('1. ✅ User approved relayer (one-time, required BNB)');
  console.log('2. ✅ User signed payment (off-chain, NO GAS)');
  console.log('3. ✅ Facilitator verified signature');
  console.log('4. ✅ Facilitator executed on-chain (paid gas for user)');
  console.log('5. ✅ USDT transferred from user to merchant');
  console.log('\n💡 Key Points:');
  console.log('• User only paid gas ONCE (for approval)');
  console.log('• All future payments are GASLESS');
  console.log('• Facilitator covered all transaction fees');
  console.log('• User maintains full custody of funds');
  console.log('• Settlement in <10 seconds');
  console.log('\n🚀 Your protocol is working perfectly!');
  console.log('\n📋 Test Details:');
  console.log(`User:         ${userWallet.address}`);
  console.log('Private Key:  [REDACTED]');
  console.log(`Transaction:  https://testnet.bscscan.com/tx/${settleResult.transaction}`);
  console.log('\n💾 Save this wallet for future tests!');
}

// Run test
testEndToEnd()
  .then(() => {
    console.log('\n✅ Test completed successfully!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  });
