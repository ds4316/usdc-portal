// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

// ─── ArcEscrowV2 ────────────────────────────────────────────────────────────
//
// 역할: AI 에이전트 작업 의뢰·검증·USDC 에스크로를 1컨트랙트로 처리.
//       두 가지 잡 타입을 지원한다:
//
//   - AIJudged        : 기존 ArcEscrow.sol과 동일한 플로우. 에이전트가 결과 URI를
//                        제출하면(submitWork) client가 오프체인 판단(예: AI 평가)을
//                        참고해 approveWork/claimRefund로 정산.
//
//   - OnchainCondition : 결과물이 온체인에서 객관적으로 확인 가능한 조건일 때 사용.
//                        client가 job 생성 시 "어떤 컨트랙트를 어떤 calldata로 읽었을
//                        때 값이 threshold를 만족하면 정산"이라는 조건을 잠근다.
//                        누구나 checkAndSettle을 호출할 수 있고, 컨트랙트가 직접
//                        staticcall로 조건을 확인해 만족 시 같은 트랜잭션에서
//                        원자적으로 지급한다 — AI도 사람 승인도 필요 없는 trustless
//                        정산 경로.
//
// 플로우 (AIJudged):
//   1. client가 createJob → USDC 락
//   2. agent가 submitWork → 결과 URI 기록
//   3. client가 approveWork → agent에 USDC 지급
//   4. 데드라인 초과 시 client가 claimRefund → 환불
//
// 플로우 (OnchainCondition):
//   1. client가 createOnchainConditionJob → USDC 락 + 조건(target/calldata/threshold/comparator) 저장
//   2. 누구나(보통 agent) checkAndSettle 호출 → 조건 충족 시 즉시 agent에 USDC 지급
//   3. 데드라인까지 조건 미충족 시 client가 claimRefund → 환불
//
// 배포 체인: Arc Testnet

contract ArcEscrowV2 {
    IERC20 public immutable usdc;

    enum Status { Open, Submitted, Approved, Refunded }
    enum JobType { AIJudged, OnchainCondition }
    enum Comparator { GTE, LTE, EQ }

    struct Job {
        address client;
        address agent;
        uint256 amount;       // USDC (6 decimals)
        uint256 deadline;     // Unix timestamp
        string  description;  // 작업 설명
        string  resultUri;    // 제출된 결과 URI (AIJudged 전용)
        Status  status;
        JobType jobType;
        // ── OnchainCondition 전용 필드 ──
        address conditionTarget;
        bytes   conditionCalldata;
        uint256 conditionThreshold;
        Comparator comparator;
    }

    uint256 public nextJobId;
    mapping(uint256 => Job) public jobs;

    event JobCreated(
        uint256 indexed jobId,
        address indexed client,
        address indexed agent,
        uint256 amount,
        uint256 deadline,
        string  description,
        uint8   jobType
    );
    event WorkSubmitted(uint256 indexed jobId, string resultUri);
    event WorkApproved(uint256 indexed jobId, address agent, uint256 amount);
    event Refunded(uint256 indexed jobId, address client, uint256 amount);
    event ConditionChecked(uint256 indexed jobId, bool met, uint256 observedValue);

    constructor(address _usdc) {
        usdc = IERC20(_usdc);
    }

    // ── 내부: 공통 job 생성 로직 ─────────────────────────────────────────────
    function _createJob(
        address agent,
        uint256 amount,
        uint256 deadline,
        string calldata description
    ) internal returns (uint256 jobId) {
        require(agent != address(0) && agent != msg.sender, "Invalid agent");
        require(amount > 0, "Amount must be > 0");
        require(deadline > block.timestamp, "Deadline in past");
        require(usdc.transferFrom(msg.sender, address(this), amount), "transferFrom failed");

        jobId = nextJobId++;
        Job storage j = jobs[jobId];
        j.client      = msg.sender;
        j.agent       = agent;
        j.amount      = amount;
        j.deadline    = deadline;
        j.description = description;
        j.status      = Status.Open;
    }

    // ── AIJudged jobs ────────────────────────────────────────────────────────

    function createJob(
        address agent,
        uint256 amount,
        uint256 deadline,
        string calldata description
    ) external returns (uint256 jobId) {
        jobId = _createJob(agent, amount, deadline, description);
        jobs[jobId].jobType = JobType.AIJudged;
        emit JobCreated(jobId, msg.sender, agent, amount, deadline, description, uint8(JobType.AIJudged));
    }

    function submitWork(uint256 jobId, string calldata resultUri) external {
        Job storage job = jobs[jobId];
        require(job.jobType == JobType.AIJudged, "Not an AIJudged job");
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
        require(job.jobType == JobType.AIJudged, "Not an AIJudged job");
        require(msg.sender == job.client, "Not client");
        require(job.status == Status.Submitted, "Not submitted");

        job.status = Status.Approved;
        require(usdc.transfer(job.agent, job.amount), "transfer failed");

        emit WorkApproved(jobId, job.agent, job.amount);
    }

    // ── OnchainCondition jobs ────────────────────────────────────────────────

    function createOnchainConditionJob(
        address agent,
        uint256 amount,
        uint256 deadline,
        string calldata description,
        address conditionTarget,
        bytes calldata conditionCalldata,
        uint256 conditionThreshold,
        Comparator comparator
    ) external returns (uint256 jobId) {
        require(conditionTarget != address(0), "Invalid condition target");
        jobId = _createJob(agent, amount, deadline, description);

        Job storage j = jobs[jobId];
        j.jobType            = JobType.OnchainCondition;
        j.conditionTarget     = conditionTarget;
        j.conditionCalldata   = conditionCalldata;
        j.conditionThreshold  = conditionThreshold;
        j.comparator          = comparator;

        emit JobCreated(jobId, msg.sender, agent, amount, deadline, description, uint8(JobType.OnchainCondition));
    }

    // Permissionless keeper function — anyone can trigger settlement once the
    // onchain condition is objectively true. No AI, no human approval.
    function checkAndSettle(uint256 jobId) external {
        Job storage job = jobs[jobId];
        require(job.jobType == JobType.OnchainCondition, "Not an OnchainCondition job");
        require(job.status == Status.Open, "Not open");
        require(block.timestamp <= job.deadline, "Deadline passed");

        (bool ok, bytes memory ret) = job.conditionTarget.staticcall(job.conditionCalldata);
        require(ok && ret.length >= 32, "Condition call failed");
        uint256 value = abi.decode(ret, (uint256));

        bool met = job.comparator == Comparator.GTE ? value >= job.conditionThreshold
                 : job.comparator == Comparator.LTE ? value <= job.conditionThreshold
                 : value == job.conditionThreshold;

        emit ConditionChecked(jobId, met, value);
        require(met, "Condition not met yet");

        job.status = Status.Approved;
        require(usdc.transfer(job.agent, job.amount), "transfer failed");

        emit WorkApproved(jobId, job.agent, job.amount);
    }

    // ── Shared ────────────────────────────────────────────────────────────

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
        require(usdc.transfer(job.client, amount), "transfer failed");

        emit Refunded(jobId, job.client, amount);
    }

    // ── Views ────────────────────────────────────────────────────────────

    function getJob(uint256 jobId) external view returns (
        address client, address agent, uint256 amount, uint256 deadline,
        string memory description, string memory resultUri, Status status, JobType jobType
    ) {
        Job storage j = jobs[jobId];
        return (j.client, j.agent, j.amount, j.deadline, j.description, j.resultUri, j.status, j.jobType);
    }

    function getCondition(uint256 jobId) external view returns (
        address conditionTarget, bytes memory conditionCalldata, uint256 conditionThreshold, Comparator comparator
    ) {
        Job storage j = jobs[jobId];
        return (j.conditionTarget, j.conditionCalldata, j.conditionThreshold, j.comparator);
    }
}
