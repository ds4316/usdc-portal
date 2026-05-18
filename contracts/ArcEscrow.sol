// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

// ─── ArcEscrow ───────────────────────────────────────────────────────────────
//
// 플로우 (marketplace):
//   1. 의뢰인이 createJob(agent=0) → USDC 즉시 잠금, 누구나 claim 가능
//   2. 작업자가 claimJob → agent로 확정, Matched 상태
//   3. 작업자가 submitWork → 결과 URI 기록
//   4. 의뢰인이 approveWork → 작업자에 USDC 지급
//
// 취소:
//   - Open 상태(매칭 전): 전액 환불
//   - Matched 상태(매칭 후): 5% 취소 수수료를 작업자에게, 나머지 환불
//
// 플로우 (direct):
//   createJob(agent=specific) → 바로 Matched 상태로 생성
//
// 배포 체인: Arc Testnet

contract ArcEscrow {
    IERC20 public immutable usdc;

    uint256 public constant CANCEL_FEE_BPS = 500; // 5%

    enum Status { Open, Matched, Submitted, Approved, Refunded, Cancelled }

    struct Job {
        address client;
        address agent;
        uint256 amount;
        uint256 deadline;
        string  description;
        string  resultUri;
        Status  status;
    }

    uint256 public nextJobId;
    mapping(uint256 => Job) public jobs;

    event JobCreated(uint256 indexed jobId, address indexed client, address indexed agent, uint256 amount, uint256 deadline, string description);
    event JobClaimed(uint256 indexed jobId, address indexed agent);
    event WorkSubmitted(uint256 indexed jobId, string resultUri);
    event WorkApproved(uint256 indexed jobId, address agent, uint256 amount);
    event JobCancelled(uint256 indexed jobId, address client, uint256 refund, address agent, uint256 fee);
    event Refunded(uint256 indexed jobId, address client, uint256 amount);

    constructor(address _usdc) {
        usdc = IERC20(_usdc);
    }

    // agent == address(0) → open job (anyone can claim)
    // agent != address(0) → direct assignment, status starts as Matched
    function createJob(
        address agent,
        uint256 amount,
        uint256 deadline,
        string calldata description
    ) external returns (uint256 jobId) {
        require(amount > 0, "Amount must be > 0");
        require(deadline > block.timestamp, "Deadline in past");
        require(agent != msg.sender, "Cannot assign yourself");

        usdc.transferFrom(msg.sender, address(this), amount);

        Status initialStatus = (agent == address(0)) ? Status.Open : Status.Matched;

        jobId = nextJobId++;
        jobs[jobId] = Job({
            client:      msg.sender,
            agent:       agent,
            amount:      amount,
            deadline:    deadline,
            description: description,
            resultUri:   '',
            status:      initialStatus
        });

        emit JobCreated(jobId, msg.sender, agent, amount, deadline, description);
    }

    // Any address can claim an open job
    function claimJob(uint256 jobId) external {
        Job storage job = jobs[jobId];
        require(job.status == Status.Open, "Job not open");
        require(job.agent == address(0), "Already claimed");
        require(msg.sender != job.client, "Client cannot claim own job");
        require(block.timestamp <= job.deadline, "Deadline passed");

        job.agent = msg.sender;
        job.status = Status.Matched;

        emit JobClaimed(jobId, msg.sender);
    }

    // Client cancels. Full refund if Open, 5% fee to agent if Matched.
    function cancelJob(uint256 jobId) external {
        Job storage job = jobs[jobId];
        require(msg.sender == job.client, "Not client");
        require(job.status == Status.Open || job.status == Status.Matched, "Cannot cancel");

        uint256 fee = 0;
        address agent = job.agent;

        if (job.status == Status.Matched) {
            fee = (job.amount * CANCEL_FEE_BPS) / 10_000;
        }

        uint256 refund = job.amount - fee;
        job.status = Status.Cancelled;

        if (fee > 0) {
            usdc.transfer(agent, fee);
        }
        usdc.transfer(job.client, refund);

        emit JobCancelled(jobId, job.client, refund, agent, fee);
    }

    function submitWork(uint256 jobId, string calldata resultUri) external {
        Job storage job = jobs[jobId];
        require(msg.sender == job.agent, "Not agent");
        require(job.status == Status.Matched, "Not matched");
        require(block.timestamp <= job.deadline, "Deadline passed");
        require(bytes(resultUri).length > 0, "Empty result");

        job.resultUri = resultUri;
        job.status    = Status.Submitted;

        emit WorkSubmitted(jobId, resultUri);
    }

    function approveWork(uint256 jobId) external {
        Job storage job = jobs[jobId];
        require(msg.sender == job.client, "Not client");
        require(job.status == Status.Submitted, "Not submitted");

        job.status = Status.Approved;
        usdc.transfer(job.agent, job.amount);

        emit WorkApproved(jobId, job.agent, job.amount);
    }

    function claimRefund(uint256 jobId) external {
        Job storage job = jobs[jobId];
        require(msg.sender == job.client, "Not client");
        require(
            job.status == Status.Open ||
            job.status == Status.Matched ||
            job.status == Status.Submitted,
            "Already resolved"
        );
        require(block.timestamp > job.deadline, "Deadline not passed");

        uint256 amount = job.amount;
        job.status = Status.Refunded;
        usdc.transfer(job.client, amount);

        emit Refunded(jobId, job.client, amount);
    }

    function getJob(uint256 jobId) external view returns (
        address client, address agent, uint256 amount, uint256 deadline,
        string memory description, string memory resultUri, Status status
    ) {
        Job storage j = jobs[jobId];
        return (j.client, j.agent, j.amount, j.deadline, j.description, j.resultUri, j.status);
    }
}
