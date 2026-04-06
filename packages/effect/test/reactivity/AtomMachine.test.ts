import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Ref, Schema, ServiceMap } from "effect"
import { AsyncResult, Atom, AtomMachine, AtomRegistry } from "effect/unstable/reactivity"
import * as Machine from "effect/unstable/machine/Machine"

class Increment extends Schema.TaggedClass<Increment, { readonly _: unique symbol }>()(
  "Increment",
  {}
) {}

class Decrement extends Schema.TaggedClass<Decrement, { readonly _: unique symbol }>()(
  "Decrement",
  {}
) {}

class Counter extends Schema.TaggedClass<Counter, { readonly _: unique symbol }>()(
  "Counter",
  { count: Schema.Number }
) {}

class InitialCount extends Schema.TaggedClass<InitialCount, { readonly _: unique symbol }>()(
  "InitialCount",
  { count: Schema.Number }
) {}

class Started extends Schema.TaggedClass<Started, { readonly _: unique symbol }>()(
  "Started",
  { count: Schema.Number }
) {}

const CounterMachine = Machine.make({
  events: [Increment, Decrement],
  initial: () => new Counter({ count: 0 }),
  states: [Counter]
}).handlers("Counter")({
  Increment: ({ state }) => new Counter({ count: state.count + 1 }),
  Decrement: ({ state }) => new Counter({ count: state.count - 1 })
})

describe("AtomMachine", () => {
  it.effect("starts the machine when mounted and exposes the current snapshot", () =>
    Effect.gen(function*() {
      const started = yield* Ref.make(0)

      const machine = Machine.make({
        events: [Increment],
        initial: () => new Started({ count: 0 }),
        states: [Started]
      }).handlers("Started")({
        Increment: ({ state }) =>
          Effect.gen(function*() {
            yield* Ref.update(started, (n) => n + 1)
            return new Started({ count: state.count + 1 })
          })
      })

      const atom = AtomMachine.make(machine)
      const registry = AtomRegistry.make()
      const unmount = registry.mount(atom)

      yield* Effect.yieldNow
      const initial = registry.get(atom)
      assert(AsyncResult.isSuccess(initial))
      assert.strictEqual(initial.value.count, 0)

      registry.set(atom, new Increment({}))
      yield* Effect.yieldNow

      const next = registry.get(atom)
      assert(AsyncResult.isSuccess(next))
      assert.strictEqual(next.value.count, 1)
      assert.strictEqual(yield* Ref.get(started), 1)

      unmount()
    }))

  it.effect("supports schema-backed input", () =>
    Effect.gen(function*() {
      const machine = Machine.make({
        input: InitialCount,
        events: [Increment],
        initial: ({ input }) => new Counter({ count: input.count }),
        states: [Counter]
      }).handlers("Counter")({
        Increment: ({ state }) => new Counter({ count: state.count + 1 })
      })

      const atom = AtomMachine.make(machine, new InitialCount({ count: 41 }))
      const registry = AtomRegistry.make()
      const unmount = registry.mount(atom)

      yield* Effect.yieldNow
      const result = registry.get(atom)
      assert(AsyncResult.isSuccess(result))
      assert.strictEqual(result.value.count, 41)

      unmount()
    }))

  it.effect("fails with UnhandledEventError for invalid events", () =>
    Effect.gen(function*() {
      const atom = AtomMachine.make(CounterMachine)
      const registry = AtomRegistry.make()
      const unmount = registry.mount(atom)

      yield* Effect.yieldNow
      registry.set(atom, new Decrement({}))
      yield* Effect.yieldNow

      const result = registry.get(atom)
      assert(AsyncResult.isSuccess(result))
      assert.strictEqual(result.value.count, -1)

      const machine = Machine.make({
        events: [Increment],
        initial: () => new Counter({ count: 0 }),
        states: [Counter]
      })

      const invalidAtom = AtomMachine.make(machine)
      registry.mount(invalidAtom)
      yield* Effect.yieldNow
      registry.set(invalidAtom, new Increment({}))
      yield* Effect.yieldNow

      const invalidResult = registry.get(invalidAtom)
      assert(AsyncResult.isFailure(invalidResult))
      const error = yield* Effect.flip(Effect.failCause(invalidResult.cause))
      assert.instanceOf(error, Machine.UnhandledEventError)

      unmount()
    }))

  it.effect("integrates with promise-style writes", () =>
    Effect.gen(function*() {
      const atom = AtomMachine.make(CounterMachine)
      const registry = AtomRegistry.make()
      registry.mount(atom)

      yield* Effect.yieldNow
      registry.set(atom, new Increment({}))

      const snapshot = yield* AtomRegistry.getResult(registry, atom, {
        suspendOnWaiting: true
      })

      assert.strictEqual(snapshot.count, 1)
    }))

  it.effect("supports machines that require services via runtime", () =>
    Effect.gen(function*() {
      class Multiplier extends ServiceMap.Service<Multiplier>()("Multiplier", {
        make: Effect.succeed({ factor: 2 })
      }) {}

      const machine = Machine.make({
        events: [Increment],
        initial: () => new Counter({ count: 1 }),
        states: [Counter]
      }).handlers("Counter")({
        Increment: ({ state }) =>
          Multiplier.use((multiplier) => Effect.succeed(new Counter({ count: state.count * multiplier.factor })))
      })

      const runtime = Atom.runtime(Layer.succeed(Multiplier, { factor: 3 }))
      const atom = AtomMachine.make({ runtime }, machine)
      const registry = AtomRegistry.make()
      registry.mount(atom)

      yield* Effect.yieldNow
      registry.set(atom, new Increment({}))

      const snapshot = yield* AtomRegistry.getResult(registry, atom, {
        suspendOnWaiting: true
      })

      assert.strictEqual(snapshot.count, 3)
    }))
})
