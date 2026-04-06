/**
 * @since 4.0.0
 */
import * as Effect from "../../Effect.ts"
import type * as Layer from "../../Layer.ts"
import * as Option from "../../Option.ts"
import type * as Scope from "../../Scope.ts"
import * as Stream from "../../Stream.ts"
import * as Machine from "../machine/Machine.ts"
import * as AsyncResult from "./AsyncResult.ts"
import * as Atom from "./Atom.ts"

type StartArgs<M extends Machine.Any> = [Machine.InputSchemaOf<M>] extends [undefined] ? [] : [input: Machine.InputOf<M>]

type SnapshotOf<M extends Machine.Any> = Machine.Snapshot<Machine.StateSchemasOf<M>>
type EventOf<M extends Machine.Any> = Machine.Event<M["event"]>
type ErrorOf<M extends Machine.Any, ER> = Machine.MachineErrorOf<M> | ER

/**
 * @since 4.0.0
 * @category constructors
 */
export const make: {
  <M extends Machine.Machine<any, any, any, any, never>>(
    machine: M,
    ...args: StartArgs<M>
  ): Atom.Writable<AsyncResult.AsyncResult<SnapshotOf<M>, Machine.MachineErrorOf<M>>, EventOf<M>>
  <M extends Machine.Any, ER>(
    options: {
      readonly runtime: Atom.AtomRuntime<Machine.ServicesOf<M>, ER>
    },
    machine: M,
    ...args: StartArgs<M>
  ): Atom.Writable<AsyncResult.AsyncResult<SnapshotOf<M>, ErrorOf<M, ER>>, EventOf<M>>
} = (...args: ReadonlyArray<any>) => {
  const [options, machine, startArgs] = isOptions(args[0])
    ? [args[0], args[1], args.slice(2)]
    : [undefined, args[0], args.slice(1)]
  return makeWithRuntime(
    options?.runtime as any,
    machine as any,
    startArgs as any
  )
}

const makeWithRuntime = <M extends Machine.Any, ER>(
  runtime: Atom.AtomRuntime<Machine.ServicesOf<M>, ER> | undefined,
  machine: M,
  args: ReadonlyArray<Machine.InputOf<M>>
): Atom.Writable<AsyncResult.AsyncResult<SnapshotOf<M>, ErrorOf<M, ER>>, EventOf<M>> => {
  const resultAtom = Atom.make(
    AsyncResult.initial<SnapshotOf<M>, ErrorOf<M, ER>>()
  ) as Atom.Writable<AsyncResult.AsyncResult<SnapshotOf<M>, ErrorOf<M, ER>>>
  const actorAtom = runtime === undefined
    ? Atom.make(
      startMachine(machine, args) as Effect.Effect<
        Machine.Actor<M>,
        never,
        Scope.Scope
      >
    )
    : runtime.atom(startMachine(machine, args))

  const sendAtom = Atom.fn<ErrorOf<M, ER>, SnapshotOf<M>, EventOf<M>>(
    Effect.fnUntraced(function*(event, get) {
      const current = get(resultAtom)
      get.set(
        resultAtom,
        current._tag === "Initial"
          ? AsyncResult.initial(true)
          : AsyncResult.waiting(current)
      )
      const actor = yield* get.result(actorAtom, { suspendOnWaiting: true })
      yield* actor.send(event as Machine.Event<M["event"]>)
      return yield* actor.snapshot
    })
  )

  const syncAtom = Atom.make((get) => {
    let releaseChanges: (() => void) | undefined

    const stopChanges = () => {
      if (releaseChanges !== undefined) {
        releaseChanges()
        releaseChanges = undefined
      }
    }

    const startChanges = (actor: Machine.Actor<M>) => {
      if (releaseChanges !== undefined) {
        return
      }
      get.set(resultAtom, AsyncResult.success(Effect.runSync(actor.snapshot)))
      releaseChanges = Effect.runCallback(
        actor.changes.pipe(
          Stream.runForEachArray((snapshots) =>
            Effect.sync(() => {
              get.set(resultAtom, AsyncResult.success(snapshots[snapshots.length - 1]!))
            }))
        )
      )
    }

    get.addFinalizer(stopChanges)
    get.mount(actorAtom)
    get.mount(sendAtom)

    get.subscribe(actorAtom, (result) => {
      if (AsyncResult.isSuccess(result)) {
        startChanges(result.value)
        return
      }
      stopChanges()
      get.set(
        resultAtom,
        result._tag === "Failure"
          ? AsyncResult.failureWithPrevious(result.cause, { previous: Option.some(get.once(resultAtom)) })
          : result as AsyncResult.Initial<SnapshotOf<M>, ErrorOf<M, ER>>
      )
    }, { immediate: true })

    get.subscribe(sendAtom, (result) => {
      if (result._tag === "Initial") {
        return
      }
      if (result._tag === "Failure") {
        get.set(resultAtom, AsyncResult.failureWithPrevious(result.cause, { previous: Option.some(get.once(resultAtom)) }))
      }
    }, { immediate: true })

    return void 0
  })

  return Atom.writable(
    (get) => {
      get.mount(syncAtom)
      return get(resultAtom)
    },
    (ctx, event) => {
      const current = ctx.get(resultAtom)
      ctx.set(
        resultAtom,
        current._tag === "Initial"
          ? AsyncResult.initial(true)
          : AsyncResult.waiting(current)
      )
      ctx.set(sendAtom, event)
    }
  )
}

const isOptions = (u: unknown): u is { readonly runtime: Atom.AtomRuntime<any, any> } =>
  typeof u === "object" && u !== null && "runtime" in u

const startMachine = <M extends Machine.Any>(
  machine: M,
  args: ReadonlyArray<Machine.InputOf<M>>
): Effect.Effect<Machine.Actor<M>, never, Scope.Scope | Machine.ServicesOf<M>> => (Machine.start as any)(machine, ...args)

/**
 * @since 4.0.0
 * @category models
 */
export interface AtomMachine<M extends Machine.Any, E = never>
  extends Atom.Writable<AsyncResult.AsyncResult<SnapshotOf<M>, ErrorOf<M, E>>, EventOf<M>>
{}

/**
 * @since 4.0.0
 * @category models
 */
export interface RuntimeOptions<M extends Machine.Any, E = never> {
  readonly runtime: Atom.AtomRuntime<Machine.ServicesOf<M>, E>
}

/**
 * @since 4.0.0
 * @category models
 */
export type LayerOf<M extends Machine.Any> = Layer.Layer<Machine.ServicesOf<M>>
