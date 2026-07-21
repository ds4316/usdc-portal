// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../src/ArcEscrowV2.sol";
import "./MockUSDC.sol";

// Minimal Foundry cheatcode interface — avoids depending on forge-std so this
// test suite has zero external dependencies.
interface Vm {
    function prank(address) external;
    function warp(uint256) external;
    function expectRevert(bytes calldata) external;
}

contract ArcEscrowV2Test {
    Vm constant vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    ArcEscrowV2 escrow;
    MockUSDC usdc;

    address client   = address(0x1111);
    address agent    = address(0x2222);
    address stranger = address(0x3333);
    address recipient = address(0x4444);

    function setUp() public {
        usdc = new MockUSDC();
        escrow = new ArcEscrowV2(address(usdc));
        usdc.mint(client, 1_000_000_000); // 1000 USDC (6 decimals)
    }

    function _createJob(uint256 amount, uint256 deadlineOffset) internal returns (uint256 jobId) {
        vm.prank(client);
        usdc.approve(address(escrow), amount);
        vm.prank(client);
        jobId = escrow.createJob(agent, amount, block.timestamp + deadlineOffset, "test job");
    }

    // ── AIJudged flow ────────────────────────────────────────────────────

    function testCreateJobLocksFunds() public {
        uint256 jobId = _createJob(100_000_000, 1 days);
        require(usdc.balanceOf(address(escrow)) == 100_000_000, "escrow should hold funds");
        (address c, address a, uint256 amt,,,,, ) = escrow.getJob(jobId);
        require(c == client, "client mismatch");
        require(a == agent, "agent mismatch");
        require(amt == 100_000_000, "amount mismatch");
    }

    function testFullApproveFlowPaysAgent() public {
        uint256 jobId = _createJob(100_000_000, 1 days);

        vm.prank(agent);
        escrow.submitWork(jobId, "ipfs://result");

        vm.prank(client);
        escrow.approveWork(jobId);

        require(usdc.balanceOf(agent) == 100_000_000, "agent should be paid");
        require(usdc.balanceOf(address(escrow)) == 0, "escrow should be empty");
    }

    function testRefundAfterDeadline() public {
        uint256 jobId = _createJob(100_000_000, 1);
        vm.warp(block.timestamp + 2);

        vm.prank(client);
        escrow.claimRefund(jobId);

        require(usdc.balanceOf(client) == 1_000_000_000, "client should be fully refunded");
    }

    function testNonAgentCannotSubmitWork() public {
        uint256 jobId = _createJob(100_000_000, 1 days);
        vm.prank(stranger);
        vm.expectRevert(bytes("Not agent"));
        escrow.submitWork(jobId, "ipfs://result");
    }

    function testNonClientCannotApprove() public {
        uint256 jobId = _createJob(100_000_000, 1 days);
        vm.prank(agent);
        escrow.submitWork(jobId, "ipfs://result");

        vm.prank(stranger);
        vm.expectRevert(bytes("Not client"));
        escrow.approveWork(jobId);
    }

    function testCannotApproveTwice() public {
        uint256 jobId = _createJob(100_000_000, 1 days);
        vm.prank(agent);
        escrow.submitWork(jobId, "ipfs://result");
        vm.prank(client);
        escrow.approveWork(jobId);

        vm.prank(client);
        vm.expectRevert(bytes("Not submitted"));
        escrow.approveWork(jobId);
    }

    function testCannotRefundBeforeDeadline() public {
        uint256 jobId = _createJob(100_000_000, 1 days);
        vm.prank(client);
        vm.expectRevert(bytes("Deadline not passed"));
        escrow.claimRefund(jobId);
    }

    function testCannotCreateJobWithSelfAsAgent() public {
        vm.prank(client);
        usdc.approve(address(escrow), 100_000_000);
        vm.prank(client);
        vm.expectRevert(bytes("Invalid agent"));
        escrow.createJob(client, 100_000_000, block.timestamp + 1 days, "job");
    }

    function testPayoutFailureReverts() public {
        FailingPayoutUSDC failToken = new FailingPayoutUSDC();
        ArcEscrowV2 failEscrow = new ArcEscrowV2(address(failToken));
        failToken.mint(client, 1_000_000_000);

        vm.prank(client);
        failToken.approve(address(failEscrow), 100_000_000);
        vm.prank(client);
        uint256 jobId = failEscrow.createJob(agent, 100_000_000, block.timestamp + 1 days, "job");

        vm.prank(agent);
        failEscrow.submitWork(jobId, "ipfs://result");

        vm.prank(client);
        vm.expectRevert(bytes("transfer failed"));
        failEscrow.approveWork(jobId);
    }

    // ── OnchainCondition flow ────────────────────────────────────────────

    function _createConditionJob(uint256 amount, uint256 threshold) internal returns (uint256 jobId) {
        bytes memory conditionCalldata = abi.encodeWithSignature("balanceOf(address)", recipient);
        vm.prank(client);
        usdc.approve(address(escrow), amount);
        vm.prank(client);
        jobId = escrow.createOnchainConditionJob(
            agent, amount, block.timestamp + 1 days, "swap and deliver to recipient",
            address(usdc), conditionCalldata, threshold, ArcEscrowV2.Comparator.GTE
        );
    }

    function testOnchainConditionRevertsWhenNotMet() public {
        uint256 jobId = _createConditionJob(50_000_000, 10_000_000);
        vm.expectRevert(bytes("Condition not met yet"));
        escrow.checkAndSettle(jobId);
    }

    function testOnchainConditionSettlesWhenMet() public {
        uint256 jobId = _createConditionJob(50_000_000, 10_000_000);

        // agent independently performs the on-chain action: deliver >= 10 USDC to recipient
        usdc.mint(agent, 20_000_000);
        vm.prank(agent);
        usdc.transfer(recipient, 20_000_000);

        // permissionless — a stranger can trigger settlement too
        vm.prank(stranger);
        escrow.checkAndSettle(jobId);

        require(usdc.balanceOf(agent) == 50_000_000, "agent should receive escrow payout");
        (, , , , , , ArcEscrowV2.Status status, ) = escrow.getJob(jobId);
        require(status == ArcEscrowV2.Status.Approved, "job should be Approved");
    }

    function testOnchainConditionCannotSettleTwice() public {
        uint256 jobId = _createConditionJob(50_000_000, 10_000_000);
        usdc.mint(recipient, 20_000_000);
        escrow.checkAndSettle(jobId);

        vm.expectRevert(bytes("Not open"));
        escrow.checkAndSettle(jobId);
    }

    function testOnchainConditionRefundableAfterDeadline() public {
        bytes memory conditionCalldata = abi.encodeWithSignature("balanceOf(address)", recipient);
        vm.prank(client);
        usdc.approve(address(escrow), 50_000_000);
        vm.prank(client);
        uint256 jobId = escrow.createOnchainConditionJob(
            agent, 50_000_000, block.timestamp + 1, "swap and deliver",
            address(usdc), conditionCalldata, 10_000_000, ArcEscrowV2.Comparator.GTE
        );

        vm.warp(block.timestamp + 2);
        vm.prank(client);
        escrow.claimRefund(jobId);

        require(usdc.balanceOf(client) == 1_000_000_000, "client should be refunded");
    }

    function testOnchainConditionRejectsInvalidTarget() public {
        vm.prank(client);
        usdc.approve(address(escrow), 50_000_000);
        vm.prank(client);
        vm.expectRevert(bytes("Invalid condition target"));
        escrow.createOnchainConditionJob(
            agent, 50_000_000, block.timestamp + 1 days, "bad job",
            address(0), bytes(""), 10_000_000, ArcEscrowV2.Comparator.GTE
        );
    }

    function testAIJudgedFunctionsRejectOnchainConditionJob() public {
        uint256 jobId = _createConditionJob(50_000_000, 10_000_000);
        vm.prank(agent);
        vm.expectRevert(bytes("Not an AIJudged job"));
        escrow.submitWork(jobId, "ipfs://result");
    }
}
