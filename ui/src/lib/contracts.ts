// Minimal ABIs for the pieces the UI touches.

export const pesoLoanAbi = [
   {
      type: 'function',
      name: 'createLoan',
      stateMutability: 'nonpayable',
      inputs: [
         { name: 'borrower', type: 'address' },
         { name: 'principalPHP', type: 'uint256' },
         { name: 'totalOwedPHP', type: 'uint256' },
         { name: 'principalUSDC', type: 'uint256' },
         { name: 'totalOwedUSDC', type: 'uint256' },
         { name: 'dueDate', type: 'uint256' }
      ],
      outputs: [{ name: 'loanId', type: 'uint256' }]
   },
   {
      type: 'function',
      name: 'repay',
      stateMutability: 'nonpayable',
      inputs: [
         { name: 'loanId', type: 'uint256' },
         { name: 'amountUSDC', type: 'uint256' }
      ],
      outputs: []
   },
   {
      type: 'function',
      name: 'getLoan',
      stateMutability: 'view',
      inputs: [{ name: 'loanId', type: 'uint256' }],
      outputs: [
         {
            name: '',
            type: 'tuple',
            components: [
               { name: 'funder', type: 'address' },
               { name: 'borrower', type: 'address' },
               { name: 'principalPHP', type: 'uint256' },
               { name: 'totalOwedPHP', type: 'uint256' },
               { name: 'principalUSDC', type: 'uint256' },
               { name: 'totalOwedUSDC', type: 'uint256' },
               { name: 'amountRepaidUSDC', type: 'uint256' },
               { name: 'dueDate', type: 'uint256' },
               { name: 'status', type: 'uint8' }
            ]
         }
      ]
   },
   {
      type: 'function',
      name: 'getRemainingOwedUSDC',
      stateMutability: 'view',
      inputs: [{ name: 'loanId', type: 'uint256' }],
      outputs: [{ name: '', type: 'uint256' }]
   },
   {
      type: 'function',
      name: 'nextLoanId',
      stateMutability: 'view',
      inputs: [],
      outputs: [{ name: '', type: 'uint256' }]
   }
] as const;

export const erc20Abi = [
   {
      type: 'function',
      name: 'approve',
      stateMutability: 'nonpayable',
      inputs: [
         { name: 'spender', type: 'address' },
         { name: 'amount', type: 'uint256' }
      ],
      outputs: [{ name: '', type: 'bool' }]
   },
   {
      type: 'function',
      name: 'allowance',
      stateMutability: 'view',
      inputs: [
         { name: 'owner', type: 'address' },
         { name: 'spender', type: 'address' }
      ],
      outputs: [{ name: '', type: 'uint256' }]
   },
   {
      type: 'function',
      name: 'balanceOf',
      stateMutability: 'view',
      inputs: [{ name: 'account', type: 'address' }],
      outputs: [{ name: '', type: 'uint256' }]
   }
] as const;

export const LOAN_STATUS = ['Active', 'Repaid'] as const;
