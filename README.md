<h1 align="center">〇〇 MaruMaru</h1>
<p align="center"><b>Prove you qualify. Reveal nothing else.</b></p>
<p align="center">A borrower-owned financial passport — prove your money facts (income ≥ X, savings ≥ Y, debt-service ratio within limit, income band, one real human) to any verifier — a home loan, a visa's proof of funds, a lease, a financing application, a business deal — without sending a single document.</p>
<p align="center"><i>ETHGlobal Tokyo 2026 · World "Best Use of IDKit" + ENS "Best Use of ENSv2"</i></p>

---

## The problem (verified global)

**A credit bureau records what you OWE — never what you EARN or HAVE. No bureau on earth does.** So even where a lender can pull your credit with a national ID (the US via SSN), it *still* asks for payslips and bank statements — the lookup covers your debts, not your income or assets. That income-and-assets hand-over is universal, and it happens far beyond mortgages: a **visa's proof of funds**, a **lease**, a **financing application**, a **business deal**. Every one demands the same shoebox.

And the hand-over is a privacy disaster. A marketing company pays a few cents for your phone number; yet to get a simple **yes/no**, you give away your entire financial life — payslips, bank statements, tax records, national ID — for free. They keep it forever, even if they reject you. You do it again at every party you approach. In broker-heavy markets like **Malaysia**, you literally **WhatsApp and email** it to a "mortgage consultant" who forwards one bundle to several banks at once. The "more secure" countries only change the pipe, not the trade: the US uploads into a portal, Singapore pulls it from the government (MyInfo), the UK and India stream it over open-banking APIs. Whichever pipe, **you don't hold it, can't carry it to the next party, and don't know who has it, where, or for how long**. Late 2023 into 2024, two US mortgage lenders — **Mr. Cooper and LoanDepot — disclosed breaches of ~31 million people** (names, Social Security numbers, bank-account numbers): exactly this data.

The whole world is trying to fix this (UK Open Banking: 15M+ users; India Account Aggregator: 154M+ consents delivered). Those are all *institution-controlled data pipes* — the bank holds your data, not you. **MaruMaru is the self-sovereign, privacy-preserving inversion: the borrower holds the credential and proves facts to any verifier.**

## The name

**MaruMaru (まるまる / 〇〇).** 〇 (*maru*) is Japan's "pass / correct" mark. Doubled, 〇〇 also means "redacted / blank." So まるまる is **"pass, pass" AND "redacted, redacted"** at once — the product in one word: the lender sees a row of passes; your data stays blanked.

## How it works

```
  Your bank account   (the figure lives behind your own login)
        │
  zkTLS web proof  ──►  reads a pass/fail from behind YOUR bank login — no aggregator,
        │                no bank partnership, the proof is yours (the self-sovereign inversion)
        ▼
  predicate:  V ≥ threshold ?  →  〇 / ✕   (only the mark, never the number)
        ▼
  World ID  (Orb / Passport / Selfie)  ──►  binds the passport to a live human (anonymous,
        │                        server-verified). Tier is FLAGGED; Orb enforced at underwriting.
        ▼
  ENSv2 subname  aiko.marumaru.eth   (Sepolia)
        └──►  soulbound · per-record expiry · per-key EAC write-scope · revocable
              per-lender consent = the portable passport you control
```

**The bank connection is a zkTLS web proof — the self-sovereign inversion.** Today's bank-data pipes
(open banking / Plaid) are *institution-controlled* — the aggregator holds the connection, not you.
MaruMaru inverts that: a zkTLS proof reads a pass/fail from behind your own login, and *you* hold the
credential. (We've also wired an **open-banking adapter** (`app/plaid.mjs`, drop-in behind the same
verifier seam) as a documented roadmap fallback for banks with no zkTLS provider — but the demo leads
with the self-sovereign proof, since that's the point.)

**Each step shows its own proof, in the flow.** The UI drops a **verification receipt** after every step
— the real World ID nullifier + a live one-passport-per-human rejection; the real Ed25519 signature +
a live tamper→reject; the real ENS namehash — so a judge *watches* the tech work, it isn't hidden.

**One privacy idea, three times:** World ID proves *a real human* without revealing *who* (Orb also proves *unique*); the zkTLS proof shows *the money is real* without revealing *how much*; ENS grants *this lender* access to *only* the facts it needs.

## The two design choices behind the idea (the theory)

**1. We measure, the bank decides — the income threshold is a public "sanity line," not a lending decision.** `policyIncomeMin` is a coarse, *public* line — set to a cited local benchmark (a country's minimum wage / a regulator's affordability floor) — meaning only *"is this person earning enough to bother?"* MaruMaru proves a **fact** against that public line; each bank then applies *its own* cutoff (like a thermometer reporting a temperature — the doctor decides what to do). The real signal isn't the floor — it's **`maru.income_band`** (income as a multiple of the line, e.g. `1-1.5x`), a coarse range a bank maps to *its own* rate/LTV tier **without ever seeing the exact salary**. So the floor value is deliberately not load-bearing: it's public, swappable, and the bank always decides.

**2. World ID isn't decoration — it's the beam our same-person-across-lenders check stands on, with assurance tiered to the stakes.** We accept **Orb / Passport / Selfie Check** and **flag the tier** (`maru.assurance`) so a lender prices it; for **shopping** any live-human tier is minimum-sufficient, and we **enforce Orb at underwriting** (the only tier that guarantees uniqueness). We bind proofs to *one human*: the same `sessionId` goes into **both** the World ID `signal` (via the signal-binding *legacy* presets — pure-v4 leaves `signal_hash=0x0`, so binding is deliberate) **and** the Reclaim proof context, so the verified human is provably the one who held that live bank session — a borrowed proof can't bind. Because a person's nullifier is stable across wallets, a **shared on-chain signal reveals when the same person is quietly borrowing from several lenders at once** (the pattern lending calls "loan stacking" — invisible today because lenders can't cross-check, un-hideable here even with a fresh wallet). At Orb that signal is authoritative; at the Selfie tier (Beta) we show it as *indicative only* and never claim uniqueness. It's keyed on a one-way `humanKey = keccak256(nullifier)`, never the raw nullifier (booth guidance: "treat it like a secret key") — the raw value is used only to verify, then dropped. Remove World ID and this breaks entirely; that's why it's load-bearing.

## Run the demo (no chain, no external deps)

```bash
node demo/deploy_demo.mjs     # seed a demo passport
node demo/server.mjs          # http://localhost:8788
```

Borrower tab → a 3-step wizard, each step dropping a live **verification receipt**: (1) verify human with World ID (pick a tier — Orb / Passport / Selfie) → receipt shows the real nullifier-derived `sub` + a "try again as the same human" button that fires the live one-passport-per-human rejection; (2) connect your bank with a **zkTLS web proof** — "read the balance now" shows the real HTTP 401 behind the auth wall, then sign in on the real same-origin `/bank` page (you never type a figure) → receipt shows the real Ed25519 signature + value→mark + a "tamper" button that fails `crypto.verify` live; (3) mint 〇〇 → the passport appears as a data-page + a receipt with the real ENS namehash. The evidence is in the flow, not hidden in drawers.
Lender tab → check without consent (denied) → borrower grants scoped access → lender reads the marks → revoke; grant a 2nd lender to see the same-person-across-lenders signal fire.
The four "alternative paths" are live in a drawer: duplicate-human → rejected, no-Proof-of-Human → ineligible, borrowed proof → binding-failed, Selfie-tier at the underwriting bar → insufficient-assurance (the tier gating app behavior).

## Test

```bash
node --test app/*.test.mjs     # 83 backend unit tests (World/Reclaim/Plaid/issuer/gateway/binding/attestation/handlers, incl. tiered assurance)
forge test -vv                 # contract tests (on a machine with Foundry)
```

## Repo map

| Path | What |
|---|---|
| `contracts/src/MaruMaruRegistrar.sol` | The core: soulbound passports, scoped marks, expiry, revocable lender consent, one-per-human |
| `contracts/src/interfaces/` | Injected ENSv2 surface + shared types |
| `contracts/test/` | unit + fuzz + invariant + faithful `MockENSv2` |
| `app/worldid.mjs` | IDKit v4 server verify + our own nullifier dedupe |
| `app/reclaim.mjs` | zkTLS verify + predicate (the self-sovereign bank rail) |
| `app/plaid.mjs` | Plaid open-banking adapter (roadmap fallback; drop-in behind the same `{ok,value,context}` seam — not on the demo path) |
| `app/issuer.mjs` | orchestration + the alternative paths |
| `app/ens-gateway.mjs` | public marks + consent-gated detail |
| `demo/` | local 3-view SPA (borrower / lender / passport) |
| `scripts/` | ENSv2 Sepolia provision + deploy |


## Honest limits (we concede these on stage)

Personhood ≠ account ownership · zkTLS is economically-secured, not "trustless" · point-in-time proof (→ why the credential expires) · **not regulatory KYC/AML — MaruMaru is the pre-qualification + shopping layer; the one regulated document exchange still happens at final underwriting** · per-site zkTLS providers needed · relies on a live, legitimately-authenticated bank session — a hijacked login is the bank's threat model, not ours (our binding stops a borrowed/replayed proof, not a compromised session).
