# B402 Protocol

> BSC-native, multi-token gasless payment facilitator

Process x402-style payments on Binance Smart Chain with one drop-in endpoint. No API keys, no blockchain headaches—just plug and play.

---

## Quick Start

**Facilitator URL:** `https://facilitator.b402.ai`

### Drop-in Setup

1. **Point your merchant at the facilitator** and you're done.

2. Choose a **network**: `bsc` (mainnet) or `bsc-testnet`

3. **Ship**. The facilitator verifies & settles payments on your behalf.

```bash
# Try the Echo Merchant demo
cd examples/echo-merchant
npm install
export MERCHANT_PRIVATE_KEY=0x...
npm start

# Open http://localhost:3001
```

**[→ Full Getting Started Guide](docs/GETTING_STARTED.md)**

---

## Features

### ⚡ Gasless Experience
No BNB required for buyers or merchants. The facilitator covers network fees and handles verification/settlement so you can focus on your product.

### 🔓 No API Keys Required
Open API—no registration, no authentication. Just plug & play.

### 🌐 BSC Native
Built specifically for Binance Smart Chain ecosystem with USD1, USDT, USDC support.

### 🚀 Drop-in Integration
Compatible with x402 protocol standards. If you're using PayAI, switching to B402 takes 2 minutes.

---

## Important Notice

**USE AT YOUR OWN RISK.** This software is provided "as is" without warranty. The smart contracts have not been professionally audited. See [DISCLAIMER.md](DISCLAIMER.md) for full terms.

---

## Overview

B402 provides gasless payment functionality similar to Coinbase's x402 protocol, adapted for Binance Smart Chain. Users sign payment authorizations off-chain using EIP-712 signatures, and a relayer contract executes transactions on-chain while covering gas fees. This eliminates the need for users to hold BNB for transaction fees.

**Key Difference from x402:** B402 uses a relayer pattern to support standard ERC20 tokens (like BSC USDT) that lack native EIP-3009 support. This provides the same gasless payment experience while working with the existing BSC token ecosystem.

## Architecture

### Core Components

- **B402Relayer Contract**: Smart contract that validates EIP-712 signatures and executes token transfers
- **Facilitator Service**: Backend service that verifies signatures and submits transactions to the blockchain
- **B402 SDK**: Client library for creating payment authorizations and interacting with the facilitator

### Payment Flow

1. User creates payment authorization with EIP-712 signature
2. User sends authorization to facilitator service
3. Facilitator verifies signature validity and payment requirements
4. Facilitator submits transaction to relayer contract
5. Relayer contract validates signature and executes token transfer

## Repository Structure

```
b402-protocol/
├── contracts/              # Solidity smart contracts
│   ├── B402Relayer.sol    # V1 relayer contract
│   └── B402RelayerV2.sol  # V2 relayer contract with enhancements
├── b402-sdk/              # TypeScript SDK for client integration
│   ├── src/
│   │   ├── wallet.ts      # Payment authorization creation
│   │   ├── facilitator.ts # Facilitator client
│   │   └── types.ts       # Type definitions
├── b402-facilitator/      # Backend service
│   └── src/
│       └── server.ts      # API endpoints for verify/settle
├── scripts/               # Deployment scripts
│   ├── deploy-relayer.ts
│   └── deploy-relayer-v2.ts
└── frontend/              # Example frontend implementation
```

## Smart Contract

### B402RelayerV2

Main contract for gasless payments.

**Key Functions:**

- `transferWithAuthorization(...)`: Execute gasless payment with EIP-712 signature
- `setTokenWhitelist(address token, bool status)`: Add/remove supported tokens (owner only)
- `pause()/unpause()`: Emergency controls (owner only)
- `cancelAuthorization(...)`: Cancel pending authorization

**Security Features:**

- EIP-712 typed structured data hashing
- Nonce-based replay protection
- Token whitelist (only approved tokens can be used)
- Reentrancy protection
- Pre-flight balance and allowance checks
- Pausable functionality for emergencies
- Ownable access control

### Deployed Contracts

**BSC Mainnet:**
- RelayerV2: `0xE1C2830d5DDd6B49E9c46EbE03a98Cb44CD8eA5a`
- Domain Separator: `0xe164e67e4fad6177673aa98478f8e99bc1c5349a107d8d9b6b4fa50aca9ca9c8`

**BSC Testnet:**
- RelayerV2: `0xd67eF16fa445101Ef1e1c6A9FB9F3014f1d60DE6`

## Installation

### SDK

```bash
npm install @b402/sdk ethers
```

### Facilitator Service

```bash
cd b402-facilitator
npm install
```

## Usage

### Creating a Payment Authorization

```typescript
import { B402Wallet } from '@b402/sdk';
import { ethers } from 'ethers';

const wallet = new ethers.Wallet(privateKey);
const b402 = new B402Wallet(wallet, {
  network: 'bsc-mainnet',
  relayerAddress: '0xE1C2830d5DDd6B49E9c46EbE03a98Cb44CD8eA5a'
});

const auth = await b402.createPaymentAuthorization({
  token: '0x55d398326f99059fF775485246999027B3197955', // USDT
  to: '0xRecipientAddress',
  value: ethers.parseUnits('10', 18), // 10 USDT
  validAfter: Math.floor(Date.now() / 1000),
  validBefore: Math.floor(Date.now() / 1000) + 3600,
  nonce: ethers.hexlify(ethers.randomBytes(32))
});
```

### Verifying and Settling Payment

```typescript
import { B402Facilitator } from '@b402/sdk';

const facilitator = new B402Facilitator({
  baseUrl: 'https://facilitator.b402.network'
});

// Verify signature
const verification = await facilitator.verify(paymentPayload, requirements);

if (verification.isValid) {
  // Submit transaction
  const result = await facilitator.settle(paymentPayload, requirements);
  console.log('Transaction:', result.transaction);
}
```

### Running the Facilitator Service

```bash
# Set environment variables
export RELAYER_PRIVATE_KEY="0x..."
export B402_RELAYER_ADDRESS="0xE1C2830d5DDd6B49E9c46EbE03a98Cb44CD8eA5a"
export NETWORK="mainnet"

# Start service
npm run start
```

**API Endpoints:**

- `POST /verify`: Verify payment signature
- `POST /settle`: Execute payment transaction
- `GET /health`: Service health check

## Deployment

### Deploy Relayer Contract

```bash
# Set deployer private key
export DEPLOYER_PRIVATE_KEY="0x..."

# Deploy to testnet
export NETWORK=testnet
npx tsx scripts/deploy-relayer-v2.ts

# Deploy to mainnet
export NETWORK=mainnet
npx tsx scripts/deploy-relayer-v2.ts
```

### Environment Variables

**Required for deployment scripts:**
- `DEPLOYER_PRIVATE_KEY`: Private key for deploying contracts
- `NETWORK`: Target network (testnet/mainnet)

**Required for facilitator service:**
- `RELAYER_PRIVATE_KEY`: Private key for relayer wallet (must have BNB for gas)
- `B402_RELAYER_ADDRESS`: Deployed relayer contract address
- `NETWORK`: Target network (testnet/mainnet)

**Required for frontend:**
- `AGENT_PRIVATE_KEY`: Private key for agent wallet

## Security Considerations

### Private Key Management

- Never commit private keys to version control
- All deployment scripts require environment variables
- Use hardware wallets or secure key management for production
- Rotate keys immediately if compromised

### Smart Contract Security

- Contracts use OpenZeppelin security primitives
- EIP-712 prevents signature replay attacks
- Nonce tracking prevents double-spending
- Token whitelist controls supported assets
- Pausable for emergency situations

### Facilitator Security

- Verify all signatures before submission
- Check payment requirements match authorization
- Rate limiting recommended for production
- Monitor for unusual transaction patterns

## Testing

### End-to-End Test

```bash
export TEST_USER_PK="0x..."
npx tsx test-e2e.ts
```

### Send Test Payment

```bash
export PRIVATE_KEY="0x..."
npx tsx send-usdt.ts <recipient> <amount>
```

## Network Information

### BSC Mainnet
- Chain ID: 56
- RPC: https://bsc-dataseed.binance.org
- USDT: `0x55d398326f99059fF775485246999027B3197955`
- Explorer: https://bscscan.com

### BSC Testnet
- Chain ID: 97
- RPC: https://data-seed-prebsc-1-s1.binance.org:8545
- USDT: `0x337610d27c682E347C9cD60BD4b3b107C9d34dDd`
- Explorer: https://testnet.bscscan.com
- Faucet: https://testnet.bnbchain.org/faucet-smart

## EIP-712 Specification

### Domain Separator

```solidity
struct EIP712Domain {
  string name;
  string version;
  uint256 chainId;
  address verifyingContract;
}
```

### Authorization Type

```solidity
struct Authorization {
  address from;
  address to;
  uint256 value;
  uint256 validAfter;
  uint256 validBefore;
  bytes32 nonce;
}
```

### Type Hash

```
keccak256("Authorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)")
```

## Comparison with x402

B402 provides x402-style gasless payments for BSC. See [TECHNICAL_COMPARISON.md](TECHNICAL_COMPARISON.md) for detailed comparison.

**Use B402 when:**
- Building on BSC (mainnet or testnet)
- Need USDT support
- Want flexibility for multiple ERC20 tokens

**Use x402 when:**
- Building on Base, Ethereum, or Solana
- USDC is sufficient
- Target chain has native EIP-3009 token support

Both protocols achieve the same user experience of gasless payments through different technical implementations.

## Disclaimer

This software is provided "as is" without warranty of any kind. Users assume all risks associated with smart contract usage. The contracts have not been professionally audited. See [DISCLAIMER.md](DISCLAIMER.md) for complete legal terms.

## License

MIT

## Documentation

### Getting Started
- **[Getting Started Guide](docs/GETTING_STARTED.md)** - Quick setup for merchants and clients
- **[API Documentation](API_DOCUMENTATION.md)** - Complete API reference
- **[Echo Merchant Demo](examples/echo-merchant/)** - Test payment flow instantly

### Technical Details
- [Technical Comparison with x402](TECHNICAL_COMPARISON.md)
- [Architecture Details](ARCHITECTURE_EXPLAINED.md)
- [User Guide](USER_GUIDE.md)
- [Quick Start](QUICK_START.md)
- [Deployment Guide](DEPLOYMENT_GUIDE.md)

### Try It Now

```bash
# Merchant: Accept payments
cd examples/echo-merchant && npm install && npm start

# Client: Send payments
cd frontend && npm install && npm start
```

## Support

- **GitHub**: [Vistara-Labs/b402](https://github.com/Vistara-Labs/b402)
- **Issues**: [Report bugs](https://github.com/Vistara-Labs/b402/issues)
- **Docs**: [Full documentation](docs/GETTING_STARTED.md)
