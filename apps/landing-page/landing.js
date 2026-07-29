/**
 * Git Manager landing page — behaviour.
 * Scroll reveal, parallax, bubble generator, nav scroll state.
 *
 * Exported as a function with a teardown rather than run on import, because the
 * landing page has two hosts: this standalone Vite app, and the documentation
 * site (apps/docs), where it is the home route of a single-page app and can be
 * navigated away from. Everything this sets up — observers, intervals, listeners
 * and the animation frame — is returned in the teardown so leaving the route
 * doesn't leak a rAF loop and a bubble timer for the rest of the session.
 *
 * The `landing` class on <html> is what gates the stylesheet's few global rules
 * (reset, body background, scrollbars) — see style.css.
 */

/**
 * @param {Document | HTMLElement} root  where to query the landing markup from
 * @returns {() => void} teardown
 */
export function initLanding(root = document) {
  const disposers = []
  const query = (selector) => root.querySelector(selector)
  const queryAll = (selector) => Array.from(root.querySelectorAll(selector))

  document.documentElement.classList.add('landing')
  disposers.push(() => document.documentElement.classList.remove('landing'))

  /* ══════════════════════════════════════════════════════
     STATIC CAPTURE MODE — ?static=1 renders the final state
     (no reveal animation, no bubbles, no smooth scroll) for
     deterministic screenshots (headless Chrome, e2e, previews).
  ══════════════════════════════════════════════════════ */
  const captureParams = new URLSearchParams(window.location.search)
  const staticCapture = captureParams.has('static')
  if (staticCapture) {
    document.documentElement.classList.add('static-capture')
    disposers.push(() => document.documentElement.classList.remove('static-capture'))
    // Optional deterministic scroll position for section captures (?static=1&scroll=1200)
    if (captureParams.has('scroll')) {
      window.scrollTo(0, Number(captureParams.get('scroll')) || 0)
    }
  }

  /* ══════════════════════════════════════════════════════
     NAV — add glass effect on scroll
  ══════════════════════════════════════════════════════ */
  const nav = query('#nav')
  const hero = query('#hero')

  if (nav && hero) {
    const navObserver = new IntersectionObserver(
      ([entry]) => {
        nav.classList.toggle('is-scrolled', !entry.isIntersecting)
      },
      { threshold: 0.1 }
    )
    navObserver.observe(hero)
    disposers.push(() => navObserver.disconnect())
  }

  /* ══════════════════════════════════════════════════════
     SCROLL REVEAL — Intersection Observer on [data-reveal]
  ══════════════════════════════════════════════════════ */
  const revealTimers = []
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        // Stagger delay for siblings
        const siblings = Array.from(
          entry.target.parentElement?.querySelectorAll('[data-reveal]') ?? []
        )
        const index = siblings.indexOf(entry.target)
        const delay = Math.min(index * 80, 400)

        revealTimers.push(
          setTimeout(() => {
            entry.target.classList.add('is-visible')
          }, delay)
        )
        revealObserver.unobserve(entry.target)
      })
    },
    { threshold: 0.12, rootMargin: '0px 0px -60px 0px' }
  )
  queryAll('[data-reveal]').forEach((el) => revealObserver.observe(el))
  disposers.push(() => {
    revealObserver.disconnect()
    revealTimers.forEach(clearTimeout)
  })

  /* ══════════════════════════════════════════════════════
     BUBBLES — procedurally generated rising bubbles
  ══════════════════════════════════════════════════════ */
  const bubblesContainer = query('#bubbles')
  const bubbleTimers = []

  function createBubble() {
    if (!bubblesContainer) return

    const bubble = document.createElement('div')
    bubble.className = 'bubble'

    // Random properties
    const size = 4 + Math.random() * 24
    const left = 5 + Math.random() * 90 // % from left
    const duration = 8 + Math.random() * 16 // seconds
    const delay = Math.random() * 12 // seconds
    const drift = (Math.random() - 0.5) * 80 // px horizontal drift
    const endScale = 0.5 + Math.random() * 1.2

    bubble.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      left: ${left}%;
      animation-duration: ${duration}s;
      animation-delay: ${delay}s;
      --drift: ${drift}px;
      --end-scale: ${endScale};
    `

    bubblesContainer.appendChild(bubble)

    // Remove after animation completes to avoid DOM bloat
    bubbleTimers.push(
      setTimeout(
        () => {
          bubble.remove()
        },
        (duration + delay) * 1000 + 500
      )
    )
  }

  // Spawn initial batch, then keep spawning (skipped entirely in static capture mode)
  if (!staticCapture) {
    const INITIAL_BUBBLES = 20
    for (let i = 0; i < INITIAL_BUBBLES; i++) createBubble()
    const bubbleInterval = setInterval(createBubble, 1200)
    disposers.push(() => {
      clearInterval(bubbleInterval)
      bubbleTimers.forEach(clearTimeout)
    })
  }

  /* ══════════════════════════════════════════════════════
     PARALLAX — hero mascot subtle parallax on mouse move
  ══════════════════════════════════════════════════════ */
  const mascot = query('#hero-mascot')

  let targetX = 0
  let targetY = 0
  let currentX = 0
  let currentY = 0
  let rafId = null
  let stopped = false

  const lerp = (a, b, t) => a + (b - a) * t

  function animateParallax() {
    if (stopped) return
    currentX = lerp(currentX, targetX, 0.06)
    currentY = lerp(currentY, targetY, 0.06)

    if (mascot) {
      mascot.style.transform = `translate(${currentX}px, ${currentY}px)`
    }

    rafId = requestAnimationFrame(animateParallax)
  }

  function onMouseMove(e) {
    // Only apply when hero is in view
    const heroRect = hero?.getBoundingClientRect()
    if (!heroRect || heroRect.bottom < 0) return

    const cx = window.innerWidth / 2
    const cy = window.innerHeight / 2
    targetX = ((e.clientX - cx) / cx) * 12
    targetY = ((e.clientY - cy) / cy) * 8
  }

  // Pause when tab hidden for performance
  function onVisibilityChange() {
    if (document.hidden) {
      cancelAnimationFrame(rafId)
    } else if (!stopped) {
      animateParallax()
    }
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('visibilitychange', onVisibilityChange)
  animateParallax()

  disposers.push(() => {
    stopped = true
    cancelAnimationFrame(rafId)
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  /* ══════════════════════════════════════════════════════
     SCROLL PARALLAX — Apple-style depth on scroll.
     Transform/opacity only (compositor-friendly), one rAF
     per scroll frame, disabled for reduced motion & capture.
  ══════════════════════════════════════════════════════ */
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (!prefersReducedMotion && !staticCapture) {
    const heroContent = query('.hero__content')
    const circuits = query('.hero__circuits')
    const oceanLayers = [
      [query('.ocean__layer--1'), 0.22],
      [query('.ocean__layer--2'), 0.14],
      [query('.ocean__layer--3'), 0.08],
    ]
    const privacyMascot = query('.privacy__mascot-wrap')
    const osBadge = query('.os__badge')

    let scrollTicking = false

    function applyScrollParallax() {
      scrollTicking = false
      const y = window.scrollY
      const vh = window.innerHeight

      // Hero recedes: drifts up slower than the page, shrinks a touch and fades out
      if (heroContent) {
        const p = Math.min(y / vh, 1.2)
        heroContent.style.transform = `translateY(${y * 0.35}px) scale(${1 - Math.min(p, 1) * 0.06})`
        heroContent.style.opacity = String(Math.max(0, 1 - p * 1.1))
      }
      // Background layers scroll at different speeds → depth
      for (const [layer, factor] of oceanLayers) {
        if (layer) layer.style.transform = `translateY(${y * factor}px)`
      }
      if (circuits) circuits.style.transform = `translateY(${y * 0.18}px)`

      // Below the fold: gentle drift relative to viewport center
      if (privacyMascot) {
        const r = privacyMascot.getBoundingClientRect()
        const d = (r.top + r.height / 2 - vh / 2) / vh
        privacyMascot.style.transform = `translateY(${(-d * 46).toFixed(1)}px)`
      }
      if (osBadge) {
        const r = osBadge.getBoundingClientRect()
        const d = (r.top + r.height / 2 - vh / 2) / vh
        osBadge.style.transform = `translateY(${(-d * 28).toFixed(1)}px)`
      }
    }

    function onScroll() {
      if (!scrollTicking) {
        scrollTicking = true
        requestAnimationFrame(applyScrollParallax)
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    applyScrollParallax()
    disposers.push(() => window.removeEventListener('scroll', onScroll))
  }

  /* ══════════════════════════════════════════════════════
     SMOOTH ANCHOR SCROLL for nav links
  ══════════════════════════════════════════════════════ */
  const anchorHandlers = []
  queryAll('a[href^="#"]').forEach((link) => {
    const onClick = (e) => {
      const href = link.getAttribute('href')
      const target = root.querySelector(href)
      if (target) {
        e.preventDefault()
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
    link.addEventListener('click', onClick)
    anchorHandlers.push(() => link.removeEventListener('click', onClick))
  })
  disposers.push(() => anchorHandlers.forEach((off) => off()))

  /* ══════════════════════════════════════════════════════
     ACTIVE NAV LINK — highlight based on scroll position
  ══════════════════════════════════════════════════════ */
  const navLinks = queryAll('.nav__link')
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        navLinks.forEach((link) => {
          const href = link.getAttribute('href')?.slice(1)
          link.style.color = href === entry.target.id ? 'var(--clr-teal)' : ''
        })
      })
    },
    { threshold: 0.4 }
  )
  queryAll('section[id]').forEach((section) => sectionObserver.observe(section))
  disposers.push(() => sectionObserver.disconnect())

  return () => disposers.forEach((dispose) => dispose())
}
