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

const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');
const fmtUsd = (v: bigint) => Number(formatUnits(v, USDC_DECIMALS)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPhp = (v: bigint) => Number(v).toLocaleString();

function SendIcon() {
   return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
         <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
      </svg>
   );
}

export function App() {
   const [account, setAccount] = useState<Address | null>(null);
   const [status, setStatus] = useState<string>('');
   const [busy, setBusy] = useState(false);
   const [phpc, setPhpc] = useState<string | null>(null);

   // Create-loan form
   const [borrower, setBorrower] = useState('');
   const [reason, setReason] = useState('Market inventory');
   const [principalPHP, setPrincipalPHP] = useState('5800');
   const [totalOwedPHP, setTotalOwedPHP] = useState('6380');
   const [principalUSDC, setPrincipalUSDC] = useState('100');
   const [totalOwedUSDC, setTotalOwedUSDC] = useState('110');
   const [weeks, setWeeks] = useState('8');

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
            params: [{ chainId: hexId, chainName: arc.name, nativeCurrency: arc.nativeCurrency, rpcUrls: arc.rpcUrls.default.http, blockExplorerUrls: [arc.blockExplorers!.default.url] }]
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
      const hash = await walletClient!.writeContract({ account: account!, address: ARC_USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [spender, amount] });
      await publicClient.waitForTransactionReceipt({ hash });
   }

   async function createLoan() {
      if (!walletClient || !account) return setStatus('Connect a wallet first.');
      if (!configured) return setStatus('Contract address not configured (VITE_PESO_LOAN_ADDRESS).');
      setBusy(true); setStatus('');
      try {
         await ensureArc();
         const pUSDC = parseUnits(principalUSDC, USDC_DECIMALS);
         setStatus('Approving USDC…');
         await approveUsdc(PESO_LOAN_ADDRESS, pUSDC);
         setStatus('Sending your help…');
         const hash = await walletClient.writeContract({
            account, address: PESO_LOAN_ADDRESS, abi: pesoLoanAbi, functionName: 'createLoan',
            args: [getAddress(borrower), BigInt(principalPHP), BigInt(totalOwedPHP), pUSDC, parseUnits(totalOwedUSDC, USDC_DECIMALS), BigInt(Math.floor(Date.now() / 1000) + Number(weeks) * 7 * 24 * 60 * 60)]
         });
         await publicClient.waitForTransactionReceipt({ hash });
         setStatus(`Loan created. Tx: ${explorerTx(hash)}`);
         setPhpc(`₱${Number(principalPHP).toLocaleString()} disbursed to the borrower as PHPC, cashed out to pesos via Coins.ph.`);
      } catch (e) { setStatus((e as Error).message); } finally { setBusy(false); }
   }

   async function repay() {
      if (!walletClient || !account) return setStatus('Connect a wallet first.');
      if (!configured) return setStatus('Contract address not configured (VITE_PESO_LOAN_ADDRESS).');
      setBusy(true); setStatus('');
      try {
         await ensureArc();
         const amt = parseUnits(repayAmount, USDC_DECIMALS);
         setStatus('Approving USDC…');
         await approveUsdc(PESO_LOAN_ADDRESS, amt);
         setStatus('Repaying…');
         const hash = await walletClient.writeContract({ account, address: PESO_LOAN_ADDRESS, abi: pesoLoanAbi, functionName: 'repay', args: [BigInt(loanId), amt] });
         await publicClient.waitForTransactionReceipt({ hash });
         setStatus(`Repayment sent. Tx: ${explorerTx(hash)}`);
         setPhpc('Borrower cashed in PHP → PHPC at par via Coins.ph; StableFX settled PHPC → USDC to the lender.');
         await lookup();
      } catch (e) { setStatus((e as Error).message); } finally { setBusy(false); }
   }

   async function lookup() {
      if (!configured) return setStatus('Contract address not configured (VITE_PESO_LOAN_ADDRESS).');
      try {
         const result = (await publicClient.readContract({ address: PESO_LOAN_ADDRESS, abi: pesoLoanAbi, functionName: 'getLoan', args: [BigInt(loanId)] })) as LoanView;
         setLoan(result); setStatus('');
      } catch (e) { setLoan(null); setStatus((e as Error).message); }
   }

   const dueLabel = loan ? new Date(Number(loan.dueDate) * 1000).toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' }) : '';
   const repaid = loan?.status === 1;

   return (
      <div className="md-shell">
         {/* Header */}
         <div className="mb-md-4 flex flex-col gap-md-1">
            <h1 className="text-md-h3 font-semibold text-md-heading">Microloan Request Board</h1>
            <p className="text-md-b2 text-md-neutral-1200">
               Peso-denominated microloans, settled in USDC on Arc.
            </p>
            <div className="mt-md-1 flex items-center gap-2 flex-wrap">
               <button
                  onClick={connect}
                  className="inline-flex min-h-[44px] items-center justify-center gap-md-1 rounded-md-lg bg-md-primary-1200 px-md-4 py-md-2 text-md-b1 font-semibold text-md-neutral-100 shadow-md-card transition-all duration-150 hover:brightness-110 active:scale-[0.97]"
               >
                  {account ? short(account) : 'Connect wallet'}
               </button>
               <span className="inline-flex items-center rounded-md-pill border border-md-green-600 bg-[rgba(0,134,36,0.05)] px-2.5 py-1 text-md-b4 font-semibold text-md-green-600">
                  PHPC settlement · preview (mock)
               </span>
            </div>
            {!configured && <p className="mt-md-1 text-md-b3 text-md-red-600">Set VITE_PESO_LOAN_ADDRESS to enable actions.</p>}
         </div>

         {/* PHPC simulated banner */}
         {phpc && (
            <div className="mb-md-4 flex items-start gap-2 rounded-md-lg border border-md-green-600/40 bg-[rgba(0,134,36,0.05)] p-md-2 text-md-b3 text-md-green-800">
               <span className="flex-none rounded-md-pill bg-md-green-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">PHPC · simulated</span>
               <span className="flex-1">{phpc}</span>
               <button onClick={() => setPhpc(null)} className="text-md-green-800" aria-label="Dismiss">✕</button>
            </div>
         )}

         {/* Loan request card — matches the app's UserCard */}
         <div className="relative mb-md-4 flex flex-col gap-4 rounded-[24px] border border-[#f0f0f0] bg-white p-md-4 shadow-[0px_11px_24px_0px_rgba(0,0,0,0.02)]">
            <div className="flex items-center gap-4">
               <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <p className="text-md-h5 font-semibold text-md-heading">{loan ? reason : 'Look up a request'}</p>
                  <div className="flex flex-wrap items-center gap-2">
                     <p className="text-md-b3 text-md-neutral-700">
                        <span>by </span>
                        <span className="text-[#d0588b]">{loan ? short(loan.borrower) : 'borrower'}</span>
                     </p>
                     <span className="inline-flex items-center justify-center rounded-[30px] border border-md-green-600 bg-[rgba(0,134,36,0.05)] px-md-1 py-md-0">
                        <span className="text-md-b4 font-semibold text-md-green-600">Good Standing</span>
                     </span>
                  </div>
                  <img src="/icons/base-account.svg" alt="Base" className="h-6 w-6 rounded-[3.4px]" />
                  <div className="flex items-center gap-1 text-md-b2 font-semibold">
                     <span className="text-[#585858]">Due On</span>
                     <span className="text-md-red-600">{loan ? dueLabel : '—'}</span>
                  </div>
                  <div className="text-md-b3 text-md-neutral-1200">
                     Obligation ₱{loan ? fmtPhp(loan.totalOwedPHP) : fmtPhp(BigInt(totalOwedPHP || 0))} (principal ₱{loan ? fmtPhp(loan.principalPHP) : fmtPhp(BigInt(principalPHP || 0))})
                  </div>
               </div>

               {/* Amount card */}
               <div className="flex w-[134px] shrink-0 flex-col justify-center gap-5 self-stretch rounded-[12px] border border-[#f0f0f0] bg-white p-3">
                  <div className="flex flex-col gap-1">
                     <p className="text-md-b3 font-medium text-[#585858]">Borrowing USDC</p>
                     <p className="text-[20px] font-semibold leading-[1.2] tracking-[-0.04em] text-md-heading">${loan ? fmtUsd(loan.principalUSDC) : Number(principalUSDC || 0).toFixed(2)}</p>
                  </div>
                  <div className="flex flex-col gap-1">
                     <p className="text-md-b3 font-medium text-[#585858]">Get back USDC</p>
                     <p className="text-[20px] font-semibold leading-[1.2] tracking-[-0.04em] text-md-green-600">${loan ? fmtUsd(loan.totalOwedUSDC) : Number(totalOwedUSDC || 0).toFixed(2)}</p>
                  </div>
               </div>
            </div>

            {loan && (
               <div className={`rounded-md-lg py-md-3 text-center text-md-b1 font-semibold ${repaid ? 'bg-md-neutral-300 text-md-neutral-1200' : 'bg-[rgba(0,134,36,0.08)] text-md-green-800'}`}>
                  {repaid ? 'Repaid — help received' : `${LOAN_STATUS[loan.status]} · ${fmtUsd(loan.amountRepaidUSDC)} / ${fmtUsd(loan.totalOwedUSDC)} USDC repaid`}
               </div>
            )}

            <div className="flex items-center gap-2">
               <input value={loanId} onChange={(e) => setLoanId(e.target.value)} placeholder="Loan ID" className="w-24 rounded-md-input border border-md-neutral-500 px-3 py-2 text-md-b2 text-md-heading focus:border-md-primary-1200 focus:outline-none" />
               <button onClick={lookup} disabled={busy} className="flex-1 rounded-md-lg border border-md-primary-1200 py-md-2 text-md-b1 font-semibold text-md-primary-1200 transition hover:bg-md-primary-100 disabled:opacity-50">View Request</button>
            </div>
         </div>

         {/* Create a request (funder) */}
         <div className="mb-md-4 flex flex-col gap-md-2 rounded-[24px] border border-[#f0f0f0] bg-white p-md-4 shadow-[0px_11px_24px_0px_rgba(0,0,0,0.02)]">
            <p className="text-md-h5 font-semibold text-md-heading">Fund a peso loan</p>
            <Field label="Borrower address" value={borrower} onChange={setBorrower} placeholder="0x…" />
            <Field label="Reason" value={reason} onChange={setReason} />
            <div className="flex gap-md-2">
               <Field label="Principal (PHP)" value={principalPHP} onChange={setPrincipalPHP} />
               <Field label="Total owed (PHP)" value={totalOwedPHP} onChange={setTotalOwedPHP} />
            </div>
            <div className="flex gap-md-2">
               <Field label="Principal (USDC)" value={principalUSDC} onChange={setPrincipalUSDC} />
               <Field label="Total owed (USDC)" value={totalOwedUSDC} onChange={setTotalOwedUSDC} />
            </div>
            <Field label="Term (weeks)" value={weeks} onChange={setWeeks} />
            <button onClick={createLoan} disabled={busy} className="mt-md-1 flex w-full items-center justify-center gap-2 rounded-md-lg bg-md-primary-1200 py-md-3 text-md-b1 font-semibold text-md-neutral-100 transition-all duration-150 hover:brightness-110 active:scale-[0.98] disabled:opacity-50">
               {busy ? 'Processing…' : 'Send Your Help'}
               {!busy && <SendIcon />}
            </button>
         </div>

         {/* Repay (borrower) */}
         <div className="mb-md-4 flex flex-col gap-md-2 rounded-[24px] border border-[#f0f0f0] bg-white p-md-4 shadow-[0px_11px_24px_0px_rgba(0,0,0,0.02)]">
            <p className="text-md-h5 font-semibold text-md-heading">Repay (borrower)</p>
            <div className="flex gap-md-2">
               <Field label="Loan ID" value={loanId} onChange={setLoanId} />
               <Field label="Amount (USDC)" value={repayAmount} onChange={setRepayAmount} />
            </div>
            <button onClick={repay} disabled={busy} className="mt-md-1 w-full rounded-md-lg border border-md-primary-1200 py-md-3 text-md-b1 font-semibold text-md-primary-1200 transition hover:bg-md-primary-100 disabled:opacity-50">
               {busy ? 'Processing…' : 'Repay'}
            </button>
         </div>

         {status && (
            <p className="mb-md-2 rounded-md-lg bg-md-primary-100 p-md-2 text-md-b3 text-md-primary-1200 break-words">
               {status.includes('Tx: http') ? <a className="underline" href={status.replace(/^.*Tx: /, '')} target="_blank" rel="noreferrer">{status}</a> : status}
            </p>
         )}

         <p className="text-md-b4 text-md-neutral-1000">
            Contract {configured ? short(PESO_LOAN_ADDRESS) : 'not set'} · USDC {short(ARC_USDC_ADDRESS)} · Arc chain {arc.id}. On-chain settlement is real USDC; the PHPC / Coins.ph peso leg is simulated (preview) — PHPC is not yet live on Arc.
         </p>
      </div>
   );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
   return (
      <label className="flex flex-1 flex-col gap-1 text-md-b3 font-medium text-[#585858]">
         {label}
         <input
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            className="rounded-md-input border border-md-neutral-500 px-3 py-2 text-md-b2 text-md-heading focus:border-md-primary-1200 focus:outline-none"
         />
      </label>
   );
}
