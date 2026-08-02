/* ============================================================
   MAJIA STUDIO — portal engine
   particle field · screen materialization · hash routing
   ============================================================ */

(() => {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ----------------------------------------------------------
     Split titles into chars for the shimmer effect
     ---------------------------------------------------------- */
  document.querySelectorAll("[data-split]").forEach((el) => {
    const text = el.textContent;
    el.textContent = "";
    el.setAttribute("aria-label", text);
    [...text].forEach((c, i) => {
      const span = document.createElement("span");
      span.className = "ch";
      span.textContent = c === " " ? " " : c;
      span.style.transitionDelay = `${0.05 + i * 0.045}s`;
      span.setAttribute("aria-hidden", "true");
      el.appendChild(span);
    });
  });

  /* ----------------------------------------------------------
     Particle field
     ---------------------------------------------------------- */
  const canvas = document.getElementById("field");
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  let W = 0, H = 0, CX = 0, CY = 0;
  const mouse = { x: -9999, y: -9999 };
  let convergence = 0;       // 0 = free drift, 1 = pulled to center (transition)
  let targetConvergence = 0;

  const PARTICLE_COUNT = () => Math.min(160, Math.floor((W * H) / 11000));
  let particles = [];

  const BONE = "242, 238, 230";
  const NEON_A = "255, 61, 129";
  const NEON_B = "53, 240, 208";

  function makeParticle() {
    const tint = Math.random();
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.22,
      vy: (Math.random() - 0.5) * 0.22,
      r: 0.6 + Math.random() * 1.5,
      ix: 0,
      iy: 0,
      // mostly bone-white; a few neon flecks
      color: tint > 0.94 ? NEON_A : tint > 0.88 ? NEON_B : BONE,
      alpha: 0.25 + Math.random() * 0.5,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.002 + Math.random() * 0.004,
    };
  }

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    CX = W / 2;
    CY = H / 2;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const n = PARTICLE_COUNT();
    while (particles.length < n) particles.push(makeParticle());
    particles.length = n;
  }

  window.addEventListener("resize", resize);
  resize();

  window.addEventListener("pointermove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  window.addEventListener("pointerleave", () => {
    mouse.x = -9999;
    mouse.y = -9999;
  });

  const LINK_DIST = 110;

  function tick() {
    ctx.clearRect(0, 0, W, H);

    // ease convergence toward its target
    convergence += (targetConvergence - convergence) * 0.06;

    for (const p of particles) {
      p.wobble += p.wobbleSpeed;

      // gentle drift
      p.x += p.vx + Math.cos(p.wobble) * 0.08;
      p.y += p.vy + Math.sin(p.wobble) * 0.08;

      // mouse repulsion — a soft field around the cursor
      const mdx = p.x - mouse.x;
      const mdy = p.y - mouse.y;
      const mDist2 = mdx * mdx + mdy * mdy;
      if (mDist2 < 16000) {
        const mDist = Math.sqrt(mDist2) || 1;
        const force = (1 - mDist / 127) * 0.9;
        p.x += (mdx / mDist) * force;
        p.y += (mdy / mDist) * force;
      }

      // portal convergence — particles gather into a ring, not a blob
      if (convergence > 0.01) {
        const rdx = p.x - CX;
        const rdy = p.y - CY;
        const rDist = Math.sqrt(rdx * rdx + rdy * rdy) || 1;
        const R = Math.min(W, H) * 0.22;
        const tx = CX + (rdx / rDist) * R;
        const ty = CY + (rdy / rDist) * R;
        p.x += (tx - p.x) * 0.06 * convergence;
        p.y += (ty - p.y) * 0.06 * convergence;
      }

      // decaying burst impulse (fired when a transition releases)
      p.x += p.ix;
      p.y += p.iy;
      p.ix *= 0.94;
      p.iy *= 0.94;

      // wrap
      if (p.x < -10) p.x = W + 10;
      if (p.x > W + 10) p.x = -10;
      if (p.y < -10) p.y = H + 10;
      if (p.y > H + 10) p.y = -10;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.color}, ${p.alpha})`;
      ctx.fill();
    }

    // constellation links — very faint
    ctx.lineWidth = 0.5;
    for (let i = 0; i < particles.length; i++) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < LINK_DIST * LINK_DIST) {
          const t = 1 - Math.sqrt(d2) / LINK_DIST;
          ctx.strokeStyle = `rgba(${BONE}, ${t * 0.07})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    requestAnimationFrame(tick);
  }

  if (!reducedMotion) {
    requestAnimationFrame(tick);
  }

  /* ----------------------------------------------------------
     Screen router — materialize / dematerialize
     ---------------------------------------------------------- */
  const screens = [...document.querySelectorAll(".screen")];
  const navLinks = [...document.querySelectorAll("[data-nav]")];
  const veil = document.getElementById("portalVeil");

  const SCREEN_NAMES = new Set(screens.map((s) => s.dataset.screen));
  let current = "home";
  let transitioning = false;

  function screenEl(name) {
    return document.querySelector(`[data-screen="${name}"]`);
  }

  function setActiveNav(name) {
    document.querySelectorAll(".chrome__link").forEach((l) => {
      l.classList.toggle("is-active", l.dataset.nav === name);
    });
  }

  function scatterBurst() {
    for (const p of particles) {
      const dx = p.x - CX;
      const dy = p.y - CY;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const strength = 1.5 + Math.random() * 2.5;
      p.ix = (dx / d) * strength;
      p.iy = (dy / d) * strength;
    }
  }

  function fireVeil() {
    veil.classList.remove("is-firing");
    // restart the animation
    void veil.offsetWidth;
    veil.classList.add("is-firing");
  }

  function goTo(name, { instant = false } = {}) {
    if (!SCREEN_NAMES.has(name)) name = "home";
    if (name === current && !instant) return;
    if (transitioning) return;

    const from = screenEl(current);
    const to = screenEl(name);
    current = name;
    setActiveNav(name);

    if (instant || reducedMotion) {
      screens.forEach((s) => s.classList.remove("is-active", "is-hidden-fx"));
      to.classList.add("is-active");
      return;
    }

    transitioning = true;

    // 1. dematerialize the current screen
    from.classList.add("is-hidden-fx");
    targetConvergence = 1;
    fireVeil();

    setTimeout(() => {
      // 2. swap screens while the veil covers the switch
      from.classList.remove("is-active");
      from.classList.remove("is-hidden-fx");

      to.classList.add("is-hidden-fx");
      to.classList.add("is-active");

      // let the browser paint the hidden state, then materialize
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          to.classList.remove("is-hidden-fx");
          targetConvergence = 0;
          convergence = 0;
          scatterBurst();
        });
      });

      setTimeout(() => { transitioning = false; }, 600);
    }, 520);
  }

  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      const name = link.dataset.nav;
      e.preventDefault();
      if (transitioning || name === current) return;
      if (history.state?.screen !== name) {
        history.pushState({ screen: name }, "", `#${name}`);
      }
      goTo(name);
    });
  });

  window.addEventListener("popstate", (e) => {
    goTo(e.state?.screen || location.hash.replace("#", "") || "home");
  });

  /* ----------------------------------------------------------
     Boot — land on the hash screen, materialize in
     ---------------------------------------------------------- */
  const bootTarget = location.hash.replace("#", "") || "home";
  const bootScreen = SCREEN_NAMES.has(bootTarget) ? bootTarget : "home";
  history.replaceState({ screen: bootScreen }, "", `#${bootScreen}`);

  const first = screenEl(bootScreen);
  screens.forEach((s) => s.classList.remove("is-active"));
  first.classList.add("is-active");
  current = bootScreen;
  setActiveNav(bootScreen);

  if (!reducedMotion) {
    first.classList.add("is-hidden-fx");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => first.classList.remove("is-hidden-fx"), 150);
      });
    });
  }

  document.getElementById("year").textContent = new Date().getFullYear();
})();
