import { definePwaApp } from '@alcariss/pwa-kit/vite';

export default definePwaApp({
  name: 'Reps',
  description: 'Kettlebell, band and bodyweight workouts with timers, tracking and progressive overload.',
  lang: 'en',
  themeColor: '#0f172a',
  backgroundColor: '#0f172a',
  // Exercise demo frames are precached so the workout player works offline.
  includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'logo.svg', 'exercises/*.webp']
});
