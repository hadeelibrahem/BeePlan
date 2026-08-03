import { useEffect, useRef, useState } from 'react'
import BeeMascot from './BeeMascot'

type Point = { x: number; y: number }
type Flight = { from: Point; to: Point; animate: boolean }

function cubicBezier(start: Point, controlOne: Point, controlTwo: Point, end: Point, progress: number): Point {
  const inverse = 1 - progress
  return {
    x: inverse ** 3 * start.x + 3 * inverse ** 2 * progress * controlOne.x + 3 * inverse * progress ** 2 * controlTwo.x + progress ** 3 * end.x,
    y: inverse ** 3 * start.y + 3 * inverse ** 2 * progress * controlOne.y + 3 * inverse * progress ** 2 * controlTwo.y + progress ** 3 * end.y,
  }
}

function safeEdge(rect: DOMRect): Point {
  const size = 26
  const gap = 8
  const left = rect.left - size - gap
  return {
    x: left >= 8 ? left + size / 2 : Math.min(window.innerWidth - size / 2 - 8, rect.right + gap + size / 2),
    y: Math.max(8 + size / 2, Math.min(window.innerHeight - size / 2 - 8, rect.top + size / 2)),
  }
}

export function BeeCompanion() {
  const beeRef = useRef<HTMLSpanElement>(null)
  const trailRef = useRef<HTMLSpanElement>(null)
  const positionRef = useRef<Point | null>(null)
  const targetRef = useRef<Element | null>(null)
  const targetKeyRef = useRef<string | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const [flight, setFlight] = useState<Flight | null>(null)
  const [flying, setFlying] = useState(false)

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const clicked = event.target instanceof Element ? event.target : null
      const target = clicked?.closest<HTMLElement>('[data-bee-target="true"]')
      if (!target) return
      const targetKey = target.dataset.sidebarPage ?? target.dataset.beeKey ?? target.id ?? null
      if (target === targetRef.current || (targetKey && targetKey === targetKeyRef.current)) return

      const destination = safeEdge(target.getBoundingClientRect())
      const current = positionRef.current
      targetRef.current = target
      targetKeyRef.current = targetKey
      setFlying(Boolean(current))
      setFlight({ from: current ?? destination, to: destination, animate: Boolean(current) })
    }

    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  useEffect(() => {
    if (!flight || !beeRef.current || !trailRef.current) return
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current)

    const bee = beeRef.current
    const trail = trailRef.current
    const { from, to } = flight
    positionRef.current = to

    if (!flight.animate) {
      bee.style.opacity = '1'
      bee.style.transform = `translate3d(${to.x - 13}px, ${to.y - 13}px, 0)`
      trail.style.opacity = '0'
      return
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const duration = reduceMotion ? 120 : 560
    const startedAt = performance.now()
    const controlOne = { x: from.x + (to.x - from.x) * 0.35, y: from.y + (to.y - from.y) * 0.35 - 24 }
    const controlTwo = { x: from.x + (to.x - from.x) * 0.65, y: from.y + (to.y - from.y) * 0.65 - 24 }
    let previous = from

    const frame = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration)
      const eased = progress < 0.5 ? 2 * progress ** 2 : 1 - ((-2 * progress + 2) ** 2) / 2
      const point = cubicBezier(from, controlOne, controlTwo, to, eased)
      const next = cubicBezier(from, controlOne, controlTwo, to, Math.min(1, eased + 0.01))
      const angle = reduceMotion ? 0 : Math.atan2(next.y - point.y, next.x - point.x) * (180 / Math.PI)
      bee.style.opacity = '1'
      bee.style.transform = `translate3d(${point.x - 13}px, ${point.y - 13}px, 0) rotate(${angle}deg) scale(${1 + Math.sin(progress * Math.PI) * 0.05})`
      trail.style.opacity = reduceMotion ? '0' : `${Math.max(0, 0.2 * (1 - progress))}`
      trail.style.transform = `translate3d(${previous.x - 3}px, ${previous.y - 3}px, 0)`
      positionRef.current = point
      previous = point

      if (progress < 1) animationFrameRef.current = requestAnimationFrame(frame)
      else {
        bee.style.transform = `translate3d(${to.x - 13}px, ${to.y - 13}px, 0)`
        trail.style.opacity = '0'
        positionRef.current = to
        setFlying(false)
        animationFrameRef.current = null
      }
    }

    animationFrameRef.current = requestAnimationFrame(frame)
    return () => {
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current)
    }
  }, [flight])

  if (!flight) return null

  return (
    <>
      <span ref={trailRef} aria-hidden="true" className="bp-bee-companion-trail" />
      <span ref={beeRef} aria-hidden="true" className="bp-bee-companion">
        <BeeMascot flying={flying} landing={!flying} size={26} />
      </span>
    </>
  )
}

export default BeeCompanion
