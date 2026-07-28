# Feature Request — `ComponentPostProcessor.afterAllComponentsRegistered`

**Proposed for:** `@asenajs/asena` (core)
**Requested by:** `@asenajs/asena-drizzle`
**Status:** Draft — please review / discuss before prototyping
**Minimum required version bump:** minor (purely additive, no breaking changes)

---

## TL;DR

We need a new optional hook on the existing `ComponentPostProcessor`
interface that fires **once**, after every user component in Phase B has
finished registering with the `Container`. This lets post-processors run
cross-component logic (e.g. "scan every registered service and bind
matches into each eligible consumer") with the full container graph in
hand.

```ts
// asena/lib/ioc/types/ComponentPostProcessor.ts
export interface ComponentPostProcessor {
  postProcess<T>(instance: T, Class: any): T | Promise<T>;

  // NEW — optional, backwards-compatible.
  afterAllComponentsRegistered?(container: Container): void | Promise<void>;
}
```

---

## Context: why the current API is not enough

`ComponentPostProcessor.postProcess(instance, Class)` fires every time
`Container.prepareInstance()` finishes building a user component (after
DI + `@PostConstruct`). This is perfect for per-instance concerns
(wrapping a method with a proxy, inspecting metadata on the incoming
class), but it runs **interleaved with other Phase B registrations**.

Concretely, in `IocEngine.searchAndRegister`
(`/lib/ioc/IocEngine.ts` in the current core):

1. Phase A: `PostProcessor` classes + their transitive deps are registered
   and activated.
2. Phase B: the remaining user components are run through
   `topologicalSort(remaining)` and then registered sequentially via
   `Container.register(name, Class, singleton)`. `register()` triggers
   `prepareInstance()`, which in turn triggers every registered
   `PostProcessor.postProcess()` call.

Because the topological sort only respects **explicit `@Inject`
dependencies**, components that want to relate to each other through a
different axis (e.g. base-class polymorphism, shared metadata markers)
are essentially ordered arbitrarily. When `postProcess(A, ClassA)` runs,
component `B` may not yet be registered — the container map is still
half-populated.

### Concrete symptoms

- You cannot reliably ask *"are there any registered services that
  extend base class X?"* during `postProcess`. The answer depends on
  registration order.
- You cannot fail fast on misconfiguration at startup for cross-component
  invariants (e.g. "exactly one component of type X must exist"). Lazy
  per-call scans can mask the problem until the first request arrives.
- You cannot safely pre-compute a lookup table keyed by metadata that
  lives across multiple components.

---

## Concrete use case — `@asenajs/asena-drizzle`

asena-drizzle wants to make the `databaseService` option on the
`@Repository` and `@Transaction` decorators **optional**: if exactly one
`@Database` service is registered, it should be auto-bound; if more than
one exists, the user gets a precise startup error listing the available
names. This is the same ergonomics Spring Boot provides for its
auto-wired repositories.

Implementing that today requires one of:

- A global registry populated at decorator evaluation time. Breaks as
  soon as the user's import order varies (e.g. tests import the
  repository file before the database file).
- A lazy resolver installed on each repository that runs on first
  `db` access. Works, but the failure modes (missing DB, ambiguous DB)
  surface the first time a query runs rather than at application
  startup — incompatible with a "prod-ready" positioning.
- A post-processor that calls `container.resolveAll(ComponentType.SERVICE)`
  inside `postProcess`. Fails when the repository is scheduled before
  the database, which we cannot influence without introducing a fake
  `@Inject` edge.

An `afterAllComponentsRegistered` hook collapses all of the above into a
single, deterministic pass:

```ts
@PostProcessor()
class DatabaseAutoInjectPostProcessor implements ComponentPostProcessor {
  private pending: Array<{ repo: any; className: string }> = [];

  postProcess<T>(instance: T, Class: any): T {
    if (instance instanceof BaseRepository && needsAutoResolve(Class)) {
      this.pending.push({ repo: instance, className: Class.name });
    }
    return instance;
  }

  async afterAllComponentsRegistered(container: Container) {
    const dbServices = collectInstancesOf(container, AsenaDatabaseService);

    if (dbServices.length === 0 && this.pending.length > 0) {
      throw new Error('No @Database service registered…');
    }
    if (dbServices.length > 1) {
      throw new Error(`Ambiguous @Database: [${dbServices.map(d => d.name).join(', ')}]…`);
    }

    for (const { repo } of this.pending) {
      repo._db = dbServices[0].instance.connection;
      repo._databaseServiceName = dbServices[0].name;
    }
  }
}
```

Failures are now caught **at server startup**, with a message that
names the offending component. That is the semantic we want to ship in
`@asenajs/asena-drizzle` v1.3.0 and — judging by the Spring/NestJS
ecosystems — the semantic users expect.

---

## Proposed API

### Interface change

```diff
 // asena/lib/ioc/types/ComponentPostProcessor.ts

 export interface ComponentPostProcessor {
   postProcess<T>(instance: T, Class: any): T | Promise<T>;
+
+  /**
+   * Optional hook invoked exactly once by the IoC engine after Phase B
+   * registration has fully completed. At this point the container graph is
+   * frozen with respect to user components: every class discovered by
+   * component scanning is present in `container.services`, singletons have
+   * been instantiated, and per-instance `postProcess` calls have all fired.
+   *
+   * Intended for cross-component concerns (scan-and-bind, invariant checks,
+   * pre-computing shared lookup tables). Prefer `postProcess` for
+   * per-instance wrapping; use this hook only when you need a global view.
+   *
+   * Execution order follows the same FIFO registration order as
+   * `postProcess`. Errors thrown here abort bootstrap — consumers should
+   * use that to fail fast on misconfiguration.
+   */
+  afterAllComponentsRegistered?(container: Container): void | Promise<void>;
 }
```

### Engine change

```diff
 // asena/lib/ioc/IocEngine.ts — searchAndRegister()

     if (remainingClasses.length > 0) {
       await this.validateAndRegisterComponents(remainingClasses);
     }
+
+    // NEW — fire the global hook once all user components are in place.
+    for (const processor of this._container.getPostProcessors()) {
+      await processor.afterAllComponentsRegistered?.(this._container);
+    }
   }
```

`Container` would need to expose either a `getPostProcessors()` accessor
or iterate the private list from inside the class — whichever matches
the core's style. The private `postProcessors` array already exists.

### Execution contract

- The hook fires **once per application bootstrap**, after `Phase B`
  finishes. Nothing else in the bootstrap sequence (route registration,
  `AsenaServer.start()`, etc.) runs before it completes.
- The hook is invoked in the **same order** processors were registered
  (FIFO), matching the ordering of `postProcess` calls.
- The hook is **optional**: implementations that omit it get exactly
  today's behavior. No existing `ComponentPostProcessor` breaks.
- Throwing from the hook aborts bootstrap with the thrown error — this
  is explicitly the desired behavior for misconfiguration (fail fast
  at startup, not at first request).

---

## Alternatives considered

| Alternative | Why we prefer the new hook |
|---|---|
| **`Container.resolveAll<T>(baseClass: Class)`** helper | Still forces each post-processor to pick the right moment to call it; does not solve the ordering problem inside `postProcess`. |
| **Metadata-hint on the topological sort** (e.g. `@BindsToComponentType(SERVICE)`) | Leaks a downstream concern into the core sort algorithm; grows the surface area. |
| **New lifecycle phase enum value** (e.g. `POST_REGISTRATION`) | Requires wider core changes and a new consumer API; `ComponentPostProcessor` already carries the right shape. |
| **Do it in `AsenaServer.start()` before `prepareConfigs()`** | Not reachable from user-land plugins; would require plugins to ship against internal server APIs. |

The proposed hook is the smallest possible addition that unblocks
auto-resolution and similar cross-component features for downstream
packages.

---

## Backwards compatibility

- New field is **optional** — every existing `ComponentPostProcessor`
  implementation keeps compiling and behaving identically.
- `IocEngine.searchAndRegister` gets a tail-end loop. If no processor
  implements the hook the loop is a no-op with negligible cost.
- No public API signatures change. No type narrowing on existing
  generics. Semver impact: **minor**.

---

## Test plan (once merged upstream)

1. Register two `@PostProcessor` classes `P1`, `P2` and record the call
   order.
   - Expect `P1.afterAllComponentsRegistered` to fire before
     `P2.afterAllComponentsRegistered` (FIFO).
   - Expect every `afterAllComponentsRegistered` call to happen **after**
     the last `postProcess` of Phase B.
2. Inside `afterAllComponentsRegistered`, call `container.services` (or
   `resolveAll(SERVICE)`) and assert that both a "late-registered"
   component and an "early-registered" component are visible.
3. Throw from `afterAllComponentsRegistered` and assert that
   `AsenaServer.start()` rejects with the thrown error and does not bind
   the adapter to a port.
4. Validate that existing `ComponentPostProcessor` tests (which do not
   implement the new hook) still pass unmodified.

---

## Downstream commitment

When this lands in `@asenajs/asena`, the `@asenajs/asena-drizzle` team
will:

1. Bump the peer dependency on `@asenajs/asena` to the first version
   that ships the hook.
2. Ship `@asenajs/asena-drizzle@1.3.0` with:
   - `@Repository.databaseService` made optional.
   - `@Transaction.database` made optional.
   - Startup-time error with descriptive message for the 0-DB and >1-DB
     cases.
3. Add a follow-up documentation section on Spring-style auto-wiring
   expectations to the `asena-drizzle` README.

We're happy to author the PR against `@asenajs/asena` if the
maintainers agree with the proposed shape.

---

## Open questions

- **Hook name.** `afterAllComponentsRegistered` is descriptive but long.
  `onBootstrapComplete`, `afterComponentScan`, `onReady` are candidates.
  Happy to take whichever matches the core's naming style.
- **Container API surface.** Does the hook receive `Container` or a
  narrower read-only view? For our use case `container.services` /
  `container.resolveAll()` is enough — a read-only projection would be
  fine.
- **Async semantics.** We propose `void | Promise<void>` returns,
  awaited sequentially (to match `postProcess`). If the core prefers
  parallelism, we can adapt — sequential is safer for invariant checks.