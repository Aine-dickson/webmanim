# WebManim

Architecture, Vision & DSL Specification

v0.1 — First working draft

A declarative, interactive simulation platform for mathematics, physics and chemistry — bringing the power of Manim-style animations to the web as live, explorable, user-driven experiences.

# 1. Vision

WebManim is an interactive simulation platform designed for educators, students and researchers who want to create, share and explore mathematical, physical and chemical phenomena directly in the browser. It draws inspiration from Manim — the Python library behind 3Blue1Brown's animated mathematics videos — but shifts the fundamental medium from pre-rendered video to live, interactive simulation.

Where Manim produces a finished film the viewer watches passively, WebManim produces a living scene the learner inhabits. Every parameter can be changed in real time. Every object can be grabbed and dragged. Every simulation can be paused, scrubbed, rewound and explored at the learner's own pace.

## 1.1 The core thesis

Understanding is not the same as watching. A student who watches a pendulum swing for thirty seconds gains far less intuition than one who grabs the bob, pulls it to a large angle, feels the restoring force in the tangent line, and watches the period change. Interactivity is not a feature — it is the pedagogical point.

## 1.2 Positioning

|  |  |
| --- | --- |
| **Tool** | **Relationship to WebManim** |
| Manim | Inspiration. Python DSL → MP4 video. WebManim replaces the video with a live simulation. |
| Desmos | Good for 2-D graphing. WebManim targets full physical simulations with objects and events. |
| GeoGebra | Strong geometry/algebra. WebManim targets physics, chemistry and cross-domain simulations. |
| Observable | Code-first notebook. WebManim is declarative-first with a purpose-built DSL. |
| p5.js / Three.js | General creative coding. WebManim is domain-specific, higher-level, ergonomic by default. |

# 2. Overall Architecture

The system is organised as a pipeline of five distinct layers. Each layer has a single responsibility. No layer reaches into an adjacent layer's domain.

## 2.1 Layer overview

* Layer 0 — DSL source (.wm file)
* Layer 1 — Parser (Lexer → AST)
* Layer 2 — Runtime engine (Rust / WASM)
* Layer 3 — Render layer (JS / Canvas2D / WebGL)
* Layer 4 — Interaction layer (JS / DOM)

## 2.2 Layer 0 — DSL source

The user authors a .wm file — a plain text program in the WebManim DSL. It declares one or more object types, then a single scene that places and connects instances of those types. The file is the complete specification of the simulation: its physics, its visual form, its interactive controls and its world rules.

**Design intent** A physics teacher with no programming background should be able to read any .wm file and understand what it simulates. Keywords read as intent, not implementation.

## 2.3 Layer 1 — Parser

The parser is a hand-written recursive-descent parser with a Pratt operator-precedence expression parser. It transforms the raw .wm source into a typed Abstract Syntax Tree (AST) in two passes:

1. Lexer — converts the character stream into a flat token array. Handles all literals (numbers, strings, colors), identifiers, operators, block delimiters and comments.
2. Parser — consumes the token array and produces the AST. Every grammar construct maps to a named AST node type. The parser is strict: any deviation from the grammar is a hard error with a human-readable message.

The current implementation is in JavaScript for rapid iteration. The long-term target is a Rust parser compiled to WebAssembly, sharing a single grammar definition between the Rust engine and a Language Server Protocol (LSP) implementation for editor tooling.

## 2.4 Layer 2 — Runtime engine

The engine is the computational core of WebManim. It owns all simulation state and advances it forward in time. It is the only layer that writes to the state store.

### State store

All instance state lives in typed flat arrays — Float64Arrays for scalar and vector quantities, Uint8Arrays for agent grids. This layout enables WASM SIMD optimisation and zero-copy reads by the render layer.

### Sim loop

The engine runs a fixed-timestep loop at 60 fps with a configurable sub-step count. Each frame: (1) process pending events, (2) advance all evolve blocks by dt, (3) resolve connections and constraints, (4) detect and fire collision events, (5) enforce boundary conditions, (6) write a render snapshot.

### Numerical integrators

|  |  |
| --- | --- |
| **method:** | **Description** |
| euler | First-order. Fast, simple. Good for stiff systems with small dt. |
| rk4 | Fourth-order Runge-Kutta. Default. Accurate for most ODE systems. |
| verlet | Velocity Verlet. Energy-conserving. Best for particle/N-body simulations. |
| leapfrog | Symplectic. Time-reversible. Best for long-running orbital simulations. |

### Simulation families

The engine is designed to support all six major simulation pattern families, each using the same state store and event system but different computational kernels:

|  |  |
| --- | --- |
| **Family** | **Kernel / mechanism** |
| ODE / Continuous | Integrator on scalar/vector state. Pendulum, circuits, epidemics, orbits. |
| Field / PDE | Discrete Laplacian, gradient operators on 2-D grids. Heat, waves, fluid. |
| Particle / N-body | Pairwise force kernels. Gravity, molecular dynamics, plasma. |
| Agent / Cellular | Neighbour rules on grid state. Game of Life, traffic, flocking. |
| Stochastic / MC | PRNG distributions, Markov transitions. Random walk, Brownian, options. |
| Graph / Network | Propagation rules on adjacency. Disease spread, neural nets, supply chain. |

### Event bus

The engine runs an internal event bus. Events are generated by: the sim clock (tick), the collision detector (collide), boundary conditions (boundary), and the interaction layer (drag, release, click, hover). Handlers registered by on clauses are invoked synchronously at the start of each tick, before evolve runs.

## 2.5 Layer 3 — Render layer

The render layer reads a snapshot from the engine each frame and draws the scene. It never writes state. The renderer is modular — different render targets handle different scene types:

|  |  |
| --- | --- |
| **Render target** | **Used for** |
| Canvas 2D | Objects (circles, rods, rects), particles, agents, trails, force vectors. |
| Plot / axes | Time-series graphs, phase portraits, function curves (math scenes). |
| Heatmap | Field values on a grid — temperature, pressure, probability density. |
| Vector field | Grid of arrows — fluid velocity, electric field, gradient. |
| WebGL (future) | Large particle systems (>10,000 bodies), 3-D scenes. |

The render layer also handles the GSAP timeline — the play/pause/scrub UI. For math explainer scenes (pure function plots with no live physics), GSAP can drive the entire animation as a scripted reveal. For physics simulations, GSAP manages only the UI chrome; the engine's loop drives the frames.

## 2.6 Layer 4 — Interaction layer

The interaction layer bridges user input and the engine event bus. Its responsibilities:

* Hit-testing — on every pointer move, test canvas coordinates against all object shapes to determine which instance (if any) is under the cursor.
* Drag dispatch — on pointer down + move, call engine.onDrag(instanceName, pos), which fires the matching on drag handler.
* Release dispatch — on pointer up, call engine.onRelease(instanceName, vel) with the tracked pointer velocity.
* Control panel — sliders, toggles and buttons declared in the control {} block are rendered as DOM elements. Slider changes call engine.setParam() directly, taking effect on the next tick.
* DSL editor — the syntax-highlighted editor with live re-parse on every keystroke. Run recompiles the full pipeline from source.

# 3. The Object-Event Model

WebManim's central design decision is that physics, shape and behaviour are co-located inside the object declaration. An object is not a data structure that receives equations from outside — it owns its own physics, knows how it looks, and declares how it responds to events.

## 3.1 Anatomy of an object

|  |  |
| --- | --- |
| **Clause** | **Responsibility** |
| shape: | Visual form. Drives hit-testing. Binds rendering properties to state variables. |
| state { } | Named variables. The only data the object owns. Scalars and [x,y] vectors. |
| evolve { } | The update rule. Runs every tick. Reads and writes state only. |
| on event { } | Behaviour triggered by an external event. Multiple handlers allowed. |
| render { } | Optional decorations beyond the base shape: trails, force vectors, labels. |

## 3.2 The scene as composer

The scene {} block does not contain physics. It contains placement (let), relationships (connect), world rules (environment) and user controls (control). This separation means object types are reusable — the same Ball type can appear in a spring scene, a billiards scene and an orbital scene without modification.

## 3.3 Event taxonomy

|  |  |  |
| --- | --- | --- |
| **Event** | **Source** | **Scope** |
| tick | Sim clock, every step | All instances |
| click | Pointer down on shape | Hit instance |
| drag | Pointer move while held | Hit instance |
| release | Pointer up | Previously dragged instance |
| hover | Pointer enters shape bounds | Hit instance |
| collide(other) | Collision detector | Both involved instances |
| boundary | Boundary condition handler | Instance that crossed boundary |
| signal | Another object via emit() | Named signal listeners |

# 4. DSL Reference — v0.1

The full grammar is defined in a companion PEG specification. This section documents each construct with examples drawn from the current implementation.

## 4.1 Top-level structure

A .wm file is a sequence of object declarations followed by exactly one scene block. Order of object declarations does not matter.

```wm
object Bob { // declare an object type
	shape: ...
	state { ... }
	evolve { ... }
	on drag { ... }
}

scene "Pendulum" { // wire instances into a world
	let bob = Bob at [380, 60]
	environment { gravity: [0, 9.8] }
	control { slider bob.L range: 60..240 label: "Length" }
}
```

## 4.2 shape clause

Declares the visual form and drives hit-testing. Any property value can be a literal or an expression referencing state — this is the live binding mechanism.

```wm
shape: circle r: 12 color: #6e8fff // fixed radius
shape: circle r: mass color: element_color // radius tracks state var
shape: rod from: pivot to: bob_pos // endpoints from state
shape: rect w: 40 h: 20 color: #ffd06e

// future
// shape: custom "M 0 0 L 10 20 Z" // SVG path
```

## 4.3 state clause

Named variables — the only data an object owns. Scalars, 2D vectors [x, y], 2D grids and dynamic lists.

```wm
state {
	theta: 1.2       // scalar
	pos: [200, 300]  // 2D vector
	mass: 1.0
	grid[80, 60]     // 2D lattice (field / PDE family)
	agents[]         // dynamic list (agent family)
}
```

## 4.4 evolve clause

The update rule. Runs every simulation tick. Reads and writes state only. dt is always in scope. Method defaults to rk4.

```wm
evolve method: rk4 {
	alpha = -(g / L) * sin(theta)
	omega += (alpha - 0.01 * omega) * dt
	theta += omega * dt
	pos = [pivot[0] + sin(theta) * L,
				 pivot[1] + cos(theta) * L]
}
```

## 4.5 on clause

Behaviour in response to an event. Multiple on clauses are allowed — one per event type. Extra bindings are in scope depending on the event.

```wm
on drag { pos = mouse }
on release { vel = mouse.vel }

on collide(other) {
	vel = reflect(vel, contact.normal) * restitution
}

on boundary { vel *= -1 }
```

## 4.6 render clause (object-level)

Optional decorations beyond the base shape. Trails record position history. Vector renders a state vector as an arrow. Label displays a value.

```wm
render {
	trail color: #ff6e9c opacity: 0.3
	vector vel color: #ffd06e scale: 0.1
	label mass at: [10, -14]
}
```

## 4.7 Scene — let, connect, environment, control

```wm
scene "Spring system" {
	// place instances
	let anchor = Ball at [380, 80] { pinned: 1.0 }
	let ball = Ball at [380, 260]

	// declare a relation
	connect anchor, ball via Spring { k: 80, rest: 140 }

	// world rules
	environment {
		gravity: [0, 9.8]
		boundary: walls // none | walls | wrap | absorb
		damping: 0.005
	}

	// user controls
	control {
		slider ball.mass range: 0.5..5.0 label: "Mass"
		slider Spring.k range: 10..200 label: "Stiffness"
		toggle damping label: "Air resistance"
		button "Kick" { ball.vel = [120.0, -80.0] }
	}

	// scene-level render
	render {
		axes x: 0..760 y: 0..480
		graph ball_energy color: #7fff6e
	}
}
```

## 4.8 Built-in expression functions

|  |  |
| --- | --- |
| **Category** | **Functions** |
| Trigonometry | sin cos tan asin acos atan atan2 |
| Arithmetic | sqrt abs floor ceil round log exp pow mod |
| Range | min max clamp lerp |
| Vector | norm normalize dot cross dist reflect |
| Physics helpers | hooke lennard\_jones coulomb |
| Stochastic | rand rand(lo,hi) normal(mu,sigma) choice(...) |
| Field ops (stubs) | laplacian gradient fourier |

# 5. What v0.1 Covers — Test Cases

The current implementation exercises the following capabilities, each demonstrated by a named example scene:

|  |  |
| --- | --- |
| **Scene** | **Capabilities exercised** |
| pendulum | ODE evolve (RK4), on drag / release, shape: circle + rod, trail render, slider, button |
| spring | connect via relation, spring force kernel, pinned instances, vel kick button |
| n-body | N-body pairwise gravity kernel, boundary: wrap, multiple instances of same type |
| diffusion | Grid state declaration, stub for PDE Laplacian kernel (field family scaffold) |
| sine | Pure math scene, phase animation, math-axes render mode, no objects |

## 5.1 Engine coverage

* Lexer: all token types from grammar spec
* Parser: all block types, Pratt expression precedence
* State store: scalar and vector state, instance overrides
* Euler integrator (default), RK4 stub
* Spring force between connected instances
* N-body pairwise gravity
* Boundary modes: walls, wrap
* on drag and on release event handlers
* Pointer hit-testing with radius tolerance
* Trail recording and rendering
* Slider controls with live engine.setParam()
* Button controls with assign block execution
* Canvas 2D renderer: circles, rods, springs (with stretch colour), pivot markers
* Math-axes render mode for function-plot scenes

# 6. Future DSL Capabilities — The Full Vision

This section documents what the DSL must eventually support to fulfil the full vision. These are not speculative additions — each is required to cover one of the six simulation families or a major interaction pattern that educators need.

## 6.1 Numerical methods

**Gap** Only Euler is fully implemented. RK4, Verlet and leapfrog are parsed but not yet wired to separate integrator kernels.

* Full method: rk4 — requires four evaluations of the derivative per step. Critical for pendulum accuracy at large angles.
* Full method: verlet — velocity Verlet. Required for molecular dynamics where energy conservation matters.
* Full method: leapfrog — symplectic integrator. Required for long-running orbital simulations.
* Adaptive timestep — allow evolve dt: adaptive tolerance: 1e-6 for stiff systems.

## 6.2 Field / PDE family

**Gap** Grid state is declared and parsed but the Laplacian/gradient kernels are stubs. The heatmap renderer is not yet wired.

* Discrete Laplacian kernel — laplacian(grid) returns the second spatial derivative at every cell. Needed for heat diffusion, wave equation, reaction-diffusion.
* Gradient kernel — gradient(grid) returns a vector field. Needed for fluid pressure gradients, electric field from potential.
* Heatmap render target — maps grid float values to a colour ramp. Needs render { heatmap T color: thermal }.
* Vector field render — overlays an arrow at each grid cell. render { vectors vel scale: 0.02 }.
* Source/sink terms — source(x, y, value) and sink(x, y) in evolve for driven PDE systems.

```wm
// Heat diffusion — target DSL
object HeatRod {
	state { T[120, 1] diffusivity: 0.4 }

	evolve method: euler {
		T += laplacian(T) * diffusivity * dt
	}

	on click { T[mouse.gridX, 0] = 1.0 }
}

scene "Heat diffusion" {
	let rod = HeatRod
	render { heatmap rod.T color: thermal }
}
```

## 6.3 Collision detection

**Gap** The on collide handler is parsed but the collision detection pipeline does not yet exist. The engine has no broad-phase or narrow-phase.

* Broad-phase — bounding volume hierarchy (BVH) or uniform spatial grid for O(n log n) candidate pairs.
* Narrow-phase — circle-circle, circle-rect, rect-rect exact tests. GJK for convex polygons (future).
* Contact manifold — provide contact.normal, contact.point, contact.depth to on collide handlers.
* Restitution and friction — on collide(other) { vel = reflect(vel, contact.normal) \* restitution } should work out of the box.

## 6.4 Agent / cellular automata family

**Gap** agents[] list type is declared in the grammar but the engine has no agent iteration or neighbour-rule machinery.

* Agent iteration — implicit for each agent over agents[] without explicit loop syntax in the DSL.
* Neighbour rule — neighbor(r) inside evolve returns the list of agents within radius r.
* Grid cell rules — grid[w,h] cells should be iterable with Moore/Von Neumann neighbourhood built in.
* Spawn and destroy — spawn Agent at pos and destroy self inside on handlers for birth/death rules.

```wm
// Flocking (Boids) — target DSL
object Boid {
	shape: arrow r: 5 color: #7fff6e
	state { pos: [0,0] vel: [0,0] sight: 60 }

	evolve {
		near = neighbor(sight)
		align = avg_vel(near) * 0.05
		cohesion = toward(centroid(near)) * 0.02
		separate = away(too_close(near, 15)) * 0.1
		vel += (align + cohesion + separate) * dt
		vel = normalize(vel) * 2.0
		pos += vel * dt
	}
}

scene "Flocking" {
	spawn 80 Boid randomly
	environment { boundary: wrap }
}
```

## 6.5 Stochastic / Monte Carlo family

* Stochastic evolve mode — evolve stochastic { } marks that the block should run once per agent, not once per tick, using per-agent random state.
* Distribution sampling — sample: normal(mu, sigma) and sample: exponential(lambda) as state initialisation.
* Markov transitions — transition state from: S to: I rate: beta\*I/N block for compartmental models.
* Histogram render target — render { histogram agent.state bins: 20 color: #6e8fff }.

```wm
// SIR epidemic — target DSL
object Person {
	state { epi_state: "S" x: 0 y: 0 }

	evolve stochastic {
		transition epi_state from: "S" to: "I" rate: beta * count("I") / N
		transition epi_state from: "I" to: "R" rate: gamma
	}
}

scene "SIR model" {
	spawn 1000 Person randomly
	Person[0].epi_state = "I" // seed one infected

	control {
		slider beta range: 0.1..0.9 label: "Transmission"
		slider gamma range: 0.01..0.3 label: "Recovery"
	}

	render {
		graph count("S") color: #6e8fff
		graph count("I") color: #ff6e9c
		graph count("R") color: #7fff6e
	}
}
```

## 6.6 Graph / network family

* Graph state — nodes[] and edges[] as first-class state types alongside grids and agent lists.
* Edge properties — edge.weight, edge.capacity, edge.active.
* Propagation rules — propagate signal along edges rate: 0.2 built-in for spreading simulations.
* Force-directed layout — render { graph\_layout: force\_directed } for network visualisation.

## 6.7 Object interactions and signals

* emit() — on collide(other) { emit("bond", other) } sends a named signal to any listener.
* on signal — on signal("bond", sender) { ... } receives it. Enables loose coupling between object types.
* Shared state — global { temperature: 300 } block for scene-level variables readable by all instances.

## 6.8 Measurement and annotation

* measure — measure kinetic\_energy = 0.5 \* mass \* norm(vel)^2 declares a named observable computed from state each tick, available to graph and label renders.
* conserve — conserve energy asserts a conservation law and plots the deviation as a diagnostic.
* Phase portrait — render { phase theta vs omega color: #6e8fff } plots trajectory in 2-D state space.
* Annotation — annotate "Period increases with amplitude" at: [400, 50] places a text callout in the scene.

## 6.9 3-D scenes

* 3-D coordinates — pos: [x, y, z] alongside the existing 2-D [x, y]. Triggers WebGL renderer.
* 3-D shapes — shape: sphere r: 5, shape: box w h d, shape: cylinder r h.
* Camera controls — orbit, pan, zoom. Declared in scene render block.
* 3-D force laws — Lennard-Jones in 3-D, Coulomb in 3-D for molecular dynamics.

## 6.10 Conditional logic in handlers

**Intentional omission in v0.1** if/else and for loops are excluded from the evolve block to keep it pure and predictable. Conditionals belong in on handlers, not in the physics update.

* Conditional in on handlers — allow if expr { assigns } inside on blocks only. Not in evolve.
* Clamp / lerp as substitutes — most conditionals in physics are better expressed as clamp(x, lo, hi) or lerp(a, b, t). These stay in the expression language.

## 6.11 Modules and reuse

* import — import "stdlib/mechanics.wm" for a standard library of common object types (Ball, Spring, Pendulum, Molecule, etc.).
* Parameterised object types — generics that take type-level parameters at scene instantiation.
* export — export object Ball for sharing object types between scenes.

## 6.12 Playback and recording

* State history — the engine records a snapshot ring buffer enabling full timeline scrub.
* Export as video — render the sim loop to a canvas MediaStream and encode to MP4/WebM via MediaRecorder.
* Export as GIF — frame capture for sharing on platforms without video support.
* Checkpoint/restore — save and load named simulation states.

## 6.13 Editor and tooling

* Language Server Protocol (LSP) — autocomplete, hover documentation, inline error squiggles for the DSL.
* Live preview — render pane updates as the user types, without requiring a manual Run.
* AST explorer — already scaffolded in v0.1 via the AST button.
* Embed mode — a read-only iframe-embeddable version for dropping interactive sims into any webpage or notebook.
* Share URL — encode the .wm source in the URL hash for instant sharing.

# 7. Rust / WASM Engine Roadmap

The JavaScript engine is the iteration vehicle. Once the grammar is stable, the engine migrates to Rust compiled to WebAssembly. This gives two things: performance (SIMD-accelerated field operations, large particle counts) and safety (the borrow checker enforces the strict state ownership model the DSL implies).

|  |  |
| --- | --- |
| **Phase** | **Scope** |
| Phase 1 — JS engine (current) | Full grammar parsing, Euler + RK4, spring/N-body, events, renderer. Sufficient for all 2-D ODE scenes. |
| Phase 2 — Rust parser | pest.rs PEG grammar. Produces JSON AST consumed by JS engine. Enables LSP. |
| Phase 3 — Rust sim core | State store in SharedArrayBuffer. Sim loop, integrators, collision in Rust/WASM. JS reads snapshots only. |
| Phase 4 — SIMD kernels | AVX2/SSE Laplacian, force kernels via wasm-simd. Enables 10k+ particle and full PDE scenes. |
| Phase 5 — WebGL renderer | 3-D scenes, large field visualisations. Rust drives WebGL via wasm-bindgen. |

# 8. Design Principles

1. Predictability first. Every keyword does exactly one thing. No clause has hidden side effects on another.
2. The object is the unit. Physics, shape and behaviour live together. Objects are independently reusable.
3. Expressions are uniform. The same expression syntax works in state, evolve, on, shape and render. No special cases.
4. The grammar is the spec. Every keyword is a contract the engine must fulfil. Omit the keyword, omit the capability.
5. Interactivity is structural. on drag is not an afterthought — it lives at the same level as evolve. Interaction is physics.
6. Defaults are sensible. method defaults to rk4. boundary defaults to none. Omitting render still draws something.
7. The scene composes, objects don't know each other. connect is declared in scene, not inside objects. Objects remain decoupled.
8. Scope is the guard. The intentional omissions table in the grammar spec is as important as the grammar itself.

*End of document — WebManim Architecture & Vision v0.1*
