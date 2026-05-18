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

contract NFTOTCEscrow {
    IUSDC public immutable usdc;

    enum Status {
        Funded,
        Settled,
        Refunded
    }

    struct Deal {
        address buyer;
        address seller;
        address nft;
        uint256 tokenId;
        uint256 usdcAmount;
        uint256 deadline;
        Status status;
    }

    uint256 public nextDealId;
    mapping(uint256 => Deal) public deals;

    event DealFunded(
        uint256 indexed dealId,
        address indexed buyer,
        address indexed seller,
        address nft,
        uint256 tokenId,
        uint256 usdcAmount,
        uint256 deadline
    );
    event DealSettled(uint256 indexed dealId, address indexed buyer, address indexed seller);
    event DealRefunded(uint256 indexed dealId, address indexed buyer, uint256 usdcAmount);

    constructor(address usdcAddress) {
        require(usdcAddress != address(0), "Zero USDC");
        usdc = IUSDC(usdcAddress);
    }

    function fundDeal(
        address seller,
        address nft,
        uint256 tokenId,
        uint256 usdcAmount,
        uint256 deadline
    ) external returns (uint256 dealId) {
        require(seller != address(0) && seller != msg.sender, "Invalid seller");
        require(nft != address(0), "Invalid NFT");
        require(usdcAmount > 0, "Amount must be > 0");
        require(deadline > block.timestamp, "Deadline in past");
        require(IERC721Like(nft).ownerOf(tokenId) == seller, "Seller does not own NFT");

        require(usdc.transferFrom(msg.sender, address(this), usdcAmount), "USDC transfer failed");

        dealId = nextDealId++;
        deals[dealId] = Deal({
            buyer: msg.sender,
            seller: seller,
            nft: nft,
            tokenId: tokenId,
            usdcAmount: usdcAmount,
            deadline: deadline,
            status: Status.Funded
        });

        emit DealFunded(dealId, msg.sender, seller, nft, tokenId, usdcAmount, deadline);
    }

    function isReadyToSettle(uint256 dealId) public view returns (bool) {
        Deal storage deal = deals[dealId];
        if (deal.status != Status.Funded) return false;
        if (block.timestamp > deal.deadline) return false;
        IERC721Like nft = IERC721Like(deal.nft);
        if (nft.ownerOf(deal.tokenId) != deal.seller) return false;
        return nft.getApproved(deal.tokenId) == address(this) || nft.isApprovedForAll(deal.seller, address(this));
    }

    function settle(uint256 dealId) external {
        Deal storage deal = deals[dealId];
        require(deal.status == Status.Funded, "Not funded");
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
        require(deal.status == Status.Funded, "Not funded");
        require(msg.sender == deal.buyer, "Only buyer");
        require(block.timestamp > deal.deadline, "Deadline not passed");

        deal.status = Status.Refunded;
        require(usdc.transfer(deal.buyer, deal.usdcAmount), "Refund failed");

        emit DealRefunded(dealId, deal.buyer, deal.usdcAmount);
    }
}
