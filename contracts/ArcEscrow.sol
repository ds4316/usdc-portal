// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

// ArcEscrow
//
// Marketplace flow:
//   1. Client calls createJob(agent=0), locking USDC immediately.
//   2. Any worker can call claimJob and become the matched agent.
//   3. Worker calls submitWork with a result URI.
//   4. Client calls approveWork to release USDC to the worker.
//
// Cancellation:
//   - Open: full refund to the client.
//   - Matched: 5% cancellation fee to the worker, remainder to the client.
//
// Direct flow:
//   createJob(agent=specific) starts in Matched status.
//
// Deployment target: Arc Testnet.

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

    // agent == address(0): open job, anyone can claim.
    // agent != address(0): direct assignment, status starts as Matched.
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
