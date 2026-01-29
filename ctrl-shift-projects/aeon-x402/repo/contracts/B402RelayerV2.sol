// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title B402RelayerV2
 * @notice Production-ready meta-transaction relayer for b402.ai
 * @dev Implements EIP-3009 transferWithAuthorization for gasless payments
 *
 * AUDIT FIXES:
 * - Added ReentrancyGuard protection
 * - Fixed validAfter check (now uses >=)
 * - Added token whitelist for security
 * - Fixed cancelAuthorization TypeHash
 * - Added pre-flight balance/allowance checks
 * - Added emergency pause mechanism
 *
 * Works with USDT on BSC (0x55d398326f99059fF775485246999027B3197955)
 * Requires user to approve this contract first: USDT.approve(relayer, amount)
 */
contract B402RelayerV2 is EIP712, ReentrancyGuard {
    using ECDSA for bytes32;

    // EIP-712 TypeHashes
    bytes32 public constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    bytes32 public constant CANCEL_AUTHORIZATION_TYPEHASH = keccak256(
        "CancelAuthorization(address authorizer,bytes32 nonce)"
    );

    // Track used nonces (same as EIP-3009)
    mapping(address => mapping(bytes32 => bool)) private _authorizationStates;

    // Token whitelist for security
    mapping(address => bool) public whitelistedTokens;

    // Admin controls
    address public owner;
    bool public paused;

    // Events (match EIP-3009)
    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);
    event AuthorizationCanceled(address indexed authorizer, bytes32 indexed nonce);
    event TokenWhitelisted(address indexed token, bool status);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Paused(address account);
    event Unpaused(address account);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Contract paused");
        _;
    }

    constructor() EIP712("B402", "1") {
        owner = msg.sender;

        // Whitelist BSC USDT by default (mainnet)
        whitelistedTokens[0x55d398326f99059fF775485246999027B3197955] = true;

        // Whitelist BSC Testnet USDT
        whitelistedTokens[0x337610d27c682E347C9cD60BD4b3b107C9d34dDd] = true;
    }

    /**
     * @notice Execute transfer with authorization (EIP-3009 compatible)
     * @param token Token contract address (must be whitelisted)
     * @param from Payer address
     * @param to Recipient address
     * @param value Amount to transfer
     * @param validAfter Timestamp after which authorization is valid
     * @param validBefore Timestamp before which authorization is valid
     * @param nonce Unique nonce
     * @param v Signature v
     * @param r Signature r
     * @param s Signature s
     */
    function transferWithAuthorization(
        address token,
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant whenNotPaused {
        // Security checks
        require(whitelistedTokens[token], "Token not whitelisted");
        require(to != address(0), "Invalid recipient");
        require(value > 0, "Invalid amount");

        // Timing validation (FIXED: now uses >= for validAfter)
        require(block.timestamp >= validAfter, "Authorization not yet valid");
        require(block.timestamp < validBefore, "Authorization expired");

        // Nonce check
        require(!_authorizationStates[from][nonce], "Authorization already used");

        // Verify signature using EIP-712
        bytes32 structHash = keccak256(
            abi.encode(
                TRANSFER_WITH_AUTHORIZATION_TYPEHASH,
                from,
                to,
                value,
                validAfter,
                validBefore,
                nonce
            )
        );

        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, v, r, s);
        require(signer == from, "Invalid signature");

        // Pre-flight checks (save gas on failures)
        IERC20 tokenContract = IERC20(token);
        require(tokenContract.balanceOf(from) >= value, "Insufficient balance");
        require(tokenContract.allowance(from, address(this)) >= value, "Insufficient allowance");

        // Mark nonce as used BEFORE external call (CEI pattern)
        _authorizationStates[from][nonce] = true;

        // Execute transfer (reentrancy protected)
        require(
            tokenContract.transferFrom(from, to, value),
            "Transfer failed"
        );

        emit AuthorizationUsed(from, nonce);
    }

    /**
     * @notice Cancel authorization before it's used
     * @param authorizer Address that signed the authorization
     * @param nonce Nonce to cancel
     * @param v Signature v
     * @param r Signature r
     * @param s Signature s
     */
    function cancelAuthorization(
        address authorizer,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(!_authorizationStates[authorizer][nonce], "Authorization already used");

        // FIXED: Use proper EIP-712 TypeHash for cancellation
        bytes32 structHash = keccak256(
            abi.encode(
                CANCEL_AUTHORIZATION_TYPEHASH,
                authorizer,
                nonce
            )
        );

        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, v, r, s);
        require(signer == authorizer, "Invalid signature");

        _authorizationStates[authorizer][nonce] = true;
        emit AuthorizationCanceled(authorizer, nonce);
    }

    /**
     * @notice Check if authorization has been used
     * @param authorizer Address that signed the authorization
     * @param nonce Nonce to check
     * @return True if nonce has been used
     */
    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool) {
        return _authorizationStates[authorizer][nonce];
    }

    /**
     * @notice Add/remove token from whitelist (owner only)
     * @param token Token address
     * @param status True to whitelist, false to remove
     */
    function setTokenWhitelist(address token, bool status) external onlyOwner {
        require(token != address(0), "Invalid token");
        whitelistedTokens[token] = status;
        emit TokenWhitelisted(token, status);
    }

    /**
     * @notice Pause contract (emergency only)
     */
    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    /**
     * @notice Unpause contract
     */
    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    /**
     * @notice Transfer ownership
     * @param newOwner New owner address
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    /**
     * @notice Get domain separator (for off-chain signing)
     * @return Domain separator hash
     */
    function getDomainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
