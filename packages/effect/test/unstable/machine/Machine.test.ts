import { assert, describe, it } from "@effect/vitest"
import { Cause, Effect, Ref, Schema } from "effect"
import * as Context from "effect/Context"
import * as Machine from "effect/unstable/machine/Machine"

describe("Machine", () => {
  const User = Schema.Struct({
    id: Schema.String,
    email: Schema.String
  })

  class Create extends Schema.TaggedClass<Create, { readonly _: unique symbol }>()(
    "Create",
    { email: Schema.String }
  ) {}

  class Rename extends Schema.TaggedClass<Rename, { readonly _: unique symbol }>()(
    "Rename",
    { email: Schema.String }
  ) {}

  class Delete extends Schema.TaggedClass<Delete, { readonly _: unique symbol }>()(
    "Delete",
    {}
  ) {}

  class Uncreated extends Schema.TaggedClass<Uncreated, { readonly _: unique symbol }>()(
    "Uncreated",
    {}
  ) {}

  class Created extends Schema.TaggedClass<Created, { readonly _: unique symbol }>()(
    "Created",
    { user: User }
  ) {}

  class Deleted extends Schema.TaggedClass<Deleted, { readonly _: unique symbol }>()(
    "Deleted",
    { userId: Schema.String }
  ) {}

  class AuthenticatedIdle extends Schema.TaggedClass<AuthenticatedIdle, { readonly _: unique symbol }>()(
    "Authenticated.Idle",
    { userId: Schema.String }
  ) {}

  class AuthenticatedRefreshing extends Schema.TaggedClass<AuthenticatedRefreshing, { readonly _: unique symbol }>()(
    "Authenticated.Refreshing",
    { userId: Schema.String }
  ) {}

  class Logout extends Schema.TaggedClass<Logout, { readonly _: unique symbol }>()(
    "Logout",
    {}
  ) {}

  class Refresh extends Schema.TaggedClass<Refresh, { readonly _: unique symbol }>()(
    "Refresh",
    {}
  ) {}

  class StartRefresh extends Schema.TaggedClass<StartRefresh, { readonly _: unique symbol }>()(
    "StartRefresh",
    {}
  ) {}

  class Unauthenticated extends Schema.TaggedClass<Unauthenticated, { readonly _: unique symbol }>()(
    "Unauthenticated",
    {}
  ) {}

  class DeferredLog extends Context.Service<DeferredLog, {
    readonly push: (message: string) => Effect.Effect<void>
    readonly read: Effect.Effect<ReadonlyArray<string>>
  }>()("test/Machine/DeferredLog") {}

  const makeDeferredLog = Effect.gen(function*() {
    const ref = yield* Ref.make<ReadonlyArray<string>>([])
    return DeferredLog.of({
      push: (message) => Ref.update(ref, (messages) => [...messages, message]),
      read: Ref.get(ref)
    })
  })

  class SaveError extends Schema.TaggedErrorClass<SaveError, { readonly _: unique symbol }>()(
    "SaveError",
    { reason: Schema.String }
  ) {}

  class AuditError extends Schema.TaggedErrorClass<AuditError, { readonly _: unique symbol }>()(
    "AuditError",
    { reason: Schema.String }
  ) {}

  class Failed extends Schema.TaggedClass<Failed, { readonly _: unique symbol }>()(
    "Failed",
    { reason: Schema.String }
  ) {}

  const UserMachine = Machine.make({
    id: "UserMachine",
    events: [Create, Rename, Delete],
    initial: () => new Uncreated({}),
    states: [Uncreated, Created, Deleted]
  })
    .handlers("Uncreated")({
      Create: ({ event }) => new Created({ user: { id: "user-1", email: event.email } })
    })
    .handlers("Created")({
      Rename: ({ state, event }) => new Created({ user: { ...state.user, email: event.email } }),
      Delete: ({ state }) => new Deleted({ userId: state.user.id })
    })

  it.effect("supports state-dependent snapshots", () =>
    Effect.gen(function*() {
      const initial = Machine.initial(UserMachine)
      const created = yield* Machine.next(UserMachine, initial, new Create({ email: "a@example.com" }))
      const renamed = yield* Machine.next(UserMachine, created, new Rename({ email: "b@example.com" }))
      const deleted = yield* Machine.next(UserMachine, renamed, new Delete({}))

      assert.instanceOf(initial, Uncreated)
      assert.strictEqual(initial._tag, "Uncreated")

      assert.instanceOf(created, Created)
      assert.strictEqual(created._tag, "Created")
      assert.deepStrictEqual(created.user, {
        id: "user-1",
        email: "a@example.com"
      })

      assert.instanceOf(renamed, Created)
      assert.strictEqual(renamed._tag, "Created")
      assert.deepStrictEqual(renamed.user, {
        id: "user-1",
        email: "b@example.com"
      })

      assert.instanceOf(deleted, Deleted)
      assert.strictEqual(deleted._tag, "Deleted")
      assert.strictEqual(deleted.userId, "user-1")
    }))

  it.effect("returns enabled event tags for the current state", () =>
    Effect.gen(function*() {
      const initial = Machine.initial(UserMachine)
      const created = yield* Machine.next(UserMachine, initial, new Create({ email: "a@example.com" }))

      assert.deepStrictEqual(Machine.enabled(UserMachine, initial), ["Create"])
      assert.deepStrictEqual(Machine.enabled(UserMachine, created), ["Rename", "Delete"])
    }))

  it.effect("machine actor processes events sequentially", () =>
    Effect.gen(function*() {
      const actor = yield* Machine.start(UserMachine)

      yield* actor.send(new Create({ email: "a@example.com" }))
      yield* actor.send(new Rename({ email: "b@example.com" }))

      const snapshot = yield* actor.snapshot
      assert.instanceOf(snapshot, Created)
      assert.strictEqual(snapshot._tag, "Created")
      assert.deepStrictEqual(snapshot.user, {
        id: "user-1",
        email: "b@example.com"
      })
    }))

  it.effect("fails with UnhandledEventError for invalid events in the current state", () =>
    Effect.gen(function*() {
      const initial = Machine.initial(UserMachine)
      const planError = yield* Effect.flip(Machine.next(UserMachine, initial, new Rename({ email: "x@example.com" })))

      assert.instanceOf(planError, Machine.UnhandledEventError)
      assert.strictEqual(planError._tag, "UnhandledEventError")
      assert.strictEqual(planError.machineId, "UserMachine")
      assert.strictEqual(planError.state, "Uncreated")
      assert.strictEqual(planError.event, "Rename")

      const actor = yield* Machine.start(UserMachine)
      const sendError = yield* Effect.flip(actor.send(new Rename({ email: "x@example.com" })))

      assert.instanceOf(sendError, Machine.UnhandledEventError)
      assert.strictEqual(sendError._tag, "UnhandledEventError")
      assert.strictEqual(sendError.machineId, "UserMachine")
      assert.strictEqual(sendError.state, "Uncreated")
      assert.strictEqual(sendError.event, "Rename")
    }))

  it.effect("supports schema-backed input for initial state", () =>
    Effect.gen(function*() {
      const ExistingUserInput = Schema.Struct({
        user: User
      })

      const InputMachine = Machine.make({
        input: ExistingUserInput,
        events: [Rename, Delete],
        states: [Uncreated, Created, Deleted],
        initial: ({ input }) => new Created({ user: input.user })
      })
        .handlers("Created")({
          Rename: ({ state, event }) => new Created({ user: { ...state.user, email: event.email } }),
          Delete: ({ state }) => new Deleted({ userId: state.user.id })
        })

      const initial = Machine.initial(InputMachine, {
        user: {
          id: "seed",
          email: "seed@example.com"
        }
      })

      assert.instanceOf(initial, Created)
      assert.deepStrictEqual(initial.user, {
        id: "seed",
        email: "seed@example.com"
      })
    }))

  it.effect("starts an actor with schema-backed input", () =>
    Effect.gen(function*() {
      const ExistingUserInput = Schema.Struct({
        user: User
      })

      const InputMachine = Machine.make({
        input: ExistingUserInput,
        events: [Rename, Delete],
        states: [Uncreated, Created, Deleted],
        initial: ({ input }) => new Created({ user: input.user })
      })
        .handlers("Created")({
          Rename: ({ state, event }) => new Created({ user: { ...state.user, email: event.email } }),
          Delete: ({ state }) => new Deleted({ userId: state.user.id })
        })

      const actor = yield* Machine.start(InputMachine, {
        user: {
          id: "seed",
          email: "seed@example.com"
        }
      })

      const initial = yield* actor.snapshot

      assert.instanceOf(initial, Created)
      assert.deepStrictEqual(initial.user, {
        id: "seed",
        email: "seed@example.com"
      })

      yield* actor.send(new Rename({ email: "updated@example.com" }))

      const updated = yield* actor.snapshot

      assert.instanceOf(updated, Created)
      assert.deepStrictEqual(updated.user, {
        id: "seed",
        email: "updated@example.com"
      })
    }))

  it.effect("bubbles handler lookup through dotted parent scopes", () =>
    Effect.gen(function*() {
      const LoginInput = Schema.Struct({
        userId: Schema.String
      })

      const RefreshMachine = Machine.make({
        input: LoginInput,
        events: [Logout, Refresh],
        states: [Unauthenticated, AuthenticatedIdle, AuthenticatedRefreshing],
        initial: ({ input }) => new AuthenticatedIdle({ userId: input.userId })
      })
        .handlers("Authenticated")({
          Logout: () => new Unauthenticated({})
        })
        .handlers("Authenticated.Idle")({
          Refresh: ({ state }) => new AuthenticatedRefreshing({ userId: state.userId })
        })

      const initial = Machine.initial(RefreshMachine, { userId: "user-1" })
      const loggedOut = yield* Machine.next(RefreshMachine, initial, new Logout({}))

      assert.instanceOf(initial, AuthenticatedIdle)
      assert.instanceOf(loggedOut, Unauthenticated)
      assert.deepStrictEqual(Machine.enabled(RefreshMachine, initial), ["Refresh", "Logout"])
    }))

  it.effect("processes raised events as internal transitions", () =>
    Effect.gen(function*() {
      const RaisedMachine = Machine.make({
        events: [Create, Rename],
        initial: () => new Uncreated({}),
        states: [Uncreated, Created]
      })
        .handlers("Uncreated")({
          Create: (_, actions) => {
            actions.raise(new Rename({ email: "raised@example.com" }))
            return new Created({ user: { id: "user-1", email: "created@example.com" } })
          }
        })
        .handlers("Created")({
          Rename: ({ state, event }) => new Created({ user: { ...state.user, email: event.email } })
        })

      const initial = Machine.initial(RaisedMachine)
      const planned = yield* Machine.plan(RaisedMachine, initial, new Create({ email: "create@example.com" }))
      const next = yield* Machine.next(RaisedMachine, initial, new Create({ email: "create@example.com" }))

      assert.instanceOf(planned.next, Created)
      assert.strictEqual(planned.next.user.email, "raised@example.com")
      assert.strictEqual(planned.actions.length, 1)
      assert.strictEqual(planned.actions[0]!._tag, "Raise")

      assert.instanceOf(next, Created)
      assert.strictEqual(next.user.email, "raised@example.com")
    }))

  it.effect("collects exit and entry actions around changed transitions", () =>
    Effect.gen(function*() {
      const LifecycleMachine = Machine.make({
        events: [Logout, StartRefresh],
        states: [AuthenticatedIdle, AuthenticatedRefreshing, Unauthenticated],
        initial: () => new AuthenticatedIdle({ userId: "user-1" })
      })
        .exit("Authenticated", (_, actions) => {
          actions.effect(DeferredLog.use((log) => log.push("exit:authenticated")))
        })
        .exit("Authenticated.Idle", (_, actions) => {
          actions.effect(DeferredLog.use((log) => log.push("exit:idle")))
        })
        .entry("Authenticated.Refreshing", (_, actions) => {
          actions.effect(DeferredLog.use((log) => log.push("entry:refreshing")))
        })
        .entry("Unauthenticated", (_, actions) => {
          actions.effect(DeferredLog.use((log) => log.push("entry:unauthenticated")))
        })
        .handlers("Authenticated.Idle")({
          StartRefresh: ({ state }, actions) => {
            actions.effect(DeferredLog.use((log) => log.push("transition:refresh")))
            return new AuthenticatedRefreshing({ userId: state.userId })
          }
        })
        .handlers("Authenticated")({
          Logout: (_, actions) => {
            actions.effect(DeferredLog.use((log) => log.push("transition:logout")))
            return new Unauthenticated({})
          }
        })

      const log = yield* makeDeferredLog
      const initial = Machine.initial(LifecycleMachine)
      const planned = yield* Machine.plan(LifecycleMachine, initial, new StartRefresh({}))

      assert.instanceOf(planned.next, AuthenticatedRefreshing)
      assert.strictEqual(planned.actions.length, 3)
      assert.deepStrictEqual(yield* log.read, [])

      const refreshing = yield* Machine.next(LifecycleMachine, initial, new StartRefresh({})).pipe(
        Effect.provideService(DeferredLog, log)
      )

      assert.instanceOf(refreshing, AuthenticatedRefreshing)
      assert.deepStrictEqual(yield* log.read, [
        "exit:idle",
        "transition:refresh",
        "entry:refreshing"
      ])

      const loggedOut = yield* Machine.next(LifecycleMachine, refreshing, new Logout({})).pipe(
        Effect.provideService(DeferredLog, log)
      )

      assert.instanceOf(loggedOut, Unauthenticated)
      assert.deepStrictEqual(yield* log.read, [
        "exit:idle",
        "transition:refresh",
        "entry:refreshing",
        "exit:authenticated",
        "transition:logout",
        "entry:unauthenticated"
      ])
    }))

  it.effect("plan does not run deferred effects", () =>
    Effect.gen(function*() {
      const DeferredMachine = Machine.make({
        events: [Create],
        initial: () => new Uncreated({}),
        states: [Uncreated, Created]
      }).handlers("Uncreated")({
        Create: (_, actions) => {
          actions.effect(DeferredLog.use((log) => log.push("created")))
          return new Created({ user: { id: "user-1", email: "a@example.com" } })
        }
      })

      const log = yield* makeDeferredLog
      const initial = Machine.initial(DeferredMachine)
      const planned = yield* Machine.plan(DeferredMachine, initial, new Create({ email: "a@example.com" }))

      assert.instanceOf(planned.next, Created)
      assert.strictEqual(planned.actions.length, 1)
      assert.deepStrictEqual(yield* log.read, [])
    }))

  it.effect("next runs deferred effects", () =>
    Effect.gen(function*() {
      const DeferredMachine = Machine.make({
        events: [Create],
        initial: () => new Uncreated({}),
        states: [Uncreated, Created]
      }).handlers("Uncreated")({
        Create: (_, actions) => {
          actions.effect(DeferredLog.use((log) => log.push("created")))
          return new Created({ user: { id: "user-1", email: "a@example.com" } })
        }
      })

      const log = yield* makeDeferredLog
      const initial = Machine.initial(DeferredMachine)
      const next = yield* Machine.next(DeferredMachine, initial, new Create({ email: "a@example.com" })).pipe(
        Effect.provideService(DeferredLog, log)
      )

      assert.instanceOf(next, Created)
      assert.deepStrictEqual(yield* log.read, ["created"])
    }))

  it.effect("recovers from tagged deferred failures", () =>
    Effect.gen(function*() {
      const RecoveringMachine = Machine.make({
        events: [Create],
        initial: () => new Uncreated({}),
        states: [Uncreated, Created, Failed]
      })
        .handlers("Uncreated")({
          Create: (_, actions: Machine.ActionQueue<SaveError>) => {
            actions.effect(Effect.fail(new SaveError({ reason: "offline" })))
            return new Created({ user: { id: "user-1", email: "a@example.com" } })
          }
        })
        .catch("SaveError", ({ error }, actions) => {
          actions.effect(DeferredLog.use((log) => log.push(error.reason)))
          return new Failed({ reason: error.reason })
        })

      const log = yield* makeDeferredLog
      const initial = Machine.initial(RecoveringMachine)
      const next = yield* Machine.next(RecoveringMachine, initial, new Create({ email: "a@example.com" })).pipe(
        Effect.provideService(DeferredLog, log)
      )

      assert.instanceOf(next, Failed)
      assert.strictEqual(next.reason, "offline")
      assert.deepStrictEqual(yield* log.read, ["offline"])
    }))

  it.effect("recovers from failures in recovery actions", () =>
    Effect.gen(function*() {
      const RecoveringMachine = Machine.make({
        events: [Create],
        initial: () => new Uncreated({}),
        states: [Uncreated, Created, Failed]
      })
        .handlers("Uncreated")({
          Create: (_, actions: Machine.ActionQueue<SaveError | AuditError>) => {
            actions.effect(Effect.fail(new SaveError({ reason: "offline" })))
            return new Created({ user: { id: "user-1", email: "a@example.com" } })
          }
        })
        .catch("SaveError", ({ error }, actions: Machine.ActionQueue<AuditError, never, any>) => {
          actions.effect(Effect.fail(new AuditError({ reason: `audit:${error.reason}` })))
          return new Failed({ reason: `save:${error.reason}` })
        })
        .catch("AuditError", ({ error }) => new Failed({ reason: error.reason }))

      const initial = Machine.initial(RecoveringMachine)
      const next = yield* Machine.next(RecoveringMachine, initial, new Create({ email: "a@example.com" }))

      assert.instanceOf(next, Failed)
      assert.strictEqual(next.reason, "audit:offline")
    }))

  it.effect("limits recovery action loops", () =>
    Effect.gen(function*() {
      const RecoveringMachine = Machine.make({
        id: "RecoveringMachine",
        events: [Create],
        initial: () => new Uncreated({}),
        states: [Uncreated, Created, Failed]
      })
        .handlers("Uncreated")({
          Create: (_, actions: Machine.ActionQueue<SaveError>) => {
            actions.effect(Effect.fail(new SaveError({ reason: "offline" })))
            return new Created({ user: { id: "user-1", email: "a@example.com" } })
          }
        })
        .catch("SaveError", ({ error }, actions: Machine.ActionQueue<SaveError, never, any>) => {
          actions.effect(Effect.fail(new SaveError({ reason: error.reason })))
          return new Failed({ reason: error.reason })
        })

      const initial = Machine.initial(RecoveringMachine)
      const error = yield* Effect.flip(
        Machine.next(RecoveringMachine, initial, new Create({ email: "a@example.com" }))
      )

      assert.instanceOf(error, Machine.InternalEventLoopError)
      assert.strictEqual(error.machineId, "RecoveringMachine")
      assert.strictEqual(error.event, "Create")
    }))

  it.effect("processes raised events from recovery handlers", () =>
    Effect.gen(function*() {
      const RecoveringMachine = Machine.make({
        events: [Create, Rename],
        initial: () => new Uncreated({}),
        states: [Uncreated, Created, Failed]
      })
        .handlers("Uncreated")({
          Create: (_, actions: Machine.ActionQueue<SaveError>) => {
            actions.effect(Effect.fail(new SaveError({ reason: "offline" })))
            return new Created({ user: { id: "user-1", email: "created@example.com" } })
          }
        })
        .handlers("Created")({
          Rename: ({ state, event }) => new Created({ user: { ...state.user, email: event.email } })
        })
        .catch("SaveError", ({ error }, actions) => {
          actions.raise(new Rename({ email: error.reason }))
          return new Created({ user: { id: "user-1", email: "recovered@example.com" } })
        })

      const initial = Machine.initial(RecoveringMachine)
      const next = yield* Machine.next(RecoveringMachine, initial, new Create({ email: "a@example.com" }))

      assert.instanceOf(next, Created)
      assert.strictEqual(next.user.email, "offline")
    }))

  it.effect("recovers from untyped defects with catchCause", () =>
    Effect.gen(function*() {
      const RecoveringMachine = Machine.make({
        events: [Create],
        initial: () => new Uncreated({}),
        states: [Uncreated, Created, Failed]
      })
        .handlers("Uncreated")({
          Create: (_, actions) => {
            actions.effect(Effect.die("boom"))
            return new Created({ user: { id: "user-1", email: "a@example.com" } })
          }
        })
        .catchCause(({ cause }) => {
          assert.strictEqual(Cause.hasDies(cause), true)
          return new Failed({ reason: Cause.pretty(cause) })
        })

      const initial = Machine.initial(RecoveringMachine)
      const next = yield* Machine.next(RecoveringMachine, initial, new Create({ email: "a@example.com" }))

      assert.instanceOf(next, Failed)
      assert.match(next.reason, /boom/)
    }))

  it.effect("actor commits snapshot before deferred failures surface", () =>
    Effect.gen(function*() {
      const DeferredMachine = Machine.make({
        events: [Create],
        initial: () => new Uncreated({}),
        states: [Uncreated, Created]
      }).handlers("Uncreated")({
        Create: (_, actions: Machine.ActionQueue<string>) => {
          actions.effect(Effect.fail("boom"))
          return new Created({ user: { id: "user-1", email: "a@example.com" } })
        }
      })

      const actor = yield* Machine.start(DeferredMachine)
      const error = yield* Effect.flip(actor.send(new Create({ email: "a@example.com" })))
      const snapshot = yield* actor.snapshot

      assert.strictEqual(error, "boom")
      assert.instanceOf(snapshot, Created)
    }))

  it.effect("starts machines with actor declarations without starting children", () =>
    Effect.gen(function*() {
      const ChildMachine = Machine.make({
        id: "ChildMachine",
        events: [Refresh],
        initial: () => new AuthenticatedIdle({ userId: "child" }),
        states: [AuthenticatedIdle, AuthenticatedRefreshing]
      }).handlers("Authenticated.Idle")({
        Refresh: ({ state }) => new AuthenticatedRefreshing({ userId: state.userId })
      })

      const ParentMachine = Machine.make({
        id: "ParentMachine",
        events: [Create],
        initial: () => new Uncreated({}),
        states: [Uncreated, Created],
        actors: {
          child: Machine.actor(ChildMachine)
        }
      }).handlers("Uncreated")({
        Create: ({ event }) => new Created({ user: { id: "user-1", email: event.email } })
      })

      const actor = yield* Machine.start(ParentMachine)
      yield* actor.send(new Create({ email: "a@example.com" }))
      const snapshot = yield* actor.snapshot

      assert.strictEqual(actor.id, "ParentMachine")
      assert.strictEqual(ParentMachine.actors.child._tag, "ActorSlot")
      assert.strictEqual(ParentMachine.actors.child.key, "child")
      assert.instanceOf(snapshot, Created)
      assert.deepStrictEqual(snapshot.user, {
        id: "user-1",
        email: "a@example.com"
      })
    }))
})
