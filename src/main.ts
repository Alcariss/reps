import '@alcariss/pwa-kit/styles.css';
import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import {
  ApiError,
  AUTH_ERROR_CODES,
  DEFAULT_AUTH_ERROR_MESSAGES,
  createApiClient,
  createAuth,
  createCache,
  createResource,
  createStore,
  formatAge,
  isDebugEnabled,
  readApiConfig,
  renderDiagnostics,
  renderLoginScreen,
  requiredElement,
  setupUpdatePrompt,
  toIsoDate,
  type Diagnostics
} from '@alcariss/pwa-kit';
import { alarm, keepScreenOn, tick, unlockAudio } from './cues';
import { addDays, daysBetween } from './dates';
import { startDemoLoop } from './demo-loop';
import { adjust, deloadStatus, isProgression, replay, type Change, type ExerciseState, type LoggedSet } from './engine';
import {
  setKey,
  toBody,
  toBodyParams,
  toSet,
  toSetParams,
  type BodyInput,
  type BodyRecord,
  type SetInput,
  type SetRecord
} from './model';
import { DEFAULT_PREFS, normalizePrefs, type Prefs } from './prefs';
import {
  BAND_LEVELS,
  exercise,
  findVariant,
  quickCircuit,
  remoteDemoFrame,
  type DemoKey,
  type PlanId,
  type WorkoutId
} from './program';
import { createQueue, createSlot } from './queue';
import {
  activeIndex,
  circuitAdvance,
  circuitBack,
  clampBand,
  createDraft,
  finisherDone,
  isComplete,
  isDraft,
  logSet,
  setInput,
  suggestedValue,
  type Draft,
  type DraftExercise
} from './session';
import {
  averageSeries,
  averageSteps,
  latest,
  latestWeight,
  nextWorkout,
  proteinTarget,
  quickSessionCount,
  rawWeights,
  sessionsThisWeek,
  trainingDays,
  weightTrend
} from './stats';
import {
  TABS,
  formatClock,
  renderBody,
  renderExercise,
  renderFinish,
  renderFinisher,
  renderNav,
  renderProgress,
  renderRest,
  renderSettings,
  renderToday,
  renderWarmup,
  type InputState,
  type Tab
} from './views';

const APP_NAME = 'Reps';
const LOCALE = 'en';
const BASE = import.meta.env.BASE_URL;
const CHART_DAYS = 56;

const config = readApiConfig(import.meta.env);
const auth = createAuth({ apiUrl: config.primaryUrl });
const client = createApiClient(config, { getSessionToken: () => auth.current()?.token ?? null });
const setResource = createResource(client, { table: 'sets', mapRow: toSet, toParams: toSetParams });
const bodyResource = createResource(client, { table: 'body', mapRow: toBody, toParams: toBodyParams });
const setCache = createCache<SetRecord>('reps:v1:sets');
const bodyCache = createCache<BodyRecord>('reps:v1:body');
const setStore = createStore<SetRecord, SetInput>({ resource: setResource, cache: setCache });
const bodyStore = createStore<BodyRecord, BodyInput>({ resource: bodyResource, cache: bodyCache });
const queue = createQueue<SetInput | BodyInput>('reps:v1:queue');
const draftSlot = createSlot<Draft>('reps:v1:draft');
const prefsSlot = createSlot<Prefs>('reps:v1:prefs');
const root = requiredElement('#app');
const demos = startDemoLoop(root);
const signInRequired = config.authProviders.length > 0;

type Timer =
  | { mode: 'idle' }
  | { mode: 'hold'; startedAt: number; alerted: boolean; lastBeep: number }
  | { mode: 'emom'; startedAt: number; lastBeep: number };

type State = {
  sets: SetRecord[];
  body: BodyRecord[];
  tab: Tab;
  draft: Draft | null;
  prefs: Prefs;
  chosen: PlanId | null;
  input: InputState;
  timer: Timer;
  progressed: Record<string, Change>;
  restBeep: number;
  tempoTick: number;
};

const state: State = {
  sets: [],
  body: [],
  tab: 'today',
  draft: null,
  prefs: normalizePrefs(prefsSlot.load() ?? DEFAULT_PREFS),
  chosen: null,
  input: { value: 0, rir: null, band: null },
  timer: { mode: 'idle' },
  progressed: {},
  restBeep: -1,
  tempoTick: -1
};

setupUpdatePrompt(registerSW);

function today(): string {
  return toIsoDate();
}

function inPlayer(): boolean {
  return location.hash === '#workout' && state.draft !== null;
}

function tabFromHash(): Tab {
  const id = location.hash.replace(/^#/, '');
  return TABS.find((tab) => tab.id === id)?.id ?? 'today';
}

// ---------- data ----------

function pendingSets(): SetInput[] {
  return queue.items().filter((item) => item.table === 'sets').map((item) => item.input as SetInput);
}

function pendingBody(): BodyRecord[] {
  return queue.items()
    .filter((item) => item.table === 'body')
    .map((item) => ({ ...(item.input as BodyInput), id: item.key }));
}

/** Server sets plus the ones still waiting in the queue, without duplicates. */
function allSetInputs(): SetInput[] {
  const known = new Set(state.sets.map(setKey));
  return [...state.sets, ...pendingSets().filter((set) => !known.has(setKey(set)))];
}

function allSets(): LoggedSet[] {
  return allSetInputs();
}

function allBody(): BodyRecord[] {
  return [...state.body, ...pendingBody()];
}

function sessionLog(): { date: string; workout: WorkoutId }[] {
  return trainingDays(allSetInputs());
}

function states(): Record<string, ExerciseState> {
  return replay(allSets(), {
    resetAfter: state.prefs.deloadFrom === null ? null : addDays(state.prefs.deloadFrom, 6),
    overrides: state.prefs.overrides
  });
}

function savePrefs(): void {
  prefsSlot.save(state.prefs);
}

function saveDraft(): void {
  if (state.draft) {
    draftSlot.save(state.draft);
  } else {
    draftSlot.clear();
  }
}

let syncing = false;

async function sync(): Promise<void> {
  if (syncing || queue.size() === 0) {
    updateSyncBadge();
    return;
  }
  syncing = true;
  updateSyncBadge();
  const known = new Set(state.sets.map(setKey));
  let authError: unknown = null;
  try {
    await queue.flush(async (item) => {
      try {
        if (item.table === 'sets') {
          const saved = await setResource.create(item.input as SetInput);
          state.sets.push(saved);
          setCache.save(state.sets);
        } else {
          const saved = await bodyResource.create(item.input as BodyInput);
          state.body.push(saved);
          bodyCache.save(state.body);
        }
      } catch (error) {
        if (error instanceof ApiError && AUTH_ERROR_CODES.includes(error.code)) {
          authError = error;
        }
        throw error;
      }
    }, (item) => item.table === 'sets' && known.has(setKey(item.input as SetInput)));
  } finally {
    syncing = false;
  }
  updateSyncBadge();
  if (authError !== null) {
    handleError(authError, 'Could not sync.');
  } else if (!inPlayer() && state.tab !== 'settings' && state.tab !== 'body') {
    render();
  }
}

function updateSyncBadge(): void {
  const node = document.querySelector('#sync');
  if (!node) {
    return;
  }
  const pending = queue.size();
  node.textContent = syncing ? 'Syncing…' : pending > 0 ? `${pending} not synced` : navigator.onLine ? '' : 'Offline';
}

// ---------- shell ----------

function showLogin(message: string | null = null): void {
  setStore.clear();
  bodyStore.clear();
  renderLoginScreen(root, {
    title: `💪 ${APP_NAME}`,
    providers: config.authProviders,
    message,
    onSelect: (provider) => auth.login(provider)
  });
}

function showShell(): void {
  root.innerHTML = `
    <header class="topbar">
      <h1>💪 ${APP_NAME}</h1>
      <span id="sync" class="sync" role="status"></span>
    </header>
    <main id="view" class="container"></main>
    <section id="debug" class="container"></section>
    <div id="rest-layer"></div>
    <nav id="nav" class="tabs" aria-label="Sections"></nav>
    <div id="toast" class="toast" role="status" hidden></div>
  `;
  requiredElement('#nav').addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-tab]');
    if (button?.dataset.tab) {
      location.hash = button.dataset.tab;
    }
  });
  window.addEventListener('hashchange', () => {
    state.tab = tabFromHash();
    render();
  });
  root.addEventListener('click', (event) => void onAction(event));
  root.addEventListener('submit', (event) => void onSubmit(event));
  // Missing local demo frames fall back to the original public-domain images.
  root.addEventListener('error', (event) => {
    const img = event.target;
    if (img instanceof HTMLImageElement && img.dataset.demo && !img.dataset.fallback) {
      img.dataset.fallback = '1';
      img.src = remoteDemoFrame(img.dataset.demo as DemoKey, img.dataset.frame === '1' ? 1 : 0);
    }
  }, true);
}

function toast(message: string, tone: 'info' | 'error' = 'info'): void {
  const node = document.querySelector<HTMLElement>('#toast');
  if (!node) {
    return;
  }
  node.textContent = message;
  node.dataset.tone = tone;
  node.hidden = false;
  window.clearTimeout(Number(node.dataset.timer));
  node.dataset.timer = String(window.setTimeout(() => {
    node.hidden = true;
  }, tone === 'error' ? 6000 : 2500));
}

function render(): void {
  const view = document.querySelector<HTMLElement>('#view');
  if (!view) {
    return;
  }
  const player = inPlayer();
  document.body.classList.toggle('in-player', player);
  keepScreenOn(player);
  const nav = requiredElement('#nav');
  nav.innerHTML = renderNav(state.tab);
  nav.hidden = player;

  if (player && state.draft) {
    renderPlayer(view, state.draft);
    updateSyncBadge();
    return;
  }
  requiredElement('#rest-layer').innerHTML = '';

  const date = today();
  switch (state.tab) {
    case 'today': {
      const exerciseStates = states();
      const days = sessionLog();
      const next = nextWorkout(days, date);
      const deload = deloadStatus(exerciseStates, days[0]?.date ?? null, date, state.prefs.deloadFrom);
      view.innerHTML = renderToday({
        today: date,
        next,
        chosen: state.chosen ?? next.workout,
        quick: quickCircuit(quickSessionCount(days, date)),
        states: exerciseStates,
        deload,
        deloadUntil: state.prefs.deloadFrom === null ? null : addDays(state.prefs.deloadFrom, 6),
        sessionsThisWeek: sessionsThisWeek(days, date),
        trend: weightTrend(allBody(), date),
        draft: state.draft,
        pending: queue.size()
      });
      break;
    }
    case 'progress':
      view.innerHTML = renderProgress(states(), state.prefs);
      break;
    case 'body': {
      const body = allBody();
      const earliest = addDays(date, -(CHART_DAYS - 1));
      const first = rawWeights(body, earliest)[0]?.date ?? earliest;
      const chartDays = Math.max(7, daysBetween(first, date) + 1);
      const from = addDays(date, -(chartDays - 1));
      view.innerHTML = renderBody({
        today: date,
        body: state.body,
        trend: weightTrend(body, date),
        protein: proteinTarget(latestWeight(body)),
        steps: averageSteps(body, date),
        waist: latest(body, 'waist'),
        raw: rawWeights(body, from),
        average: averageSeries(body, date, chartDays),
        chartFrom: from,
        chartDays,
        pendingBody: pendingBody()
      });
      break;
    }
    case 'settings':
      view.innerHTML = renderSettings(state.prefs, {
        email: auth.current()?.email ?? null,
        signInRequired,
        version: __APP_VERSION__,
        pending: queue.size()
      });
      break;
  }
  updateSyncBadge();
}

// ---------- workout player ----------

function currentItem(): DraftExercise | undefined {
  const draft = state.draft;
  return draft ? draft.exercises[activeIndex(draft)] : undefined;
}

function inFinisher(draft: Draft): boolean {
  return draft.circuit !== undefined && draft.step === draft.circuit.size;
}

function renderPlayer(view: HTMLElement, draft: Draft): void {
  if (draft.step < 0) {
    view.innerHTML = renderWarmup(draft, BASE);
  } else if (draft.step >= draft.exercises.length) {
    view.innerHTML = renderFinish(draft, state.progressed, queue.size(), Date.now());
  } else if (inFinisher(draft)) {
    view.innerHTML = renderFinisher(draft, BASE, state.input, state.timer.mode, activeIndex(draft), Date.now());
  } else {
    view.innerHTML = renderExercise(draft, state.prefs, BASE, state.input, state.timer.mode);
  }
  renderRestLayer();
}

function renderRestLayer(): void {
  const layer = requiredElement('#rest-layer');
  const draft = state.draft;
  if (!draft?.restEndsAt || !inPlayer()) {
    layer.innerHTML = '';
    return;
  }
  // In the circuit the position has already moved on: show what comes next.
  const next = draft.circuit ? currentItem() : undefined;
  const upNext = draft.circuit
    ? inFinisher(draft) ? 'Finisher: swings + plank' : next ? findVariant(exercise(next.exercise), next.variant).name : null
    : null;
  layer.innerHTML = renderRest(draft.restEndsAt, draft.restTotal, Date.now(), upNext);
}

function resetInput(): void {
  const item = currentItem();
  if (!item) {
    return;
  }
  const variant = findVariant(exercise(item.exercise), item.variant);
  const lastRir = item.logged.at(-1)?.rir ?? null;
  state.input = {
    value: suggestedValue(item),
    rir: lastRir ?? 2,
    band: variant.banded ? item.band ?? 2 : null
  };
}

function goToStep(step: number): void {
  const draft = state.draft;
  if (!draft) {
    return;
  }
  stopTimer();
  draft.step = Math.max(-1, Math.min(draft.exercises.length - 1, step));
  enteredStep(draft);
  resetInput();
  saveDraft();
  render();
  window.scrollTo({ top: 0 });
}

/** Circuit navigation: next/previous exercise, round, or the finisher. */
function moveCircuit(direction: 1 | -1): void {
  const draft = state.draft;
  if (!draft) {
    return;
  }
  stopTimer();
  if (direction === 1) {
    circuitAdvance(draft);
  } else {
    circuitBack(draft);
  }
  enteredStep(draft);
  resetInput();
  saveDraft();
  render();
  window.scrollTo({ top: 0 });
}

function enteredStep(draft: Draft): void {
  if (draft.circuit && inFinisher(draft) && draft.circuit.finisherStartedAt === null) {
    draft.circuit.finisherStartedAt = Date.now();
  }
}

function startWorkout(quick = false): void {
  unlockAudio();
  const exerciseStates = states();
  const days = sessionLog();
  const date = today();
  const workout: WorkoutId = quick ? 'Q' : state.chosen ?? nextWorkout(days, date).workout;
  const deload = deloadStatus(exerciseStates, days[0]?.date ?? null, date, state.prefs.deloadFrom);
  state.draft = createDraft({
    workout,
    date,
    deload: deload.active,
    states: exerciseStates,
    sets: allSets(),
    now: Date.now(),
    quickCount: quickSessionCount(days, date)
  });
  state.progressed = {};
  saveDraft();
  location.hash = 'workout';
}

function startRest(seconds: number): void {
  const draft = state.draft;
  if (!draft || seconds <= 0) {
    return;
  }
  draft.restEndsAt = Date.now() + seconds * 1000;
  draft.restTotal = seconds;
  state.restBeep = -1;
}

function logCurrentSet(values?: { value: number; rir: number | null }): void {
  const draft = state.draft;
  const item = currentItem();
  if (!draft || !item) {
    return;
  }
  const ex = exercise(item.exercise);
  const variant = findVariant(ex, item.variant);
  const value = Math.max(0, Math.round(values?.value ?? state.input.value));
  if (value <= 0) {
    toast('Enter at least 1.', 'error');
    return;
  }
  const index = activeIndex(draft);
  const set = logSet(draft, index, {
    reps: ex.kind === 'hold' ? null : value,
    seconds: ex.kind === 'hold' ? value : null,
    rir: ex.kind === 'reps' ? (values ? values.rir : state.input.rir) : null,
    band: variant.banded ? state.input.band : null
  });
  if (set.band !== null) {
    item.band = set.band;
  }
  const input = setInput(draft, item, set);
  queue.add(setKey(input), 'sets', input);

  if (draft.circuit) {
    logCircuitSet(draft, index, item);
    return;
  }

  const lastExercise = draft.step === draft.exercises.length - 1;
  if (ex.kind !== 'emom' && !(lastExercise && isComplete(item))) {
    startRest(item.rest ?? ex.restSeconds);
  }
  saveDraft();
  if (ex.kind !== 'emom') {
    resetInput();
    render();
  } else {
    setText('#emom-round', String(Math.min(item.prescription.sets, item.logged.length + 1)));
  }
  void sync();
}

function logCircuitSet(draft: Draft, index: number, item: DraftExercise): void {
  const circuit = draft.circuit;
  if (!circuit) {
    return;
  }
  if (index < circuit.size) {
    // Exercise → rest → next exercise (or next round, or the finisher).
    circuitAdvance(draft);
    enteredStep(draft);
    startRest(item.rest ?? exercise(item.exercise).restSeconds);
  } else if (finisherDone(draft)) {
    void sync();
    finishWorkout();
    return;
  } else if (exercise(item.exercise).kind !== 'hold') {
    // Swings done: the plank starts after a 3-second count-in.
    state.timer = { mode: 'hold', startedAt: Date.now() + 3000, alerted: false, lastBeep: -1 };
  } else {
    stopTimer();
  }
  saveDraft();
  resetInput();
  render();
  window.scrollTo({ top: 0 });
  void sync();
}

async function undoLastSet(): Promise<void> {
  const draft = state.draft;
  const item = currentItem();
  const set = item?.logged.at(-1);
  if (!draft || !item || !set) {
    return;
  }
  const input = setInput(draft, item, set);
  const key = setKey(input);
  const saved = state.sets.find((candidate) => setKey(candidate) === key);
  if (saved) {
    try {
      await setResource.remove(saved.id);
      state.sets = state.sets.filter((candidate) => candidate.id !== saved.id);
      setCache.save(state.sets);
    } catch (error) {
      handleError(error, 'Could not undo the saved set.');
      return;
    }
  }
  queue.remove(key);
  item.logged.pop();
  draft.restEndsAt = null;
  saveDraft();
  resetInput();
  render();
}

function finishWorkout(): void {
  const draft = state.draft;
  if (!draft) {
    return;
  }
  stopTimer();
  draft.restEndsAt = null;
  draft.step = draft.exercises.length;
  // Today's log now decides the next prescription; drop the manual overrides it used.
  for (const item of draft.exercises) {
    if (item.logged.length > 0) {
      delete state.prefs.overrides[item.exercise];
    }
  }
  savePrefs();
  const after = states();
  const counted = draft.circuit ? draft.exercises.slice(0, draft.circuit.size) : draft.exercises;
  state.progressed = {};
  for (const item of counted) {
    const result = after[item.exercise];
    if (item.logged.length > 0 && result !== undefined && result.lastDate === draft.date && isProgression(result.change)) {
      state.progressed[item.exercise] = result.change;
    }
  }
  saveDraft();
  render();
  window.scrollTo({ top: 0 });
  void sync();
}

function closeWorkout(): void {
  state.draft = null;
  state.chosen = null;
  saveDraft();
  stopTimer();
  location.hash = 'today';
}

function adjustCurrent(direction: 1 | -1): void {
  const draft = state.draft;
  const item = currentItem();
  if (!draft || !item) {
    return;
  }
  const ex = exercise(item.exercise);
  const band = state.input.band ?? item.band;
  const next = adjust(item.exercise, { variant: item.variant, band }, direction);
  if (next.variant === item.variant && next.band === band) {
    toast(direction === 1 ? 'Already the hardest step.' : 'Already the easiest step.');
    return;
  }
  if (next.variant !== item.variant && item.logged.length > 0) {
    toast('Undo this exercise’s sets before switching variation.', 'error');
    return;
  }
  item.variant = next.variant;
  item.band = next.band;
  item.change = 'manual';
  state.prefs.overrides[item.exercise] = { variant: next.variant, band: next.band, date: draft.date };
  savePrefs();
  saveDraft();
  resetInput();
  toast(`${findVariant(ex, next.variant).name}${next.band === null ? '' : `, band L${next.band}`}`);
  render();
}

// ---------- timers ----------

function stopTimer(): void {
  state.timer = { mode: 'idle' };
}

function signals(): { sound: boolean; vibrate: boolean } {
  return { sound: state.prefs.sound, vibrate: state.prefs.vibrate };
}

function setText(selector: string, text: string): void {
  const node = document.querySelector(selector);
  if (node && node.textContent !== text) {
    node.textContent = text;
  }
}

function onTick(): void {
  const draft = state.draft;
  if (!draft || !inPlayer()) {
    return;
  }
  const now = Date.now();
  if (draft.circuit?.finisherStartedAt != null && inFinisher(draft)) {
    setText('#finisher-clock', formatClock((now - draft.circuit.finisherStartedAt) / 1000));
  }

  if (draft.restEndsAt !== null) {
    const left = Math.ceil((draft.restEndsAt - now) / 1000);
    if (left <= 0) {
      draft.restEndsAt = null;
      saveDraft();
      alarm(signals());
      renderRestLayer();
    } else {
      setText('#rest-left', formatClock(left));
      const bar = document.querySelector<HTMLProgressElement>('#rest-bar');
      if (bar) {
        bar.value = draft.restTotal - left;
      }
      if (left <= 3 && left !== state.restBeep) {
        state.restBeep = left;
        tick(signals());
      }
    }
    return;
  }

  const timer = state.timer;
  if (timer.mode === 'hold') {
    const elapsed = (now - timer.startedAt) / 1000;
    if (elapsed < 0) {
      const count = Math.ceil(-elapsed);
      setText('#hold-elapsed', `Ready… ${count}`);
      if (count !== timer.lastBeep) {
        timer.lastBeep = count;
        tick(signals());
      }
      return;
    }
    if (timer.lastBeep !== 0) {
      timer.lastBeep = 0;
      tick(signals(), true);
    }
    setText('#hold-elapsed', `${Math.floor(elapsed)} s`);
    if (!timer.alerted && elapsed >= state.input.value) {
      timer.alerted = true;
      alarm(signals());
    }
    return;
  }

  if (timer.mode === 'emom') {
    const item = draft.exercises[draft.step];
    if (!item) {
      return;
    }
    const elapsed = (now - timer.startedAt) / 1000;
    if (elapsed < 0) {
      setText('#emom-left', `Ready… ${Math.ceil(-elapsed)}`);
      return;
    }
    const minute = Math.floor(elapsed / 60);
    if (minute !== timer.lastBeep) {
      timer.lastBeep = minute;
      if (minute > 0) {
        // The minute that just ended counts as a round.
        logCurrentSet({ value: state.input.value, rir: null });
      }
      if (isComplete(item)) {
        stopTimer();
        alarm(signals());
        render();
        return;
      }
      tick(signals(), true);
    }
    setText('#emom-left', String(Math.max(1, 60 - Math.floor(elapsed % 60))));
    return;
  }

  // Tempo metronome: one click per second, accented at the start of each rep.
  const item = currentItem();
  if (state.prefs.tempoCue && item) {
    const ex = exercise(item.exercise);
    const tempo = findVariant(ex, item.variant).tempo;
    if (ex.kind === 'reps' && tempo) {
      const cycle = Math.max(2, tempo.split('-').reduce((sum, part) => sum + Number(part), 0));
      const second = Math.floor(now / 1000);
      if (second !== state.tempoTick) {
        state.tempoTick = second;
        tick(signals(), second % cycle === 0);
      }
    }
  }
}

// ---------- actions ----------

async function onAction(event: Event): Promise<void> {
  const button = (event.target as Element).closest<HTMLButtonElement>('[data-action]');
  if (!button) {
    return;
  }
  const draft = state.draft;
  switch (button.dataset.action) {
    case 'start':
      startWorkout();
      break;
    case 'start-quick':
      startWorkout(true);
      break;
    case 'finish':
      if (confirm('Finish the workout now?')) {
        finishWorkout();
      }
      break;
    case 'resume':
      unlockAudio();
      resetInput();
      location.hash = 'workout';
      break;
    case 'discard':
      if (confirm('End this workout? Sets you logged stay saved.')) {
        closeWorkout();
      }
      break;
    case 'swap-workout': {
      const current = state.chosen ?? nextWorkout(sessionLog(), today()).workout;
      state.chosen = current === 'A' ? 'B' : 'A';
      render();
      break;
    }
    case 'exit':
      stopTimer();
      location.hash = 'today';
      break;
    case 'warmup':
      if (draft) {
        const index = Number(button.dataset.index);
        draft.warmup[index] = !draft.warmup[index];
        saveDraft();
        render();
      }
      break;
    case 'next':
      unlockAudio();
      if (draft?.circuit) {
        moveCircuit(1);
      } else if (draft) {
        if (draft.step === draft.exercises.length - 1) {
          finishWorkout();
        } else {
          goToStep(draft.step + 1);
        }
      }
      break;
    case 'prev':
      if (draft?.circuit) {
        moveCircuit(-1);
      } else if (draft) {
        goToStep(draft.step - 1);
      }
      break;
    case 'step': {
      const item = currentItem();
      const size = item && exercise(item.exercise).kind === 'hold' ? 5 : 1;
      state.input.value = Math.max(1, state.input.value + Number(button.dataset.delta) * size);
      setText('#value-value strong', String(state.input.value));
      break;
    }
    case 'rir':
      state.input.rir = Number(button.dataset.rir);
      for (const option of document.querySelectorAll<HTMLButtonElement>('[data-action="rir"]')) {
        option.setAttribute('aria-pressed', option === button ? 'true' : 'false');
      }
      break;
    case 'band':
      if (state.input.band !== null) {
        state.input.band = clampBand(state.input.band + Number(button.dataset.delta));
        render();
      }
      break;
    case 'log':
      unlockAudio();
      logCurrentSet();
      break;
    case 'undo':
      await undoLastSet();
      break;
    case 'easier':
      adjustCurrent(-1);
      break;
    case 'harder':
      adjustCurrent(1);
      break;
    case 'tempo':
      unlockAudio();
      state.prefs.tempoCue = !state.prefs.tempoCue;
      savePrefs();
      render();
      break;
    case 'rest-add':
      if (draft?.restEndsAt) {
        draft.restEndsAt += 15_000;
        draft.restTotal += 15;
        saveDraft();
        renderRestLayer();
      }
      break;
    case 'rest-skip':
      if (draft) {
        draft.restEndsAt = null;
        saveDraft();
        renderRestLayer();
      }
      break;
    case 'hold-start':
      unlockAudio();
      state.timer = { mode: 'hold', startedAt: Date.now() + 3000, alerted: false, lastBeep: -1 };
      render();
      break;
    case 'hold-stop':
      if (state.timer.mode === 'hold') {
        const seconds = Math.floor((Date.now() - state.timer.startedAt) / 1000);
        stopTimer();
        if (seconds > 0) {
          logCurrentSet({ value: seconds, rir: null });
        } else {
          render();
        }
      }
      break;
    case 'emom-start':
      unlockAudio();
      state.timer = { mode: 'emom', startedAt: Date.now() + 3000, lastBeep: -1 };
      render();
      break;
    case 'emom-stop':
      stopTimer();
      render();
      break;
    case 'demo-toggle':
      demos.toggle();
      break;
    case 'zoom-demo':
      button.closest('.ex-top')?.classList.toggle('zoomed');
      break;
    case 'close-finish':
      closeWorkout();
      break;
    case 'start-deload':
      state.prefs.deloadFrom = today();
      savePrefs();
      toast('Deload week started: half the sets, 3–4 RIR.');
      render();
      break;
    case 'end-deload':
      state.prefs.deloadFrom = addDays(today(), -7);
      savePrefs();
      render();
      break;
    case 'sync':
      await sync();
      toast(queue.size() === 0 ? 'Everything is synced.' : 'Still offline. Will retry.', queue.size() === 0 ? 'info' : 'error');
      render();
      break;
    case 'override': {
      const exerciseId = button.dataset.exercise ?? '';
      const current = states()[exerciseId];
      if (!current) {
        break;
      }
      const next = adjust(exerciseId, current, button.dataset.direction === '1' ? 1 : -1);
      state.prefs.overrides[exerciseId] = { ...next, date: today() };
      savePrefs();
      toast(`Next time: ${findVariant(exercise(exerciseId), next.variant).name}${next.band === null ? '' : ` (band L${next.band})`}`);
      render();
      break;
    }
    case 'delete-body': {
      const id = button.dataset.id;
      if (id && confirm('Delete this entry?')) {
        try {
          state.body = (await bodyStore.remove(id)).items;
          render();
        } catch (error) {
          handleError(error, 'Could not delete.');
        }
      }
      break;
    }
    case 'logout':
      auth.logout();
      showLogin();
      break;
  }
}

function readNumber(form: HTMLFormElement, name: string): number | null {
  const field = form.elements.namedItem(name) as HTMLInputElement | null;
  if (!field || field.value.trim() === '') {
    return null;
  }
  const value = Number(field.value.replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function readText(form: HTMLFormElement, name: string): string {
  return (form.elements.namedItem(name) as HTMLInputElement | null)?.value ?? '';
}

async function onSubmit(event: Event): Promise<void> {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) {
    return;
  }
  event.preventDefault();
  if (form.id === 'body-form') {
    const input: BodyInput = {
      date: readText(form, 'date') || today(),
      weight: readNumber(form, 'weight'),
      waist: readNumber(form, 'waist'),
      steps: readNumber(form, 'steps'),
      protein: readNumber(form, 'protein'),
      note: readText(form, 'note')
    };
    if (input.weight === null && input.waist === null && input.steps === null && input.protein === null && input.note.trim() === '') {
      toast('Fill in at least one value.', 'error');
      return;
    }
    queue.add(`body|${Date.now()}`, 'body', input);
    toast('Saved.');
    render();
    await sync();
    render();
  } else if (form.id === 'settings-form') {
    const data = new FormData(form);
    state.prefs = normalizePrefs({
      ...state.prefs,
      bandNames: Array.from({ length: BAND_LEVELS }, (_, index) => String(data.get(`band-${index}`) ?? '')),
      sound: data.get('sound') === 'on',
      vibrate: data.get('vibrate') === 'on',
      tempoCue: data.get('tempoCue') === 'on'
    });
    savePrefs();
    toast('Settings saved.');
    render();
  }
}

function handleError(error: unknown, message: string): void {
  if (error instanceof ApiError && AUTH_ERROR_CODES.includes(error.code)) {
    // Logged sets stay in the queue and sync after signing in again.
    auth.logout();
    showLogin(error.code === 'FORBIDDEN'
      ? DEFAULT_AUTH_ERROR_MESSAGES.not_allowed
      : 'Your session has expired. Sign in again.');
    return;
  }
  console.error(error);
  const offline = error instanceof ApiError && ['NETWORK_ERROR', 'TIMEOUT'].includes(error.code);
  toast(`${message} ${offline ? 'You are offline.' : error instanceof Error ? error.message : ''}`.trim(), 'error');
}

function showDiagnostics(diagnostics: Diagnostics): void {
  if (isDebugEnabled()) {
    renderDiagnostics(requiredElement('#debug'), diagnostics, { Version: __APP_VERSION__, Queue: String(queue.size()) });
  }
}

async function refresh(): Promise<void> {
  try {
    const [sets, body] = await Promise.all([setStore.refresh(), bodyStore.refresh()]);
    state.sets = sets.items;
    state.body = body.items;
    if (sets.diagnostics.source === 'cache') {
      toast(`Offline: data from ${formatAge((sets.diagnostics.cacheAgeSeconds ?? 0) * 1000, LOCALE)}.`);
    }
    showDiagnostics(sets.diagnostics);
  } catch (error) {
    handleError(error, 'Could not load your log.');
  }
}

async function start(): Promise<void> {
  const outcome = auth.completeLogin();
  if (outcome.status === 'failed') {
    showLogin(DEFAULT_AUTH_ERROR_MESSAGES[outcome.reason] ?? 'Sign-in failed. Try again.');
    return;
  }
  if (signInRequired && auth.current() === null) {
    showLogin();
    return;
  }

  showShell();
  const savedDraft = draftSlot.load();
  state.draft = isDraft(savedDraft) ? savedDraft : null;
  const restEndsAt = state.draft?.restEndsAt ?? null;
  if (state.draft && restEndsAt !== null && restEndsAt < Date.now()) {
    state.draft.restEndsAt = null;
  }
  state.sets = setStore.loadCached()?.items ?? [];
  state.body = bodyStore.loadCached()?.items ?? [];
  state.tab = tabFromHash();
  if (state.draft) {
    resetInput();
  } else if (location.hash === '#workout') {
    history.replaceState(null, '', '#today');
  }
  render();

  await refresh();
  if (!inPlayer()) {
    render();
  }
  await sync();

  window.addEventListener('online', () => void sync());
  window.addEventListener('offline', updateSyncBadge);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void sync();
    }
  });
  window.setInterval(onTick, 250);
}

void start();
