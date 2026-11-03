import { escapeHtml, formatIsoDate } from '@alcariss/pwa-kit';
import {
  CHANGE_LABELS,
  type Change,
  isProgression,
  type DeloadStatus,
  type ExerciseState
} from './engine';
import { gifUrl } from './media';
import type { BodyRecord } from './model';
import { bandLabel, type Prefs } from './prefs';
import {
  EASIER_ADVICE,
  CIRCUIT_POOL,
  DELOAD_ROUNDS,
  EXERCISES,
  FINISHER,
  REST_STEPS,
  ROUNDS,
  WARMUP,
  demoFrames,
  exercise,
  findVariant,
  unitLabel,
  type DemoKey
} from './program';
import { finisherRound, type Draft, type DraftExercise } from './session';
import type { LastSession, WeightTrend } from './stats';

export type Tab = 'today' | 'progress' | 'body' | 'settings';

export const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today', label: 'Today', icon: '🏋️' },
  { id: 'progress', label: 'Progress', icon: '📈' },
  { id: 'body', label: 'Body', icon: '⚖️' },
  { id: 'settings', label: 'Settings', icon: '⚙️' }
];

const LOCALE = 'en';

export function formatDate(iso: string): string {
  return formatIsoDate(iso, LOCALE, { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmt(value: number, digits = 1): string {
  return value.toLocaleString(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function signed(value: number, digits = 2): string {
  return `${value > 0 ? '+' : value < 0 ? '−' : '±'}${fmt(Math.abs(value), digits)}`;
}

export function renderNav(active: Tab): string {
  return TABS.map((tab) => `
    <button type="button" data-tab="${tab.id}" ${tab.id === active ? 'aria-current="page"' : ''}>
      <span aria-hidden="true">${tab.icon}</span>${escapeHtml(tab.label)}
    </button>
  `).join('');
}

export function renderDemo(key: DemoKey, base: string): string {
  const gif = gifUrl(key);
  if (gif) {
    return `
      <div class="demo gif">
        <img src="${escapeHtml(gif)}" alt="" decoding="async" />
      </div>
    `;
  }
  const [first, second] = demoFrames(key, base);
  return `
    <button type="button" class="demo" data-action="demo-toggle" data-show="0" aria-pressed="false" aria-label="Pause or play the demo">
      <img src="${escapeHtml(first)}" data-demo="${escapeHtml(key)}" data-frame="0" alt="" decoding="async" />
      <img src="${escapeHtml(second)}" data-demo="${escapeHtml(key)}" data-frame="1" alt="" decoding="async" class="demo-b" />
    </button>
  `;
}

/** Inline SVG line chart; no chart library needed for a few dozen points. */
export function sparkline(values: readonly number[], options: { width?: number; height?: number; label?: string } = {}): string {
  const width = options.width ?? 120;
  const height = options.height ?? 32;
  if (values.length < 2) {
    return '';
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * (width - 4) + 2;
    const y = height - 2 - ((value - min) / span) * (height - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = points.at(-1)?.split(',') ?? ['0', '0'];
  return `
    <svg class="spark" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeHtml(options.label ?? 'trend')}">
      <polyline points="${points.join(' ')}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      <circle cx="${last[0]}" cy="${last[1]}" r="3" fill="currentColor" />
    </svg>
  `;
}

const TIPS = [
  'Aim to lose 0.5–1 % of bodyweight a week: a 300–500 kcal daily deficit.',
  'Protein 1.6–2.2 g per kg every day protects muscle while you lose fat.',
  'Weigh in the morning after the toilet. Only the 7-day average matters.',
  'Steps: add ~2 000 to your usual daily count, building toward 8–10 k.',
  'Measure your waist weekly at the navel, relaxed, same time of day.',
  'Stop sets 1–3 reps short of failure. Close to failure is enough to grow.',
  'Lower every rep under control: 2–3 seconds down.',
  'Sleep 7–9 hours: recovery is when the muscle is built.'
];

export function renderToday(view: {
  today: string;
  last: LastSession;
  /** Exercise ids of the next circuit. */
  circuit: string[];
  states: Record<string, ExerciseState>;
  deload: DeloadStatus;
  deloadUntil: string | null;
  sessionsThisWeek: number;
  trend: WeightTrend;
  draft: Draft | null;
  pending: number;
}): string {
  const { last, deload } = view;
  const tip = TIPS[Number(view.today.replaceAll('-', '')) % TIPS.length] ?? TIPS[0];
  const lastText = last.daysSince === null
    ? 'First workout: welcome! Start light and learn the movements.'
    : last.daysSince === 0
      ? 'You already trained today.'
      : `Last workout ${last.daysSince === 1 ? 'yesterday' : `${last.daysSince} days ago`}.`;
  const busy = view.draft !== null && view.draft.step <= view.draft.circuit.size;

  const draft = busy && view.draft
    ? `<section class="card highlight">
        <h2>Workout in progress</h2>
        <p class="muted">Started ${escapeHtml(formatDate(view.draft.date))}.</p>
        <div class="row"><button type="button" class="big" data-action="resume">Resume workout</button>
        <button type="button" class="ghost" data-action="discard">Discard</button></div>
      </section>`
    : '';

  const deloadBanner = deload.active
    ? `<section class="banner info"><strong>Deload week</strong> until ${escapeHtml(formatDate(view.deloadUntil ?? view.today))}:
        ${DELOAD_ROUNDS} rounds, full rest, 3–4 reps in reserve. Recover, then come back stronger.
        <button type="button" class="link" data-action="end-deload">End deload</button></section>`
    : deload.due
      ? `<section class="banner warn"><strong>Time for a deload.</strong>
          ${deload.reason === 'stalls'
            ? `${deload.stalled.length} exercises stalled (${escapeHtml(deload.stalled.map((id) => exercise(id).name).join(', '))}).`
            : `${deload.weeks} weeks of training since the last one.`}
          One easy week (${DELOAD_ROUNDS} rounds, 3–4 RIR) lets fatigue drop and progress resume.
          <button type="button" data-action="start-deload">Start deload week</button></section>`
      : '';

  const rest = last.restSuggested && !last.trainedToday
    ? '<p class="note">You trained yesterday. Muscles grow between sessions: 3×/week on non-consecutive days works best. A walk counts today!</p>'
    : '';

  const rounds = deload.active ? DELOAD_ROUNDS : ROUNDS;
  const rows = view.circuit.map((exerciseId) => {
    const ex = exercise(exerciseId);
    const state = view.states[exerciseId];
    const variant = findVariant(ex, state?.variant ?? ex.start);
    const restSeconds = deload.active ? REST_STEPS[0] : state?.rest ?? REST_STEPS[0];
    const up = state && isProgression(state.change) ? ' <span class="badge up">↑</span>' : '';
    return `<li><span>${escapeHtml(variant.name)}${up}</span><span class="muted">${ex.min}–${ex.max} ${escapeHtml(unitLabel(ex, variant))} · rest ${restSeconds} s</span></li>`;
  }).join('');
  const avg = view.trend.average === null ? '—' : `${fmt(view.trend.average)} kg`;
  const rate = view.trend.ratePct === null ? '' : ` (${signed(view.trend.ratePct)} %/wk)`;

  return `
    ${draft}
    ${deloadBanner}
    <section class="card">
      <div class="split">
        <h2>Today’s workout</h2>
        <span class="badge">${rounds} rounds · 20–25 min</span>
      </div>
      <p class="muted">${escapeHtml(lastText)}</p>
      ${rest}
      <p class="muted small">3-min warm-up, ${rounds} rounds of this circuit, then ${FINISHER.rounds} rounds of ${FINISHER.swings} swings + ${FINISHER.plankMin}–${FINISHER.plankMax} s plank.</p>
      <ol class="plan">${rows}</ol>
      <button type="button" class="big" data-action="start" ${busy ? 'disabled' : ''}>Start workout</button>
    </section>
    <section class="card stats">
      <div><strong>${view.sessionsThisWeek}/3</strong><span>sessions this week</span></div>
      <div><strong>${escapeHtml(avg)}</strong><span>7-day avg weight${escapeHtml(rate)}</span></div>
    </section>
    ${view.pending > 0
      ? `<section class="banner warn">${view.pending} logged ${view.pending === 1 ? 'entry is' : 'entries are'} waiting to sync.
          <button type="button" data-action="sync">Sync now</button></section>`
      : ''}
    <p class="tip">💡 ${escapeHtml(tip ?? '')}</p>
  `;
}

/** The warm-up item on screen: the first one not yet done (the last once all are). */
export function warmupIndex(draft: Draft): number {
  const next = draft.warmup.findIndex((done) => !done);
  return next === -1 ? WARMUP.length - 1 : next;
}

/** Warm-up, one move per screen, laid out like the exercise player. */
export function renderWarmup(draft: Draft, base: string): string {
  const index = warmupIndex(draft);
  const item = WARMUP[index];
  if (!item) {
    return '';
  }
  const ex = exercise(item.exercise);
  const variant = findVariant(ex, ex.start);
  const last = index === WARMUP.length - 1;
  return `
    ${playerHead(`Warm-up · ${index + 1}/${WARMUP.length}`)}
    <section class="exercise play">
      <div class="play-title"><h2>${escapeHtml(variant.name)}</h2></div>
      <div class="play-demo">${renderDemo(variant.demo, base)}</div>
      <p class="warm-amount">${escapeHtml(item.amount)}</p>
    </section>
    ${formSheet({ title: variant.name, target: `Warm-up: ${item.amount}`, cues: variant.cues ?? ex.cues, logged: '' })}
    ${playerBar(
      { action: 'warmup-done', label: last ? 'Done · start round 1 ▶' : 'Done ✓' },
      { back: index > 0, extra: { action: 'next', label: 'Skip all' } }
    )}
  `;
}

function targetLine(item: DraftExercise, prefs: Prefs): string {
  const ex = exercise(item.exercise);
  const variant = findVariant(ex, item.variant);
  const p = item.prescription;
  const parts = [`${p.rounds} rounds × ${p.min}–${p.max} ${unitLabel(ex, variant)}`, `rest ${p.rest} s`];
  if (ex.kind === 'reps') {
    parts.push(p.rir);
  }
  if (variant.banded && item.band !== null) {
    parts.push(`band ${bandLabel(prefs, item.band)}`);
  }
  return parts.join(' · ');
}

function loggedLine(item: DraftExercise): string {
  const ex = exercise(item.exercise);
  if (item.logged.length === 0) {
    return '';
  }
  const rounds = item.logged.map((set) => {
    const value = ex.kind === 'hold' ? `${set.seconds ?? 0} s` : `${set.reps ?? 0}`;
    return set.rir === null ? value : `${value} @${set.rir}`;
  });
  return `<p class="muted small">Logged: ${escapeHtml(rounds.join(', '))}</p>`;
}

type BarAction = { action: string; label: string; secondary?: boolean };

/**
 * The fixed bottom bar of the player. The primary action (log, start timer,
 * next) is always here, so it never sits below the fold.
 */
function playerBar(primary: BarAction, options: { back?: boolean; extra?: BarAction | null } = {}): string {
  const back = options.back === false
    ? ''
    : '<button type="button" class="secondary bar-back" data-action="prev" aria-label="Back">◀</button>';
  const extra = options.extra
    ? `<button type="button" class="secondary bar-extra" data-action="${escapeHtml(options.extra.action)}">${escapeHtml(options.extra.label)}</button>`
    : '';
  return `
    <nav class="player-nav">
      ${back}
      <button type="button" class="bar-primary ${primary.secondary ? 'secondary' : ''}" data-action="${escapeHtml(primary.action)}">${escapeHtml(primary.label)}</button>
      ${extra}
    </nav>
  `;
}

/** Form cues and the "too hard / too easy" switches, out of the way until ⓘ is tapped. */
function formSheet(options: { title: string; target: string; cues: readonly string[]; hint?: string; logged: string; extra?: string }): string {
  return `
    <dialog class="sheet" id="form-sheet">
      <h2>${escapeHtml(options.title)}</h2>
      ${options.target ? `<p class="muted small">${escapeHtml(options.target)}</p>` : ''}
      ${options.hint ? `<p class="note">${escapeHtml(options.hint)}</p>` : ''}
      <h3>Form cues</h3>
      <ul class="cues">${options.cues.map((cue) => `<li>${escapeHtml(cue)}</li>`).join('')}</ul>
      ${options.extra ?? ''}
      ${options.logged}

      <button type="button" class="secondary close-sheet" data-action="close-sheet">Close</button>
    </dialog>
  `;
}

function playerHead(label: string, right = ''): string {
  return `
    <header class="player-head">
      <button type="button" class="ghost" data-action="exit" aria-label="Leave workout">✕</button>
      <span>${escapeHtml(label)}</span>
      ${right}
      <button type="button" class="ghost music" data-action="music" aria-label="Lo-fi music" aria-pressed="false">🎵</button>
      <button type="button" class="ghost info" data-action="form" aria-label="Form cues">ⓘ</button>
    </header>
  `;
}

export type InputState = { value: number; rir: number | null; band: number | null };

/** The numbers worth offering: a little below the range up to a little above it. */
export function pickOptions(min: number, max: number, current: number, step = 1): number[] {
  const low = Math.max(step, Math.min(current, min - 3 * step));
  const high = Math.max(current, max + 5 * step);
  const options: number[] = [];
  for (let value = low - (low % step || 0); value <= high; value += step) {
    if (value > 0) {
      options.push(value);
    }
  }
  if (!options.includes(current)) {
    options.push(current);
    options.sort((a, b) => a - b);
  }
  return options;
}

/** Tap the number you did: no ± buttons to hit mid-set. */
function valuePicker(label: string, options: readonly number[], selected: number): string {
  return `
    <fieldset class="pick">
      <legend>${escapeHtml(label)}</legend>
      <div class="pick-strip">
        ${options.map((value) => `
          <button type="button" data-action="pick" data-value="${value}" aria-pressed="${value === selected ? 'true' : 'false'}">${value}</button>
        `).join('')}
      </div>
    </fieldset>
  `;
}

function rirPicker(selected: number | null, floor: number): string {
  return `
    <fieldset class="rir">
      <legend>Reps left in the tank</legend>
      <div class="segmented">
        ${[0, 1, 2, 3, 4].map((rir) => `
          <button type="button" data-action="rir" data-rir="${rir}" aria-pressed="${selected === rir ? 'true' : 'false'}" class="${rir < floor ? 'risky' : ''}">${rir === 4 ? '4+' : rir}</button>
        `).join('')}
      </div>
    </fieldset>
  `;
}


/** One circuit exercise in the current round. */
export function renderExercise(draft: Draft, prefs: Prefs, base: string, input: InputState): string {
  const index = draft.step;
  const item = draft.exercises[index];
  if (!item) {
    return '';
  }
  const ex = exercise(item.exercise);
  const variant = findVariant(ex, item.variant);
  const circuit = draft.circuit;
  const complete = item.logged.length >= circuit.round;
  const lastInCircuit = index === circuit.size - 1 && circuit.round >= circuit.rounds;
  const change = item.change === 'start' || item.change === 'none'
    ? ''
    : `<span class="badge ${isProgression(item.change) ? 'up' : item.change.endsWith('-') || item.change === 'repeat' ? 'down' : ''}">${escapeHtml(CHANGE_LABELS[item.change] ?? '')}</span>`;
  const p = item.prescription;
  const unit = unitLabel(ex, variant);
  const holdStep = ex.kind === 'hold' ? 5 : 1;
  const logger = complete
    ? `<div class="logged-done">
        <p class="done">✓ Round ${circuit.round} logged</p>
        <button type="button" class="link" data-action="undo">Undo</button>
      </div>`
    : `
      ${valuePicker(`${unit[0]?.toUpperCase() ?? ''}${unit.slice(1)} · target ${p.min}–${p.max}`, pickOptions(p.min, p.max, input.value, holdStep), input.value)}
      ${ex.kind === 'reps' ? rirPicker(input.rir, ex.rirFloor) : ''}
    `;
  const band = variant.banded && input.band !== null
    ? `<span class="badge">${escapeHtml(bandLabel(prefs, input.band))}</span>`
    : '';
  const primary: BarAction = complete
    ? { action: 'next', label: lastInCircuit ? 'Finisher ▶' : 'Next ▶' }
    : { action: 'log', label: `Done · ${input.value} ${unit} ✓` };

  return `
    ${playerHead(`Round ${circuit.round}/${circuit.rounds} · ${index + 1}/${circuit.size}${draft.deload ? ' · deload' : ''}`)}
    <section class="exercise play">
      <div class="play-title"><h2>${escapeHtml(variant.name)}</h2>${band}${change}</div>
      <div class="play-demo">${renderDemo(variant.demo, base)}</div>
      ${logger}
    </section>
    ${formSheet({ title: variant.name, target: targetLine(item, prefs), cues: variant.cues ?? ex.cues, hint: variant.hint, logged: loggedLine(item), extra: easierAdvice(item.exercise, variant.id, item.change) })}
    ${playerBar(primary, { extra: complete ? null : { action: 'next', label: 'Skip' } })}
  `;
}

export function renderRest(endsAt: number, total: number, now: number, upNext: string | null = null): string {
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  return `
    <div class="rest" role="timer" aria-live="off">
      <div class="timer-label">Rest</div>
      <div class="timer-big" id="rest-left">${formatClock(left)}</div>
      <progress id="rest-bar" max="${total}" value="${total - left}"></progress>
      ${upNext ? `<p class="up-next">Up next: <strong>${escapeHtml(upNext)}</strong></p>` : ''}
      <div class="row">
        <button type="button" class="secondary" data-action="rest-add">+15 s</button>
        <button type="button" data-action="rest-skip">Skip rest</button>
      </div>
    </div>
  `;
}

/** Finisher: swings then plank, back to back, for 3 rounds. */
export function renderFinisher(draft: Draft, base: string, input: InputState, timer: 'idle' | 'hold', activeIndex: number, now: number): string {
  const circuit = draft.circuit;
  const item = draft.exercises[activeIndex];
  if (!item) {
    return '';
  }
  const ex = exercise(item.exercise);
  const variant = findVariant(ex, item.variant);
  const round = finisherRound(draft);
  const isPlank = ex.kind === 'hold';
  const elapsed = circuit.finisherStartedAt === null ? 0 : Math.max(0, (now - circuit.finisherStartedAt) / 1000);
  const station = isPlank && timer === 'hold'
    ? `<div class="timer"><div class="timer-big" id="hold-elapsed">0</div>
        <p class="muted">Target ${input.value} s</p></div>`
    : isPlank
      ? valuePicker(`Hold target · ${FINISHER.plankMin}–${FINISHER.plankMax} s`, pickOptions(FINISHER.plankMin, FINISHER.plankMax, input.value, 5), input.value)
      : valuePicker('Swings', pickOptions(FINISHER.swings, FINISHER.swings, input.value), input.value);
  const primary: BarAction = isPlank
    ? timer === 'hold'
      ? { action: 'hold-stop', label: 'Plank done ✓' }
      : { action: 'hold-start', label: `▶ Start ${input.value} s plank` }
    : { action: 'log', label: `Done · ${input.value} swings ✓` };
  const title = isPlank ? 'Plank' : `${FINISHER.swings} KB swings`;
  return `
    ${playerHead(`Finisher · round ${round}/${circuit.finisherRounds}`, `<span class="clock" id="finisher-clock">${formatClock(elapsed)}</span>`)}
    <section class="exercise play">
      <div class="play-title"><h2>${escapeHtml(title)}</h2></div>
      <div class="play-demo">${renderDemo(variant.demo, base)}</div>
      ${station}
    </section>
    ${formSheet({ title, target: 'No rest: swings, straight into the plank, straight into the next round.', cues: ex.cues, logged: '' })}
    ${playerBar(primary, { extra: { action: 'finish', label: 'End' } })}
  `;
}

export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

export function renderFinish(draft: Draft, progressed: Record<string, Change>, pending: number, now: number): string {
  const earned = Object.keys(progressed);
  const minutes = Math.max(1, Math.round((now - draft.startedAt) / 60_000));
  const rows = draft.exercises.map((item) => {
    const ex = exercise(item.exercise);
    const values = item.logged.map((set) => (ex.kind === 'hold' ? set.seconds : set.reps) ?? 0);
    const total = values.reduce((sum, value) => sum + value, 0);
    const change = progressed[item.exercise];
    const up = change === undefined
      ? ''
      : `<span class="badge up">${change === 'rest-' ? '↑ shorter rest next time' : '↑ level up next time'}</span>`;
    return `<li><span>${escapeHtml(findVariant(ex, item.variant).name)} ${up}</span>
      <span class="muted">${values.length === 0 ? 'skipped' : `${escapeHtml(values.join(' · '))}${ex.kind === 'hold' ? ' s' : ''} = ${total}`}</span></li>`;
  }).join('');
  return `
    <section class="card finish">
      <h2>🎉 Workout done</h2>
      <p class="muted">${minutes} min · ${draft.exercises.reduce((sum, item) => sum + item.logged.length, 0)} sets</p>
      ${earned.length > 0 ? `<p class="note">Progression earned on ${earned.length} exercise${earned.length === 1 ? '' : 's'}. Next session will be a bit harder.</p>` : ''}
      <ol class="plan">${rows}</ol>
      <p class="muted">${pending > 0 ? `${pending} ${pending === 1 ? 'set is' : 'sets are'} saved on this phone and will sync when you're online.` : 'Everything is saved.'}</p>
      <p class="tip">Now: protein-rich meal, water, and a walk later counts toward your steps.</p>
    </section>
    ${playerBar({ action: 'close-finish', label: 'Done ✓' }, { back: false })}
  `;
}

/** Exercises from the retired A/B plan that are still in the log. */
export type RetiredExercise = { exercise: string; sessions: number; last: string };

function retiredName(id: string): string {
  const names: Record<string, string> = {
    'split-squat': 'Split squat',
    press: 'One-arm KB press',
    row: 'Two-arm bent-over band row',
    'scap-pushup': 'Scapular push-up',
    'dead-bug': 'Dead bug',
    'floor-press': 'KB floor press',
    'band-press': 'Band overhead press',
    'pull-apart': 'Band pull-apart'
  };
  return names[id] ?? id;
}

/** At the bottom of the ladder the engine can only repeat a stalled load; say how to make it lighter. */
function easierAdvice(exerciseId: string, variantId: string, change: Change): string {
  const ex = exercise(exerciseId);
  const advice = EASIER_ADVICE[exerciseId];
  if (change !== 'repeat' || ex.ladder[0]?.id !== variantId || !advice) {
    return '';
  }
  return `<p class="note small">Stalled on the easiest step. ${escapeHtml(advice)}</p>`;
}

export function renderProgress(states: Record<string, ExerciseState>, prefs: Prefs, retired: readonly RetiredExercise[] = []): string {
  const cards = Object.values(EXERCISES).filter((ex) => !ex.warmup && (CIRCUIT_POOL.includes(ex.id) || ex.finisher)).map((ex) => {
    const state = states[ex.id];
    if (!state) {
      return '';
    }
    const variant = findVariant(ex, state.variant);
    const history = state.history.slice(-12);
    const lastSession = history.at(-1);
    const step = `${ex.ladder.findIndex((v) => v.id === variant.id) + 1}/${ex.ladder.length}`;
    const status = state.lastOutcome === 'stall'
      ? '<span class="badge down">stalled</span>'
      : isProgression(state.change)
        ? '<span class="badge up">progressing</span>'
        : '';
    const unit = ex.kind === 'hold' ? 's' : 'reps';
    const next = ex.finisher
      ? '<p class="small muted">Finisher: logged for history.</p>'
      : `<p class="small">Next: ${ROUNDS} rounds × ${state.target} (${ex.min}–${ex.max}) · rest ${state.rest} s · ${escapeHtml(CHANGE_LABELS[state.change] ?? '')}</p>
        ${easierAdvice(ex.id, state.variant, state.change)}`;
    return `
      <li class="card progress-card">
        <div class="split">
          <div>
            <h3>${escapeHtml(ex.name)}</h3>
            <p class="muted">${escapeHtml(variant.name)}${ex.finisher ? '' : ` · step ${step}`}${variant.banded && state.band !== null ? ` · ${escapeHtml(bandLabel(prefs, state.band))}` : ''}</p>
          </div>
          ${status}
        </div>
        <div class="split">
          <div class="spark-wrap">${sparkline(history.map((session) => session.total), { label: `${ex.name} total ${unit}` }) || '<span class="muted">Log two sessions to see a trend.</span>'}</div>
          ${lastSession ? `<div class="last"><strong>${lastSession.best}</strong> best · <strong>${lastSession.total}</strong> total<br /><small class="muted">${escapeHtml(formatDate(lastSession.date))}</small></div>` : ''}
        </div>
        ${next}
      </li>
    `;
  }).join('');
  const old = retired.length === 0
    ? ''
    : `<details class="card"><summary>Earlier exercises (${retired.length})</summary>
        <ul class="list entries">${retired.map((item) => `
          <li class="entry"><span>${escapeHtml(retiredName(item.exercise))}</span>
            <span class="muted">${item.sessions} session${item.sessions === 1 ? '' : 's'} · last ${escapeHtml(formatDate(item.last))}</span><span></span></li>`).join('')}
        </ul></details>`;
  return `
    <h2 class="section-title">Progress</h2>
    <p class="muted small">Hit the top of the range in every round and the rest gets shorter (90 → 45 s), then the load goes up: a heavier band or the next variation. Miss the bottom of the range (or lose reps twice) and it is a stall; two stalls in a row step you back. Difficulty follows your log only.</p>
    <ul class="list">${cards}</ul>
    ${old}
  `;
}

function weightChart(raw: { date: string; value: number }[], average: { date: string; value: number }[], from: string, to: string, days: number): string {
  const all = [...raw, ...average].map((point) => point.value);
  if (all.length < 2) {
    return '<p class="muted">Weigh in for a few days to see the trend.</p>';
  }
  const width = 320;
  const height = 120;
  const min = Math.min(...all) - 0.3;
  const max = Math.max(...all) + 0.3;
  const dayIndex = (date: string): number => {
    const [y1, m1, d1] = from.split('-').map(Number) as [number, number, number];
    const [y2, m2, d2] = date.split('-').map(Number) as [number, number, number];
    return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
  };
  const x = (date: string): number => (dayIndex(date) / Math.max(1, days - 1)) * (width - 8) + 4;
  const y = (value: number): number => height - 4 - ((value - min) / (max - min)) * (height - 8);
  const dots = raw.map((point) => `<circle cx="${x(point.date).toFixed(1)}" cy="${y(point.value).toFixed(1)}" r="2.5" class="dot" />`).join('');
  const line = average.map((point) => `${x(point.date).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ');
  return `
    <svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Weight from ${escapeHtml(from)} to ${escapeHtml(to)}">
      ${dots}
      <polyline points="${line}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" />
      <text x="4" y="12" class="axis">${fmt(max - 0.3)}</text>
      <text x="4" y="${height - 6}" class="axis">${fmt(min + 0.3)}</text>
    </svg>
    <p class="muted small">Dots: daily weigh-ins · line: 7-day average · last ${days} days</p>
  `;
}

export function renderBody(view: {
  today: string;
  body: BodyRecord[];
  trend: WeightTrend;
  protein: { min: number; max: number } | null;
  steps: number | null;
  waist: { date: string; value: number } | null;
  raw: { date: string; value: number }[];
  average: { date: string; value: number }[];
  chartFrom: string;
  chartDays: number;
  pendingBody: BodyRecord[];
}): string {
  const { trend } = view;
  let trendNote = '';
  if (trend.plateau) {
    trendNote = '<p class="banner warn">Weight has moved less than 0.25 %/week for 3 weeks. Trim ~200 kcal/day or add ~2 000 steps.</p>';
  } else if (trend.tooFast) {
    trendNote = '<p class="banner warn">Losing faster than 1 %/week. Eat a little more to keep your muscle.</p>';
  } else if (trend.onTarget) {
    trendNote = '<p class="banner ok">Right on target: 0.5–1 %/week. Keep going.</p>';
  }
  const entries = [...view.pendingBody.map((entry) => ({ ...entry, pending: true })), ...view.body.map((entry) => ({ ...entry, pending: false }))]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 14);

  return `
    <h2 class="section-title">Body</h2>
    <form id="body-form" class="card form">
      <div class="grid2">
        <label>Date<input name="date" type="date" required value="${escapeHtml(view.today)}" /></label>
        <label>Weight (kg)<input name="weight" inputmode="decimal" placeholder="daily" /></label>
        <label>Waist (cm)<input name="waist" inputmode="decimal" placeholder="weekly" /></label>
        <label>Steps<input name="steps" inputmode="numeric" placeholder="today" /></label>
        <label>Protein (g)<input name="protein" inputmode="numeric" placeholder="today" /></label>
        <label>Note<input name="note" maxlength="200" /></label>
      </div>
      <button type="submit" class="big">Save</button>
    </form>
    ${trendNote}
    <section class="card stats">
      <div><strong>${trend.average === null ? '—' : `${fmt(trend.average)} kg`}</strong><span>7-day average</span></div>
      <div><strong>${trend.ratePct === null ? '—' : `${signed(trend.ratePct)} %`}</strong><span>per week (goal −0.5 to −1)</span></div>
      <div><strong>${view.protein ? `${view.protein.min}–${view.protein.max} g` : '—'}</strong><span>protein / day</span></div>
      <div><strong>${view.steps === null ? '—' : view.steps.toLocaleString(LOCALE)}</strong><span>avg steps (7 d)</span></div>
      <div><strong>${view.waist ? `${fmt(view.waist.value)} cm` : '—'}</strong><span>waist${view.waist ? ` · ${escapeHtml(formatDate(view.waist.date))}` : ''}</span></div>
    </section>
    <section class="card">
      ${weightChart(view.raw, view.average, view.chartFrom, view.today, view.chartDays)}
    </section>
    <details class="card">
      <summary>Fat-loss basics</summary>
      <ul class="cues">
        <li>Eat 300–500 kcal/day below maintenance; aim to lose 0.5–1 % of bodyweight per week.</li>
        <li>Protein 1.6–2.2 g/kg/day, spread over 3–4 meals.</li>
        <li>Steps: your baseline + 2 000, building toward 8–10 k a day.</li>
        <li>Weigh daily in the morning; judge only the 7-day average. Waist weekly at the navel.</li>
        <li>Lifting keeps the muscle while the deficit removes the fat.</li>
      </ul>
    </details>
    <ul class="list entries">
      ${entries.map((entry) => `
        <li class="entry">
          <span>${escapeHtml(formatDate(entry.date))}${entry.pending ? ' <span class="badge">not synced</span>' : ''}</span>
          <span class="muted">${[
            entry.weight === null ? '' : `${fmt(entry.weight)} kg`,
            entry.waist === null ? '' : `waist ${fmt(entry.waist)}`,
            entry.steps === null ? '' : `${entry.steps.toLocaleString(LOCALE)} steps`,
            entry.protein === null ? '' : `${entry.protein} g protein`,
            entry.note
          ].filter(Boolean).map((part) => escapeHtml(part)).join(' · ')}</span>
          ${entry.pending ? '' : `<button type="button" class="link danger" data-action="delete-body" data-id="${escapeHtml(entry.id)}" aria-label="Delete">✕</button>`}
        </li>`).join('')}
    </ul>
  `;
}

export function renderSettings(prefs: Prefs, view: { email: string | null; signInRequired: boolean; version: string; pending: number }): string {
  return `
    <h2 class="section-title">Settings</h2>
    <form id="settings-form" class="card form">
      <h3>Resistance bands</h3>
      <p class="muted small">Name your bands from lightest (1) to heaviest. Level 6 can be two bands together.</p>
      ${prefs.bandNames.map((name, index) => `
        <label class="inline">L${index + 1}<input name="band-${index}" value="${escapeHtml(name)}" maxlength="40" /></label>`).join('')}
      <h3>Workout</h3>
      <label class="toggle"><input type="checkbox" name="sound" ${prefs.sound ? 'checked' : ''} /> Sound (timer beeps)</label>
      <label class="toggle"><input type="checkbox" name="music" ${prefs.music ? 'checked' : ''} /> Lo-fi music during workouts</label>
      <label class="toggle"><input type="checkbox" name="vibrate" ${prefs.vibrate ? 'checked' : ''} /> Vibration</label>
      <button type="submit" class="big">Save settings</button>
    </form>
    <section class="card">
      <h3>Deload</h3>
      <p class="muted small">${prefs.deloadFrom ? `Last deload started ${escapeHtml(formatDate(prefs.deloadFrom))}.` : 'No deload yet.'} Deloads come every 6 weeks, or earlier when two exercises stall.</p>
      <button type="button" class="secondary" data-action="start-deload">Start a deload week now</button>
    </section>
    <section class="card">
      <h3>Sync</h3>
      <p class="muted small">${view.pending === 0 ? 'Everything is synced.' : `${view.pending} entries waiting to sync.`}</p>
      <button type="button" class="secondary" data-action="sync">Sync now</button>
    </section>
    <section class="card about">
      <h3>About</h3>
      <p class="small">Full-body training 3×/week with a kettlebell, bands and bodyweight, with double progression and automatic deloads. Method and sources are in the <a href="https://github.com/Alcariss/reps#method" target="_blank" rel="noopener">README</a>.</p>
      <p class="small muted">Exercise images: <a href="https://github.com/yuhonas/free-exercise-db" target="_blank" rel="noopener">free-exercise-db</a> (public domain, Unlicense).</p>
      ${view.signInRequired ? `<p class="small">Signed in${view.email ? ` as ${escapeHtml(view.email)}` : ''}. <button type="button" class="link" data-action="logout">Sign out</button></p>` : ''}
      <p class="version">${escapeHtml(view.version)}</p>
    </section>
  `;
}
