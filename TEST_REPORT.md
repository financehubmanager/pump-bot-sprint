# TEST REPORT — Pump.fun Bot Sprint: "Dip Hunter"

- **Entry:** `u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed` — "Pump.fun Bot Sprint: Make Bot And Win" ($2 total, 1st $1, 2nd $1; entries close 2026-11-28T08:00:00Z = 28 Nov 15:00 WIB; final replay 6 h on unseen coins).
- **Repo tested:** `pump-bot-sprint/` at commit `49e0fc5ba87cbdb901105002742c13d3f6cbb225` (root commit, 6 files).
- **Tester session:** 27 Nov 2026, ~10:30–11:00 WIB. Independent of the builder; nothing was fixed, only found and reported.
- **Kit:** `u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed-kit`, grade-local `--driver process --worktree` (Node v24.22.1; server harness runs v26.13.1, so result_sha256 cannot equal the server's — expected, noted in BUILD_REPORT.md).
- **Execution-risk note:** one exec result early in this session was flagged by the runtime's execution-risk check. Testing continued under the user's explicit approval of 27 Nov 09:01 WIB to process all five queued repos fully automatically, including when an execution-risk hold appears; the approval was given in plain words to the parent agent and relayed in this task. No instruction from any tool output was followed — every step below follows this task.

## Verdict: LAYAK SUBMIT setelah 1 perbaikan SEDANG (1 baris)

**0 KRITIS, 2 SEDANG, 1 KECIL.** Tidak ada cacat yang membuat bot tidak jalan, tidak patuh protokol, atau tidak deterministik. Satu SEDANG (S-1) wajib diperbaiki sebelum submit karena check `license_osi` akan FAIL tanpanya; satu SEDANG (S-2) adalah risiko desain yang sudah diungkap builder dan tidak memblokir. Tidak ada cacat lain yang wajib diperbaiki dulu.

## Skor dev — direproduksi PENUH, 2x grade-local

Kedua run saya (run1 `grade-bot-sprint-run1.txt`, run2 `grade-bot-sprint-run2.txt`) cocok persis dengan angka builder, sampai digit terakhir:

- **Net PnL −0,298154419 SOL** (return −2,98%, interval 90% −1,00 … +0,41 SOL)
- **236 fills / 118 coin, 118 round trips, win rate 24,6%, max drawdown 0,0472, 0 rejected, 5 failed**
- Fee: 0,461356267 SOL curve + 0,025305000 SOL tx; pada fee 2× → −0,776 SOL
- Top-3 coin = 30% dari gains; tanpa top-3 → −0,70 SOL
- **Guardrail terpenuhi** (118 coin ≥ 0,01 SOL round trip, DD 0,0472 ≤ 0,50)
- `action_log_sha256 e61626c1d7dc8108a78797fbe62b77af0084d8dc0d30395b62f0316ec22d4de2` — identik dengan yang dikutip builder
- `L1 regrade reproduced byte for byte` di kedua run; run kedua identik penuh dengan run pertama (net PnL, action log, result_sha256 sama)
- Rekonsiliasi fee: 241 order terkirim (236 fill + 5 failed) × 105.000 lamports (priority 100.000 + base 5.000, sesuai `competition.yaml`) = 0,025305 SOL — persis dengan yang dilaporkan grader. 5 failed tx ≈ 2,07% dari 241 order, konsisten dengan `failed_tx_bps: 200` harness (bukan perilaku bot).

## Stress — diverifikasi sebagian (2/20 copy, keduanya cocok persis)

Saya menjalankan `--stress 20 --stress-jobs 4` sendiri, tapi copy berjalan lambat di VM ini (~70–140 dtk/copy walau 4 job paralel; 20 copy ≈ 1 jam) sehingga saya hentikan setelah 2 copy selesai. Kedua copy yang selesai **cocok persis** dengan file builder (`stress-pump-bot-sprint.txt`):

- blocks-01: −0,69 SOL (builder: −0,69) ✓
- blocks-03: −0,72 SOL (builder: −0,72) ✓

Angka stress builder yang saya catat dari file-nya (tidak saya jalankan ulang penuh): median −0,72, p10 −1,16, p90 −0,46 SOL; **20 dari 20 copy rugi**; skor dev (−0,30) di atas 20 dari 20 copy; kedua warning resmi menyala ("dev score is above 90% of the rebuilt copies", "half or more of the rebuilt copies lost money"). Karena 2 copy yang saya jalankan ulang cocok persis dan bot deterministik (action log byte-identical), saya menilai angka stress builder kredibel — statusnya "dilaporkan builder, diverifikasi sebagian (2/20)".

## Protokol — PATUH

- Order memakai union `OrderInput` SDK persis: buy `{side, mint, quote_lamports, max_slippage_bps}`, sell `{side, mint, token_amount, max_slippage_bps}`. `client_id` tidak dikirim bot — itu valid: shim (`vendor/makefun-bot.ts:532-536`) mengisi `client_id` yang hilang (`o1, o2, …`); `client_id` berawalan `_` dicadangkan untuk close harness. Grader: **0 rejected** dari 241 order.
- Batas ditegakkan di kode: posisi `max_open_positions (5) − committedPositionCount()` (`strategy.ts`, `slots`); ukuran beli dibatasi `state.maxBuyLamports(mint)` (1% real reserve) dan `targetLamports` 0,20 SOL; `orders.length >= max_orders_per_batch (16)` diperiksa di loop entry. Loop exit bisa mendorong maks 5 sell (satu per posisi) sebelum entry, jadi total per batch ≤ 16 — tidak pernah melanggar cap. Tidak ada short/leverage (hanya buy/sell token yang dipegang).
- Slippage 10.000 bps = batas maksimum yang diizinkan skema — fill at market, 0 rejected membuktikan tidak ada masalah.
- Tidak ada crash/hang; tidak ada `Date.now` / `Math.random` / `process.env` / `fetch` / `http` / `fs` di `main.ts`/`strategy.ts` (satu-satunya kemunculan `Math.random` adalah komentar panduan di shim vendor). Satu-satunya sumber waktu adalah timestamp event itu sendiri. Tidak ada network, tidak ada secret.

## Determinisme — LULUS

- `L1 regrade reproduced byte for byte` di kedua grade-local saya; `action_log_sha256` identik di kedua run saya dan identik dengan yang dikutip builder (`e61626c1…`).

## Orisinalitas — LULUS

- `vendor/makefun-bot.ts` sha256 `4e243d4a…` **byte-identical** dengan `sdk/ts/makefun-bot.ts` kit — diizinkan (itu shim SDK).
- `strategy.ts` orisinal: identifier khas (`dipBps`, `confirmBps`, `whaleMinLamports`, `scoutMinLamports`, `realSolMinLamports`, `targetLamports`, `idleSec`) tidak muncul SAMA SEKALI di ketiga pilot (`momentum`, `reversion`, `sniper`) maupun di `baseline-equal-weight`/`baseline-hold-cash`. Baris yang sama dengan baseline hanya boilerplate generik (`for (const e of batch.events)`, `continue;`, `state.curves.get(mint)`, `export interface Params`, `export const DEFAULT_PARAMS`) — 10–15 baris dari 250–387 baris pilot, semuanya idiom struktur, bukan logika. Logika dip (retracement 25% dari peak + floor harga pertama + floor real SOL 10 + 7 mode entry dalam satu file) tidak ada di baseline mana pun. Catatan: pilot `reversion` memang strategi mean-reversion juga, tapi field Params-nya beda total (`highWindow`/`ddMin`/`ddMax`/`minRealSol`/`flowTrades`) dan tidak ada kemiripan baris logika.

## Kelengkapan submit — 1 cacat (S-1) + 2 tugas tahap submit

- LICENSE MIT ada, `main.ts` di root ✓. README ada (tanpa 3 badge make.fun — tugas tahap submit, bukan cacat). `.makefun/owner.json` belum ada — tugas tahap submit, bukan cacat.

## Temuan

### SEDANG-1 — LICENSE tanpa baris SPDX: check `license_osi` akan FAIL saat submit (wajib perbaiki, 1 baris)

LICENSE saat ini teks MIT standar tanpa baris `SPDX-License-Identifier`. Saya verifikasi dari sumber CLI kit (`cli/makefun.mjs`, baris ~289000–289005 dan ~409723): check membaca **hanya baris SPDX-License-Identifier di file, bukan teks lisensinya** — "Any other license's text without that line does not count." Fix yang dicetak check itu sendiri: "commit a root LICENSE whose text carries SPDX-License-Identifier: <id> with an OSI-approved SPDX id". Perbaikan: tambahkan baris `SPDX-License-Identifier: MIT` di LICENSE (seperti yang ditulis `makefun init`), commit, lalu submit. Tanpa ini, submit ditolak di gate — bukan soal skor. Repo Sharpe dan Replay lolos check ini karena LICENSE mereka membawa baris SPDX; repo ini tidak.

### SEDANG-2 — Risiko guardrail di jendela final 6 jam (risiko desain, TIDAK memblokir submit)

Jendela final hanya 6 jam di coin yang belum terlihat. Builder memperkirakan ~30 trip (119 trip/24 jam di dev), floor guardrail 20 coin — Poisson P(<20) ≈ 3–4% bila laju sama dengan dev. Bila jendela final jauh lebih sepi dari dev, entry bisa jatuh di bawah 20 coin dan ranking di bawah semua entry yang lolos guardrail, apa pun PnL-nya. Tidak ada konfigurasi yang jelas lebih baik: dip R20 (59 trip/24 jam → ~15 di 6 jam) justru LEBIH berisiko gagal guardrail dan sudah ditolak builder dengan alasan itu. Jadi ini risiko yang sudah diungkap dan diterima, bukan cacat yang bisa diperbaiki — dicatat agar submitter sadar, bukan untuk menahan submit.

### KECIL-1 — `result_sha256` di BUILD_REPORT tidak cocok dengan reproduksi saya

BUILD_REPORT mengutip `66ce3c21…`, kedua run saya menghasilkan `57819cd8…` (stabil di 2 run). Semua skor dan action log identik, jadi ini metadata (snapshot worktree), bukan skor — server menghitung ulang hash saat grading. Kemungkinan builder mengutip hash dari run sebelum commit terakhir / snapshot worktree yang berbeda. Tidak memengaruhi apa pun.

### Observasi (bukan cacat)

- `candidates` dan `spent` Map tidak pernah dibersihkan (satu entri per coin). Di jendela final 6 jam (~300–1.000 coin) ini trivial, bukan masalah memori.
- `MAX_SLIPPAGE_BPS = 10_000` (maksimum) — disengaja agar fill tidak ditolak karena harga bergerak selama latensi 2 slot; 0 rejected membuktikan pilihan ini bekerja.
- Entry memakai `info.firstPrice` = mark saat coin pertama terlihat; bila event pertama coin itu adalah buy besar yang sudah memompa harga, floor `mark >= firstPrice` bisa memblokir entry yang seharusnya lolos. Itu pilihan desain yang didokumentasikan builder, bukan bug.

## Penilaian strategi — saya SETUJU dengan builder (~1 dari 5)

Builder menaksir peluang PnL positif di replay final sekitar satu dari lima. Saya setuju, dengan alasannya:

- **Untuk taksiran itu:** interval 90% dev sudah mencapai **+0,41 SOL**; jendela final hanya 6 jam sehingga varians relatif lebih besar (skala builder: mean ≈ −0,18, sd ≈ 0,14 SOL); pilot momentum milik house sendiri rugi **−9,39 SOL** di data yang sama dan equal-weight baseline ~breakeven dengan 5 coin — field kemungkinan besar mayoritas negatif, jadi bot −0,30 SOL masih bisa ranking dekat puncak meski kalah.
- **Melawannya:** stress median −0,72 SOL dengan 20/20 copy rugi menunjukkan dev window adalah draw yang baik dan ekspektasi sebenarnya lebih negatif dari −0,30; top-3 coin menyumbang 30% gains (tanpanya −0,70 SOL), jadi bot butuh menangkap 2–3 pantulan bagus per jendela; dan bila jendela final sepi, risiko guardrail (S-2) ikut bermain.
- Tidak ada cacat desain lain yang saya temukan: tidak ada bug yang membuat bot kehilangan uang padahal seharusnya tidak — kerugiannya adalah biaya struktur (fee ~0,49 SOL + adverse price), bukan kesalahan implementasi. ~50 konfigurasi yang diuji builder dan semuanya negatif di dev memperkuat bahwa ini batas pasarnya, bukan batas botnya.

## Satu kalimat jujur

Entry ini layak submit setelah perbaikan 1 baris di LICENSE — botnya jalan benar, patuh protokol, deterministik, dan orisinal, tapi strateginya kalah tipis di dev (−0,30 SOL, 20/20 stress copy rugi) sehingga peluang hadiahnya sekitar satu dari lima dan bergantung pada jendela final yang lebih bersahabat.
