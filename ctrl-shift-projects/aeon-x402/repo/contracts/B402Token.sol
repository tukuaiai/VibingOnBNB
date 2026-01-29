// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title B402Token
 * @dev The native token of the b402 gasless payment protocol
 *
 * Key Features:
 * - Limited supply: 1 billion tokens
 * - Distributed to users who make USDT payments
 * - Tradeable on DEX (PancakeSwap)
 * - Deflationary: Fees can be burned
 * - Utility: Stake to run facilitator, governance, fee discounts
 */
contract B402Token is ERC20, Ownable, ReentrancyGuard {
    // Token Economics
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10**18; // 1 billion
    uint256 public constant EARLY_USER_ALLOCATION = 400_000_000 * 10**18; // 40% for users

    // Reward Configuration
    uint256 public tokensPerUSDT = 100 * 10**18; // 100 B402 per 1 USDT initially
    uint256 public totalDistributed;
    bool public rewardsEnabled = true;

    // Facilitator Staking
    uint256 public facilitatorStakeRequired = 10_000 * 10**18; // 10k B402
    mapping(address => bool) public facilitators;
    mapping(address => uint256) public facilitatorStake;

    // User Tracking
    mapping(address => uint256) public rewardsClaimed;
    mapping(address => uint256) public paymentsCount;
    mapping(address => address) public referredBy;

    // Referral System
    uint256 public referralBonus = 50 * 10**18; // 50 B402 bonus

    // Events
    event RewardClaimed(address indexed user, uint256 amount, uint256 usdtPaid);
    event FacilitatorStaked(address indexed facilitator, uint256 amount);
    event FacilitatorUnstaked(address indexed facilitator, uint256 amount);
    event ReferralRewarded(address indexed referrer, address indexed referee, uint256 amount);
    event TokensBurned(address indexed burner, uint256 amount);
    event RewardRateUpdated(uint256 newRate);

    constructor() ERC20("B402 Protocol Token", "B402") Ownable(msg.sender) {
        // Mint entire supply to deployer
        _mint(msg.sender, MAX_SUPPLY);

        // Distribution:
        // 40% (400M) - Held for user rewards (this contract)
        // 20% (200M) - Liquidity pool (PancakeSwap)
        // 15% (150M) - Team & advisors (vesting)
        // 15% (150M) - Treasury (protocol development)
        // 10% (100M) - Ecosystem fund (grants, partnerships)
    }

    /**
     * @dev Claim reward for making a USDT payment
     * Called by agent service when user pays via b402
     * @param user Address of the user who paid
     * @param usdtPaid Amount of USDT paid (in USDT decimals, 6)
     */
    function claimReward(address user, uint256 usdtPaid) external onlyOwner nonReentrant {
        require(rewardsEnabled, "Rewards are disabled");
        require(user != address(0), "Invalid user address");
        require(usdtPaid > 0, "Payment amount must be > 0");
        require(totalDistributed < EARLY_USER_ALLOCATION, "Early user rewards exhausted");

        // Calculate reward: 100 B402 per 1 USDT
        // usdtPaid is in 6 decimals, tokensPerUSDT is in 18 decimals
        uint256 reward = (usdtPaid * tokensPerUSDT) / 10**6;

        require(totalDistributed + reward <= EARLY_USER_ALLOCATION, "Exceeds allocation");

        // Transfer tokens from owner to user
        _transfer(owner(), user, reward);

        // Update tracking
        totalDistributed += reward;
        rewardsClaimed[user] += reward;
        paymentsCount[user] += 1;

        emit RewardClaimed(user, reward, usdtPaid);

        // Process referral bonus if applicable
        if (referredBy[user] != address(0) && paymentsCount[user] == 1) {
            _processReferralBonus(referredBy[user], user);
        }
    }

    /**
     * @dev Batch claim rewards for multiple users
     * Gas optimization for processing many payments at once
     */
    function claimRewardBatch(
        address[] calldata users,
        uint256[] calldata usdtPaidAmounts
    ) external onlyOwner nonReentrant {
        require(users.length == usdtPaidAmounts.length, "Array length mismatch");
        require(users.length <= 100, "Batch too large");

        for (uint256 i = 0; i < users.length; i++) {
            if (totalDistributed >= EARLY_USER_ALLOCATION) break;

            address user = users[i];
            uint256 usdtPaid = usdtPaidAmounts[i];

            if (user != address(0) && usdtPaid > 0) {
                uint256 reward = (usdtPaid * tokensPerUSDT) / 10**6;

                if (totalDistributed + reward <= EARLY_USER_ALLOCATION) {
                    _transfer(owner(), user, reward);
                    totalDistributed += reward;
                    rewardsClaimed[user] += reward;
                    paymentsCount[user] += 1;

                    emit RewardClaimed(user, reward, usdtPaid);
                }
            }
        }
    }

    /**
     * @dev Set referral relationship
     * @param referee The new user being referred
     * @param referrer The existing user who referred them
     */
    function setReferral(address referee, address referrer) external onlyOwner {
        require(referee != address(0) && referrer != address(0), "Invalid addresses");
        require(referee != referrer, "Cannot refer yourself");
        require(referredBy[referee] == address(0), "Already has referrer");
        require(paymentsCount[referee] == 0, "User already made payment");

        referredBy[referee] = referrer;
    }

    /**
     * @dev Internal function to process referral bonus
     */
    function _processReferralBonus(address referrer, address referee) internal {
        if (totalDistributed + referralBonus <= EARLY_USER_ALLOCATION) {
            _transfer(owner(), referrer, referralBonus);
            totalDistributed += referralBonus;
            rewardsClaimed[referrer] += referralBonus;

            emit ReferralRewarded(referrer, referee, referralBonus);
        }
    }

    /**
     * @dev Stake tokens to become a facilitator
     * Facilitators can run b402-facilitator service and earn fees
     */
    function stakeToBecameFacilitator() external nonReentrant {
        require(!facilitators[msg.sender], "Already a facilitator");
        require(balanceOf(msg.sender) >= facilitatorStakeRequired, "Insufficient B402 balance");

        // Transfer stake to contract
        _transfer(msg.sender, address(this), facilitatorStakeRequired);

        facilitators[msg.sender] = true;
        facilitatorStake[msg.sender] = facilitatorStakeRequired;

        emit FacilitatorStaked(msg.sender, facilitatorStakeRequired);
    }

    /**
     * @dev Unstake and stop being a facilitator
     */
    function unstakeFacilitator() external nonReentrant {
        require(facilitators[msg.sender], "Not a facilitator");

        uint256 stake = facilitatorStake[msg.sender];

        facilitators[msg.sender] = false;
        facilitatorStake[msg.sender] = 0;

        // Return stake
        _transfer(address(this), msg.sender, stake);

        emit FacilitatorUnstaked(msg.sender, stake);
    }

    /**
     * @dev Burn tokens (deflationary mechanism)
     * Anyone can burn their own tokens
     */
    function burn(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        _burn(msg.sender, amount);
        emit TokensBurned(msg.sender, amount);
    }

    /**
     * @dev Update reward rate (owner only)
     * Can decrease over time as token value increases
     */
    function setRewardRate(uint256 newRate) external onlyOwner {
        require(newRate > 0, "Rate must be > 0");
        tokensPerUSDT = newRate;
        emit RewardRateUpdated(newRate);
    }

    /**
     * @dev Update facilitator stake requirement
     */
    function setFacilitatorStakeRequired(uint256 newAmount) external onlyOwner {
        require(newAmount > 0, "Amount must be > 0");
        facilitatorStakeRequired = newAmount;
    }

    /**
     * @dev Update referral bonus
     */
    function setReferralBonus(uint256 newBonus) external onlyOwner {
        referralBonus = newBonus;
    }

    /**
     * @dev Enable/disable rewards
     */
    function setRewardsEnabled(bool enabled) external onlyOwner {
        rewardsEnabled = enabled;
    }

    /**
     * @dev Get user stats
     */
    function getUserStats(address user) external view returns (
        uint256 totalRewards,
        uint256 totalPayments,
        bool isFacilitator,
        uint256 stakeAmount,
        address referrer
    ) {
        return (
            rewardsClaimed[user],
            paymentsCount[user],
            facilitators[user],
            facilitatorStake[user],
            referredBy[user]
        );
    }

    /**
     * @dev Get protocol stats
     */
    function getProtocolStats() external view returns (
        uint256 currentSupply,
        uint256 distributedRewards,
        uint256 remainingRewards,
        uint256 currentRewardRate,
        bool rewardsActive
    ) {
        return (
            totalSupply(),
            totalDistributed,
            EARLY_USER_ALLOCATION - totalDistributed,
            tokensPerUSDT,
            rewardsEnabled
        );
    }

    /**
     * @dev Emergency: Withdraw any ERC20 tokens sent to this contract
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        require(token != address(this), "Cannot withdraw B402");
        IERC20(token).transfer(owner(), amount);
    }
}
