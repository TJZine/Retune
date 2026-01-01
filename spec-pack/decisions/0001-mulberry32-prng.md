# ADR-001: Mulberry32 PRNG for Shuffle

## Status

Accepted

## Context

The channel scheduler needs to support shuffle mode, where content plays in a randomized order. To achieve a "linear TV" experience where all viewers see the same content at the same time, the shuffle must be **deterministic** - given the same seed, the same shuffle order should be produced every time, even across app restarts and different devices.

JavaScript's built-in `Math.random()` is not seedable, so we cannot guarantee deterministic results.

## Decision

Use **Mulberry32**, a simple 32-bit PRNG with the following properties:

```typescript
function mulberry32(seed: number): () => number {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
```

Use this PRNG with Fisher-Yates shuffle for content ordering.

## Consequences

### Positive

- **Deterministic**: Same seed always produces same sequence
- **Fast**: Single multiplication per call, suitable for real-time scheduling
- **Simple**: ~10 lines of code, no external dependencies
- **Chromium 68 compatible**: Uses only basic operations supported by webOS 4.0

### Negative

- **Not cryptographically secure**: Not suitable for security-sensitive randomness
- **32-bit period**: Repeats after 2^32 values (acceptable for our use case)

## Alternatives Considered

### 1. Math.random() with seed workaround

**Rejected**: `Math.random()` is not seedable in JavaScript. Would require storing the entire shuffle order, which doesn't scale for large libraries.

### 2. XorShift128+

**Rejected**: More complex implementation, and we only need a single stream of random numbers. Mulberry32's simplicity is preferred.

### 3. Pre-computed shuffle tables

**Rejected**: Would require storing shuffle orders for every channel configuration. Storage overhead and sync complexity not justified.

### 4. Server-side shuffle with sync

**Rejected**: Adds server dependency for a feature that should work offline. Increases complexity without clear benefit.

## References

- [Mulberry32 on Wikipedia](https://en.wikipedia.org/wiki/Mulberry_(PRNG))
- [Fisher-Yates Shuffle](https://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle)
