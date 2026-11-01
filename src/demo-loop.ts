/**
 * Exercise demos flip between their start and end frames like a GIF. A JS
 * timer drives it, not a CSS animation: iOS "Reduce Motion" (and our own
 * reduced-motion styles) would otherwise freeze an instructional image.
 * One shared pause flag, so a re-render keeps the user's choice.
 */
export function startDemoLoop(root: ParentNode, intervalMs = 1000): { toggle(): boolean; isPaused(): boolean } {
  let frame = 0;
  let paused = false;

  const apply = (): void => {
    for (const demo of root.querySelectorAll<HTMLElement>('.demo')) {
      demo.classList.toggle('paused', paused);
      demo.setAttribute('aria-pressed', paused ? 'true' : 'false');
      if (!paused) {
        demo.dataset.show = String(frame);
      }
    }
  };

  window.setInterval(() => {
    if (!paused) {
      frame = frame === 0 ? 1 : 0;
    }
    apply();
  }, intervalMs);

  return {
    toggle() {
      paused = !paused;
      apply();
      return paused;
    },
    isPaused: () => paused
  };
}
