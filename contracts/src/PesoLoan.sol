// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PesoLoan (Moodeng Credit — Arc)
 * @notice A minimal peso-denominated microloan settled in USDC on Arc.
 *
 *         The borrower's obligation is recorded in PHP; value moves in USDC. The
 *         funder locks the exchange rate off-chain by supplying the matched
 *         (PHP, USDC) amounts at creation, so the on-chain record stays
 *         peso-denominated with no oracle and no fixed-point math.
 *
 *         Flow: a funder calls {createLoan}, fronting `principalUSDC` to the
 *         borrower. The borrower repays via {repay}; once the full USDC total is
 *         repaid, the contract forwards it to the funder and marks the loan
 *         Repaid. One funder per loan (the funder is the lender).
 *
 *         This is a deliberately small primitive: the smallest honest slice of
 *         Moodeng's PHP-denominated credit product, running on Arc mainnet where
 *         USDC is the native settlement and gas asset.
 */
contract PesoLoan is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------
    enum Status {
        Active,
        Repaid
    }

    struct Loan {
        address funder; // supplies USDC, receives repayment
        address borrower; // receives USDC, repays
        uint256 principalPHP; // obligation denomination (display/record)
        uint256 totalOwedPHP; // peso amount owed at maturity
        uint256 principalUSDC; // USDC actually fronted
        uint256 totalOwedUSDC; // USDC to repay (rate locked implicitly by funder)
        uint256 amountRepaidUSDC; // running USDC repaid
        uint256 dueDate; // unix seconds
        Status status;
    }

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------
    IERC20 public immutable usdc;
    uint256 private _nextLoanId = 1;
    mapping(uint256 loanId => Loan) private _loans;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------
    event LoanCreated(
        uint256 indexed loanId,
        address indexed funder,
        address indexed borrower,
        uint256 principalPHP,
        uint256 totalOwedPHP,
        uint256 principalUSDC,
        uint256 totalOwedUSDC,
        uint256 dueDate
    );
    event RepaymentMade(uint256 indexed loanId, address indexed borrower, uint256 amountUSDC, uint256 totalRepaidUSDC);
    event LoanRepaid(uint256 indexed loanId, address indexed funder, uint256 totalUSDC);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------
    error ZeroAddress();
    error InvalidTerms();
    error InvalidLoan();
    error NotBorrower();
    error NotActive();
    error InvalidAmount();
    error OverRepayment();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------
    /// @param usdc_ USDC token on Arc (ERC-20 interface, 6 decimals).
    constructor(address usdc_) {
        if (usdc_ == address(0)) revert ZeroAddress();
        usdc = IERC20(usdc_);
    }

    // -------------------------------------------------------------------------
    // Origination
    // -------------------------------------------------------------------------
    /**
     * @notice Funder fronts `principalUSDC` to `borrower` and records a
     *         peso-denominated obligation. The funder must approve this contract
     *         for at least `principalUSDC` first.
     * @return loanId The new loan id.
     */
    function createLoan(
        address borrower,
        uint256 principalPHP,
        uint256 totalOwedPHP,
        uint256 principalUSDC,
        uint256 totalOwedUSDC,
        uint256 dueDate
    ) external nonReentrant returns (uint256 loanId) {
        if (borrower == address(0)) revert ZeroAddress();
        if (borrower == msg.sender) revert InvalidTerms();
        if (principalPHP == 0 || principalUSDC == 0) revert InvalidTerms();
        if (totalOwedPHP < principalPHP) revert InvalidTerms();
        if (totalOwedUSDC < principalUSDC) revert InvalidTerms();
        if (dueDate <= block.timestamp) revert InvalidTerms();

        loanId = _nextLoanId++;
        _loans[loanId] = Loan({
            funder: msg.sender,
            borrower: borrower,
            principalPHP: principalPHP,
            totalOwedPHP: totalOwedPHP,
            principalUSDC: principalUSDC,
            totalOwedUSDC: totalOwedUSDC,
            amountRepaidUSDC: 0,
            dueDate: dueDate,
            status: Status.Active
        });

        emit LoanCreated(
            loanId, msg.sender, borrower, principalPHP, totalOwedPHP, principalUSDC, totalOwedUSDC, dueDate
        );

        // Front the principal: funder -> contract -> borrower.
        usdc.safeTransferFrom(msg.sender, borrower, principalUSDC);
    }

    // -------------------------------------------------------------------------
    // Repayment
    // -------------------------------------------------------------------------
    /**
     * @notice Borrower repays `amountUSDC`. On full repayment the contract
     *         forwards the collected USDC to the funder and marks the loan
     *         Repaid. The borrower must approve this contract first.
     */
    function repay(uint256 loanId, uint256 amountUSDC) external nonReentrant {
        Loan storage loan = _loans[loanId];
        if (loan.borrower == address(0)) revert InvalidLoan();
        if (msg.sender != loan.borrower) revert NotBorrower();
        if (loan.status != Status.Active) revert NotActive();
        if (amountUSDC == 0) revert InvalidAmount();

        uint256 remaining = loan.totalOwedUSDC - loan.amountRepaidUSDC;
        if (amountUSDC > remaining) revert OverRepayment();

        loan.amountRepaidUSDC += amountUSDC;
        // Collect into the contract, then forward on full payoff.
        usdc.safeTransferFrom(msg.sender, address(this), amountUSDC);
        emit RepaymentMade(loanId, msg.sender, amountUSDC, loan.amountRepaidUSDC);

        if (loan.amountRepaidUSDC == loan.totalOwedUSDC) {
            loan.status = Status.Repaid;
            uint256 payout = loan.totalOwedUSDC;
            usdc.safeTransfer(loan.funder, payout);
            emit LoanRepaid(loanId, loan.funder, payout);
        }
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------
    function getLoan(uint256 loanId) external view returns (Loan memory) {
        Loan memory loan = _loans[loanId];
        if (loan.borrower == address(0)) revert InvalidLoan();
        return loan;
    }

    function getRemainingOwedUSDC(uint256 loanId) external view returns (uint256) {
        Loan memory loan = _loans[loanId];
        if (loan.borrower == address(0)) revert InvalidLoan();
        return loan.totalOwedUSDC - loan.amountRepaidUSDC;
    }

    function nextLoanId() external view returns (uint256) {
        return _nextLoanId;
    }
}
