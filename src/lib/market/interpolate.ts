/**
 * The tween the `requestAnimationFrame` driver runs between server anchors.
 *
 * **This does not invent price movement.** An earlier draft of `build-plan.md`
 * described "micro-ticks ... bounded so it never drifts beyond a small band",
 * which is jitter around the anchor — figures no provider reported and the
 * market never traded at. `architecture.md` → Interpolated values is
 * authoritative and says the loop "moves prices between server anchors", so
 * every value this returns lies on the closed segment between two prices that
 * were really observed.
 *
 * That is also why there is no band constant here. The bound is structural: the
 * output cannot leave `[min(from, to), max(from, to)]`, which is strictly
 * stronger than a percentage window and is what the tier-1 suite asserts.
 *
 * Pure and DOM-free, because tier 1 runs in node with no jsdom.
 */

/**
 * How long a price takes to travel from its old anchor to its new one.
 *
 * Short on purpose. The alternative — spreading the tween across the whole
 * ~60s gap between ticks — looks livelier but leaves the display permanently
 * behind the truth, which matters once F20 badges freshness.
 */
export const TWEEN_DURATION_MS = 800

/**
 * Fast at first, settling at the end. A linear ramp reads as mechanical, and
 * easing *in* would make a price appear to hesitate before moving.
 */
export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3
}

/**
 * Where the displayed price sits `elapsedMs` into its journey.
 *
 * Clamped at both ends rather than extrapolated: a frame that arrives late — a
 * backgrounded tab, a slow paint — must land exactly on the anchor, never past
 * it. Overshooting would put a price on screen that is not between two observed
 * values, which is the one thing this module exists to prevent.
 */
export function tweenAt(
  from: number,
  to: number,
  elapsedMs: number,
  durationMs: number = TWEEN_DURATION_MS
): number {
  if (durationMs <= 0) return to
  const t = elapsedMs / durationMs
  if (t <= 0) return from
  if (t >= 1) return to
  return from + (to - from) * easeOutCubic(t)
}

/** True while a price still has distance to travel. */
export function isTweening(elapsedMs: number, durationMs: number = TWEEN_DURATION_MS): boolean {
  return elapsedMs < durationMs
}
