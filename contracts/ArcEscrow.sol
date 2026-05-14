// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

// ─── ArcEscrow ───────────────────────────────────────────────────────────────
//
// 역할: AI 에이전트 작업 의뢰·검증·USDC 에스크로를 1컨트랙트로 처리
//
// 플로우:
//   1. 의뢰인(client)이 createJob → USDC 락
//   2. 에이전트(agent)가 submitWork → 결과 URI 기록
//   3. 의뢰인이 approveWork → 에이전트에 USDC 지급
//   4. 데드라인 초과 시 의뢰인이 claimRefund → 환불
//
// 배포 체인: Arc Testnet
// 배포 파라미터 (Arc Testnet):
//   _usdc = 0xbA89E65f0f55F7F6E88E8FfB0F8d6e1e3f4A7B2C  (Arc Testnet USDC — 배포 후 확인)

contract ArcEscrow {
    IERC20 public immutable usdc;

    enum Status { Open, Submitted, Approved, Refunded }

    struct Job {
        address client;
        address agent;
        uint256 amount;       // USDC (6 decimals)
        uint256 deadline;     // Unix timestamp
        string  description;  // 작업 설명
        string  resultUri;    // 제출된 결과 URI (IPFS / URL)
        Status  status;
    }

    uint256 public nextJobId;
    mapping(uint256 => Job) public jobs;

    event JobCreated(
        uint256 indexed jobId,
        address indexed client,
        address indexed agent,
        uint256 amount,
        uint256 deadline,
        string  description
    );
    event WorkSubmitted(uint256 indexed jobId, string resultUri);
    event WorkApproved(uint256 indexed jobId, address agent, uint256 amount);
    event Refunded(uint256 indexed jobId, address client, uint256 amount);

    constructor(address _usdc) {
        usdc = IERC20(_usdc);
    }

    function createJob(
        address agent,
        uint256 amount,
        uint256 deadline,
        string calldata description
    ) external returns (uint256 jobId) {
        require(agent != address(0) && agent != msg.sender, "Invalid agent");
        require(amount > 0, "Amount must be > 0");
        require(deadline > block.timestamp, "Deadline in past");

        usdc.transferFrom(msg.sender, address(this), amount);

        jobId = nextJobId++;
        jobs[jobId] = Job({
            client:      msg.sender,
            agent:       agent,
            amount:      amount,
            deadline:    deadline,
            description: description,
            resultUri:   '',
            status:      Status.Open
        });

        emit JobCreated(jobId, msg.sender, agent, amount, deadline, description);
    }

    function submitWork(uint256 jobId, string calldata resultUri) external {
        Job storage job = jobs[jobId];
        require(msg.sender == job.agent, "Not agent");
        require(job.status == Status.Open, "Not open");
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
            job.status == Status.Open || job.status == Status.Submitted,
            "Already resolved"
        );
        require(block.timestamp > job.deadline, "Deadline not passed");

        uint256 amount = job.amount;
        job.status = Status.Refunded;
        usdc.transfer(job.client, amount);

        emit Refunded(jobId, job.client, amount);
    }

    // ── View: 잡 전체 조회 ─────────────────────────────────────────────────
    function getJob(uint256 jobId) external view returns (
        address client, address agent, uint256 amount, uint256 deadline,
        string memory description, string memory resultUri, Status status
    ) {
        Job storage j = jobs[jobId];
        return (j.client, j.agent, j.amount, j.deadline, j.description, j.resultUri, j.status);
    }
}
