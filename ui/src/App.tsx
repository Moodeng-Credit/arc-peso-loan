import { useEffect, useMemo, useState } from 'react';
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

import { arc, ARC_USDC_ADDRESS, PESO_LOAN_ADDRESS, USDC_DECIMALS, explorerTx, explorerAddress } from './lib/arc';
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
type BoardLoan = { id: number; loan: LoanView };

const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');
const fmtUsd = (v: bigint) => Number(formatUnits(v, USDC_DECIMALS)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPhp = (v: bigint) => Number(v).toLocaleString();
const dueLabel = (d: bigint) => new Date(Number(d) * 1000).toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' });

function SendIcon() {
   return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
         <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
      </svg>
   );
}
function Spinner() {
   return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-md-primary-1200 border-t-transparent align-[-2px]" />;
}

export function App() {
   const [account, setAccount] = useState<Address | null>(null);
   const [status, setStatus] = useState<string>('');
   const [busy, setBusy] = useState(false);
   const [phpc, setPhpc] = useState<string | null>(null);

   const [borrower, setBorrower] = useState('');
   const [reason, setReason] = useState('Market inventory');
   const [principalPHP, setPrincipalPHP] = useState('5800');
   const [totalOwedPHP, setTotalOwedPHP] = useState('6380');
   const [principalUSDC, setPrincipalUSDC] = useState('100');
   const [totalOwedUSDC, setTotalOwedUSDC] = useState('110');
   const [weeks, setWeeks] = useState('8');

   const [repayId, setRepayId] = useState('1');
   const [repayAmount, setRepayAmount] = useState('110');

   const [board, setBoard] = useState<BoardLoan[]>([]);
   const [loadingBoard, setLoadingBoard] = useState(true);

   const configured = useMemo(() => /^0x[a-fA-F0-9]{40}$/.test(PESO_LOAN_ADDRESS), []);
   const walletClient = useMemo(() => {
      if (!window.ethereum) return null;
      return createWalletClient({ chain: arc, transport: custom(window.ethereum) });
   }, []);

   async function refreshBoard() {
      if (!configured) { setLoadingBoard(false); return; }
      setLoadingBoard(true);
      try {
         const next = (await publicClient.readContract({ address: PESO_LOAN_ADDRESS, abi: pesoLoanAbi, functionName: 'nextLoanId' })) as bigint;
         const ids = Array.from({ length: Number(next) - 1 }, (_, i) => i + 1);
         const loans = await Promise.all(
            ids.map(async (id) => {
               try {
                  const loan = (await publicClient.readContract({ address: PESO_LOAN_ADDRESS, abi: pesoLoanAbi, functionName: 'getLoan', args: [BigInt(id)] })) as LoanView;
                  return { id, loan } as BoardLoan;
               } catch { return null; }
            })
         );
         setBoard(loans.filter(Boolean).reverse() as BoardLoan[]);
      } catch { setBoard([]); } finally { setLoadingBoard(false); }
   }
   useEffect(() => { refreshBoard(); /* eslint-disable-next-line */ }, []);

   async function ensureArc() {
      if (!window.ethereum) throw new Error('No wallet found. Install a browser wallet (e.g. Rabby).');
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
         if (!walletClient) throw new Error('No wallet found. Install a browser wallet (e.g. Rabby).');
         const [addr] = await walletClient.requestAddresses();
         await ensureArc();
         setAccount(getAddress(addr));
         setStatus('Wallet connected.');
      } catch (e) { setStatus((e as Error).message); }
   }
   async function approveUsdc(spender: Address, amount: bigint) {
      const hash = await walletClient!.writeContract({ account: account!, address: ARC_USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [spender, amount] });
      await publicClient.waitForTransactionReceipt({ hash });
   }
   async function createLoan() {
      if (!walletClient || !account) return setStatus('Connect a wallet first.');
      if (!configured) return setStatus('Contract not configured.');
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
         refreshBoard();
      } catch (e) { setStatus((e as Error).message); } finally { setBusy(false); }
   }
   async function repay() {
      if (!walletClient || !account) return setStatus('Connect a wallet first.');
      if (!configured) return setStatus('Contract not configured.');
      setBusy(true); setStatus('');
      try {
         await ensureArc();
         const amt = parseUnits(repayAmount, USDC_DECIMALS);
         setStatus('Approving USDC…');
         await approveUsdc(PESO_LOAN_ADDRESS, amt);
         setStatus('Repaying…');
         const hash = await walletClient.writeContract({ account, address: PESO_LOAN_ADDRESS, abi: pesoLoanAbi, functionName: 'repay', args: [BigInt(repayId), amt] });
         await publicClient.waitForTransactionReceipt({ hash });
         setStatus(`Repayment sent. Tx: ${explorerTx(hash)}`);
         setPhpc('Borrower cashed in PHP → PHPC at par via Coins.ph; StableFX settled PHPC → USDC to the lender.');
         refreshBoard();
      } catch (e) { setStatus((e as Error).message); } finally { setBusy(false); }
   }

   return (
      <div className="min-h-screen">
         {/* Nav */}
         <nav className="sticky top-0 z-20 border-b border-md-neutral-400 bg-white/85 backdrop-blur">
            <div className="mx-auto flex max-w-[960px] items-center justify-between px-4 py-3">
               <div className="flex items-center gap-2">
                  <img src="/brand/moodeng-logo.png" alt="Moodeng Credit" className="h-8 w-8 rounded-md-md object-contain" />
                  <span className="text-md-b1 font-semibold text-md-heading">Moodeng Credit</span>
                  <span className="hidden text-md-b3 text-md-neutral-1200 sm:inline">· Arc</span>
               </div>
               <div className="flex items-center gap-3">
                  <a href="https://github.com/Moodeng-Credit/arc-peso-loan" target="_blank" rel="noreferrer" className="hidden text-md-b2 font-semibold text-md-neutral-1400 hover:text-md-primary-1200 sm:inline">GitHub</a>
                  <a href={explorerAddress(PESO_LOAN_ADDRESS)} target="_blank" rel="noreferrer" className="hidden text-md-b2 font-semibold text-md-neutral-1400 hover:text-md-primary-1200 sm:inline">Explorer</a>
                  <button onClick={connect} className="rounded-md-lg bg-md-primary-1200 px-md-3 py-md-1 text-md-b2 font-semibold text-white shadow-md-card transition-all duration-150 hover:brightness-110 active:scale-[0.97]">
                     {account ? short(account) : 'Connect wallet'}
                  </button>
               </div>
            </div>
         </nav>

         <main className="mx-auto max-w-[960px] px-4 pb-24">
            {/* Hero */}
            <section className="pb-6 pt-8">
               <h1 className="text-md-display font-semibold text-md-heading">Microloan Request Board</h1>
               <p className="mt-2 max-w-[560px] text-md-b1 text-md-neutral-1200">
                  Peso-denominated microloans, settled in USDC on Arc. Borrowers owe pesos; lenders fund and are repaid in USDC.
               </p>
               <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-md-pill border border-md-green-600 bg-[rgba(0,134,36,0.05)] px-2.5 py-1 text-md-b4 font-semibold text-md-green-600">
                     <span className="h-1.5 w-1.5 rounded-full bg-md-green-600" /> Live on Arc mainnet
                  </span>
                  <a href={explorerAddress(PESO_LOAN_ADDRESS)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md-pill border border-md-neutral-500 bg-white px-2.5 py-1 text-md-b4 font-semibold text-md-neutral-1400 hover:border-md-primary-1200 hover:text-md-primary-1200">
                     Contract {short(PESO_LOAN_ADDRESS)} ↗
                  </a>
                  <span className="inline-flex items-center rounded-md-pill border border-md-green-600 bg-[rgba(0,134,36,0.05)] px-2.5 py-1 text-md-b4 font-semibold text-md-green-600">PHPC settlement · preview (mock)</span>
               </div>
            </section>

            {/* How it works */}
            <section className="mb-8 grid gap-3 sm:grid-cols-3">
               <StepCard n="1" title="Borrower posts in PHP" body="A loan request is denominated in pesos — the currency the borrower actually earns." />
               <StepCard n="2" title="Lender funds in USDC" body="Funds settle in USDC on Arc. (StableFX → PHPC to pesos is the production step; simulated here.)" />
               <StepCard n="3" title="Repay in PHP → USDC" body="The peso obligation is fixed; on repayment the lender receives USDC back." />
            </section>

            {phpc && (
               <div className="mb-6 flex items-start gap-2 rounded-md-lg border border-md-green-600/40 bg-[rgba(0,134,36,0.05)] p-md-2 text-md-b3 text-md-green-800">
                  <span className="flex-none rounded-md-pill bg-md-green-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">PHPC · simulated</span>
                  <span className="flex-1">{phpc}</span>
                  <button onClick={() => setPhpc(null)} className="text-md-green-800" aria-label="Dismiss">✕</button>
               </div>
            )}

            <div className="grid gap-6 md:grid-cols-2">
               {/* Left: live board */}
               <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                     <h2 className="text-md-h5 font-semibold text-md-heading">Requests <span className="text-md-b3 font-normal text-md-neutral-1000">· live from Arc</span></h2>
                     <button onClick={refreshBoard} className="text-md-b3 font-semibold text-md-primary-1200 hover:underline">Refresh</button>
                  </div>
                  {loadingBoard ? (
                     <div className="flex items-center gap-2 rounded-[24px] border border-[#f0f0f0] bg-white p-md-4 text-md-b2 text-md-neutral-1200 shadow-[0px_11px_24px_0px_rgba(0,0,0,0.02)]"><Spinner /> Loading loans…</div>
                  ) : board.length === 0 ? (
                     <div className="flex flex-col items-center gap-2 rounded-[24px] border border-[#f0f0f0] bg-white p-md-5 text-center shadow-[0px_11px_24px_0px_rgba(0,0,0,0.02)]">
                        <img src="/brand/moodeng-logo.png" alt="" className="h-14 w-14 object-contain opacity-90" />
                        <p className="text-md-b1 font-semibold text-md-heading">No requests yet</p>
                        <p className="text-md-b3 text-md-neutral-1200">Fund the first peso loan on the right — it’ll appear here, live from the contract.</p>
                     </div>
                  ) : (
                     board.map(({ id, loan }) => <LoanCard key={id} id={id} loan={loan} />)
                  )}
               </div>

               {/* Right: actions */}
               <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-md-2 rounded-[24px] border border-[#f0f0f0] bg-white p-md-4 shadow-[0px_11px_24px_0px_rgba(0,0,0,0.02)]">
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
                     <button onClick={createLoan} disabled={busy} className="mt-md-1 flex w-full items-center justify-center gap-2 rounded-md-lg bg-md-primary-1200 py-md-3 text-md-b1 font-semibold text-white transition-all duration-150 hover:brightness-110 active:scale-[0.98] disabled:opacity-50">
                        {busy ? <><Spinner /> Processing…</> : <>Send Your Help <SendIcon /></>}
                     </button>
                  </div>

                  <div className="flex flex-col gap-md-2 rounded-[24px] border border-[#f0f0f0] bg-white p-md-4 shadow-[0px_11px_24px_0px_rgba(0,0,0,0.02)]">
                     <p className="text-md-h5 font-semibold text-md-heading">Repay (borrower)</p>
                     <div className="flex gap-md-2">
                        <Field label="Loan ID" value={repayId} onChange={setRepayId} />
                        <Field label="Amount (USDC)" value={repayAmount} onChange={setRepayAmount} />
                     </div>
                     <button onClick={repay} disabled={busy} className="mt-md-1 w-full rounded-md-lg border border-md-primary-1200 py-md-3 text-md-b1 font-semibold text-md-primary-1200 transition hover:bg-md-primary-100 disabled:opacity-50">
                        {busy ? 'Processing…' : 'Repay'}
                     </button>
                  </div>
               </div>
            </div>

            {status && (
               <p className="mt-6 rounded-md-lg bg-md-primary-100 p-md-2 text-md-b3 text-md-primary-1200 break-words">
                  {status.includes('Tx: http') ? <a className="underline" href={status.replace(/^.*Tx: /, '')} target="_blank" rel="noreferrer">{status}</a> : status}
               </p>
            )}

            <footer className="mt-12 border-t border-md-neutral-400 pt-6 text-md-b3 text-md-neutral-1200">
               <div className="mb-2 flex items-center gap-2">
                  <img src="/brand/moodeng-logo.png" alt="" className="h-6 w-6 object-contain" />
                  <span className="font-semibold text-md-heading">Moodeng Credit</span>
               </div>
               <p className="mb-1">
                  <a className="font-semibold text-md-primary-1200 hover:underline" href={explorerAddress(PESO_LOAN_ADDRESS)} target="_blank" rel="noreferrer">Contract</a>{' '}{short(PESO_LOAN_ADDRESS)} · USDC {short(ARC_USDC_ADDRESS)} · Arc chain {arc.id} ·{' '}
                  <a className="font-semibold text-md-primary-1200 hover:underline" href="https://github.com/Moodeng-Credit/arc-peso-loan" target="_blank" rel="noreferrer">GitHub</a>
               </p>
               <p className="text-md-b4 text-md-neutral-1000">
                  On-chain settlement is real USDC. The PHPC / Coins.ph peso leg is <strong>simulated (preview)</strong> — PHPC is not yet live on Arc.
               </p>
            </footer>
         </main>
      </div>
   );
}

function LoanCard({ id, loan }: { id: number; loan: LoanView }) {
   const repaid = loan.status === 1;
   return (
      <div className="relative flex flex-col gap-4 rounded-[24px] border border-[#f0f0f0] bg-white p-md-4 shadow-[0px_11px_24px_0px_rgba(0,0,0,0.02)]">
         <div className="flex items-center gap-4">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
               <p className="text-md-h5 font-semibold text-md-heading">Peso microloan #{id}</p>
               <div className="flex flex-wrap items-center gap-2">
                  <p className="text-md-b3 text-md-neutral-700"><span>by </span><span className="text-[#d0588b]">{short(loan.borrower)}</span></p>
                  <span className="inline-flex items-center justify-center rounded-[30px] border border-md-green-600 bg-[rgba(0,134,36,0.05)] px-md-1 py-md-0"><span className="text-md-b4 font-semibold text-md-green-600">Good Standing</span></span>
               </div>
               <img src="/icons/base-account.svg" alt="Base" className="h-6 w-6 rounded-[3.4px]" />
               <div className="flex items-center gap-1 text-md-b2 font-semibold">
                  <span className="text-[#585858]">Due On</span>
                  <span className="text-md-red-600">{dueLabel(loan.dueDate)}</span>
               </div>
               <div className="text-md-b3 text-md-neutral-1200">Obligation ₱{fmtPhp(loan.totalOwedPHP)} (principal ₱{fmtPhp(loan.principalPHP)})</div>
            </div>
            <div className="flex w-[134px] shrink-0 flex-col justify-center gap-5 self-stretch rounded-[12px] border border-[#f0f0f0] bg-white p-3">
               <div className="flex flex-col gap-1">
                  <p className="text-md-b3 font-medium text-[#585858]">Borrowing USDC</p>
                  <p className="text-[20px] font-semibold leading-[1.2] tracking-[-0.04em] text-md-heading">${fmtUsd(loan.principalUSDC)}</p>
               </div>
               <div className="flex flex-col gap-1">
                  <p className="text-md-b3 font-medium text-[#585858]">Get back USDC</p>
                  <p className="text-[20px] font-semibold leading-[1.2] tracking-[-0.04em] text-md-green-600">${fmtUsd(loan.totalOwedUSDC)}</p>
               </div>
            </div>
         </div>
         <div className={`rounded-md-lg py-md-3 text-center text-md-b1 font-semibold ${repaid ? 'bg-md-neutral-300 text-md-neutral-1200' : 'bg-[rgba(0,134,36,0.08)] text-md-green-800'}`}>
            {repaid ? 'Repaid — help received' : `${LOAN_STATUS[loan.status]} · ${fmtUsd(loan.amountRepaidUSDC)} / ${fmtUsd(loan.totalOwedUSDC)} USDC repaid`}
         </div>
      </div>
   );
}

function StepCard({ n, title, body }: { n: string; title: string; body: string }) {
   return (
      <div className="flex flex-col gap-1.5 rounded-md-lg border border-md-neutral-400 bg-white p-md-3">
         <span className="flex h-6 w-6 items-center justify-center rounded-md-pill bg-md-primary-100 text-md-b3 font-bold text-md-primary-1200">{n}</span>
         <p className="text-md-b1 font-semibold text-md-heading">{title}</p>
         <p className="text-md-b3 text-md-neutral-1200">{body}</p>
      </div>
   );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
   return (
      <label className="flex flex-1 flex-col gap-1 text-md-b3 font-medium text-[#585858]">
         {label}
         <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="rounded-md-input border border-md-neutral-500 px-3 py-2 text-md-b2 text-md-heading focus:border-md-primary-1200 focus:outline-none" />
      </label>
   );
}
