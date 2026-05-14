// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ⚠️  TESTNET ONLY — 메인넷 배포 전 아래 항목 반드시 수정할 것:
//   1. Reentrancy: bridgeUSDCToArc / bridgeETHToArc에 ReentrancyGuard 추가
//   2. arcRecipient zero-address 체크 추가
//   3. Swap deadline 파라미터 추가 (front-running 방지)
//   4. 주소 하드코딩 → 생성자 파라미터로 변경 (멀티체인 지원)
//   5. rescue() 함수에 timelock 또는 multisig 적용 고려

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24  fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata p)
        external payable returns (uint256 amountOut);
}

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

// CCTP V2 TokenMessenger
interface ITokenMessenger {
    function depositForBurn(
        uint256 amount,
        uint32  destinationDomain,
        bytes32 mintRecipient,
        address burnToken
    ) external returns (uint64 nonce);
}

// ─── ArcOnboarder ────────────────────────────────────────────────────────────
//
// 역할: 다른 EVM 체인의 자산을 Arc Testnet USDC로 1트랜잭션에 온보딩
//
// 배포 체인: Ethereum Sepolia (테스트) / Ethereum Mainnet (메인넷)
// 목적지:    Arc Testnet (CCTP Domain 26)
//
// 생성자 파라미터 (Sepolia):
//   _router    = 0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E  (Uniswap V3 SwapRouter02)
//   _messenger = 0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA  (CCTP V2 TokenMessenger)
//   _usdc      = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238  (Sepolia USDC)
//   _weth      = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14  (Sepolia WETH)

contract ArcOnboarder {
    ISwapRouter    public immutable swapRouter;
    ITokenMessenger public immutable tokenMessenger;
    address        public immutable usdc;
    address        public immutable weth;

    // Arc Testnet CCTP 도메인
    uint32  public constant ARC_DOMAIN = 26;
    // Uniswap USDC/ETH 0.05% 풀
    uint24  public constant POOL_FEE   = 500;

    address public owner;

    event BridgeInitiated(
        address indexed sender,
        bytes32 indexed arcRecipient,
        uint256 usdcAmount
    );

    constructor(
        address _router,
        address _messenger,
        address _usdc,
        address _weth
    ) {
        swapRouter     = ISwapRouter(_router);
        tokenMessenger = ITokenMessenger(_messenger);
        usdc           = _usdc;
        weth           = _weth;
        owner          = msg.sender;
    }

    // ── 1. ETH → USDC (Uniswap V3) → Arc USDC (CCTP) ────────────────────
    //    메인 함수: 1트랜잭션으로 ETH를 Arc USDC로 변환
    //    arcRecipient: Arc 수신 주소를 bytes32로 (address를 오른쪽 정렬 패딩)
    //    minUsdcOut:   슬리피지 보호 (예: 예상 금액의 95%)
    function bridgeETHToArc(
        bytes32 arcRecipient,
        uint256 minUsdcOut
    ) external payable {
        require(msg.value > 0, "No ETH sent");

        // Step 1: ETH → USDC via Uniswap V3
        uint256 usdcOut = swapRouter.exactInputSingle{value: msg.value}(
            ISwapRouter.ExactInputSingleParams({
                tokenIn:           weth,
                tokenOut:          usdc,
                fee:               POOL_FEE,
                recipient:         address(this),
                amountIn:          msg.value,
                amountOutMinimum:  minUsdcOut,
                sqrtPriceLimitX96: 0
            })
        );

        // Step 2: USDC → Arc via CCTP
        IERC20(usdc).approve(address(tokenMessenger), usdcOut);
        tokenMessenger.depositForBurn(usdcOut, ARC_DOMAIN, arcRecipient, usdc);

        emit BridgeInitiated(msg.sender, arcRecipient, usdcOut);
    }

    // ── 2. USDC → Arc USDC (CCTP 직접) ───────────────────────────────────
    //    테스트용: USDC를 이미 갖고 있을 때 바로 브릿지
    function bridgeUSDCToArc(
        uint256 amount,
        bytes32 arcRecipient
    ) external {
        require(amount > 0, "No USDC");

        IERC20(usdc).transferFrom(msg.sender, address(this), amount);
        IERC20(usdc).approve(address(tokenMessenger), amount);
        tokenMessenger.depositForBurn(amount, ARC_DOMAIN, arcRecipient, usdc);

        emit BridgeInitiated(msg.sender, arcRecipient, amount);
    }

    // ── 비상용: 컨트랙트에 남은 토큰 회수 ────────────────────────────────
    function rescue(address token) external {
        require(msg.sender == owner, "Not owner");
        IERC20(token).transfer(owner, IERC20(token).balanceOf(address(this)));
    }

    receive() external payable {}
}
