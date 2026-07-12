/**
 * Git Manager Landing Page — script.js
 * Handles: scroll reveal, parallax, bubble generator, nav scroll state
 *
 * The octopus mascot is the shared <git-mascot> web component. Importing it here
 * registers the custom element; it renders its own artwork, idle animations and
 * pointer-following eyes internally (in Shadow DOM).
 */
import '@git-manager/mascot/element';

/* ══════════════════════════════════════════════════════
   STATIC CAPTURE MODE — ?static=1 renders the final state
   (no reveal animation, no bubbles, no smooth scroll) for
   deterministic screenshots (headless Chrome, e2e, previews).
══════════════════════════════════════════════════════ */
const CAPTURE_PARAMS = new URLSearchParams(window.location.search);
const STATIC_CAPTURE = CAPTURE_PARAMS.has('static');
if (STATIC_CAPTURE) {
  document.documentElement.classList.add('static-capture');
  // Optional deterministic scroll position for section captures (?static=1&scroll=1200)
  window.addEventListener('load', () => {
    if (CAPTURE_PARAMS.has('scroll')) {
      window.scrollTo(0, Number(CAPTURE_PARAMS.get('scroll')) || 0);
    }
  });
}

/* ══════════════════════════════════════════════════════
   NAV — add glass effect on scroll
══════════════════════════════════════════════════════ */
const nav = document.getElementById('nav');

const navObserver = new IntersectionObserver(
  ([entry]) => {
    nav.classList.toggle('is-scrolled', !entry.isIntersecting);
  },
  { threshold: 0.1 }
);

// Observe the hero section — when it leaves viewport, activate nav glass
const hero = document.getElementById('hero');
if (hero) navObserver.observe(hero);

/* ══════════════════════════════════════════════════════
   SCROLL REVEAL — Intersection Observer on [data-reveal]
══════════════════════════════════════════════════════ */
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        // Stagger delay for siblings
        const siblings = Array.from(
          entry.target.parentElement?.querySelectorAll('[data-reveal]') ?? []
        );
        const index = siblings.indexOf(entry.target);
        const delay = Math.min(index * 80, 400);

        setTimeout(() => {
          entry.target.classList.add('is-visible');
        }, delay);

        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12, rootMargin: '0px 0px -60px 0px' }
);

document.querySelectorAll('[data-reveal]').forEach((el) => {
  revealObserver.observe(el);
});

/* ══════════════════════════════════════════════════════
   BUBBLES — procedurally generated rising bubbles
══════════════════════════════════════════════════════ */
const bubblesContainer = document.getElementById('bubbles');

function createBubble() {
  if (!bubblesContainer) return;

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  // Random properties
  const size = 4 + Math.random() * 24;
  const left = 5 + Math.random() * 90; // % from left
  const duration = 8 + Math.random() * 16; // seconds
  const delay = Math.random() * 12; // seconds
  const drift = (Math.random() - 0.5) * 80; // px horizontal drift
  const endScale = 0.5 + Math.random() * 1.2;

  bubble.style.cssText = `
    width: ${size}px;
    height: ${size}px;
    left: ${left}%;
    animation-duration: ${duration}s;
    animation-delay: ${delay}s;
    --drift: ${drift}px;
    --end-scale: ${endScale};
  `;

  bubblesContainer.appendChild(bubble);

  // Remove after animation completes to avoid DOM bloat
  setTimeout(() => {
    bubble.remove();
  }, (duration + delay) * 1000 + 500);
}

// Spawn initial batch, then keep spawning (skipped entirely in static capture mode)
if (!STATIC_CAPTURE) {
  const INITIAL_BUBBLES = 20;
  for (let i = 0; i < INITIAL_BUBBLES; i++) {
    createBubble();
  }
  setInterval(createBubble, 1200);
}

/* ══════════════════════════════════════════════════════
   PARALLAX — hero mascot subtle parallax on mouse move
══════════════════════════════════════════════════════ */
const mascot = document.getElementById('hero-mascot');

let targetX = 0;
let targetY = 0;
let currentX = 0;
let currentY = 0;
let rafId = null;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function animateParallax() {
  currentX = lerp(currentX, targetX, 0.06);
  currentY = lerp(currentY, targetY, 0.06);

  if (mascot) {
    mascot.style.transform = `translate(${currentX}px, ${currentY}px)`;
  }

  rafId = requestAnimationFrame(animateParallax);
}

document.addEventListener('mousemove', (e) => {
  // Only apply when hero is in view
  const heroRect = hero?.getBoundingClientRect();
  if (!heroRect || heroRect.bottom < 0) return;

  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const dx = (e.clientX - cx) / cx;
  const dy = (e.clientY - cy) / cy;

  targetX = dx * 12;
  targetY = dy * 8;
});

// Start parallax loop
animateParallax();

// Pause when tab hidden for performance
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(rafId);
  } else {
    animateParallax();
  }
});

/* ══════════════════════════════════════════════════════
   SCROLL PARALLAX — Apple-style depth on scroll.
   Transform/opacity only (compositor-friendly), one rAF
   per scroll frame, disabled for reduced motion & capture.
══════════════════════════════════════════════════════ */
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!prefersReducedMotion && !STATIC_CAPTURE) {
  const heroContent = document.querySelector('.hero__content');
  const circuits = document.querySelector('.hero__circuits');
  const oceanLayers = [
    [document.querySelector('.ocean__layer--1'), 0.22],
    [document.querySelector('.ocean__layer--2'), 0.14],
    [document.querySelector('.ocean__layer--3'), 0.08],
  ];
  const privacyMascot = document.querySelector('.privacy__mascot-wrap');
  const osBadge = document.querySelector('.os__badge');

  let scrollTicking = false;

  function applyScrollParallax() {
    scrollTicking = false;
    const y = window.scrollY;
    const vh = window.innerHeight;

    // Hero recedes: drifts up slower than the page, shrinks a touch and fades out
    if (heroContent) {
      const p = Math.min(y / vh, 1.2);
      heroContent.style.transform = `translateY(${y * 0.35}px) scale(${1 - Math.min(p, 1) * 0.06})`;
      heroContent.style.opacity = String(Math.max(0, 1 - p * 1.1));
    }
    // Background layers scroll at different speeds → depth
    for (const [layer, factor] of oceanLayers) {
      if (layer) layer.style.transform = `translateY(${y * factor}px)`;
    }
    if (circuits) circuits.style.transform = `translateY(${y * 0.18}px)`;

    // Below the fold: gentle drift relative to viewport center
    if (privacyMascot) {
      const r = privacyMascot.getBoundingClientRect();
      const d = (r.top + r.height / 2 - vh / 2) / vh;
      privacyMascot.style.transform = `translateY(${(-d * 46).toFixed(1)}px)`;
    }
    if (osBadge) {
      const r = osBadge.getBoundingClientRect();
      const d = (r.top + r.height / 2 - vh / 2) / vh;
      osBadge.style.transform = `translateY(${(-d * 28).toFixed(1)}px)`;
    }
  }

  window.addEventListener(
    'scroll',
    () => {
      if (!scrollTicking) {
        scrollTicking = true;
        requestAnimationFrame(applyScrollParallax);
      }
    },
    { passive: true }
  );
  applyScrollParallax();
}

/* ══════════════════════════════════════════════════════
   SMOOTH ANCHOR SCROLL for nav links
══════════════════════════════════════════════════════ */
document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (e) => {
    const href = link.getAttribute('href');
    const target = document.querySelector(href);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

/* ══════════════════════════════════════════════════════
   ACTIVE NAV LINK — highlight based on scroll position
══════════════════════════════════════════════════════ */
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.nav__link');

const sectionObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        navLinks.forEach((link) => {
          const href = link.getAttribute('href')?.slice(1);
          link.style.color = href === entry.target.id
            ? 'var(--clr-teal)'
            : '';
        });
      }
    });
  },
  { threshold: 0.4 }
);

sections.forEach((section) => sectionObserver.observe(section));
