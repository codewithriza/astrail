// Per-upstream-host circuit breaker. After a burst of consecutive upstream
// failures the circuit opens and calls fail fast (no upstream fetch) until the
// cooldown elapses; the first call after cooldown runs as a half-open probe.
// Like the runtime rate limiter this is an in-memory, per-instance guardrail,
// not a distributed control plane.

type CircuitState = {
  consecutiveFailures: number;
  openedAt: number | null;
  lastSeenAt: number;
  probeInFlight: boolean;
};

const circuits = new Map<string, CircuitState>();
const FAILURE_THRESHOLD = positiveInteger(process.env.ASTRAIL_CIRCUIT_FAILURE_THRESHOLD, 5);
const OPEN_MS = positiveInteger(process.env.ASTRAIL_CIRCUIT_OPEN_MS, 30_000);
const MAX_CIRCUITS = positiveInteger(process.env.ASTRAIL_CIRCUIT_MAX_HOSTS, 5_000);

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function evictOldestCircuit() {
  let oldestKey: string | null = null;
  let oldestSeenAt = Number.POSITIVE_INFINITY;
  for (const [key, state] of Array.from(circuits.entries())) {
    if (state.lastSeenAt < oldestSeenAt) {
      oldestSeenAt = state.lastSeenAt;
      oldestKey = key;
    }
  }
  if (oldestKey) circuits.delete(oldestKey);
}

function circuitFor(key: string, now: number) {
  const existing = circuits.get(key);
  if (existing) {
    existing.lastSeenAt = now;
    return existing;
  }
  if (circuits.size >= MAX_CIRCUITS) evictOldestCircuit();
  const created: CircuitState = { consecutiveFailures: 0, openedAt: null, lastSeenAt: now, probeInFlight: false };
  circuits.set(key, created);
  return created;
}

export type CircuitDecision =
  | { allowed: true; halfOpenProbe: boolean }
  | { allowed: false; retryAtMs: number; consecutiveFailures: number };

export function checkUpstreamCircuit(host: string, now = Date.now()): CircuitDecision {
  const state = circuits.get(host);
  if (!state || state.openedAt === null) return { allowed: true, halfOpenProbe: false };

  const retryAtMs = state.openedAt + OPEN_MS;
  if (now < retryAtMs) {
    state.lastSeenAt = now;
    return { allowed: false, retryAtMs, consecutiveFailures: state.consecutiveFailures };
  }

  // Cooldown elapsed: allow one probe through. A success closes the circuit;
  // a failure re-opens it for another full cooldown window.
  if (state.probeInFlight) {
    return { allowed: false, retryAtMs: now + 1_000, consecutiveFailures: state.consecutiveFailures };
  }
  state.probeInFlight = true;
  state.lastSeenAt = now;
  return { allowed: true, halfOpenProbe: true };
}

export function reportUpstreamSuccess(host: string, now = Date.now()) {
  const state = circuits.get(host);
  if (!state) return;
  state.consecutiveFailures = 0;
  state.openedAt = null;
  state.probeInFlight = false;
  state.lastSeenAt = now;
}

export function reportUpstreamFailure(host: string, now = Date.now()) {
  const state = circuitFor(host, now);
  state.consecutiveFailures += 1;
  state.probeInFlight = false;
  if (state.consecutiveFailures >= FAILURE_THRESHOLD) {
    state.openedAt = now;
  }
  return {
    consecutiveFailures: state.consecutiveFailures,
    open: state.openedAt !== null,
  };
}

export function upstreamCircuitStats() {
  return {
    trackedHosts: circuits.size,
    failureThreshold: FAILURE_THRESHOLD,
    openMs: OPEN_MS,
  };
}

export function resetUpstreamCircuitsForTests() {
  circuits.clear();
}
