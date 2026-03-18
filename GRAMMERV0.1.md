# WebManim DSL — Grammar Specification v0.1
> First shot. Principles: predictability, simplicity, flexibility, ergonomic structure.

---

## Design principles

1. **Every block has one job.** `state` holds data. `evolve` changes it.
   `render` draws it. `on` reacts to it. `control` exposes it. Never mixed.

2. **Keywords read like intent.** A physics teacher should be able to read
   a scene file without knowing the tool. No sigils, no magic punctuation.

3. **The object is the unit.** Physics, shape and behaviour live together
   inside one `object` declaration. The `scene` only places and connects.

4. **Expressions are just math.** Any value position accepts an expression.
   No special syntax to learn — `sin(x)`, `vel * dt`, `F / mass` all just work.

5. **What you don't write has a sensible default.** `method` defaults to `rk4`.
   `boundary` defaults to `none`. Omitting `render` still draws something.

---

## Top-level structure

A `.wm` file is a sequence of `object` declarations followed by exactly
one `scene` block. Order of `object` declarations does not matter.

```
program     = object_def* scene_def
object_def  = "object" IDENT "{" object_body "}"
scene_def   = "scene" STRING "{" scene_body "}"
```

---

## Object block

```
object_body = (shape_clause
             | state_clause
             | evolve_clause
             | on_clause
             | render_clause)*
```

Each clause appears at most once, in any order.
All clauses are optional — a minimal object is valid.

---

### shape clause

Declares the visual form. Drives hit-testing and default render.

```
shape_clause = "shape" ":" shape_expr

shape_expr   = "circle"   shape_props
             | "rect"     shape_props
             | "rod"      shape_props        // line from pivot to tip
             | "arrow"    shape_props
             | "sphere"   shape_props        // 3-D future
             | "custom"   STRING             // SVG path string

shape_props  = (shape_key ":" value_expr)*

shape_key    = "r" | "w" | "h" | "color" | "opacity"
             | "from" | "to"               // rod / arrow endpoints
             | "fill" | "stroke"
```

Any `shape_key` value can be a literal or an expression referencing `state`.
This is the binding mechanism: `r: mass` means radius tracks the `mass` state var.

**Examples**
```
shape: circle r: 12 color: #6e8fff
shape: circle r: mass color: element_color
shape: rod    from: [0,0] to: [sin(theta)*L, -cos(theta)*L]
shape: rect   w: 40 h: 20 color: #ffd06e
```

---

### state clause

Named variables. These are the only things `evolve` and `on` can read or write.

```
state_clause = "state" "{" state_entry* "}"

state_entry  = IDENT ":" value_expr          // scalar or vector
             | IDENT "[" INT "," INT "]"     // 2-D grid declaration
             | IDENT "[" "]"                 // dynamic list (particles)
```

Scalars, 2D vectors `[x, y]`, grids and lists are the only types.
No objects inside state. No functions inside state. Pure data.

**Examples**
```
state {
  pos:    [200, 300]
  vel:    [0, 0]
  mass:   1.0
  charge: -1
  grid[80, 60]          // 2-D field, e.g. temperature
  agents[]              // dynamic list of agent positions
}
```

---

### evolve clause

The update rule. Runs every simulation tick.
Reads and writes `state` only. No side effects, no rendering here.

```
evolve_clause = "evolve" evolve_opts "{" assign* "}"

evolve_opts  = ("dt" ":" IDENT)?             // name for the timestep var, default "dt"
               ("method" ":" method_name)?

method_name  = "euler" | "rk4" | "verlet" | "leapfrog"

assign       = IDENT ("+=" | "-=" | "*=" | "=") value_expr
```

Assignments execute in order. `dt` is always in scope (the timestep).
Built-in math functions are in scope: `sin cos tan sqrt abs floor ceil
atan2 norm dot cross clamp lerp`.

**Examples**
```
// pendulum
evolve method: rk4 {
  alpha  = -(g / L) * sin(theta)
  omega += (alpha - damping * omega) * dt
  theta += omega * dt
}

// bouncing ball
evolve {
  vel   += [0, gravity] * dt
  pos   += vel * dt
}

// diffusion (grid)
evolve method: euler {
  grid  += laplacian(grid) * diffusion_rate * dt
}
```

---

### on clause

Behaviour in response to an event. Can read and write `state`.
Multiple `on` clauses are allowed — one per event type.

```
on_clause    = "on" event_name on_target? "{" assign* "}"

event_name   = "tick"                        // every sim step (before evolve)
             | "click"
             | "drag"
             | "release"
             | "hover"
             | "collide"                     // requires collision detection
             | "boundary"                    // hit a scene boundary
             | IDENT                         // custom signal name

on_target    = "(" IDENT ")"                 // e.g. on collide(other)
```

Inside an `on` block, extra bindings are in scope:
- `on drag`    → `mouse.pos`, `mouse.vel`, `mouse.delta`
- `on collide` → `other.state.*`, `contact.normal`, `contact.point`
- `on release` → `mouse.vel` (velocity at moment of release)

**Examples**
```
on drag {
  pos = mouse.pos
}

on release {
  vel = mouse.vel
}

on collide(other) {
  vel = reflect(vel, contact.normal) * restitution
}

on boundary {
  vel *= -1
}
```

---

### render clause

How the object draws itself beyond its base shape.
Optional — if omitted the shape clause is the render.

```
render_clause = "render" "{" render_stmt* "}"

render_stmt  = "trail"  render_props          // draw position history
             | "vector" IDENT render_props    // draw a state vector as arrow
             | "label"  value_expr render_props
             | "plot"   IDENT render_props    // time-series sub-plot

render_props = (render_key ":" value_expr)*
render_key   = "color" | "length" | "scale"
             | "opacity" | "width" | "at"
```

**Examples**
```
render {
  trail  color: #6e8fff opacity: 0.4
  vector vel   color: #ff6e9c scale: 0.1
  label  mass  at: [10, -14]
}
```

---

## Scene block

Places objects, defines relationships, sets the world, exposes controls.

```
scene_body   = (let_stmt
              | connect_stmt
              | environment_clause
              | control_clause
              | render_clause)*      // scene-level render: axes, heatmap, etc.
```

---

### let — place an object instance

```
let_stmt     = "let" IDENT "=" IDENT ("at" vec_expr)?  ("{" override* "}")?

override     = IDENT ":" value_expr             // override any state var
```

**Examples**
```
let b1 = Ball at [150, 200]
let b2 = Ball at [400, 200] { mass: 3.0 }
let p  = Pendulum at [320, 60] { L: 140, theta: 0.8 }
```

---

### connect — declare a relation between instances

```
connect_stmt = "connect" IDENT "," IDENT "via" IDENT ("{" override* "}")?
```

The third `IDENT` is an object type used as the relation.
That object's `evolve` receives `a` and `b` bound to the two endpoints.

**Examples**
```
connect b1, b2 via Spring
connect b1, b2 via Spring { k: 80, rest: 100 }
```

---

### environment clause

The world the scene lives in. Affects all objects unless overridden.

```
environment_clause = "environment" "{" env_entry* "}"

env_entry    = "gravity"   ":" vec_expr          // default [0, 9.8]
             | "boundary"  ":" boundary_type     // default none
             | "field"     ":" IDENT             // a named grid object as field
             | "damping"   ":" NUMBER

boundary_type = "none" | "walls" | "wrap" | "absorb"
```

**Examples**
```
environment {
  gravity:  [0, 9.8]
  boundary: walls
  damping:  0.01
}
```

---

### control clause

Exposes parameters to the user. Live — changes take effect next tick.

```
control_clause = "control" "{" control_stmt* "}"

control_stmt = "slider" IDENT ("." IDENT)? "range" ":" NUMBER ".." NUMBER
                 ("default" ":" NUMBER)?
                 ("label" ":" STRING)?
             | "toggle" IDENT ("." IDENT)?
                 ("label" ":" STRING)?
             | "button" STRING "{" assign* "}"    // imperative one-shot action
```

The dotted form `instance.state_var` targets a specific instance.
The plain form targets the matching state var across all instances of that type.

**Examples**
```
control {
  slider gravity.y  range: 0..20     default: 9.8  label: "Gravity"
  slider Spring.k   range: 10..200   default: 40   label: "Spring stiffness"
  toggle damping                                    label: "Air resistance"
  button "Reset" {
    b1.pos = [150, 200]
    b1.vel = [0, 0]
    b2.pos = [400, 200]
    b2.vel = [0, 0]
  }
}
```

---

### scene-level render clause

Draws the world frame — axes, fields, measurements.
Uses the same `render` keyword but at scene scope.

```
render_stmt  += "axes"     render_props          // coordinate frame
              | "heatmap"  IDENT render_props    // grid object → colour map
              | "graph"    IDENT render_props    // named object measure → time plot
              | "vectors"  IDENT render_props    // grid of velocity/force arrows
```

**Examples**
```
render {
  axes   x: -6..6  y: -4..4
  heatmap temperature  color: thermal
  graph   kinetic_energy  color: #7fff6e
}
```

---

## Expressions

Wherever `value_expr` appears, this grammar applies.

```
value_expr   = NUMBER
             | STRING
             | BOOL                           // true | false
             | vec_literal                    // [ expr, expr ]
             | IDENT                          // state var or bound name
             | IDENT "." IDENT               // other.state.vel etc
             | func_call
             | value_expr binop value_expr
             | unop value_expr
             | "(" value_expr ")"

vec_literal  = "[" value_expr "," value_expr "]"

func_call    = IDENT "(" (value_expr ("," value_expr)*)? ")"

binop        = "+" | "-" | "*" | "/" | "%" | "^"
             | "==" | "!=" | "<" | "<=" | ">" | ">="
             | "&&" | "||"

unop         = "-" | "!"
```

---

## Built-in functions

Available in any expression context.

### Math
```
sin(x)  cos(x)  tan(x)  asin(x)  acos(x)  atan(x)  atan2(y,x)
sqrt(x)  abs(x)  floor(x)  ceil(x)  round(x)  log(x)  exp(x)
min(a,b)  max(a,b)  clamp(x,lo,hi)  lerp(a,b,t)  mod(a,b)
```

### Vector
```
norm(v)          // magnitude
normalize(v)     // unit vector
dot(a, b)        // dot product
cross(a, b)      // 2-D cross (scalar) or 3-D cross (vector)
dist(a, b)       // Euclidean distance between two vec2
reflect(v, n)    // reflection of v about normal n
```

### Physics helpers
```
lennard_jones(r, epsilon, sigma)    // LJ potential force magnitude
coulomb(q1, q2, r)                  // Coulomb force magnitude
hooke(k, rest, r)                   // spring force magnitude
laplacian(grid)                     // discrete ∇² of a grid state var
gradient(grid)                      // discrete ∇ of a grid state var → vec grid
fourier(array)                      // DFT of a 1-D state array
```

### Stochastic
```
rand()                  // uniform [0, 1)
rand(lo, hi)            // uniform [lo, hi)
normal(mu, sigma)       // Gaussian sample
choice(a, b, ...)       // pick one uniformly
```

---

## Lexical rules

```
IDENT    = [a-zA-Z_][a-zA-Z0-9_]*
NUMBER   = [-]?[0-9]+("."[0-9]+)?([eE][+-]?[0-9]+)?
STRING   = '"' [^"]* '"'
BOOL     = "true" | "false"
INT      = [0-9]+
COLOR    = "#" [0-9a-fA-F]{3,6}

comment  = "//" [^\n]*            // single line only
         | "/*" .*? "*/"          // block comment
```

Whitespace and comments are ignored everywhere.

---

## Complete example — double pendulum

This example exercises every clause.

```
object Bob {
  shape: circle r: 10 color: #ff6e9c

  state {
    pos:   [0, 0]
    vel:   [0, 0]
    theta: 0.0
    omega: 0.0
    L:     120
    mass:  1.0
  }

  evolve method: rk4 {
    pos = pivot + [sin(theta) * L, -cos(theta) * L]
  }

  on drag {
    theta = atan2(mouse.pos - pivot)
    omega = 0
  }

  on release {
    omega = mouse.vel.x / L
  }

  render {
    trail  color: #ff6e9c opacity: 0.3
    vector vel   color: #ffd06e scale: 0.05
  }
}

object Rod {
  shape: rod from: a.pos to: b.pos color: #4a4a6a
}

scene "Double pendulum" {
  let pivot = [320, 80]
  let b1 = Bob at pivot { theta: 0.6, L: 120 }
  let b2 = Bob at b1.pos { theta: 0.3, L: 100, mass: 0.8 }

  connect pivot, b1 via Rod
  connect b1,    b2 via Rod

  environment {
    gravity:  [0, 9.8]
    boundary: none
  }

  control {
    slider b1.L     range: 60..200   label: "Rod 1 length"
    slider b2.L     range: 60..200   label: "Rod 2 length"
    slider b1.mass  range: 0.5..5    label: "Bob 1 mass"
    toggle damping                   label: "Damping"
    button "Reset" {
      b1.theta = 0.6
      b1.omega = 0
      b2.theta = 0.3
      b2.omega = 0
    }
  }

  render {
    axes x: 0..640 y: 0..480
    graph b1.theta  color: #6e8fff  label: "θ₁"
    graph b2.theta  color: #ff6e9c  label: "θ₂"
  }
}
```

---

## What the grammar intentionally omits (v0.1)

These are out of scope until the grammar is extended deliberately.

| Omitted | Why deferred |
|---|---|
| 3-D coordinates | adds renderer complexity, tackle after 2-D is solid |
| `if / else` in evolve | use `clamp`, `lerp`, expressions instead — keeps evolve pure |
| `for` loops in evolve | agent grids iterate implicitly; explicit loops risk complexity |
| custom force laws beyond built-ins | `lennard_jones`, `hooke`, `coulomb` cover the common cases |
| imports / modules | single-file first, composition later |
| time-dependent boundary conditions | environment is static for now |
| 3-body+ explicit connections | N-body handled by `force(i,j)` kernel, not connect statements |