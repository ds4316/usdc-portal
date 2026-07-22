// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IUSDC {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IERC721Like {
    function ownerOf(uint256 tokenId) external view returns (address);
    function getApproved(uint256 tokenId) external view returns (address);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
    function transferFrom(address from, address to, uint256 tokenId) external;
}

// NFTOTCEscrow
//
// Marketplace flow:
//   1. Buyer calls fundDeal(seller=0), locking USDC immediately.
//   2. NFT owner calls claimDeal and becomes the seller after ownerOf check.
//   3. Seller approves this contract for the NFT.
//   4. Buyer or seller calls settle to atomically swap NFT for USDC.
//
// Cancellation:
//   - Funded: full refund to the buyer.
//   - Matched: 5% cancellation fee to the seller, remainder to the buyer.
//
// Direct flow:
//   fundDeal(seller=specific) starts in Matched status after ownerOf check.

contract NFTOTCEscrow {
    IUSDC public immutable usdc;

    uint256 public constant CANCEL_FEE_BPS = 500; // 5%

    enum Status { Funded, Matched, Settled, Refunded, Cancelled }

    struct Deal {
        address buyer;
        address seller;
        address nft;
        uint256 tokenId;
        uint256 usdcAmount;
        uint256 deadline;
        Status  status;
    }

    uint256 public nextDealId;
    mapping(uint256 => Deal) public deals;

    event DealFunded(uint256 indexed dealId, address indexed buyer, address seller, address nft, uint256 tokenId, uint256 usdcAmount, uint256 deadline);
    event DealClaimed(uint256 indexed dealId, address indexed seller);
    event DealSettled(uint256 indexed dealId, address indexed buyer, address indexed seller);
    event DealCancelled(uint256 indexed dealId, address buyer, uint256 refund, address seller, uint256 fee);
    event DealRefunded(uint256 indexed dealId, address indexed buyer, uint256 usdcAmount);

    constructor(address usdcAddress) {
        require(usdcAddress != address(0), "Zero USDC");
        usdc = IUSDC(usdcAddress);
    }

    // seller == address(0): open deal, anyone owning the NFT can claim.
    // seller != address(0): direct deal, ownerOf checked at creation.
    function fundDeal(
        address seller,
        address nft,
        uint256 tokenId,
        uint256 usdcAmount,
        uint256 deadline
    ) external returns (uint256 dealId) {
        require(nft != address(0), "Invalid NFT");
        require(usdcAmount > 0, "Amount must be > 0");
        require(deadline > block.timestamp, "Deadline in past");
        require(seller != msg.sender, "Cannot be own seller");

        // For direct deals, verify seller owns NFT upfront
        if (seller != address(0)) {
            require(IERC721Like(nft).ownerOf(tokenId) == seller, "Seller does not own NFT");
        }

        require(usdc.transferFrom(msg.sender, address(this), usdcAmount), "USDC transfer failed");

        Status initialStatus = (seller == address(0)) ? Status.Funded : Status.Matched;

        dealId = nextDealId++;
        deals[dealId] = Deal({
            buyer:      msg.sender,
            seller:     seller,
            nft:        nft,
            tokenId:    tokenId,
            usdcAmount: usdcAmount,
            deadline:   deadline,
            status:     initialStatus
        });

        emit DealFunded(dealId, msg.sender, seller, nft, tokenId, usdcAmount, deadline);
    }

    // NFT owner claims an open deal and becomes the seller
    function claimDeal(uint256 dealId) external {
        Deal storage deal = deals[dealId];
        require(deal.status == Status.Funded, "Deal not open");
        require(deal.seller == address(0), "Already claimed");
        require(msg.sender != deal.buyer, "Buyer cannot claim own deal");
        require(block.timestamp <= deal.deadline, "Deadline passed");
        require(IERC721Like(deal.nft).ownerOf(deal.tokenId) == msg.sender, "Must own the NFT");

        deal.seller = msg.sender;
        deal.status = Status.Matched;

        emit DealClaimed(dealId, msg.sender);
    }

    // Buyer cancels. Full refund if Funded (no seller), 5% fee to seller if Matched.
    function cancelDeal(uint256 dealId) external {
        Deal storage deal = deals[dealId];
        require(msg.sender == deal.buyer, "Only buyer");
        require(deal.status == Status.Funded || deal.status == Status.Matched, "Cannot cancel");

        uint256 fee = 0;
        address seller = deal.seller;

        if (deal.status == Status.Matched) {
            fee = (deal.usdcAmount * CANCEL_FEE_BPS) / 10_000;
        }

        uint256 refund = deal.usdcAmount - fee;
        deal.status = Status.Cancelled;

        if (fee > 0) {
            usdc.transfer(seller, fee);
        }
        usdc.transfer(deal.buyer, refund);

        emit DealCancelled(dealId, deal.buyer, refund, seller, fee);
    }

    function isReadyToSettle(uint256 dealId) public view returns (bool) {
        Deal storage deal = deals[dealId];
        if (deal.status != Status.Matched) return false;
        if (block.timestamp > deal.deadline) return false;
        IERC721Like nft = IERC721Like(deal.nft);
        if (nft.ownerOf(deal.tokenId) != deal.seller) return false;
        return nft.getApproved(deal.tokenId) == address(this) || nft.isApprovedForAll(deal.seller, address(this));
    }

    function settle(uint256 dealId) external {
        Deal storage deal = deals[dealId];
        require(deal.status == Status.Matched, "Not matched");
        require(block.timestamp <= deal.deadline, "Deadline passed");
        require(msg.sender == deal.buyer || msg.sender == deal.seller, "Not participant");
        require(isReadyToSettle(dealId), "NFT not approved");

        deal.status = Status.Settled;
        IERC721Like(deal.nft).transferFrom(deal.seller, deal.buyer, deal.tokenId);
        require(usdc.transfer(deal.seller, deal.usdcAmount), "USDC payout failed");

        emit DealSettled(dealId, deal.buyer, deal.seller);
    }

    function refundAfterDeadline(uint256 dealId) external {
        Deal storage deal = deals[dealId];
        require(msg.sender == deal.buyer, "Only buyer");
        require(deal.status == Status.Funded || deal.status == Status.Matched, "Not refundable");
        require(block.timestamp > deal.deadline, "Deadline not passed");

        uint256 amount = deal.usdcAmount;
        deal.status = Status.Refunded;
        require(usdc.transfer(deal.buyer, amount), "Refund failed");

        emit DealRefunded(dealId, deal.buyer, amount);
    }

    function getDeal(uint256 dealId) external view returns (
        address buyer, address seller, address nft, uint256 tokenId,
        uint256 usdcAmount, uint256 deadline, Status status
    ) {
        Deal storage d = deals[dealId];
        return (d.buyer, d.seller, d.nft, d.tokenId, d.usdcAmount, d.deadline, d.status);
    }
}
