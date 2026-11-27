# FIX REPORT — Pump.fun Bot Sprint: "Dip Hunter"

- **Entry:** `u-riidzhsn-pump-fun-bot-sprint-make-bot-and-win-cb203fed` — "Pump.fun Bot Sprint: Make Bot And Win" ($2 total, 1st $1, 2nd $1; entries close 2026-11-28T08:00:00Z = 28 Nov 15:00 WIB).
- **Repo:** `pump-bot-sprint/`, fixing on top of tester commit `75b74da`.
- **Fixer session:** 27 Nov 2026, ~10:40–10:50 WIB.
- **Execution-risk note:** no exec result in this session was flagged; work proceeded under the user's explicit approval of 27 Nov 09:01 WIB to process all five queued repos fully automatically, including when an execution-risk hold appears.

## Verdict: SIAP SUBMIT

Semua temuan tester diperbaiki atau diverifikasi. Skor dev setelah perbaikan **identik** dengan builder dan tester sampai digit terakhir. Check kit mengonfirmasi `license_osi` PASS. Satu-satunya check yang masih fail (`transcripts_present`) adalah karena check dijalankan tanpa bundle transkrip — itu langkah parent (bundle + submit), bukan cacat repo.

## Yang diubah

### SEDANG-1 — LICENSE tanpa baris SPDX (WAJIB, diperbaiki)
- `LICENSE`: baris pertama kini `SPDX-License-Identifier: MIT` (teks MIT selebihnya tidak disentuh).
- Verifikasi oleh check kit sendiri: `pass license_osi — LICENSE declares SPDX-License-Identifier: MIT, OSI-approved`.

### SEDANG-2 — Risiko guardrail jendela final 6 jam (TIDAK diubah, sesuai tugas)
- Risiko desain yang sudah diungkap builder/tester (perkiraan ~30 trip vs floor 20 coin, Poisson P(<20) ≈ 3–4%). Tidak ada konfigurasi yang jelas lebih baik; strategi dan parameter tidak disentuh.

### KECIL-1 — `result_sha256` di BUILD_REPORT (diperbarui + dijelaskan)
- `BUILD_REPORT.md` line 31: `66ce3c21…` → `57819cd8a768c107153ca0d2e4b25968ee90a2c9c558d8fcd201c25804747aa3` (nilai reproduksi tester, stabil di 2 run), lalu setelah re-grade pasca-perbaikan diperbarui lagi ke `f95793dfcade8b7277ee704d7e985b55e54891a183a6c04daa59badff852c649` dengan catatan baru: `result_sha256` adalah hash snapshot worktree — ia berubah dengan edit file apa pun (LICENSE/README/BUILD_REPORT), jadi wajar berbeda dari run sebelumnya dan dari server. Identitas stabil bot adalah `action_log_sha256 e61626c1…` dan skornya, bukan hash ini.

### Tugas tahap submit (ditambahkan)
- `README.md`: 3 badge live make.fun di bagian atas (bounty, rank, reward) + baris `<sub>Entered on make.fun…</sub>`, persis pola repo Replay/Sharpe.
- `.makefun/owner.json` baru: `{"wallet": "5XrS76uzjrhf9pyMBVQpfL1SpyxX7Dk8vyFUncED2o39"}`.

## Verifikasi — grade-local pasca-perbaikan (1 run, `--driver process --worktree`)

Log lengkap: `~/workspace/makefun/grade-bot-sprint-fix.txt`. (Catatan: pemanggilan pertama saya sempat gagal exit 2 karena memakai opsi `--repo` yang tidak dikenal grade-local; pemanggilan benar adalah `--kit <dir> --bot <path>`. Bukan cacat repo.)

| | Builder | Tester (2 run) | Setelah perbaikan |
|---|---|---|---|
| Net PnL | −0,298154419 SOL | −0,298154419 SOL | **−0,298154419 SOL** |
| Return / interval 90% | −2,98% / −1,00 … +0,41 | sama | sama |
| Fills / coins / round trips | 236 / 118 / 118 | sama | sama |
| Win rate / max drawdown | 24,6% / 0,0472 | sama | sama |
| Rejected / failed | 0 / 5 | sama | sama |
| Fee curve + tx / 2× fees | 0,461 + 0,025 SOL / −0,776 | sama | sama |
| Guardrail | terpenuhi | terpenuhi | **terpenuhi** (118 ≥ 20, DD ≤ 0,50) |
| action_log_sha256 | e61626c1… | e61626c1… | **e61626c1…** |
| L1 regrade | byte-identical | byte-identical | **reproduced byte for byte** |

Perbaikan tidak mengubah perilaku bot sama sekali: skor, action log, dan semua angka identik; satu-satunya yang berubah adalah `result_sha256` (hash snapshot worktree, dijelaskan di atas).

## Check kit pasca-perbaikan (tanpa bundle transkrip)

`makefun check --kit . --repo ~/workspace/makefun/pump-bot-sprint` (tanpa `--transcripts`, jadi gate transkrip tidak jalan — itu langkah parent):

- `pass snapshot` — 7 file, 67.892 bytes, dalam batas intake.
- `pass license_osi` — SPDX MIT, OSI-approved. ← SEDANG-1 terverifikasi tertutup.
- `pass entrypoint` — main.ts di root, node22 diterima.
- `fail transcripts_present` — **diharapkan**: tidak ada bundle transkrip yang diberikan; parent menjalankan check ulang dengan `--transcripts <bundle>` sebelum submit.
- 5 item "at submission" (repo_public, repo_owner, repo_created_after_open, commit_in_repo, duplicate_snapshot) — urusan parent saat push + submit.

## Tidak diubah

- `main.ts`, `strategy.ts`, `vendor/makefun-bot.ts`: tidak disentuh. Strategi, parameter, dan shim SDK identik dengan yang diuji tester.
- Tidak ada push, tidak ada submit, tidak ada repo GitHub yang dibuat — sesuai tugas, itu urusan agen top-level.

## Satu kalimat jujur

Ya — entry ini sekarang siap submit: cacat yang memblokir (SPDX LICENSE) sudah diperbaiki dan diverifikasi lolos check kit, skor dev tidak berubah sama sekali (−0,298 SOL), dan peluang hadiah tetap sekitar satu dari lima seperti penilaian builder/tester, bergantung pada jendela final yang lebih bersahabat.
