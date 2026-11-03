# Reps 💪

A pocket coach for full-body training at home with a **16 kg kettlebell,
resistance bands and bodyweight**: what to do today, how to do it, timers while
you do it, and a log that makes next time a little harder. Plus a simple body
log for the fat-loss side.

**https://alcariss.github.io/reps/**. Sign-in with Google or GitHub, only for
e-mails on the allowlist.

## What it does

- **Today.** One workout: the next circuit with each exercise's current
  variation and rest, days since the last session (3×/week on non-consecutive
  days works best), this week's sessions and the 7-day average weight. A banner
  says when a deload week is due.
- **Workout player.** A 3-minute warm-up with demos, then the circuit round by
  round: one exercise at a time with an animated demo, target (variation,
  rounds × rep range, rest, tempo, RIR, band level), big +/− steppers
  prefilled from last time, a 0–4 RIR picker and a band picker. Logging a
  round starts the **rest timer** with "up next" (+15 s / skip; beep and
  vibration at the end). The finisher is timed: 15 swings straight into a
  **plank hold timer**, 3 rounds. ♩ toggles a **tempo metronome**; the screen
  stays on. "Too hard / too easy" moves one band level or variation, and on
  the easiest step says how to make it lighter. The finish screen shows which
  exercises earned a progression.
- **Progress.** Per exercise: current step on the ladder and band, trend of
  total reps per session (inline SVG), best and total of the last session, next
  prescription and rest, progressing/stalled flags, and easier/harder
  overrides. Exercises from the earlier plan stay listed under "Earlier
  exercises".
- **Body.** Weight (daily), waist (weekly), steps, protein. 7-day rolling
  average, weekly rate of change in %, protein target from your weight, a
  56-day chart, and a flag when loss stalls or runs too fast.
- **Offline.** Every logged set and body entry is written to the phone first
  and synced in the background (on `online`, on finish, on the next start).
  The workout in progress survives a reload or a killed app. Demo images are
  precached.

## Method

One 20–25 minute full-body circuit, 3×/week. Equipment: a 16 kg kettlebell,
tube bands with handles and a door anchor, bodyweight. 1–3 reps in reserve
(RIR), 2–3 s lowering.

- **Warm-up**, 1 round: band pull-apart ×15 (light band), world's greatest
  stretch ×4/side, bodyweight good morning ×10 (hands behind the head).
- **Circuit**, 3 rounds, 90 → 45 s rest between exercises:
  goblet squat 8–15 · KB Romanian deadlift 8–15 · push-up 6–15 ·
  band row 10–20. Every second session the push-up becomes a **pike push-up**
  6–12 for the shoulders (no overhead pressing with the 16 kg bell).
- **Finisher**, 3 rounds without rest: KB swing ×15 + plank 30–45 s.

Volume: 3 rounds × 3 sessions = 9 hard sets per muscle group per week, close
to the ~10 sets/week where most of the hypertrophy benefit lies (Schoenfeld
2017), in sessions short enough to keep doing. Progress comes from denser
work (shorter rest) and harder variations rather than more sets.

Until November 2026 the app had two longer workouts (A and B). Their sets
(`workout` A/B) still load: squats, RDLs and push-ups count toward the history
and progression above; retired exercises (split squat, KB press, …) are only
listed.

**Progression ladders** (`src/program.ts`):

- Squat: goblet → goblet 3 s down + 2 s pause → goblet 1½ reps.
- Hinge: KB RDL → KB RDL 4 s lowering → supported single-leg RDL → single-leg
  RDL → single-leg RDL + band.
- Push: incline → push-up → band push-up (band levels) → deficit →
  feet-elevated → archer.
- Pike push-up: incline (hands on a chair) → floor → feet-elevated → 2 s pause.
- Row: door-anchored two-arm band row → single-arm door-anchored row →
  single-arm bent-over band row → 2 s squeeze → one-arm 16 kg KB row. The
  bands are elastic, so no inverted (TRX-style) rows.

**Engine** (`src/engine.ts`, derived by replaying the log; no extra state):

- **Double progression.** Inside the rep range, beat last time by a rep.
- **Progress** when every round reaches the top of the range at ≤2 RIR: the
  rest after that exercise shortens 90 → 75 → 60 → 45 s. At 45 s the load goes
  up (next band level, else the next variation, back to the bottom of the
  range) and the rest starts again at 90 s. At ≥3 RIR ("too easy") the load
  goes up straight away.
- **Stall** when total reps drop two sessions in a row at the same load, or a
  round fails (0 RIR) below the range: repeat once, then one band lighter or
  one step back.
- **Deload** every 6 weeks, or earlier when two exercises stall: one week of
  2 rounds at 90 s rest and 3–4 RIR. Stall counters restart after it.
- The finisher is logged for history only. Never to failure on RDLs and
  swings; the last round of push-ups and rows may go to 0 RIR.

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

Exercise animations: [GymVisual](https://gymvisual.com/) GIFs, licensed for
personal use and therefore **not in this repo**. They live in the pwa-kit
worker's `MEDIA` KV namespace (keys `reps/<name>.gif`), are served only to
signed-in users (`?action=media`), and are cached on the device for offline
workouts (`src/media.ts`). Exercises without a GIF, and anyone not signed in,
see the [free-exercise-db](https://github.com/yuhonas/free-exercise-db) photos
(public domain, Unlicense) in `public/exercises/`, downloaded by `npm run demos`.

To add or replace a GIF (from `pwa-kit/worker`):

```bash
npx wrangler kv key put --remote --binding MEDIA reps/<name>.gif --path <file>.gif --metadata '{"contentType":"image/gif"}'
```

then map the demo key to `<name>` in `GIF_FOR` in `src/media.ts`.

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
node scripts/stub-api.mjs --seed      # MEDIA_DIR=<folder of GIFs> to serve demos too
VITE_API_URL_PRIMARY=http://localhost:8787/reps VITE_AUTH_PROVIDERS= npm run dev
```

### One-time setup

1. **Grist:** document "Reps" with two tables. Dates and text are **Text**
   columns; the rest **Numeric**. Both need `owner`, `created_at`,
   `updated_at` (Text) for the worker.
   - `Sets`: `date`, `workout` (Q; A/B in older rows), `exercise`, `variant`, `set_number`,
     `reps`, `seconds`, `rir`, `band`, `note`
   - `Body`: `date`, `weight`, `waist`, `steps`, `protein`, `note`
2. **Worker:** the `reps` entry in `pwa-kit/worker/src/apps.ts` with the
   document id, then in `pwa-kit/worker`:
   `npx wrangler secret put ALLOWED_EMAILS_REPS` and `npx wrangler deploy`.
3. **This repo:** *Settings → Pages → Source: GitHub Actions* and the
   repository secret `VITE_API_URL_PRIMARY` = `https://<worker>/reps`.

Every push to `main` deploys GitHub Pages through pwa-kit's shared workflow.
Band colours, sounds and deload dates are kept per device in `localStorage`.
