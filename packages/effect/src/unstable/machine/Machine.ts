/**
 * @since 4.0.0
 */
import * as Cause from "../../Cause.ts"
import * as Deferred from "../../Deferred.ts"
import * as Effect from "../../Effect.ts"
import * as Exit from "../../Exit.ts"
import * as Option from "../../Option.ts"
import * as Predicate from "../../Predicate.ts"
import * as PubSub from "../../PubSub.ts"
import * as Queue from "../../Queue.ts"
import * as Ref from "../../Ref.ts"
import * as Schema from "../../Schema.ts"
import * as SchemaAST from "../../SchemaAST.ts"
import * as Scope from "../../Scope.ts"
import * as Stream from "../../Stream.ts"
import type * as Types from "../../Types.ts"

const TypeId = "~effect/unstable/machine/Machine" as const
const ActorSlotTypeId: unique symbol = Symbol.for("effect/unstable/machine/ActorSlot") as any

type AnyTaggedEvent = Schema.Top & { readonly Type: { readonly _tag: PropertyKey } }
type AnyTaggedUnion = Schema.Top & { readonly Type: { readonly _tag: PropertyKey }; readonly cases: any }
type AnyEventSchema = Schema.Top & {
  readonly Type: { readonly _tag: PropertyKey }
  readonly cases: any
}
type AnyEventTuple = readonly [AnyTaggedEvent, ...Array<AnyTaggedEvent>]
type AnyTaggedState = Schema.Top & { readonly Type: { readonly _tag: PropertyKey } }
type AnyStateTuple = readonly [AnyTaggedState, ...Array<AnyTaggedState>]
type AnyStateSchemas = Record<string, AnyTaggedState>

type StateSchemasOfStates<States extends AnyStateTuple> = {
  readonly [State in States[number] as State["Type"]["_tag"] & string]: State
}
type ScopePrefixes<Tag extends string> = Tag extends `${infer Head}.${infer Tail}`
  ? Head | `${Head}.${ScopePrefixes<Tail>}`
  : Tag
type ScopesOfStates<States extends AnyStateSchemas> = {
  readonly [Name in keyof States & string]: ScopePrefixes<Name>
}[keyof States & string]
type StatesInScope<States extends AnyStateSchemas, Scope extends string> = {
  readonly [Name in keyof States & string as Name extends Scope | `${Scope}.${string}` ? Name : never]: States[Name]
}
type DataSchema<StateSchemas extends AnyStateSchemas, Name extends keyof StateSchemas & string> = StateSchemas[Name]
type InputValue<InputSchema> = InputSchema extends Schema.Top ? Schema.Schema.Type<InputSchema> : never
type Initializer<InputSchema, State> = [InputSchema] extends [undefined] ? () => State
  : (args: { readonly input: InputValue<InputSchema> }) => State

/**
 * @since 4.0.0
 * @category models
 */
export interface ActorSlot<M extends Any> {
  readonly _tag: "ActorSlot"
  readonly key: string
  readonly machine: M
  readonly [ActorSlotTypeId]: M
}

/**
 * @since 4.0.0
 * @category models
 */
export type ActorsDefinition = Record<string, Any>

/**
 * @since 4.0.0
 * @category models
 */
export type ActorSlotsOf<Actors extends ActorsDefinition> = {
  readonly [Key in keyof Actors]: ActorSlot<Actors[Key]>
}

/**
 * @since 4.0.0
 * @category models
 */
export type Snapshot<StateSchemas extends AnyStateSchemas> = {
  readonly [Name in keyof StateSchemas & string]: Schema.Schema.Type<DataSchema<StateSchemas, Name>>
}[keyof StateSchemas & string]

/**
 * @since 4.0.0
 * @category models
 */
export type ReducedSnapshot<StateSchemas extends AnyStateSchemas> = {
  readonly [Name in keyof StateSchemas & string]: Schema.Schema.Type<DataSchema<StateSchemas, Name>>
}[keyof StateSchemas & string] extends infer Q ? Q : never

/**
 * @since 4.0.0
 * @category models
 */
export type Event<EventSchema extends AnyEventSchema> = EventSchema["Type"]

type EventTag<EventSchema extends AnyEventSchema> = keyof EventSchema["cases"] & string
type EventByTag<EventSchema extends AnyEventSchema, Tag extends EventTag<EventSchema>> =
  EventSchema["cases"][Tag]["Type"]

/**
 * @since 4.0.0
 * @category models
 */
export type Transition<StateSchemas extends AnyStateSchemas> = Snapshot<StateSchemas>

/**
 * @since 4.0.0
 * @category models
 */
export interface HandlerArgs<
  EventSchema extends AnyEventSchema,
  StateSchemas extends AnyStateSchemas,
  Actors extends ActorsDefinition,
  Source extends ScopesOfStates<StateSchemas>,
  Tag extends EventTag<EventSchema>
> {
  readonly state: ReducedSnapshot<StatesInScope<StateSchemas, Source>>
  readonly event: EventByTag<EventSchema, Tag>
  readonly actors: ActorSlotsOf<Actors>
}

/**
 * @since 4.0.0
 * @category models
 */
export type Handler<
  StateSchemas extends AnyStateSchemas,
  Source extends ScopesOfStates<StateSchemas>,
  Actors extends ActorsDefinition,
  EventSchema extends AnyEventSchema,
  Tag extends EventTag<EventSchema>,
  E = never,
  R = never
> = (
  args: HandlerArgs<EventSchema, StateSchemas, Actors, Source, Tag>,
  actions: ActionQueue<E, R, EventSchema>
) => Transition<StateSchemas>

/**
 * @since 4.0.0
 * @category models
 */
export type Handlers<
  EventSchema extends AnyEventSchema,
  StateSchemas extends AnyStateSchemas,
  Actors extends ActorsDefinition,
  Scope extends ScopesOfStates<StateSchemas>,
  E = never,
  R = never
> = {
  readonly [Tag in EventTag<EventSchema>]?: Handler<StateSchemas, Scope, Actors, EventSchema, Tag, E, R>
}

/**
 * @since 4.0.0
 * @category models
 */
export interface LifecycleArgs<
  EventSchema extends AnyEventSchema,
  StateSchemas extends AnyStateSchemas,
  Actors extends ActorsDefinition,
  Scope extends ScopesOfStates<StateSchemas>
> {
  readonly state: ReducedSnapshot<StatesInScope<StateSchemas, Scope>>
  readonly event: Event<EventSchema> | undefined
  readonly actors: ActorSlotsOf<Actors>
}

/**
 * @since 4.0.0
 * @category models
 */
export type LifecycleHandler<
  EventSchema extends AnyEventSchema,
  StateSchemas extends AnyStateSchemas,
  Actors extends ActorsDefinition,
  Scope extends ScopesOfStates<StateSchemas>,
  E = never,
  R = never
> = (
  args: LifecycleArgs<EventSchema, StateSchemas, Actors, Scope>,
  actions: ActionQueue<E, R, EventSchema>
) => void

/**
 * @since 4.0.0
 * @category models
 */
export interface CatchArgs<
  EventSchema extends AnyEventSchema,
  StateSchemas extends AnyStateSchemas,
  Actors extends ActorsDefinition,
  E
> {
  readonly state: Snapshot<StateSchemas>
  readonly event: Event<EventSchema>
  readonly actors: ActorSlotsOf<Actors>
  readonly error: E
}

/**
 * @since 4.0.0
 * @category models
 */
export type CatchHandler<
  EventSchema extends AnyEventSchema,
  StateSchemas extends AnyStateSchemas,
  Actors extends ActorsDefinition,
  E,
  E2 = never,
  R2 = never
> = (
  args: CatchArgs<EventSchema, StateSchemas, Actors, E>,
  actions: ActionQueue<E2, R2, EventSchema>
) => Transition<StateSchemas>

/**
 * @since 4.0.0
 * @category models
 */
export interface CatchCauseArgs<
  EventSchema extends AnyEventSchema,
  StateSchemas extends AnyStateSchemas,
  Actors extends ActorsDefinition,
  E
> {
  readonly state: Snapshot<StateSchemas>
  readonly event: Event<EventSchema>
  readonly actors: ActorSlotsOf<Actors>
  readonly cause: Cause.Cause<E>
}

/**
 * @since 4.0.0
 * @category models
 */
export type CatchCauseHandler<
  EventSchema extends AnyEventSchema,
  StateSchemas extends AnyStateSchemas,
  Actors extends ActorsDefinition,
  E,
  E2 = never,
  R2 = never
> = (
  args: CatchCauseArgs<EventSchema, StateSchemas, Actors, E>,
  actions: ActionQueue<E2, R2, EventSchema>
) => Transition<StateSchemas>

type InputFor<M extends Any> = InputValue<InputSchemaOf<M>>

/**
 * @since 4.0.0
 * @category models
 */
export interface InvokeArgs<
  EventSchema extends AnyEventSchema,
  StateSchemas extends AnyStateSchemas,
  Actors extends ActorsDefinition,
  Scope extends ScopesOfStates<StateSchemas>
> {
  readonly state: ReducedSnapshot<StatesInScope<StateSchemas, Scope>>
  readonly event: Event<EventSchema>
  readonly actors: ActorSlotsOf<Actors>
}

type InvokeDefinitionFor<Slot extends ActorSlot<Any>> = Slot extends ActorSlot<infer M> ?
  [InputSchemaOf<M>] extends [undefined] ? {
      readonly actor: Slot
      readonly input?: never
    }
  : {
    readonly actor: Slot
    readonly input: InputFor<M>
  }
  : never

/**
 * @since 4.0.0
 * @category models
 */
export type InvokeDefinition<Actors extends ActorsDefinition> = keyof Actors extends never ? never
  : {
    readonly [Key in keyof Actors]: InvokeDefinitionFor<ActorSlotsOf<Actors>[Key]>
  }[keyof Actors]

/**
 * @since 4.0.0
 * @category models
 */
export type InvokeHandler<
  EventSchema extends AnyEventSchema,
  StateSchemas extends AnyStateSchemas,
  Actors extends ActorsDefinition,
  Scope extends ScopesOfStates<StateSchemas>
> = (args: InvokeArgs<EventSchema, StateSchemas, Actors, Scope>) => InvokeDefinition<Actors>

type HandlerDefinitions<
  EventSchema extends AnyEventSchema,
  StateSchemas extends AnyStateSchemas,
  Actors extends ActorsDefinition,
  Scope extends ScopesOfStates<StateSchemas>
> = {
  readonly [Tag in EventTag<EventSchema>]?: (
    args: HandlerArgs<EventSchema, StateSchemas, Actors, Scope, Tag>,
    actions: ActionQueue<any, any, any>
  ) => Transition<StateSchemas>
}

type HandlerUnion<HandlersDef extends Record<string, any>> = Exclude<HandlersDef[keyof HandlersDef], undefined>
type LifecycleUnion<HandlersDef extends ReadonlyArray<any>> = HandlersDef[number]

/**
 * @since 4.0.0
 * @category models
 */
export type Action<E = never, R = never, EventSchema extends AnyEventSchema = AnyEventSchema> =
  | EffectAction<E, R>
  | RaiseAction<EventSchema>
  | StartActorAction
  | StopActorAction

/**
 * @since 4.0.0
 * @category models
 */
export interface EffectAction<E = never, R = never> {
  readonly _tag: "Effect"
  readonly effect: Effect.Effect<void, E, R>
}

/**
 * @since 4.0.0
 * @category models
 */
export interface RaiseAction<EventSchema extends AnyEventSchema = AnyEventSchema> {
  readonly _tag: "Raise"
  readonly event: Event<EventSchema>
}

/**
 * @since 4.0.0
 * @category models
 */
export interface StartActorAction {
  readonly _tag: "StartActor"
  readonly scope: string
  readonly slot: ActorSlot<Any>
  readonly input: ReadonlyArray<unknown>
}

/**
 * @since 4.0.0
 * @category models
 */
export interface StopActorAction {
  readonly _tag: "StopActor"
  readonly scope: string
}

/**
 * @since 4.0.0
 * @category models
 */
export interface ActionQueue<E = never, R = never, EventSchema extends AnyEventSchema = AnyEventSchema> {
  readonly effect: <A, E2 extends E, R2 extends R>(effect: Effect.Effect<A, E2, R2>) => void
  readonly raise: (event: Event<EventSchema>) => void
}

type IsAny<T> = 0 extends 1 & T ? true : false
type InferQueueError<Queue> = Queue extends ActionQueue<infer E, any> ? IsAny<E> extends true ? never : E
  : never
type InferQueueServices<Queue> = Queue extends ActionQueue<any, infer R> ? IsAny<R> extends true ? never : R
  : never

type InferDeferredError<HandlersDef extends Record<string, any>> = HandlerUnion<HandlersDef> extends
  (args: any, actions: infer Queue) => any ? InferQueueError<Queue>
  : never

type InferDeferredServices<HandlersDef extends Record<string, any>> = HandlerUnion<HandlersDef> extends
  (args: any, actions: infer Queue) => any ? InferQueueServices<Queue>
  : never

type InferLifecycleError<HandlersDef extends ReadonlyArray<any>> = LifecycleUnion<HandlersDef> extends
  (args: any, actions: infer Queue) => any ? InferQueueError<Queue>
  : never

type InferLifecycleServices<HandlersDef extends ReadonlyArray<any>> = LifecycleUnion<HandlersDef> extends
  (args: any, actions: infer Queue) => any ? InferQueueServices<Queue>
  : never

type InferCatchError<HandlerDef> = HandlerDef extends (args: any, actions: infer Queue) => any ? InferQueueError<Queue>
  : never

type InferCatchServices<HandlerDef> = HandlerDef extends (args: any, actions: infer Queue) => any ?
  InferQueueServices<Queue>
  : never

type InferInvokeServices<HandlerDef> = HandlerDef extends (args: any) => infer Definition ?
  Definition extends { readonly actor: ActorSlot<infer M> } ? Scope.Scope | ServicesOf<M>
  : never
  : never

type InferHandlerError<HandlersDef extends Record<string, any>> = HandlerUnion<HandlersDef> extends never ? never
  : never
type InferHandlerServices<HandlersDef extends Record<string, any>> = HandlerUnion<HandlersDef> extends never ? never
  : never

/**
 * @since 4.0.0
 * @category models
 */
export interface Plan<
  StateSchemas extends AnyStateSchemas,
  EventSchema extends AnyEventSchema,
  Source extends Snapshot<StateSchemas> = Snapshot<StateSchemas>,
  E = never,
  R = never
> {
  readonly snapshot: Source
  readonly event: Event<EventSchema>
  readonly next: Snapshot<StateSchemas>
  readonly actions: ReadonlyArray<Action<E, R, EventSchema>>
  readonly changed: boolean
}

/**
 * @since 4.0.0
 * @category models
 */
export interface Machine<
  EventSchema extends AnyEventSchema,
  StateSchemas extends AnyStateSchemas,
  InputSchema = undefined,
  Actors extends ActorsDefinition = {},
  E = never,
  R = never,
  DeferredE = never,
  DeferredR = never
> {
  readonly [TypeId]: typeof TypeId
  readonly id: string | undefined
  readonly input: InputSchema
  readonly event: EventSchema
  readonly snapshot: AnyTaggedUnion
  readonly initial: Initializer<InputSchema, Snapshot<StateSchemas>>
  readonly states: { readonly [Name in keyof StateSchemas & string]: DataSchema<StateSchemas, Name> }
  readonly actors: ActorSlotsOf<Actors>
  readonly scopedHandlers: Partial<
    Record<ScopesOfStates<StateSchemas>, Handlers<EventSchema, StateSchemas, Actors, any, any, any>>
  >
  readonly catchHandlers: Partial<Record<string, CatchHandler<any, any, Actors, any, any, any>>>
  readonly catchCauseHandler:
    | CatchCauseHandler<any, any, Actors, any, any, any>
    | undefined
  readonly entryHandlers: Partial<
    Record<
      ScopesOfStates<StateSchemas>,
      ReadonlyArray<LifecycleHandler<EventSchema, StateSchemas, Actors, any, any, any>>
    >
  >
  readonly exitHandlers: Partial<
    Record<
      ScopesOfStates<StateSchemas>,
      ReadonlyArray<LifecycleHandler<EventSchema, StateSchemas, Actors, any, any, any>>
    >
  >
  readonly invokeHandlers: Partial<
    Record<ScopesOfStates<StateSchemas>, ReadonlyArray<InvokeHandler<EventSchema, StateSchemas, Actors, any>>>
  >
  readonly handlers: <Scope extends ScopesOfStates<StateSchemas>>(
    scope: Scope
  ) => <HandlersDef extends HandlerDefinitions<EventSchema, StateSchemas, Actors, Scope>>(
    handlers: HandlersDef
  ) => Machine<
    EventSchema,
    StateSchemas,
    InputSchema,
    Actors,
    InferHandlerError<HandlersDef> | E,
    InferHandlerServices<HandlersDef> | R,
    InferDeferredError<HandlersDef> | DeferredE,
    InferDeferredServices<HandlersDef> | DeferredR
  >
  readonly catch: <
    Tag extends Types.Tags<E | DeferredE>,
    HandlerDef extends CatchHandler<EventSchema, StateSchemas, Actors, Types.ExtractTag<E | DeferredE, Tag>, any, any>
  >(
    tag: Tag,
    handler: HandlerDef
  ) => Machine<
    EventSchema,
    StateSchemas,
    InputSchema,
    Actors,
    Types.ExcludeTag<E, Tag>,
    R,
    Types.ExcludeTag<DeferredE, Tag> | InferCatchError<HandlerDef>,
    DeferredR | InferCatchServices<HandlerDef>
  >
  readonly catchCause: <
    HandlerDef extends CatchCauseHandler<
      EventSchema,
      StateSchemas,
      Actors,
      E | DeferredE | UnhandledEventError | InternalEventLoopError,
      any,
      any
    >
  >(
    handler: HandlerDef
  ) => Machine<
    EventSchema,
    StateSchemas,
    InputSchema,
    Actors,
    never,
    R,
    InferCatchError<HandlerDef>,
    DeferredR | InferCatchServices<HandlerDef>
  >
  readonly entry: <
    Scope extends ScopesOfStates<StateSchemas>,
    HandlersDef extends ReadonlyArray<LifecycleHandler<EventSchema, StateSchemas, Actors, Scope, any, any>>
  >(
    scope: Scope,
    ...handlers: HandlersDef
  ) => Machine<
    EventSchema,
    StateSchemas,
    InputSchema,
    Actors,
    E,
    R,
    InferLifecycleError<HandlersDef> | DeferredE,
    InferLifecycleServices<HandlersDef> | DeferredR
  >
  readonly exit: <
    Scope extends ScopesOfStates<StateSchemas>,
    HandlersDef extends ReadonlyArray<LifecycleHandler<EventSchema, StateSchemas, Actors, Scope, any, any>>
  >(
    scope: Scope,
    ...handlers: HandlersDef
  ) => Machine<
    EventSchema,
    StateSchemas,
    InputSchema,
    Actors,
    E,
    R,
    InferLifecycleError<HandlersDef> | DeferredE,
    InferLifecycleServices<HandlersDef> | DeferredR
  >
  readonly invoke: <
    Scope extends ScopesOfStates<StateSchemas>,
    HandlerDef extends InvokeHandler<EventSchema, StateSchemas, Actors, Scope>
  >(
    scope: Scope,
    handler: HandlerDef
  ) => Machine<
    EventSchema,
    StateSchemas,
    InputSchema,
    Actors,
    E,
    R,
    DeferredE,
    InferInvokeServices<HandlerDef> | DeferredR
  >
}

/**
 * @since 4.0.0
 * @category errors
 */
export class UnhandledEventError extends Schema.TaggedErrorClass<UnhandledEventError, { readonly _: unique symbol }>()(
  "UnhandledEventError",
  {
    machineId: Schema.optional(Schema.String),
    state: Schema.String,
    event: Schema.String
  }
) {}

/**
 * @since 4.0.0
 * @category errors
 */
export class InternalEventLoopError
  extends Schema.TaggedErrorClass<InternalEventLoopError, { readonly _: unique symbol }>()(
    "InternalEventLoopError",
    {
      machineId: Schema.optional(Schema.String),
      event: Schema.String,
      maxIterations: Schema.Number
    }
  )
{}

/**
 * @since 4.0.0
 * @category models
 */
export interface ActorRef<M extends Any> {
  readonly id: string
  readonly send: (event: Event<M["event"]>) => Effect.Effect<void, MachineErrorOf<M>>
}

/**
 * @since 4.0.0
 * @category models
 */
export interface Actor<M extends Any> extends ActorRef<M> {
  readonly snapshot: Effect.Effect<Snapshot<StateSchemasOf<M>>>
  readonly changes: Stream.Stream<Snapshot<StateSchemasOf<M>>>
}

interface Envelope<E, A> {
  readonly event: E
  readonly ack: Deferred.Deferred<Exit.Exit<void, A>>
}

/**
 * @since 4.0.0
 * @category models
 */
export type Any = Machine<any, any, any, any, any, any, any, any>

/**
 * @since 4.0.0
 * @category models
 */
export type StateSchemasOf<M extends Any> = M extends Machine<any, infer StateSchemas, any, any, any, any, any, any> ?
  StateSchemas
  : never

/**
 * @since 4.0.0
 * @category models
 */
export type InputSchemaOf<M extends Any> = M extends Machine<any, any, infer InputSchema, any, any, any, any, any> ?
  InputSchema
  : never

/**
 * @since 4.0.0
 * @category models
 */
export type InputOf<M extends Any> = InputValue<InputSchemaOf<M>>

type ActorDefinitionsOf<M extends Any> = M extends Machine<any, any, any, infer Actors, any, any, any, any> ? Actors
  : never

/**
 * @since 4.0.0
 * @category models
 */
export type ImmediateErrorOf<M extends Any> = M extends Machine<any, any, any, any, infer E, any, any, any> ? E
  : never

/**
 * @since 4.0.0
 * @category models
 */
export type ImmediateServicesOf<M extends Any> = M extends Machine<any, any, any, any, any, infer R, any, any> ? R
  : never

/**
 * @since 4.0.0
 * @category models
 */
export type DeferredErrorOf<M extends Any> = M extends Machine<any, any, any, any, any, any, infer E, any> ? E
  : never

/**
 * @since 4.0.0
 * @category models
 */
export type DeferredServicesOf<M extends Any> = M extends Machine<any, any, any, any, any, any, any, infer R> ? R
  : never

/**
 * @since 4.0.0
 * @category models
 */
export type ErrorOf<M extends Any> = ImmediateErrorOf<M> | DeferredErrorOf<M>

/**
 * @since 4.0.0
 * @category models
 */
export type ServicesOf<M extends Any> = ImmediateServicesOf<M> | DeferredServicesOf<M>

/**
 * @since 4.0.0
 * @category models
 */
export type PlanErrorOf<M extends Any> = ImmediateErrorOf<M>

/**
 * @since 4.0.0
 * @category models
 */
export type PlanServicesOf<M extends Any> = ImmediateServicesOf<M>

/**
 * @since 4.0.0
 * @category models
 */
export type MachineErrorOf<M extends Any> = ErrorOf<M> | UnhandledEventError | InternalEventLoopError

/**
 * @since 4.0.0
 * @category guards
 */
export const isMachine = (u: unknown): u is Any => Predicate.hasProperty(u, TypeId)

const makeActorSlots = <Actors extends ActorsDefinition>(actors: Actors): ActorSlotsOf<Actors> => {
  const slots: Record<string, ActorSlot<Any>> = {}
  for (const key of Object.keys(actors)) {
    slots[key] = {
      _tag: "ActorSlot",
      key,
      machine: actors[key]!,
      [ActorSlotTypeId]: actors[key]!
    }
  }
  return slots as unknown as ActorSlotsOf<Actors>
}

const scopesOf = (tag: string): ReadonlyArray<string> => {
  const segments = tag.split(".")
  const scopes = new Array<string>(segments.length)
  for (let i = segments.length; i >= 1; i--) {
    scopes[segments.length - i] = segments.slice(0, i).join(".")
  }
  return scopes
}

const entryScopesOf = (tag: string): ReadonlyArray<string> => Array.from(scopesOf(tag)).reverse()
const exitScopesOf = scopesOf

const exitScopesBetween = (from: string, to: string): ReadonlyArray<string> => {
  const toScopes = new Set(scopesOf(to))
  return exitScopesOf(from).filter((scope) => !toScopes.has(scope))
}

const entryScopesBetween = (from: string, to: string): ReadonlyArray<string> => {
  const fromScopes = new Set(scopesOf(from))
  return entryScopesOf(to).filter((scope) => !fromScopes.has(scope))
}

/**
 * @since 4.0.0
 * @category constructors
 */
export const make = <
  const Events extends AnyEventTuple,
  const States extends AnyStateTuple,
  InputSchema = undefined,
  const Actors extends ActorsDefinition = {}
>(definition: {
  readonly id?: string | undefined
  readonly input?: InputSchema
  readonly events: Events
  readonly initial: Initializer<InputSchema, Snapshot<StateSchemasOfStates<States>>>
  readonly states: States
  readonly actors?: Actors | undefined
}): Machine<Schema.toTaggedUnion<"_tag", Events>, StateSchemasOfStates<States>, InputSchema, Actors> => {
  const event = normalizeEventSchema(definition)
  const initial = definition.initial
  const snapshot = snapshotSchemaFromStates(definition.states)
  const states = Object.fromEntries(definition.states.map((state) => [stateTag(state), state])) as {
    readonly [Name in keyof StateSchemasOfStates<States> & string]: DataSchema<StateSchemasOfStates<States>, Name>
  }
  const actorSlots = makeActorSlots((definition.actors ?? {}) as Actors)
  const makeMachine = <E, R, DeferredE, DeferredR>(
    scopedHandlers: Partial<
      Record<
        ScopesOfStates<StateSchemasOfStates<States>>,
        Handlers<typeof event, StateSchemasOfStates<States>, Actors, any, any, any>
      >
    >,
    catchHandlers: Partial<Record<string, CatchHandler<any, any, Actors, any, any, any>>>,
    catchCauseHandler:
      | CatchCauseHandler<any, any, Actors, any, any, any>
      | undefined,
    entryHandlers: Partial<
      Record<
        ScopesOfStates<StateSchemasOfStates<States>>,
        ReadonlyArray<LifecycleHandler<typeof event, StateSchemasOfStates<States>, Actors, any, any, any>>
      >
    >,
    exitHandlers: Partial<
      Record<
        ScopesOfStates<StateSchemasOfStates<States>>,
        ReadonlyArray<LifecycleHandler<typeof event, StateSchemasOfStates<States>, Actors, any, any, any>>
      >
    >,
    invokeHandlers: Partial<
      Record<
        ScopesOfStates<StateSchemasOfStates<States>>,
        ReadonlyArray<InvokeHandler<typeof event, StateSchemasOfStates<States>, Actors, any>>
      >
    >
  ): Machine<typeof event, StateSchemasOfStates<States>, InputSchema, Actors, E, R, DeferredE, DeferredR> => ({
    [TypeId]: TypeId,
    id: definition.id,
    input: definition.input as InputSchema,
    event,
    snapshot,
    initial,
    states,
    actors: actorSlots,
    scopedHandlers: scopedHandlers as any,
    catchHandlers,
    catchCauseHandler,
    entryHandlers: entryHandlers as any,
    exitHandlers: exitHandlers as any,
    invokeHandlers: invokeHandlers as any,
    handlers: (scope) => (handlers) =>
      makeMachine<
        InferHandlerError<typeof handlers> | E,
        InferHandlerServices<typeof handlers> | R,
        InferDeferredError<typeof handlers> | DeferredE,
        InferDeferredServices<typeof handlers> | DeferredR
      >(
        {
          ...scopedHandlers,
          [scope]: handlers as Handlers<typeof event, StateSchemasOfStates<States>, Actors, typeof scope, any, any>
        },
        catchHandlers,
        catchCauseHandler,
        entryHandlers,
        exitHandlers,
        invokeHandlers
      ),
    catch: (tag, handler) =>
      makeMachine<
        Types.ExcludeTag<E, typeof tag>,
        R,
        Types.ExcludeTag<DeferredE, typeof tag> | InferCatchError<typeof handler>,
        DeferredR | InferCatchServices<typeof handler>
      >(
        scopedHandlers,
        {
          ...catchHandlers,
          [tag]: handler as CatchHandler<any, any, Actors, any, any, any>
        },
        catchCauseHandler,
        entryHandlers,
        exitHandlers,
        invokeHandlers
      ),
    catchCause: (handler) =>
      makeMachine<
        never,
        R,
        InferCatchError<typeof handler>,
        DeferredR | InferCatchServices<typeof handler>
      >(
        scopedHandlers,
        {},
        handler as CatchCauseHandler<any, any, Actors, any, any, any>,
        entryHandlers,
        exitHandlers,
        invokeHandlers
      ),
    entry: (scope, ...handlers) =>
      makeMachine<
        E,
        R,
        InferLifecycleError<typeof handlers> | DeferredE,
        InferLifecycleServices<typeof handlers> | DeferredR
      >(
        scopedHandlers,
        catchHandlers,
        catchCauseHandler,
        {
          ...entryHandlers,
          [scope]: [
            ...(entryHandlers[scope] ?? []),
            ...handlers
          ] as ReadonlyArray<
            LifecycleHandler<typeof event, StateSchemasOfStates<States>, Actors, typeof scope, any, any>
          >
        },
        exitHandlers,
        invokeHandlers
      ),
    exit: (scope, ...handlers) =>
      makeMachine<
        E,
        R,
        InferLifecycleError<typeof handlers> | DeferredE,
        InferLifecycleServices<typeof handlers> | DeferredR
      >(scopedHandlers, catchHandlers, catchCauseHandler, entryHandlers, {
        ...exitHandlers,
        [scope]: [
          ...(exitHandlers[scope] ?? []),
          ...handlers
        ] as ReadonlyArray<LifecycleHandler<typeof event, StateSchemasOfStates<States>, Actors, typeof scope, any, any>>
      }, invokeHandlers),
    invoke: (scope, handler) =>
      makeMachine<
        E,
        R,
        DeferredE,
        InferInvokeServices<typeof handler> | DeferredR
      >(scopedHandlers, catchHandlers, catchCauseHandler, entryHandlers, exitHandlers, {
        ...invokeHandlers,
        [scope]: [
          ...(invokeHandlers[scope] ?? []),
          handler
        ] as ReadonlyArray<InvokeHandler<typeof event, StateSchemasOfStates<States>, Actors, typeof scope>>
      })
  })
  return makeMachine<never, never, never, never>({}, {}, undefined, {}, {}, {})
}

const snapshotSchemaFromStates = <const States extends AnyStateTuple>(states: States): AnyTaggedUnion =>
  Schema.Union(states as any).pipe(Schema.toTaggedUnion("_tag")) as AnyTaggedUnion

const stateTag = (state: AnyTaggedState): string => {
  const ast = SchemaAST.toEncoded((state as Schema.Top).ast)
  if (!SchemaAST.isObjects(ast)) {
    throw new Error("Machine states must be object-like tagged schemas")
  }
  const tagField = ast.propertySignatures.find((property) => property.name === "_tag")
  if (tagField === undefined || !SchemaAST.isLiteral(tagField.type) || typeof tagField.type.literal !== "string") {
    throw new Error("Machine states must have a string literal _tag")
  }
  return tagField.type.literal
}

const normalizeEventSchema = <const Events extends AnyEventTuple>(
  definition: { readonly events: Events }
): Schema.toTaggedUnion<"_tag", Events> =>
  Schema.Union(definition.events as any).pipe(Schema.toTaggedUnion("_tag")) as Schema.toTaggedUnion<"_tag", Events>

/**
 * @since 4.0.0
 * @category constructors
 */
type InitialArguments<M extends Any> = [InputSchemaOf<M>] extends [undefined] ? [] : [input: InputOf<M>]

const resolveInitial = <M extends Any>(self: M, args: ReadonlyArray<InputOf<M>>): Snapshot<StateSchemasOf<M>> => {
  if (self.input === undefined) {
    return (self.initial as () => Snapshot<StateSchemasOf<M>>)()
  }
  return (self.initial as (args: { readonly input: InputOf<M> }) => Snapshot<StateSchemasOf<M>>)({
    input: args[0] as InputOf<M>
  })
}

/**
 * @since 4.0.0
 * @category constructors
 */
export const initial = <M extends Any>(
  self: M,
  ...args: InitialArguments<M>
): Snapshot<StateSchemasOf<M>> => resolveInitial(self, args as ReadonlyArray<InputOf<M>>)

interface EvaluatedPlan<
  StateSchemas extends AnyStateSchemas,
  EventSchema extends AnyEventSchema,
  Source extends Snapshot<StateSchemas>,
  DeferredE = never,
  DeferredR = never
> {
  readonly plan: Plan<StateSchemas, EventSchema, Source, DeferredE, DeferredR>
  readonly actions: ReadonlyArray<Action<DeferredE, DeferredR, EventSchema>>
}

const makeActionQueue = <EventSchema extends AnyEventSchema, E, R>(): readonly [
  queue: ActionQueue<E, R, EventSchema>,
  read: () => ReadonlyArray<Action<E, R, EventSchema>>
] => {
  const actions: Array<Action<E, R, EventSchema>> = []
  return [
    {
      effect: (effect) => {
        actions.push({
          _tag: "Effect",
          effect: Effect.asVoid(effect)
        })
      },
      raise: (event) => {
        actions.push({
          _tag: "Raise",
          event
        })
      }
    },
    () => actions
  ]
}

interface ActorRuntime {
  readonly start: (
    scope: string,
    slot: ActorSlot<Any>,
    input: ReadonlyArray<unknown>
  ) => Effect.Effect<void, never, any>
  readonly stop: (scope: string) => Effect.Effect<void>
}

const runActions = <E, R>(
  actions: ReadonlyArray<Action<E, R>>,
  runtime?: ActorRuntime | undefined
): Effect.Effect<void, E, R> =>
  Effect.forEach(actions, (action) => {
    switch (action._tag) {
      case "Effect":
        return action.effect
      case "StartActor":
        return runtime === undefined ? Effect.void : runtime.start(action.scope, action.slot, action.input)
      case "StopActor":
        return runtime === undefined ? Effect.void : runtime.stop(action.scope)
      case "Raise":
        return Effect.void
    }
  }, { discard: true }) as Effect.Effect<void, E, R>

const raisedEvents = <EventSchema extends AnyEventSchema>(
  actions: ReadonlyArray<Action<any, any, EventSchema>>
): ReadonlyArray<Event<EventSchema>> => {
  const events: Array<Event<EventSchema>> = []
  for (const action of actions) {
    if (action._tag === "Raise") {
      events.push(action.event)
    }
  }
  return events
}

const collectLifecycleActions = <
  M extends Any,
  Source extends Snapshot<StateSchemasOf<M>>
>(
  handlersByScope: Partial<
    Record<
      ScopesOfStates<StateSchemasOf<M>>,
      ReadonlyArray<LifecycleHandler<M["event"], StateSchemasOf<M>, ActorDefinitionsOf<M>, any, any, any>>
    >
  >,
  scopes: ReadonlyArray<string>,
  state: Source,
  event: Event<M["event"]>,
  actors: ActorSlotsOf<ActorDefinitionsOf<M>>
): ReadonlyArray<Action<DeferredErrorOf<M>, DeferredServicesOf<M>, M["event"]>> => {
  const [actions, readActions] = makeActionQueue<M["event"], DeferredErrorOf<M>, DeferredServicesOf<M>>()
  for (const scope of scopes) {
    const handlers = handlersByScope[scope as keyof typeof handlersByScope] ?? []
    for (const handler of handlers) {
      handler({
        state: state as any,
        event,
        actors
      }, actions)
    }
  }
  return readActions()
}

const collectInvokeStartActions = <
  M extends Any,
  Source extends Snapshot<StateSchemasOf<M>>
>(
  self: M,
  scopes: ReadonlyArray<string>,
  state: Source,
  event: Event<M["event"]> | undefined
): ReadonlyArray<Action<DeferredErrorOf<M>, DeferredServicesOf<M>, M["event"]>> => {
  const actions: Array<Action<DeferredErrorOf<M>, DeferredServicesOf<M>, M["event"]>> = []
  for (const scope of scopes) {
    const handlers = self.invokeHandlers[scope as keyof typeof self.invokeHandlers] ?? []
    for (const handler of handlers) {
      const definition = handler({
        state: state as any,
        event,
        actors: self.actors
      }) as InvokeDefinition<ActorDefinitionsOf<M>>
      actions.push({
        _tag: "StartActor",
        scope,
        slot: definition.actor,
        input: "input" in definition ? [definition.input] : []
      })
    }
  }
  return actions
}

const collectInvokeStopActions = <M extends Any>(
  self: M,
  scopes: ReadonlyArray<string>
): ReadonlyArray<Action<DeferredErrorOf<M>, DeferredServicesOf<M>, M["event"]>> => {
  const actions: Array<Action<DeferredErrorOf<M>, DeferredServicesOf<M>, M["event"]>> = []
  for (const scope of scopes) {
    const handlers = self.invokeHandlers[scope as keyof typeof self.invokeHandlers] ?? []
    if (handlers.length > 0) {
      actions.push({
        _tag: "StopActor",
        scope
      })
    }
  }
  return actions
}

const actionsForTransition = <
  M extends Any,
  Source extends Snapshot<StateSchemasOf<M>>
>(
  self: M,
  current: Source,
  next: Snapshot<StateSchemasOf<M>>,
  event: Event<M["event"]>,
  transitionActions: ReadonlyArray<Action<DeferredErrorOf<M>, DeferredServicesOf<M>, M["event"]>>
): ReadonlyArray<Action<DeferredErrorOf<M>, DeferredServicesOf<M>, M["event"]>> =>
  next === current ? transitionActions : [
    ...collectLifecycleActions(
      self.exitHandlers,
      exitScopesBetween(current._tag, next._tag),
      current,
      event,
      self.actors
    ),
    ...collectInvokeStopActions(self, exitScopesBetween(current._tag, next._tag)),
    ...transitionActions,
    ...collectLifecycleActions(
      self.entryHandlers,
      entryScopesBetween(current._tag, next._tag),
      next,
      event,
      self.actors
    ),
    ...collectInvokeStartActions(self, entryScopesBetween(current._tag, next._tag), next, event)
  ]

const evaluateStep = <
  M extends Any,
  Source extends Snapshot<StateSchemasOf<M>>
>(
  self: M,
  snapshot: Source,
  event: Event<M["event"]>
): Effect.Effect<
  EvaluatedPlan<StateSchemasOf<M>, M["event"], Source, DeferredErrorOf<M>, DeferredServicesOf<M>>,
  UnhandledEventError | PlanErrorOf<M>,
  PlanServicesOf<M>
> =>
  Effect.gen(function*() {
    const current = snapshot as Source
    const currentEvent = event as Event<M["event"]>
    const eventTag = (currentEvent as { readonly _tag: string })._tag
    let handler:
      | Handler<
        StateSchemasOf<M>,
        any,
        ActorDefinitionsOf<M>,
        M["event"],
        EventTag<M["event"]>,
        DeferredErrorOf<M>,
        DeferredServicesOf<M>
      >
      | undefined = undefined
    for (const scope of scopesOf(current._tag)) {
      const handlers = self.scopedHandlers[scope as keyof typeof self.scopedHandlers]
      const candidate = handlers?.[eventTag as keyof typeof handlers] as
        | Handler<
          StateSchemasOf<M>,
          any,
          ActorDefinitionsOf<M>,
          M["event"],
          EventTag<M["event"]>,
          DeferredErrorOf<M>,
          DeferredServicesOf<M>
        >
        | undefined
      if (candidate !== undefined) {
        handler = candidate
        break
      }
    }
    if (handler === undefined) {
      return yield* Effect.fail(
        new UnhandledEventError({
          machineId: self.id,
          state: current._tag,
          event: eventTag
        })
      )
    }
    const [actions, readActions] = makeActionQueue<M["event"], DeferredErrorOf<M>, DeferredServicesOf<M>>()
    const next = handler({
      state: current as any,
      event: currentEvent as any,
      actors: self.actors
    }, actions)
    const transitionActions = readActions()
    const collectedActions = actionsForTransition(self, current, next, currentEvent, transitionActions)
    return {
      plan: {
        snapshot: current,
        event: currentEvent,
        next,
        actions: collectedActions,
        changed: next !== current
      },
      actions: collectedActions
    }
  })

const MaxInternalTransitions = 1000

const evaluate = <
  M extends Any,
  Source extends Snapshot<StateSchemasOf<M>>
>(
  self: M,
  snapshot: Source,
  event: Event<M["event"]>
): Effect.Effect<
  EvaluatedPlan<StateSchemasOf<M>, M["event"], Source, DeferredErrorOf<M>, DeferredServicesOf<M>>,
  UnhandledEventError | InternalEventLoopError | PlanErrorOf<M>,
  PlanServicesOf<M>
> =>
  Effect.gen(function*() {
    const source = snapshot as Source
    let current = source as Snapshot<StateSchemasOf<M>>
    const internalQueue: Array<Event<M["event"]>> = [event]
    const actions: Array<Action<DeferredErrorOf<M>, DeferredServicesOf<M>, M["event"]>> = []
    let index = 0
    let iterations = 0

    while (index < internalQueue.length) {
      if (iterations >= MaxInternalTransitions) {
        return yield* Effect.fail(
          new InternalEventLoopError({
            machineId: self.id,
            event: (event as { readonly _tag: string })._tag,
            maxIterations: MaxInternalTransitions
          })
        )
      }
      iterations++
      const currentEvent = internalQueue[index++]!
      const evaluated = yield* evaluateStep(self, current as any, currentEvent)
      current = evaluated.plan.next
      actions.push(...evaluated.actions)
      internalQueue.push(...raisedEvents(evaluated.actions))
    }

    return {
      plan: {
        snapshot: source,
        event,
        next: current,
        actions,
        changed: current !== source
      },
      actions
    }
  })

const evaluateRaisedActions = <
  M extends Any,
  Source extends Snapshot<StateSchemasOf<M>>
>(
  self: M,
  source: Source,
  event: Event<M["event"]>,
  snapshot: Snapshot<StateSchemasOf<M>>,
  actions: ReadonlyArray<Action<DeferredErrorOf<M>, DeferredServicesOf<M>, M["event"]>>
): Effect.Effect<
  EvaluatedPlan<StateSchemasOf<M>, M["event"], Source, DeferredErrorOf<M>, DeferredServicesOf<M>>,
  UnhandledEventError | InternalEventLoopError | PlanErrorOf<M>,
  PlanServicesOf<M>
> =>
  Effect.gen(function*() {
    let current = snapshot
    const internalQueue: Array<Event<M["event"]>> = [...raisedEvents(actions)]
    const collectedActions: Array<Action<DeferredErrorOf<M>, DeferredServicesOf<M>, M["event"]>> = [...actions]
    let index = 0
    let iterations = 0

    while (index < internalQueue.length) {
      if (iterations >= MaxInternalTransitions) {
        return yield* Effect.fail(
          new InternalEventLoopError({
            machineId: self.id,
            event: (event as { readonly _tag: string })._tag,
            maxIterations: MaxInternalTransitions
          })
        )
      }
      iterations++
      const currentEvent = internalQueue[index++]!
      const evaluated = yield* evaluateStep(self, current as any, currentEvent)
      current = evaluated.plan.next
      collectedActions.push(...evaluated.actions)
      internalQueue.push(...raisedEvents(evaluated.actions))
    }

    return {
      plan: {
        snapshot: source,
        event,
        next: current,
        actions: collectedActions,
        changed: current !== source
      },
      actions: collectedActions
    }
  })

const recover = <
  M extends Any,
  Source extends Snapshot<StateSchemasOf<M>>
>(
  self: M,
  snapshot: Source,
  event: Event<M["event"]>,
  cause: Cause.Cause<MachineErrorOf<M>>
): Effect.Effect<
  EvaluatedPlan<StateSchemasOf<M>, M["event"], Source, DeferredErrorOf<M>, DeferredServicesOf<M>>,
  MachineErrorOf<M>,
  ServicesOf<M>
> =>
  Effect.gen(function*() {
    const current = snapshot as Source
    const currentEvent = event as Event<M["event"]>
    const error = Cause.findErrorOption(cause)
    if (Option.isSome(error) && Predicate.hasProperty(error.value, "_tag")) {
      const handler = self.catchHandlers[
        error.value._tag as keyof typeof self.catchHandlers
      ] as
        | CatchHandler<
          M["event"],
          StateSchemasOf<M>,
          ActorDefinitionsOf<M>,
          any,
          DeferredErrorOf<M>,
          DeferredServicesOf<M>
        >
        | undefined
      if (handler !== undefined) {
        const [actions, readActions] = makeActionQueue<M["event"], DeferredErrorOf<M>, DeferredServicesOf<M>>()
        const next = handler({
          state: current as any,
          event: currentEvent,
          actors: self.actors,
          error: error.value
        }, actions)
        const collectedActions = actionsForTransition(self, current, next, currentEvent, readActions())
        return yield* evaluateRaisedActions(self, current, currentEvent, next, collectedActions)
      }
    }

    const catchCauseHandler = self.catchCauseHandler as
      | CatchCauseHandler<
        M["event"],
        StateSchemasOf<M>,
        ActorDefinitionsOf<M>,
        MachineErrorOf<M>,
        DeferredErrorOf<M>,
        DeferredServicesOf<M>
      >
      | undefined
    if (catchCauseHandler === undefined) {
      return yield* Effect.failCause(cause)
    }

    const [actions, readActions] = makeActionQueue<M["event"], DeferredErrorOf<M>, DeferredServicesOf<M>>()
    const next = catchCauseHandler({
      state: current as any,
      event: currentEvent,
      actors: self.actors,
      cause
    }, actions)
    const collectedActions = actionsForTransition(self, current, next, currentEvent, readActions())
    return yield* evaluateRaisedActions(self, current, currentEvent, next, collectedActions)
  })

const runEvaluatedActions = <
  M extends Any,
  Source extends Snapshot<StateSchemasOf<M>>
>(
  self: M,
  evaluated: EvaluatedPlan<StateSchemasOf<M>, M["event"], Source, DeferredErrorOf<M>, DeferredServicesOf<M>>,
  onRecovery?: (snapshot: Snapshot<StateSchemasOf<M>>) => Effect.Effect<void>,
  runtime?: ActorRuntime | undefined
): Effect.Effect<
  Plan<StateSchemasOf<M>, M["event"], Source, DeferredErrorOf<M>, DeferredServicesOf<M>>,
  MachineErrorOf<M>,
  ServicesOf<M>
> =>
  Effect.gen(function*() {
    let current = evaluated
    const actions: Array<Action<DeferredErrorOf<M>, DeferredServicesOf<M>, M["event"]>> = [...evaluated.actions]
    let iterations = 0

    while (true) {
      if (iterations >= MaxInternalTransitions) {
        return yield* Effect.fail(
          new InternalEventLoopError({
            machineId: self.id,
            event: (evaluated.plan.event as { readonly _tag: string })._tag,
            maxIterations: MaxInternalTransitions
          })
        )
      }
      iterations++
      const result = yield* Effect.exit(runActions(current.actions, runtime))
      if (Exit.isSuccess(result)) {
        return {
          ...evaluated.plan,
          next: current.plan.next,
          actions,
          changed: evaluated.plan.changed || current.plan.changed
        }
      }
      current = yield* recover(self, current.plan.next as any, evaluated.plan.event, result.cause)
      if (onRecovery !== undefined) {
        yield* onRecovery(current.plan.next)
      }
      actions.push(...current.actions)
    }
  })

/**
 * @since 4.0.0
 * @category constructors
 */
export const plan = <
  M extends Any,
  Source extends Snapshot<StateSchemasOf<M>>
>(
  self: M,
  snapshot: Source,
  event: Event<M["event"]>
): Effect.Effect<
  Plan<StateSchemasOf<M>, M["event"], Source, DeferredErrorOf<M>, DeferredServicesOf<M>>,
  UnhandledEventError | InternalEventLoopError | PlanErrorOf<M>,
  PlanServicesOf<M>
> => Effect.map(evaluate(self, snapshot, event), (_) => _.plan)

/**
 * @since 4.0.0
 * @category constructors
 */
export const transition = <
  M extends Any,
  Source extends Snapshot<StateSchemasOf<M>>
>(
  self: M,
  snapshot: Source,
  event: Event<M["event"]>
): Effect.Effect<
  Plan<StateSchemasOf<M>, M["event"], Source, DeferredErrorOf<M>, DeferredServicesOf<M>>,
  MachineErrorOf<M>,
  ServicesOf<M>
> =>
  Effect.gen(function*() {
    const evaluated = yield* Effect.exit(evaluate(self, snapshot, event))
    if (Exit.isFailure(evaluated)) {
      const recovered = yield* recover(self, snapshot, event, evaluated.cause)
      yield* runActions(recovered.actions)
      return recovered.plan
    }
    return yield* runEvaluatedActions(self, evaluated.value)
  })

/**
 * @since 4.0.0
 * @category constructors
 */
export const next = <
  M extends Any,
  Source extends Snapshot<StateSchemasOf<M>>
>(
  self: M,
  snapshot: Source,
  event: Event<M["event"]>
): Effect.Effect<
  Snapshot<StateSchemasOf<M>>,
  MachineErrorOf<M>,
  ServicesOf<M>
> => Effect.map(transition(self, snapshot, event), (plan) => plan.next)

/**
 * @since 4.0.0
 * @category constructors
 */
export const enabled = <
  M extends Any,
  Source extends Snapshot<StateSchemasOf<M>>
>(
  self: M,
  snapshot: Source
): ReadonlyArray<EventTag<M["event"]>> => {
  const enabled = new Set<EventTag<M["event"]>>()
  for (const scope of scopesOf(snapshot._tag)) {
    const handlers = self.scopedHandlers[scope as keyof typeof self.scopedHandlers] ?? {}
    for (const key of Object.keys(handlers)) {
      enabled.add(key as EventTag<M["event"]>)
    }
  }
  return Array.from(enabled)
}

/**
 * @since 4.0.0
 * @category constructors
 */
export const graph = <M extends Any>(self: M) => ({
  id: self.id,
  states: Object.keys(self.states)
})

/**
 * @since 4.0.0
 * @category constructors
 */
export const start = <M extends Any>(
  machine: M,
  ...args: InitialArguments<M>
): Effect.Effect<Actor<M>, never, Scope.Scope | ServicesOf<M>> =>
  Effect.gen(function*() {
    const initialSnapshot = resolveInitial(machine, args as ReadonlyArray<InputOf<M>>)
    const snapshots = yield* Ref.make(initialSnapshot)
    const mailbox = yield* Queue.unbounded<Envelope<Event<M["event"]>, MachineErrorOf<M>>>()
    const changesHub = yield* PubSub.unbounded<Snapshot<StateSchemasOf<M>>>()
    const children = new Map<string, ReadonlyArray<Scope.Scope>>()

    const runtime: ActorRuntime = {
      start: (scope, slot, input) =>
        Effect.gen(function*() {
          const childScope = yield* Scope.make()
          yield* (start as (
            machine: Any,
            input?: any
          ) => Effect.Effect<Actor<Any>, never, Scope.Scope | ServicesOf<Any>>)(slot.machine, input[0]).pipe(
            Effect.provideService(Scope.Scope, childScope)
          )
          children.set(scope, [...(children.get(scope) ?? []), childScope])
        }),
      stop: (scope) => {
        const scopes = children.get(scope) ?? []
        children.delete(scope)
        return Effect.forEach(scopes, (scope) => Scope.close(scope, Exit.void), { discard: true })
      }
    }
    yield* (runActions(
      collectInvokeStartActions(machine, entryScopesOf(initialSnapshot._tag), initialSnapshot, undefined),
      runtime
    ) as Effect.Effect<void, never, Scope.Scope | ServicesOf<M>>)

    const loop = Effect.gen(function*() {
      while (true) {
        const envelope = yield* Queue.take(mailbox)
        const current = yield* Ref.get(snapshots)
        const publishSnapshot = (snapshot: Snapshot<StateSchemasOf<M>>): Effect.Effect<void> =>
          Effect.gen(function*() {
            yield* Ref.set(snapshots, snapshot)
            yield* PubSub.publish(changesHub, snapshot)
          })
        const result = yield* Effect.exit(evaluate(machine, current as any, envelope.event as any))
        if (Exit.isSuccess(result)) {
          yield* publishSnapshot(result.value.plan.next as any)
          const actionsResult = yield* Effect.exit(runEvaluatedActions(machine, result.value, publishSnapshot, runtime))
          yield* Deferred.succeed(
            envelope.ack,
            Exit.isSuccess(actionsResult) ? Exit.succeed<void>(void 0) : Exit.map(actionsResult, () => void 0)
          )
          continue
        }
        const recoveryResult = yield* Effect.exit(
          recover(machine, current as any, envelope.event as any, result.cause as any)
        )
        if (Exit.isFailure(recoveryResult)) {
          yield* Deferred.succeed(envelope.ack, Exit.map(recoveryResult, () => void 0))
          continue
        }
        yield* publishSnapshot(recoveryResult.value.plan.next as any)
        const actionsResult = yield* Effect.exit(
          runEvaluatedActions(machine, recoveryResult.value, publishSnapshot, runtime)
        )
        yield* Deferred.succeed(
          envelope.ack,
          Exit.isSuccess(actionsResult) ? Exit.succeed<void>(void 0) : Exit.map(actionsResult, () => void 0)
        )
      }
    })

    yield* Effect.forkScoped(loop)
    yield* Effect.addFinalizer(() => Queue.shutdown(mailbox))
    yield* Effect.addFinalizer(() => PubSub.shutdown(changesHub))
    yield* Effect.addFinalizer(() =>
      Effect.forEach(
        children.values(),
        (scopes) => Effect.forEach(scopes, (scope) => Scope.close(scope, Exit.void), { discard: true }),
        { discard: true }
      )
    )

    const send = (event: Event<M["event"]>): Effect.Effect<void, MachineErrorOf<M>> =>
      Effect.gen(function*() {
        const ack = yield* Deferred.make<Exit.Exit<void, MachineErrorOf<M>>>()
        yield* Queue.offer(mailbox, { event, ack })
        const exit = yield* Deferred.await(ack)
        return yield* Exit.match(exit, {
          onSuccess: () => Effect.void,
          onFailure: Effect.failCause
        })
      })

    return {
      id: machine.id ?? "Machine",
      send,
      snapshot: Ref.get(snapshots),
      changes: Stream.concat(Stream.make(initialSnapshot), Stream.fromPubSub(changesHub))
    }
  })
