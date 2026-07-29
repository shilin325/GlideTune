import type { HandFrame, HandGesture, Landmark } from './types'
import { HAND_CONNECTIONS } from './types'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  hue: number
  alpha: number
}

/** 手势 → 粒子色相 / 行为参数 */
const GESTURE_STYLE: Record<
  HandGesture,
  { hue: number; burst: number; attract: number; trail: number }
> = {
  none: { hue: 210, burst: 0, attract: 0, trail: 1 },
  open_palm: { hue: 190, burst: 0.4, attract: -0.15, trail: 1.2 },
  closed_fist: { hue: 280, burst: 0, attract: 0.55, trail: 0.6 },
  pointing_up: { hue: 45, burst: 0.2, attract: 0, trail: 1.4 },
  thumb_up: { hue: 340, burst: 0.8, attract: -0.2, trail: 1.3 },
  thumb_down: { hue: 0, burst: 0.3, attract: 0.2, trail: 0.8 },
  victory: { hue: 45, burst: 1.1, attract: -0.15, trail: 1.5 },
  iloveyou: { hue: 330, burst: 1, attract: -0.25, trail: 1.5 },
  swipe_left: { hue: 200, burst: 2.2, attract: 0, trail: 2 },
  swipe_right: { hue: 200, burst: 2.2, attract: 0, trail: 2 },
  swipe_up: { hue: 170, burst: 2, attract: 0, trail: 2 },
  swipe_down: { hue: 170, burst: 2, attract: 0, trail: 2 },
  pinch: { hue: 50, burst: 0.1, attract: 0.35, trail: 1.1 },
}

/**
 * Canvas 2D 粒子系统：
 * - 跟随指尖/掌心持续发射
 * - 绘制手部骨架连线
 * - 根据手势切换颜色、爆散、吸引等行为
 */
export class ParticleSystem {
  private particles: Particle[] = []
  private lastPalm: Landmark | null = null
  private flash = 0
  private activeGesture: HandGesture = 'none'

  clear() {
    this.particles = []
    this.lastPalm = null
  }

  onGestureBurst(gesture: HandGesture, palm: Landmark, w: number, h: number) {
    const style = GESTURE_STYLE[gesture]
    this.activeGesture = gesture
    this.flash = 1
    const cx = (1 - palm.x) * w // 镜像
    const cy = palm.y * h
    const count = Math.floor(24 + style.burst * 40)

    let dirX = 0
    let dirY = 0
    if (gesture === 'swipe_left') dirX = -1
    if (gesture === 'swipe_right') dirX = 1
    if (gesture === 'swipe_up') dirY = -1
    if (gesture === 'swipe_down') dirY = 1

    for (let i = 0; i < count; i++) {
      const angle = dirX || dirY
        ? Math.atan2(dirY, dirX) + (Math.random() - 0.5) * 0.9
        : Math.random() * Math.PI * 2
      const speed = 2 + Math.random() * (3 + style.burst * 4)
      this.particles.push({
        x: cx + (Math.random() - 0.5) * 20,
        y: cy + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        maxLife: 0.7 + Math.random() * 0.6,
        size: 2 + Math.random() * 4,
        hue: style.hue + (Math.random() - 0.5) * 30,
        alpha: 0.9,
      })
    }
  }

  /**
   * 每帧根据手部关键点更新粒子
   * @param mirrorX 摄像头镜像时，绘制 x = (1 - landmark.x) * width
   */
  update(frame: HandFrame | null, w: number, h: number, dt: number) {
    this.flash = Math.max(0, this.flash - dt * 2.2)

    if (!frame || frame.landmarks.length === 0) {
      // 无手时粒子自然消散
      this.stepParticles(null, w, h, dt, GESTURE_STYLE.none)
      this.lastPalm = null
      return
    }

    const style = GESTURE_STYLE[frame.gesture] ?? GESTURE_STYLE.none
    this.activeGesture = frame.gesture

    const palm = frame.palm
    const px = (1 - palm.x) * w
    const py = palm.y * h

    // 指尖拖尾发射
    const emitRate = 2 + style.trail * 2
    for (const tip of frame.fingertips) {
      const tx = (1 - tip.x) * w
      const ty = tip.y * h
      for (let i = 0; i < emitRate; i++) {
        if (this.particles.length > 420) break
        this.particles.push({
          x: tx + (Math.random() - 0.5) * 6,
          y: ty + (Math.random() - 0.5) * 6,
          vx: (Math.random() - 0.5) * 1.2,
          vy: (Math.random() - 0.5) * 1.2 - 0.3,
          life: 1,
          maxLife: 0.45 + Math.random() * 0.4,
          size: 1.2 + Math.random() * 2.4,
          hue: style.hue + (Math.random() - 0.5) * 40,
          alpha: 0.75,
        })
      }
    }

    // 掌心随速度补喷
    if (this.lastPalm) {
      const speed = Math.hypot(palm.x - this.lastPalm.x, palm.y - this.lastPalm.y)
      if (speed > 0.008) {
        for (let i = 0; i < 4; i++) {
          this.particles.push({
            x: px,
            y: py,
            vx: -(palm.x - this.lastPalm.x) * w * 0.35 + (Math.random() - 0.5),
            vy: (palm.y - this.lastPalm.y) * h * 0.35 + (Math.random() - 0.5),
            life: 1,
            maxLife: 0.5,
            size: 2,
            hue: style.hue,
            alpha: 0.6,
          })
        }
      }
    }
    this.lastPalm = { ...palm }

    this.stepParticles({ x: px, y: py }, w, h, dt, style)
  }

  private stepParticles(
    attractor: { x: number; y: number } | null,
    _w: number,
    _h: number,
    dt: number,
    style: { attract: number; hue: number },
  ) {
    const next: Particle[] = []
    for (const p of this.particles) {
      if (attractor && style.attract !== 0) {
        const ax = attractor.x - p.x
        const ay = attractor.y - p.y
        const dist = Math.hypot(ax, ay) + 0.001
        const f = style.attract * 40 * dt
        p.vx += (ax / dist) * f
        p.vy += (ay / dist) * f
      }

      p.vx *= 0.98
      p.vy *= 0.98
      p.x += p.vx
      p.y += p.vy
      p.life -= dt / p.maxLife
      if (p.life > 0) next.push(p)
    }
    this.particles = next
  }

  draw(
    ctx: CanvasRenderingContext2D,
    frame: HandFrame | null,
    w: number,
    h: number,
  ) {
    ctx.clearRect(0, 0, w, h)

    // 手势闪光环
    if (this.flash > 0 && frame) {
      const px = (1 - frame.palm.x) * w
      const py = frame.palm.y * h
      const style = GESTURE_STYLE[this.activeGesture]
      const r = 40 + (1 - this.flash) * 90
      const g = ctx.createRadialGradient(px, py, 0, px, py, r)
      g.addColorStop(0, `hsla(${style.hue}, 90%, 70%, ${0.35 * this.flash})`)
      g.addColorStop(1, `hsla(${style.hue}, 90%, 50%, 0)`)
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(px, py, r, 0, Math.PI * 2)
      ctx.fill()
    }

    // 骨架
    if (frame && frame.landmarks.length >= 21) {
      this.drawSkeleton(ctx, frame.landmarks, w, h, GESTURE_STYLE[frame.gesture].hue)
    }

    // 粒子
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (const p of this.particles) {
      const a = p.alpha * Math.max(0, p.life)
      ctx.beginPath()
      ctx.fillStyle = `hsla(${p.hue}, 90%, 65%, ${a})`
      ctx.arc(p.x, p.y, p.size * (0.5 + p.life * 0.5), 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  private drawSkeleton(
    ctx: CanvasRenderingContext2D,
    landmarks: Landmark[],
    w: number,
    h: number,
    hue: number,
  ) {
    const pt = (i: number) => ({
      x: (1 - landmarks[i].x) * w,
      y: landmarks[i].y * h,
    })

    ctx.save()
    ctx.lineWidth = 2
    ctx.strokeStyle = `hsla(${hue}, 85%, 70%, 0.55)`
    ctx.shadowColor = `hsla(${hue}, 100%, 60%, 0.8)`
    ctx.shadowBlur = 8

    for (const [a, b] of HAND_CONNECTIONS) {
      const pa = pt(a)
      const pb = pt(b)
      ctx.beginPath()
      ctx.moveTo(pa.x, pa.y)
      ctx.lineTo(pb.x, pb.y)
      ctx.stroke()
    }

    for (let i = 0; i < landmarks.length; i++) {
      const p = pt(i)
      const isTip = [4, 8, 12, 16, 20].includes(i)
      ctx.beginPath()
      ctx.fillStyle = isTip
        ? `hsla(${hue}, 95%, 75%, 0.95)`
        : `hsla(${hue}, 70%, 60%, 0.7)`
      ctx.arc(p.x, p.y, isTip ? 4.5 : 2.8, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
}
