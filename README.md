# Reps 💪

A pocket coach for full-body training at home with a **16 kg kettlebell,
resistance bands and bodyweight**: what to do today, how to do it, timers while
you do it, and a log that makes next time a little harder. Plus a simple body
log for the fat-loss side.

**https://alcariss.github.io/reps/**. Sign-in with Google or GitHub, only for
e-mails on the allowlist.

## What it does

- **Today.** Suggests the next workout (A and B alternate, 3×/week on
  non-consecutive days), shows days since the last one, the plan with the
  current variation and sets, this week's sessions and the 7-day average weight.
  A banner says when a deload week is due.
- **Workout player.** A 5-minute warm-up checklist, then one exercise at a
  time: animated demo, form cues, target (variation, sets × rep range, tempo,
  RIR, band level), big +/− steppers prefilled from last time, a 0–4 RIR
  picker and a band picker. Logging a set starts the **rest timer** (2 min for
  squats/hinges, 90 s for push/pull, 60 s for accessories; +15 s / skip; beep
  and vibration at the end). The plank has a **hold timer**, the KB swing an
  **EMOM timer** that logs each round itself, and ♩ toggles a **tempo
  metronome**. The screen stays on during a workout. "Too hard / too easy"
  moves one band level or variation. The finish screen shows which exercises
  earned a progression.
- **Progress.** Per exercise: current step on the ladder and band, trend of
  total reps per session (inline SVG), best and total of the last session, next
  prescription, progressing/stalled flags, and easier/harder overrides.
- **Body.** Weight (daily), waist (weekly), steps, protein. 7-day rolling
  average, weekly rate of change in %, protein target from your weight, a
  56-day chart, and a flag when loss stalls or runs too fast.
- **Offline.** Every logged set and body entry is written to the phone first
  and synced in the background (on `online`, on finish, on the next start).
  The workout in progress survives a reload or a killed app. Demo images are
  precached.

## Method

Full body, 3×/week, A/B alternating. 3 working sets per exercise to start,
1–3 reps in reserve (RIR), 2–3 s lowering.

| A | B |
|---|---|
| Goblet squat 3×8–15 | Split squat 3×8–12/leg |
| Band push-up 3×6–15 | KB Romanian deadlift 3×8–15 |
| Two-arm bent-over band row 3×10–20 | One-arm KB press 3×6–12/side |
| KB Romanian deadlift 3×8–15 | Bent-over band row 3×10–20 |
| Band pull-apart / face pull 2×15–25 | Band push-up 3×6–15 |
| Dead bug 2×6–10/side | KB swing EMOM 6–10 min × 10–15 |
| Scapular push-up 2×8–15 | Plank 2×20–45 s |

The scapular push-up ("lopatkový klik") is in the warm-up and as an accessory;
the band push-up does the main chest work.

**Progression ladders** (`src/program.ts`):

- Squat: goblet → goblet 3 s down + 2 s pause → goblet 1½ reps.
  Split squat: KB split squat → Bulgarian → Bulgarian with KB → Bulgarian 1½ reps.
- Hinge: KB RDL → KB RDL 4 s lowering → supported single-leg RDL → single-leg
  RDL → single-leg RDL + band.
- Push: incline → push-up → band push-up (band levels) → deficit →
  feet-elevated → archer.
- Press: half-kneeling → standing → pause/tempo press.
- Row: band levels → shorter grip → two bands → 2 s squeeze → one-arm 16 kg KB row.

**Engine** (`src/engine.ts`, derived by replaying the log; no extra state):

- **Double progression.** Inside the rep range, beat last time by a rep.
- **Progress** when every working set reaches the top of the range at ≤2 RIR:
  +1 set while that muscle stays ≤15 sets/week, otherwise the next band level,
  otherwise the next variation (back to the bottom of the range). At ≥3 RIR
  ("too easy") the extra set is skipped and the load goes up directly.
- **Stall** when total reps drop two sessions in a row, or a set fails (0 RIR)
  below the range: repeat once, then −1 set or one step back.
- **Deload** every 6 weeks, or earlier when two exercises stall: one week at
  half the sets and 3–4 RIR. Stall counters restart after it.
- Never to failure on RDLs and swings; the last set of push-ups, rows and band
  work may go to 0 RIR.

**Fat loss** (tips in the Body tab): a 300–500 kcal/day deficit for
0.5–1 %/week, protein 1.6–2.2 g/kg, steps baseline +2 000 toward 8–10 k, weigh
daily in the morning and judge the 7-day average, waist weekly at the navel.
Less than 0.25 %/week for 3 weeks is flagged.

Sources:

- Schoenfeld et al. 2017, dose-response of weekly sets and hypertrophy — [PubMed 27433992](https://pubmed.ncbi.nlm.nih.gov/27433992/)
- Schoenfeld et al. 2017, low- vs high-load training — [PubMed 28834797](https://pubmed.ncbi.nlm.nih.gov/28834797/)
- Schoenfeld et al. 2019, training frequency — [PubMed 30558493](https://pubmed.ncbi.nlm.nih.gov/30558493/)
- Refalo et al. 2023, proximity to failure — [PubMed 36334240](https://pubmed.ncbi.nlm.nih.gov/36334240/)
- Schoenfeld et al. 2016, longer rest intervals — [PubMed 26605807](https://pubmed.ncbi.nlm.nih.gov/26605807/)
- Morton et al. 2018, protein and resistance training — [PubMed 28698222](https://pubmed.ncbi.nlm.nih.gov/28698222/)
- Helms et al. 2014, contest prep: deficit and rate of loss — [PubMed 24864135](https://pubmed.ncbi.nlm.nih.gov/24864135/)
- Lopes et al. 2019, elastic bands vs conventional resistance — [PubMed 30815258](https://pubmed.ncbi.nlm.nih.gov/30815258/)
- ACSM 2009, progression models in resistance training — [PubMed 19204579](https://pubmed.ncbi.nlm.nih.gov/19204579/)
- Huberman Lab × Dr. Andy Galpin, [optimal protocols to build strength and grow muscles](https://www.hubermanlab.com/episode/dr-andy-galpin-optimal-protocols-to-build-strength-and-grow-muscles)
- Renaissance Periodization, volume landmarks (MEV/MAV/MRV); Stronger by Science articles on volume, RIR and progression.

Exercise images: [free-exercise-db](https://github.com/yuhonas/free-exercise-db)
(public domain, Unlicense), downloaded to `public/exercises/` by `npm run demos`.

## Development

Built on [pwa-kit](https://github.com/Alcariss/pwa-kit). Data lives in the
Grist document "Reps" (tables `Sets` and `Body`) behind the pwa-kit worker,
app `reps` in its `apps.ts`.

```bash
cp .env.example .env
npm install          # Node 24 / npm 11
npm run dev          # http://localhost:5173
npm test
npm run icons        # after changing public/logo.svg
npm run demos        # re-download exercise images (keeps existing files)
```

Without Grist or sign-in, run the in-memory stub API (`--seed` adds two weeks
of sample data):

```bash
node scripts/stub-api.mjs --seed
VITE_API_URL_PRIMARY=http://localhost:8787/reps VITE_AUTH_PROVIDERS= npm run dev
```

### One-time setup

1. **Grist:** document "Reps" with two tables. Dates and text are **Text**
   columns; the rest **Numeric**. Both need `owner`, `created_at`,
   `updated_at` (Text) for the worker.
   - `Sets`: `date`, `workout` (A/B), `exercise`, `variant`, `set_number`,
     `reps`, `seconds`, `rir`, `band`, `note`
   - `Body`: `date`, `weight`, `waist`, `steps`, `protein`, `note`
2. **Worker:** the `reps` entry in `pwa-kit/worker/src/apps.ts` with the
   document id, then in `pwa-kit/worker`:
   `npx wrangler secret put ALLOWED_EMAILS_REPS` and `npx wrangler deploy`.
3. **This repo:** *Settings → Pages → Source: GitHub Actions* and the
   repository secret `VITE_API_URL_PRIMARY` = `https://<worker>/reps`.

Every push to `main` deploys GitHub Pages through pwa-kit's shared workflow.
Band colours, sounds and deload dates are kept per device in `localStorage`.
