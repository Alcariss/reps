// In-memory stand-in for the pwa-kit worker's `reps` app, for UI work
// without Grist or sign-in. Data is lost when it stops.
//   node scripts/stub-api.mjs [--seed]
//   VITE_API_URL_PRIMARY=http://localhost:8787/reps VITE_AUTH_PROVIDERS= npm run dev
// MEDIA_DIR=<folder of <name>.gif files> serves the private demo GIFs (?action=media).
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';

const NUMBER_FIELDS = new Set(['setNumber', 'reps', 'seconds', 'rir', 'band', 'weight', 'waist', 'steps', 'protein']);
const FIELDS = {
  sets: ['date', 'workout', 'exercise', 'variant', 'setNumber', 'reps', 'seconds', 'rir', 'band', 'note'],
  body: ['date', 'weight', 'waist', 'steps', 'protein', 'note']
};
const tables = { sets: [], body: [] };
let nextId = 1;

function isoDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toLocaleDateString('sv-SE');
}

function insert(table, values) {
  const now = new Date().toISOString();
  const row = { id: String(nextId++), ...values, createdAt: now, updatedAt: now };
  tables[table].push(row);
  return row;
}

if (process.argv.includes('--seed')) {
  const plan = [
    [9, 'A', [['squat', 'goblet-squat', 12], ['pushup', 'band-pushup', 9, 2], ['row', 'band-row', 15, 2], ['rdl', 'kb-rdl', 12]]],
    [7, 'B', [['split-squat', 'kb-split-squat', 10], ['rdl', 'kb-rdl', 13], ['press', 'half-kneeling-press', 8], ['row', 'band-row', 17, 2]]],
    [5, 'A', [['squat', 'goblet-squat', 14], ['pushup', 'band-pushup', 11, 2], ['row', 'band-row', 20, 2], ['rdl', 'kb-rdl', 15]]],
    [2, 'B', [['split-squat', 'kb-split-squat', 11], ['rdl', 'kb-rdl', 15], ['press', 'half-kneeling-press', 9], ['row', 'band-row', 20, 2]]]
  ];
  for (const [ago, workout, exercises] of plan) {
    for (const [exercise, variant, reps, band = null] of exercises) {
      for (let setNumber = 1; setNumber <= 3; setNumber += 1) {
        insert('sets', { date: isoDaysAgo(ago), workout, exercise, variant, setNumber, reps, seconds: null, rir: 2, band, note: '' });
      }
    }
  }
  for (let ago = 20; ago >= 1; ago -= 1) {
    insert('body', { date: isoDaysAgo(ago), weight: Math.round((95 - (20 - ago) * 0.09 + Math.sin(ago) * 0.4) * 10) / 10, waist: ago % 7 === 0 ? 102 - (20 - ago) * 0.1 : null, steps: 6000 + (ago % 5) * 800, protein: 150, note: '' });
  }
}

function reply(response, data, errorCode = null, status = 200) {
  const meta = { apiVersion: '2.1.0', schemaVersion: 1, source: 'primary', fetchedAt: new Date().toISOString() };
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Accept'
  });
  response.end(JSON.stringify(errorCode ? { success: false, data: null, meta, errorCode, message: errorCode } : { success: true, data, meta }));
}

createServer((request, response) => {
  if (request.method === 'OPTIONS') {
    return reply(response, null);
  }
  const url = new URL(request.url ?? '/', 'http://localhost');
  const params = url.searchParams;
  if (params.get('action') === 'media') {
    const name = params.get('name') ?? '';
    if (!process.env.MEDIA_DIR || !/^[a-z0-9-]+\.gif$/.test(name)) {
      return reply(response, null, 'NOT_FOUND', 404);
    }
    readFile(join(process.env.MEDIA_DIR, name)).then(
      (bytes) => {
        response.writeHead(200, { 'Content-Type': 'image/gif', 'Access-Control-Allow-Origin': '*' });
        response.end(bytes);
      },
      () => reply(response, null, 'NOT_FOUND', 404)
    );
    return;
  }
  const table = params.get('table');
  if (!(table in tables)) {
    return reply(response, null, 'VALIDATION_ERROR', 400);
  }
  const values = {};
  for (const field of FIELDS[table]) {
    const raw = params.get(field);
    values[field] = raw === null || raw === '' ? (NUMBER_FIELDS.has(field) ? null : '') : NUMBER_FIELDS.has(field) ? Number(raw) : raw;
  }
  switch (params.get('action')) {
    case 'fetch':
      return reply(response, [...tables[table]].sort((a, b) => b.date.localeCompare(a.date)));
    case 'add':
      return reply(response, insert(table, values));
    case 'edit': {
      const row = tables[table].find((candidate) => candidate.id === params.get('id'));
      if (!row) {
        return reply(response, null, 'NOT_FOUND', 404);
      }
      Object.assign(row, values, { updatedAt: new Date().toISOString() });
      return reply(response, row);
    }
    case 'delete':
      tables[table] = tables[table].filter((candidate) => candidate.id !== params.get('id'));
      return reply(response, null);
    default:
      return reply(response, null, 'UNSUPPORTED_ACTION', 400);
  }
}).listen(8787, () => console.log('stub reps API on http://localhost:8787/reps'));
