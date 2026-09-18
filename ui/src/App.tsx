import { useMemo, useState } from 'react';
import {
   createPublicClient,
   createWalletClient,
   custom,
   http,
   formatUnits,
   parseUnits,
   getAddress,
   type Address
} from 'viem';

import { arc, ARC_USDC_ADDRESS, PESO_LOAN_ADDRESS, USDC_DECIMALS, explorerTx } from './lib/arc';
import { pesoLoanAbi, erc20Abi, LOAN_STATUS } from './lib/contracts';

const publicClient = createPublicClient({ chain: arc, transport: http() });

type LoanView = {
   funder: Address;
   borrower: Address;
   principalPHP: bigint;
   totalOwedPHP: bigint;
   principalUSDC: bigint;
   totalOwedUSDC: bigint;
   amountRepaidUSDC: bigint;
   dueDate: bigint;
   status: number;
};

export function App() {
   const [account, setAccount] = useState<Address | null>(null);
   const [status, setStatus] = useState<string>('');
   const [busy, setBusy] = useState(false);

   // Create-loan form
   const [borrower, setBorrower] = useState('');
   const [principalPHP, setPrincipalPHP] = useState('5800');
   const [totalOwedPHP, setTotalOwedPHP] = useState('6380');
   const [principalUSDC, setPrincipalUSDC] = useState('100');
   const [totalOwedUSDC, setTotalOwedUSDC] = useState('110');
   const [weeks, setWeeks] = useState('8');

   // Repay / lookup
   const [loanId, setLoanId] = useState('1');
   const [repayAmount, setRepayAmount] = useState('110');
   const [loan, setLoan] = useState<LoanView | null>(null);

   const configured = useMemo(() => /^0x[a-fA-F0-9]{40}$/.test(PESO_LOAN_ADDRESS), []);

   const walletClient = useMemo(() => {
      if (!window.ethereum) return null;
      return createWalletClient({ chain: arc, transport: custom(window.ethereum) });
   }, []);

   async function ensureArc() {
      if (!window.ethereum) throw new Error('No wallet found. Install a browser wallet.');
      const hexId = `0x${arc.id.toString(16)}`;
      try {
         await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexId }] });
      } catch {
         await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
               {
                  chainId: hexId,
                  chainName: arc.name,
                  nativeCurrency: arc.nativeCurrency,
                  rpcUrls: arc.rpcUrls.default.http,
                  blockExplorerUrls: [arc.blockExplorers!.default.url]
               }
            ]
         });
      }
   }

   async function connect() {
      try {
         if (!walletClient) throw new Error('No wallet found. Install a browser wallet.');
         const [addr] = await walletClient.requestAddresses();
         await ensureArc();
         setAccount(getAddress(addr));
         setStatus('Wallet connected.');
      } catch (e) {
         setStatus((e as Error).message);
      }
   }

   async function approveUsdc(spender: Address, amount: bigint) {
      const hash = await walletClient!.writeContract({
         account: account!,
         address: ARC_USDC_ADDRESS,
         abi: erc20Abi,
         functionName: 'approve',
         args: [spender, amount]
      });
      await publicClient.waitForTransactionReceipt({ hash });
   }

   async function createLoan() {
      if (!walletClient || !account) return setStatus('Connect a wallet first.');
      if (!configured) return setStatus('Contract address not configured (VITE_PESO_LOAN_ADDRESS).');
      setBusy(true);
      setStatus('');
      try {
         await ensureArc();
         const pUSDC = parseUnits(principalUSDC, USDC_DECIMALS);
         setStatus('Approving USDC…');
         await approveUsdc(PESO_LOAN_ADDRESS, pUSDC);

         setStatus('Creating loan…');
         const hash = await walletClient.writeContract({
            account,
            address: PESO_LOAN_ADDRESS,
            abi: pesoLoanAbi,
            functionName: 'createLoan',
            args: [
               getAddress(borrower),
               BigInt(principalPHP),
               BigInt(totalOwedPHP),
               pUSDC,
               parseUnits(totalOwedUSDC, USDC_DECIMALS),
               BigInt(Math.floor(Date.now() / 1000) + Number(weeks) * 7 * 24 * 60 * 60)
            ]
         });
         await publicClient.waitForTransactionReceipt({ hash });
         setStatus(`Loan created. Tx: ${explorerTx(hash)}`);
      } catch (e) {
         setStatus((e as Error).message);
      } finally {
         setBusy(false);
      }
   }

   async function repay() {
      if (!walletClient || !account) return setStatus('Connect a wallet first.');
      if (!configured) return setStatus('Contract address not configured (VITE_PESO_LOAN_ADDRESS).');
      setBusy(true);
      setStatus('');
      try {
         await ensureArc();
         const amt = parseUnits(repayAmount, USDC_DECIMALS);
         setStatus('Approving USDC…');
         await approveUsdc(PESO_LOAN_ADDRESS, amt);

         setStatus('Repaying…');
         const hash = await walletClient.writeContract({
            account,
            address: PESO_LOAN_ADDRESS,
            abi: pesoLoanAbi,
            functionName: 'repay',
            args: [BigInt(loanId), amt]
         });
         await publicClient.waitForTransactionReceipt({ hash });
         setStatus(`Repayment sent. Tx: ${explorerTx(hash)}`);
         await lookup();
      } catch (e) {
         setStatus((e as Error).message);
      } finally {
         setBusy(false);
      }
   }

   async function lookup() {
      if (!configured) return setStatus('Contract address not configured (VITE_PESO_LOAN_ADDRESS).');
      try {
         const result = (await publicClient.readContract({
            address: PESO_LOAN_ADDRESS,
            abi: pesoLoanAbi,
            functionName: 'getLoan',
            args: [BigInt(loanId)]
         })) as LoanView;
         setLoan(result);
         setStatus('');
      } catch (e) {
         setLoan(null);
         setStatus((e as Error).message);
      }
   }

   return (
      <div className="wrap">
         <header>
            <h1>Peso Loan on Arc</h1>
            <p className="sub">
               A PHP-denominated microloan settled in USDC on Arc. The borrower's obligation is in pesos; value moves in
               USDC. By Moodeng Credit.
            </p>
            <button className="connect" onClick={connect}>
               {account ? `${account.slice(0, 6)}…${account.slice(-4)}` : 'Connect wallet'}
            </button>
            {!configured && (
               <p className="warn">Set VITE_PESO_LOAN_ADDRESS to the deployed contract to enable actions.</p>
            )}
         </header>

         <section className="card">
            <h2>1. Create a loan (funder)</h2>
            <label>Borrower address<input value={borrower} onChange={(e) => setBorrower(e.target.value)} placeholder="0x…" /></label>
            <div className="row">
               <label>Principal (PHP)<input value={principalPHP} onChange={(e) => setPrincipalPHP(e.target.value)} /></label>
               <label>Total owed (PHP)<input value={totalOwedPHP} onChange={(e) => setTotalOwedPHP(e.target.value)} /></label>
            </div>
            <div className="row">
               <label>Principal (USDC)<input value={principalUSDC} onChange={(e) => setPrincipalUSDC(e.target.value)} /></label>
               <label>Total owed (USDC)<input value={totalOwedUSDC} onChange={(e) => setTotalOwedUSDC(e.target.value)} /></label>
            </div>
            <label>Term (weeks)<input value={weeks} onChange={(e) => setWeeks(e.target.value)} /></label>
            <button disabled={busy} onClick={createLoan}>Create loan</button>
         </section>

         <section className="card">
            <h2>2. Repay (borrower)</h2>
            <div className="row">
               <label>Loan ID<input value={loanId} onChange={(e) => setLoanId(e.target.value)} /></label>
               <label>Amount (USDC)<input value={repayAmount} onChange={(e) => setRepayAmount(e.target.value)} /></label>
            </div>
            <button disabled={busy} onClick={repay}>Repay</button>
         </section>

         <section className="card">
            <h2>3. Loan status</h2>
            <div className="row">
               <label>Loan ID<input value={loanId} onChange={(e) => setLoanId(e.target.value)} /></label>
               <button disabled={busy} onClick={lookup}>Look up</button>
            </div>
            {loan && (
               <dl className="loan">
                  <div><dt>Status</dt><dd>{LOAN_STATUS[loan.status] ?? loan.status}</dd></div>
                  <div><dt>Borrower</dt><dd>{loan.borrower}</dd></div>
                  <div><dt>Funder</dt><dd>{loan.funder}</dd></div>
                  <div><dt>Obligation (PHP)</dt><dd>₱{loan.totalOwedPHP.toString()} (principal ₱{loan.principalPHP.toString()})</dd></div>
                  <div><dt>Owed (USDC)</dt><dd>{formatUnits(loan.totalOwedUSDC, USDC_DECIMALS)}</dd></div>
                  <div><dt>Repaid (USDC)</dt><dd>{formatUnits(loan.amountRepaidUSDC, USDC_DECIMALS)}</dd></div>
               </dl>
            )}
         </section>

         {status && (
            <p className="status">
               {status.startsWith('http') || status.includes('Tx: http') ? (
                  <a href={status.replace(/^.*Tx: /, '')} target="_blank" rel="noreferrer">{status}</a>
               ) : (
                  status
               )}
            </p>
         )}

         <footer>
            <p>Contract: {configured ? PESO_LOAN_ADDRESS : 'not set'} · USDC: {ARC_USDC_ADDRESS} · Arc chain {arc.id}</p>
         </footer>
      </div>
   );
}
