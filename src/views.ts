import { escapeHtml, formatIsoDate } from '@alcariss/pwa-kit';
import {
  CHANGE_LABELS,
  isProgression,
  type DeloadStatus,
  type ExerciseState
} from './engine';
import type { BodyRecord } from './model';
import { bandLabel, type Prefs } from './prefs';
import {
  BAND_LEVELS,
  EXERCISES,
  WARMUP,
  WORKOUTS,
  demoFrames,
  exercise,
  findVariant,
  unitLabel,
  type DemoKey,
  type WorkoutId
} from './program';
import { isComplete, type Draft, type DraftExercise } from './session';
import type { NextWorkout, WeightTrend } from './stats';

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
  const [first, second] = demoFrames(key, base);
  return `
    <div class="demo" aria-hidden="true">
      <img src="${escapeHtml(first)}" data-demo="${escapeHtml(key)}" data-frame="0" alt="" decoding="async" />
      <img src="${escapeHtml(second)}" data-demo="${escapeHtml(key)}" data-frame="1" alt="" decoding="async" class="demo-b" />
    </div>
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

function workoutPlan(workout: WorkoutId, states: Record<string, ExerciseState>, deload: boolean): string {
  return `<ol class="plan">${WORKOUTS[workout].map((exerciseId) => {
    const ex = exercise(exerciseId);
    const state = states[exerciseId];
    const variant = findVariant(ex, state?.variant ?? ex.start);
    const sets = deload ? Math.max(1, Math.ceil((state?.sets ?? ex.sets) / 2)) : state?.sets ?? ex.sets;
    const range = ex.kind === 'emom' ? `${sets} min × ${ex.min}–${ex.max}` : `${sets} × ${ex.min}–${ex.max} ${unitLabel(ex, variant)}`;
    const up = state && isProgression(state.change) ? '<span class="badge up">↑</span>' : '';
    return `<li><span>${escapeHtml(variant.name)} ${up}</span><span class="muted">${escapeHtml(range)}</span></li>`;
  }).join('')}</ol>`;
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
  next: NextWorkout;
  chosen: WorkoutId;
  states: Record<string, ExerciseState>;
  deload: DeloadStatus;
  deloadUntil: string | null;
  sessionsThisWeek: number;
  trend: WeightTrend;
  draft: Draft | null;
  pending: number;
}): string {
  const { next, deload } = view;
  const tip = TIPS[Number(view.today.replaceAll('-', '')) % TIPS.length] ?? TIPS[0];
  const lastText = next.daysSince === null
    ? 'First workout: welcome! Start light and learn the movements.'
    : next.daysSince === 0
      ? 'You already trained today.'
      : `Last workout ${next.daysSince === 1 ? 'yesterday' : `${next.daysSince} days ago`}.`;

  const draft = view.draft && view.draft.step < view.draft.exercises.length
    ? `<section class="card highlight">
        <h2>Workout ${escapeHtml(view.draft.workout)} in progress</h2>
        <p class="muted">Started ${escapeHtml(formatDate(view.draft.date))}.</p>
        <div class="row"><button type="button" class="big" data-action="resume">Resume workout</button>
        <button type="button" class="ghost" data-action="discard">Discard</button></div>
      </section>`
    : '';

  const deloadBanner = deload.active
    ? `<section class="banner info"><strong>Deload week</strong> until ${escapeHtml(formatDate(view.deloadUntil ?? view.today))}:
        half the sets, 3–4 reps in reserve. Recover, then come back stronger.
        <button type="button" class="link" data-action="end-deload">End deload</button></section>`
    : deload.due
      ? `<section class="banner warn"><strong>Time for a deload.</strong>
          ${deload.reason === 'stalls'
            ? `${deload.stalled.length} exercises stalled (${escapeHtml(deload.stalled.map((id) => exercise(id).name).join(', '))}).`
            : `${deload.weeks} weeks of training since the last one.`}
          One easy week (half the sets, 3–4 RIR) lets fatigue drop and progress resume.
          <button type="button" data-action="start-deload">Start deload week</button></section>`
      : '';

  const rest = next.restSuggested && !next.trainedToday
    ? '<p class="note">You trained yesterday. Muscles grow between sessions: 3×/week on non-consecutive days works best. A walk counts today!</p>'
    : '';

  const avg = view.trend.average === null ? '—' : `${fmt(view.trend.average)} kg`;
  const rate = view.trend.ratePct === null ? '' : ` (${signed(view.trend.ratePct)} %/wk)`;

  return `
    ${draft}
    ${deloadBanner}
    <section class="card">
      <div class="split">
        <h2>Workout ${escapeHtml(view.chosen)}</h2>
        <button type="button" class="link" data-action="swap-workout">Do ${escapeHtml(view.chosen === 'A' ? 'B' : 'A')} instead</button>
      </div>
      <p class="muted">${escapeHtml(lastText)}${view.chosen !== next.workout ? ' (suggested: ' + escapeHtml(next.workout) + ')' : ''}</p>
      ${rest}
      ${workoutPlan(view.chosen, view.states, deload.active)}
      <button type="button" class="big" data-action="start" ${view.draft && view.draft.step < view.draft.exercises.length ? 'disabled' : ''}>Start workout ${escapeHtml(view.chosen)}</button>
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

export function renderWarmup(draft: Draft): string {
  const done = draft.warmup.every(Boolean);
  return `
    <header class="player-head">
      <button type="button" class="ghost" data-action="exit">✕</button>
      <span>Workout ${escapeHtml(draft.workout)} · Warm-up</span>
      <span></span>
    </header>
    <section class="card">
      <h2>5-minute warm-up</h2>
      <p class="muted">Raise your temperature and groove the patterns. Tap each item when done.</p>
      <ul class="checklist">
        ${WARMUP.map((item, index) => `
          <li><button type="button" class="check ${draft.warmup[index] ? 'done' : ''}" data-action="warmup" data-index="${index}" aria-pressed="${draft.warmup[index] ? 'true' : 'false'}">
            <span class="box" aria-hidden="true">${draft.warmup[index] ? '✓' : ''}</span>${escapeHtml(item)}
          </button></li>`).join('')}
      </ul>
      <button type="button" class="big ${done ? '' : 'secondary'}" data-action="next">${done ? 'Start first exercise' : 'Skip warm-up'}</button>
    </section>
  `;
}

function targetLine(item: DraftExercise, prefs: Prefs): string {
  const ex = exercise(item.exercise);
  const variant = findVariant(ex, item.variant);
  const p = item.prescription;
  const parts = ex.kind === 'emom'
    ? [`${p.sets} min EMOM`, `${p.min}–${p.max} reps each minute`]
    : [`${p.sets} × ${p.min}–${p.max} ${unitLabel(ex, variant)}`];
  if (variant.tempo) {
    parts.push(`tempo ${variant.tempo}`);
  }
  if (ex.kind !== 'emom') {
    parts.push(p.rir);
  }
  if (variant.banded && item.band !== null) {
    parts.push(`band ${bandLabel(prefs, item.band)}`);
  }
  return parts.map((part) => `<span>${escapeHtml(part)}</span>`).join('');
}

function loggedChips(item: DraftExercise, prefs: Prefs): string {
  const ex = exercise(item.exercise);
  if (item.logged.length === 0) {
    return '';
  }
  return `<ol class="chips">${item.logged.map((set) => {
    const value = ex.kind === 'hold' ? `${set.seconds ?? 0} s` : `${set.reps ?? 0}`;
    const rir = set.rir === null ? '' : ` @${set.rir}`;
    const band = set.band === null ? '' : ` · L${set.band}`;
    return `<li title="${escapeHtml(bandLabel(prefs, set.band))}">${escapeHtml(value + rir + band)}</li>`;
  }).join('')}</ol>`;
}

export type InputState = { value: number; rir: number | null; band: number | null };

function stepper(name: string, value: number, unit: string): string {
  return `
    <div class="stepper" data-stepper="${name}">
      <button type="button" data-action="step" data-field="${name}" data-delta="-1" aria-label="Less">−</button>
      <output id="${name}-value" aria-live="polite"><strong>${value}</strong><small>${escapeHtml(unit)}</small></output>
      <button type="button" data-action="step" data-field="${name}" data-delta="1" aria-label="More">+</button>
    </div>
  `;
}

function rirPicker(selected: number | null, floor: number): string {
  return `
    <fieldset class="rir">
      <legend>Reps in reserve <small>(how many more you could do)</small></legend>
      <div class="segmented">
        ${[0, 1, 2, 3, 4].map((rir) => `
          <button type="button" data-action="rir" data-rir="${rir}" aria-pressed="${selected === rir ? 'true' : 'false'}" class="${rir < floor ? 'risky' : ''}">${rir === 4 ? '4+' : rir}</button>
        `).join('')}
      </div>
    </fieldset>
  `;
}

function bandPicker(prefs: Prefs, band: number): string {
  return `
    <div class="band-row">
      <span class="muted">Band</span>
      <div class="stepper small">
        <button type="button" data-action="band" data-delta="-1" aria-label="Lighter band" ${band <= 1 ? 'disabled' : ''}>−</button>
        <output>${escapeHtml(bandLabel(prefs, band))}</output>
        <button type="button" data-action="band" data-delta="1" aria-label="Heavier band" ${band >= BAND_LEVELS ? 'disabled' : ''}>+</button>
      </div>
    </div>
  `;
}

export function renderExercise(draft: Draft, prefs: Prefs, base: string, input: InputState, timer: 'idle' | 'hold' | 'emom'): string {
  const index = draft.step;
  const item = draft.exercises[index];
  if (!item) {
    return '';
  }
  const ex = exercise(item.exercise);
  const variant = findVariant(ex, item.variant);
  const complete = isComplete(item);
  const last = index === draft.exercises.length - 1;
  const setNumber = item.logged.length + 1;
  const change = item.change === 'start' || item.change === 'none'
    ? ''
    : `<span class="badge ${isProgression(item.change) ? 'up' : item.change.endsWith('-') || item.change === 'repeat' ? 'down' : ''}">${escapeHtml(CHANGE_LABELS[item.change])}</span>`;

  let logger = '';
  if (ex.kind === 'emom') {
    logger = timer === 'emom'
      ? `<div class="timer emom" id="emom">
          <div class="timer-label">Round <strong id="emom-round">1</strong> / ${item.prescription.sets}</div>
          <div class="timer-big" id="emom-left">60</div>
          <p class="muted">${input.value} swings at the top of each minute, rest the remainder.</p>
          <button type="button" class="secondary" data-action="emom-stop">Stop early</button>
        </div>`
      : complete
        ? ''
        : `<div class="logger">
            <p class="muted">Every minute on the minute: do the swings, rest until the beep. Rounds are logged automatically.</p>
            ${stepper('value', input.value, 'reps / min')}
            <button type="button" class="big" data-action="emom-start">Start ${item.prescription.sets}-min EMOM</button>
          </div>`;
  } else if (!complete) {
    const holdTimer = ex.kind === 'hold'
      ? timer === 'hold'
        ? `<div class="timer"><div class="timer-big" id="hold-elapsed">0</div>
            <p class="muted">Target ${input.value} s</p>
            <button type="button" class="big" data-action="hold-stop">Stop</button></div>`
        : `<button type="button" class="secondary" data-action="hold-start">▶ Start ${input.value}-second hold</button>`
      : '';
    logger = `
      <div class="logger">
        <h3>Set ${setNumber} of ${item.prescription.sets}</h3>
        ${holdTimer}
        ${stepper('value', input.value, unitLabel(ex, variant))}
        ${ex.kind === 'reps' ? rirPicker(input.rir, ex.rirFloor) : ''}
        ${variant.banded && input.band !== null ? bandPicker(prefs, input.band) : ''}
        <button type="button" class="big" data-action="log">Log set ${setNumber}</button>
      </div>
    `;
  }

  return `
    <header class="player-head">
      <button type="button" class="ghost" data-action="exit" aria-label="Leave workout">✕</button>
      <span>Workout ${escapeHtml(draft.workout)} · ${index + 1}/${draft.exercises.length}${draft.deload ? ' · deload' : ''}</span>
      <button type="button" class="ghost ${prefs.tempoCue ? 'on' : ''}" data-action="tempo" aria-pressed="${prefs.tempoCue ? 'true' : 'false'}" title="Tempo metronome">♩</button>
    </header>
    <section class="card exercise">
      ${renderDemo(variant.demo, base)}
      <h2>${escapeHtml(variant.name)}</h2>
      ${change}
      <div class="target">${targetLine(item, prefs)}</div>
      ${variant.hint ? `<p class="note">${escapeHtml(variant.hint)}</p>` : ''}
      <ul class="cues">${ex.cues.map((cue) => `<li>${escapeHtml(cue)}</li>`).join('')}</ul>
      ${loggedChips(item, prefs)}
      ${logger}
      ${complete && (ex.kind !== 'emom' || timer !== 'emom') ? `<p class="done">✓ All ${item.prescription.sets} ${ex.kind === 'emom' ? 'rounds' : 'sets'} done.</p>` : ''}
      <div class="row adjust">
        <button type="button" class="link" data-action="easier">Too hard: easier</button>
        ${item.logged.length > 0 ? '<button type="button" class="link" data-action="undo">Undo last set</button>' : ''}
        <button type="button" class="link" data-action="harder">Too easy: harder</button>
      </div>
    </section>
    <nav class="player-nav">
      <button type="button" class="secondary" data-action="prev">◀ Back</button>
      <button type="button" class="${complete ? '' : 'secondary'}" data-action="next">${last ? 'Finish' : complete ? 'Next exercise ▶' : 'Skip ▶'}</button>
    </nav>
  `;
}

export function renderRest(endsAt: number, total: number, now: number): string {
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  return `
    <div class="rest" role="timer" aria-live="off">
      <div class="timer-label">Rest</div>
      <div class="timer-big" id="rest-left">${formatClock(left)}</div>
      <progress id="rest-bar" max="${total}" value="${total - left}"></progress>
      <div class="row">
        <button type="button" class="secondary" data-action="rest-add">+15 s</button>
        <button type="button" data-action="rest-skip">Skip rest</button>
      </div>
    </div>
  `;
}

export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

export function renderFinish(draft: Draft, progressed: string[], pending: number, now: number): string {
  const minutes = Math.max(1, Math.round((now - draft.startedAt) / 60_000));
  const rows = draft.exercises.map((item) => {
    const ex = exercise(item.exercise);
    const values = item.logged.map((set) => (ex.kind === 'hold' ? set.seconds : set.reps) ?? 0);
    const total = values.reduce((sum, value) => sum + value, 0);
    const up = progressed.includes(item.exercise) ? '<span class="badge up">↑ level up next time</span>' : '';
    return `<li><span>${escapeHtml(findVariant(ex, item.variant).name)} ${up}</span>
      <span class="muted">${values.length === 0 ? 'skipped' : `${escapeHtml(values.join(' · '))}${ex.kind === 'hold' ? ' s' : ''} = ${total}`}</span></li>`;
  }).join('');
  return `
    <section class="card finish">
      <h2>🎉 Workout ${escapeHtml(draft.workout)} done</h2>
      <p class="muted">${minutes} min · ${draft.exercises.reduce((sum, item) => sum + item.logged.length, 0)} sets</p>
      ${progressed.length > 0 ? `<p class="note">Progression earned on ${progressed.length} exercise${progressed.length === 1 ? '' : 's'}. Next session will be a bit harder.</p>` : ''}
      <ol class="plan">${rows}</ol>
      <p class="muted">${pending > 0 ? `${pending} sets are saved on this phone and will sync when you're online.` : 'Everything is saved.'}</p>
      <p class="tip">Now: protein-rich meal, water, and a walk later counts toward your steps.</p>
      <button type="button" class="big" data-action="close-finish">Done</button>
    </section>
  `;
}

export function renderProgress(states: Record<string, ExerciseState>, prefs: Prefs): string {
  const cards = Object.values(EXERCISES).map((ex) => {
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
    return `
      <li class="card progress-card">
        <div class="split">
          <div>
            <h3>${escapeHtml(ex.name)}</h3>
            <p class="muted">${escapeHtml(variant.name)} · step ${step}${variant.banded && state.band !== null ? ` · ${escapeHtml(bandLabel(prefs, state.band))}` : ''}</p>
          </div>
          ${status}
        </div>
        <div class="split">
          <div class="spark-wrap">${sparkline(history.map((session) => session.total), { label: `${ex.name} total ${unit}` }) || '<span class="muted">Log two sessions to see a trend.</span>'}</div>
          ${lastSession ? `<div class="last"><strong>${lastSession.best}</strong> best · <strong>${lastSession.total}</strong> total<br /><small class="muted">${escapeHtml(formatDate(lastSession.date))}</small></div>` : ''}
        </div>
        <p class="small">Next: ${state.sets} × ${state.target}${ex.kind === 'hold' ? ' s' : ''} (${ex.min}–${ex.max}) · ${escapeHtml(CHANGE_LABELS[state.change])}</p>
        <div class="row adjust">
          <button type="button" class="link" data-action="override" data-exercise="${ex.id}" data-direction="-1">Easier</button>
          <button type="button" class="link" data-action="override" data-exercise="${ex.id}" data-direction="1">Harder</button>
        </div>
      </li>
    `;
  }).join('');
  return `
    <h2 class="section-title">Progress</h2>
    <p class="muted small">Hit the top of the range on every set and the next session moves you up: an extra set, a heavier band or the next variation. Two stalled sessions in a row step you back.</p>
    <ul class="list">${cards}</ul>
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
      <label class="toggle"><input type="checkbox" name="vibrate" ${prefs.vibrate ? 'checked' : ''} /> Vibration</label>
      <label class="toggle"><input type="checkbox" name="tempoCue" ${prefs.tempoCue ? 'checked' : ''} /> Tempo metronome on by default</label>
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
