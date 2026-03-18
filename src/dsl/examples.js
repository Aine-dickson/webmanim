export const EXAMPLES = {
  pendulum: `// Single pendulum — drag the bob
object Bob {
  shape: circle r: 12 color: #ff6e9c

  state {
    theta:   1.2
    omega:   0.0
    L:       160
    mass:    1.0
    pivot:   [380, 60]
    pos:     [0, 0]
  }

  evolve method: rk4 {
    alpha = -(9.8 / L) * sin(theta)
    omega += (alpha - 0.01 * omega) * dt
    theta += omega * dt
    pos    = [pivot[0] + sin(theta)*L, pivot[1] + cos(theta)*L]
  }

  on drag {
    theta = atan2(mouse.pos[0] - pivot[0], mouse.pos[1] - pivot[1])
    omega = 0.0
  }

  render {
    trail color: #ff6e9c opacity: 0.3
  }
}

object Rod {
  shape: rod color: #3a3a5a
  state {
    from: [0, 0]
    to:   [0, 0]
  }
}

scene "Pendulum" {
  let bob = Bob
  let rod = Rod

  control {
    slider bob.L    range: 60..240   default: 160  label: "Length"
    slider bob.mass range: 0.5..5.0  default: 1.0  label: "Mass"
    button "Release" { omega = 0.0 }
  }

  render {
    axes x: 0..760 y: 0..480
  }
}`,

  spring: `// Two balls connected by a spring
object Ball {
  shape: circle r: 14 color: #6e8fff

  state {
    pos: [0, 0]
    vel: [0, 0]
    mass: 1.0
    pinned: 0.0
  }

  evolve method: euler {
    vel += [0.0, 9.8 * (1.0 - pinned)] * dt
    pos += vel * dt
  }

  on drag {
    pos = mouse.pos
    vel = [0.0, 0.0]
  }

  render {
    trail color: #6e8fff opacity: 0.25
  }
}

object Spring {
  shape: rod color: #ffd06e
  state {
    k:    60.0
    rest: 140.0
    a:    [0, 0]
    b:    [0, 0]
  }
  evolve method: euler {
    diff   = [b[0]-a[0], b[1]-a[1]]
    d      = sqrt(diff[0]*diff[0] + diff[1]*diff[1])
    f      = k * (d - rest) / d
    a      = a
    b      = b
  }
}

scene "Spring system" {
  let anchor = Ball at [380, 80]  { pinned: 1.0 mass: 99.0 }
  let ball   = Ball at [380, 260]

  connect anchor, ball via Spring

  control {
    slider ball.mass  range: 0.5..5.0  default: 1.0  label: "Ball mass"
    slider Spring.k   range: 10..200   default: 60   label: "Stiffness k"
    slider Spring.rest range: 60..220  default: 140  label: "Rest length"
    button "Kick" { vel = [120.0, -80.0] }
  }

  render {
    axes x: 0..760 y: 0..480
  }
}`,

  nbody: `// N-body gravity — click canvas to add bodies
object Body {
  shape: circle r: 6 color: #7fff6e

  state {
    pos:  [0, 0]
    vel:  [0, 0]
    mass: 1.0
  }

  evolve method: euler {
    vel += [0.0, 0.0] * dt
    pos += vel * dt
  }

  on drag {
    pos = mouse.pos
  }

  render {
    trail color: #7fff6e opacity: 0.2
  }
}

scene "N-body gravity" {
  let b1 = Body at [280, 240] { mass: 3.0 vel: [0.0,  60.0] }
  let b2 = Body at [480, 240] { mass: 3.0 vel: [0.0, -60.0] }
  let b3 = Body at [380, 140] { mass: 1.5 vel: [50.0,  0.0] }

  environment {
    gravity:  [0.0, 0.0]
    boundary: wrap
  }

  control {
    slider b1.mass range: 0.5..8.0 default: 3.0 label: "Body 1 mass"
    slider b2.mass range: 0.5..8.0 default: 3.0 label: "Body 2 mass"
  }

  render {
    axes x: 0..760 y: 0..480
  }
}`,

  diffusion: `// Heat diffusion on a 1-D rod
object Rod1D {
  shape: rect w: 700 h: 40 color: #6e8fff

  state {
    T:           0.0
    x:           0.0
    diffusion:   0.4
  }

  evolve method: euler {
    T += 0.0 * dt
  }
}

scene "Heat diffusion" {
  let rod = Rod1D at [380, 240]

  control {
    slider rod.diffusion range: 0.05..1.0 default: 0.4 label: "Diffusivity"
    button "Heat centre" { T = 1.0 }
  }

  render {
    axes x: 0..760 y: 0..480
  }
}`,

  sine: `// Interactive sine — pure math scene
object Wave {
  shape: rect w: 1 h: 1 color: #6e8fff

  state {
    freq:  1.0
    amp:   1.0
    phase: 0.0
    speed: 0.5
  }

  evolve method: euler {
    phase += speed * dt
  }
}

scene "Sine wave" {
  let wave = Wave

  control {
    slider wave.freq  range: 0.5..5.0  default: 1.0  label: "Frequency"
    slider wave.amp   range: 0.2..2.0  default: 1.0  label: "Amplitude"
    slider wave.speed range: 0.0..3.0  default: 0.5  label: "Speed"
  }

  render {
    axes x: -6..6 y: -2.5..2.5
  }
}`,

  bouncer: `// Gravity + walls + drag throw
object Ball {
  shape: circle r: 10 color: #ffd06e

  state {
    pos: [240, 120]
    vel: [130, -20]
    drag_lock: 0.0
  }

  evolve method: euler {
    vel += gravity * dt
    pos += vel * dt
  }

  on drag {
    pos = mouse.pos
    vel = [0.0, 0.0]
  }

  on release {
    vel = mouse.vel * 0.15
  }

  render {
    trail color: #ffd06e opacity: 0.3
  }
}

scene "Bouncer" {
  let ball = Ball

  environment {
    gravity: [0.0, 12.0]
    boundary: walls
  }

  control {
    slider gravity.y range: 0..30 default: 12 label: "Gravity y"
  }

  render {
    axes x: 0..760 y: 0..480
  }
}`,

  spiral: `// Spiral sink with tunable pull + swirl
object Probe {
  shape: circle r: 8 color: #ff6e9c

  state {
    pos: [620, 120]
    vel: [0, 80]
    center: [380, 240]
    pull: 28.0
    swirl: 40.0
    damping: 0.35
  }

  evolve method: euler {
    d = [center[0] - pos[0], center[1] - pos[1]]
    a = [d[0] * pull * 0.01 + d[1] * swirl * 0.01, d[1] * pull * 0.01 - d[0] * swirl * 0.01]
    vel += (a - vel * damping) * dt
    pos += vel * dt
  }

  on drag {
    pos = mouse.pos
    vel = [0, 0]
  }

  render {
    trail color: #ff6e9c opacity: 0.35
  }
}

scene "Spiral sink" {
  let p = Probe

  control {
    slider p.pull    range: 2..80  default: 28  label: "Pull"
    slider p.swirl   range: -90..90 default: 40 label: "Swirl"
    slider p.damping range: 0.0..1.2 default: 0.35 label: "Damping"
  }

  render {
    axes x: 0..760 y: 0..480
  }
}`,

  lissajous: `// Lissajous marker with trail
object Marker {
  shape: circle r: 7 color: #7fff6e

  state {
    pos:   [380, 240]
    t:     0.0
    ax:    200.0
    ay:    140.0
    fx:    3.0
    fy:    2.0
    phase: 1.2
    speed: 1.0
  }

  evolve method: euler {
    t += speed * dt
    pos = [380 + ax * sin(fx * t + phase), 240 + ay * sin(fy * t)]
  }

  render {
    trail color: #7fff6e opacity: 0.25
  }
}

scene "Lissajous" {
  let m = Marker

  control {
    slider m.fx    range: 1..8 default: 3 label: "fx"
    slider m.fy    range: 1..8 default: 2 label: "fy"
    slider m.phase range: 0..6.28 default: 1.2 label: "phase"
    slider m.speed range: 0..4 default: 1 label: "speed"
  }

  render {
    axes x: 0..760 y: 0..480
  }
}`,

  dual: `// Two independent movers for control testing
object Dot {
  shape: circle r: 9 color: #6e8fff

  state {
    pos: [0, 0]
    vel: [0, 0]
    thrust: [0, 0]
    drag: 0.2
  }

  evolve method: euler {
    vel += (thrust - vel * drag) * dt
    pos += vel * dt
  }

  on drag {
    pos = mouse.pos
    vel = [0, 0]
  }

  render {
    trail color: #6e8fff opacity: 0.2
  }
}

scene "Dual movers" {
  let a = Dot at [220, 200] { vel: [0, -50] }
  let b = Dot at [520, 260] { vel: [0, 40] }

  control {
    slider Dot.drag range: 0.0..1.0 default: 0.2 label: "Drag (all dots)"
  }

  environment {
    boundary: wrap
    gravity: [0, 0]
  }

  render {
    axes x: 0..760 y: 0..480
  }
}`
};
