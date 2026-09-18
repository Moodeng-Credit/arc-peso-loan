// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {PesoLoan} from "../src/PesoLoan.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract PesoLoanTest is Test {
    PesoLoan internal peso;
    MockUSDC internal usdc;

    address internal funder = address(0xF00D);
    address internal borrower = address(0xB0B);

    // Rate locked off-chain: 1 USDC = 58 PHP. Loan: 5,800 PHP principal, 6,380 PHP owed.
    uint256 internal constant PRINCIPAL_PHP = 5_800;
    uint256 internal constant TOTAL_OWED_PHP = 6_380;
    uint256 internal constant PRINCIPAL_USDC = 100e6; // $100
    uint256 internal constant TOTAL_OWED_USDC = 110e6; // $110

    function setUp() public {
        usdc = new MockUSDC();
        peso = new PesoLoan(address(usdc));

        usdc.mint(funder, 1_000e6);
        usdc.mint(borrower, 1_000e6); // borrower will have off-ramped/earned USDC to repay
    }

    function _createDefaultLoan() internal returns (uint256 loanId) {
        vm.startPrank(funder);
        usdc.approve(address(peso), PRINCIPAL_USDC);
        loanId = peso.createLoan(
            borrower, PRINCIPAL_PHP, TOTAL_OWED_PHP, PRINCIPAL_USDC, TOTAL_OWED_USDC, block.timestamp + 8 weeks
        );
        vm.stopPrank();
    }

    function test_CreateLoan_FrontsUsdcToBorrower() public {
        uint256 borrowerBefore = usdc.balanceOf(borrower);
        uint256 loanId = _createDefaultLoan();

        assertEq(usdc.balanceOf(borrower), borrowerBefore + PRINCIPAL_USDC, "borrower funded");
        assertEq(usdc.balanceOf(address(peso)), 0, "contract holds nothing after funding");

        PesoLoan.Loan memory loan = peso.getLoan(loanId);
        assertEq(loan.funder, funder);
        assertEq(loan.borrower, borrower);
        assertEq(loan.principalPHP, PRINCIPAL_PHP, "obligation recorded in PHP");
        assertEq(loan.totalOwedPHP, TOTAL_OWED_PHP);
        assertEq(loan.totalOwedUSDC, TOTAL_OWED_USDC);
        assertEq(uint256(loan.status), uint256(PesoLoan.Status.Active));
    }

    function test_Repay_FullPayoff_ReleasesToFunder() public {
        uint256 loanId = _createDefaultLoan();
        uint256 funderBefore = usdc.balanceOf(funder);

        vm.startPrank(borrower);
        usdc.approve(address(peso), TOTAL_OWED_USDC);
        peso.repay(loanId, TOTAL_OWED_USDC);
        vm.stopPrank();

        assertEq(usdc.balanceOf(funder), funderBefore + TOTAL_OWED_USDC, "funder repaid in full");
        assertEq(usdc.balanceOf(address(peso)), 0, "no dust left in contract");

        PesoLoan.Loan memory loan = peso.getLoan(loanId);
        assertEq(uint256(loan.status), uint256(PesoLoan.Status.Repaid));
        assertEq(peso.getRemainingOwedUSDC(loanId), 0);
    }

    function test_Repay_Partial_ThenFull() public {
        uint256 loanId = _createDefaultLoan();
        uint256 funderBefore = usdc.balanceOf(funder);

        vm.startPrank(borrower);
        usdc.approve(address(peso), TOTAL_OWED_USDC);

        peso.repay(loanId, 40e6);
        assertEq(peso.getRemainingOwedUSDC(loanId), TOTAL_OWED_USDC - 40e6);
        // funder not paid until full payoff
        assertEq(usdc.balanceOf(funder), funderBefore, "funder not paid on partial");
        assertEq(usdc.balanceOf(address(peso)), 40e6, "partial held in contract");

        peso.repay(loanId, TOTAL_OWED_USDC - 40e6);
        vm.stopPrank();

        assertEq(usdc.balanceOf(funder), funderBefore + TOTAL_OWED_USDC, "funder paid on full");
        PesoLoan.Loan memory loan = peso.getLoan(loanId);
        assertEq(uint256(loan.status), uint256(PesoLoan.Status.Repaid));
    }

    function test_Repay_RevertsOverRepayment() public {
        uint256 loanId = _createDefaultLoan();
        vm.startPrank(borrower);
        usdc.approve(address(peso), TOTAL_OWED_USDC + 1);
        vm.expectRevert(PesoLoan.OverRepayment.selector);
        peso.repay(loanId, TOTAL_OWED_USDC + 1);
        vm.stopPrank();
    }

    function test_Repay_RevertsNonBorrower() public {
        uint256 loanId = _createDefaultLoan();
        vm.startPrank(address(0xBEEF));
        vm.expectRevert(PesoLoan.NotBorrower.selector);
        peso.repay(loanId, 10e6);
        vm.stopPrank();
    }

    function test_CreateLoan_RevertsBadTerms() public {
        vm.startPrank(funder);
        usdc.approve(address(peso), PRINCIPAL_USDC);

        // totalOwedUSDC < principalUSDC
        vm.expectRevert(PesoLoan.InvalidTerms.selector);
        peso.createLoan(borrower, PRINCIPAL_PHP, TOTAL_OWED_PHP, PRINCIPAL_USDC, PRINCIPAL_USDC - 1, block.timestamp + 1 weeks);

        // dueDate in the past
        vm.expectRevert(PesoLoan.InvalidTerms.selector);
        peso.createLoan(borrower, PRINCIPAL_PHP, TOTAL_OWED_PHP, PRINCIPAL_USDC, TOTAL_OWED_USDC, block.timestamp);

        // borrower == funder
        vm.expectRevert(PesoLoan.InvalidTerms.selector);
        peso.createLoan(funder, PRINCIPAL_PHP, TOTAL_OWED_PHP, PRINCIPAL_USDC, TOTAL_OWED_USDC, block.timestamp + 1 weeks);
        vm.stopPrank();
    }
}
