/* ============================================================
   MAJIA STUDIO — shadow engine
   leaf shadows · a 3D robit cast as silhouette · shoji doors
   ============================================================ */

(() => {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ----------------------------------------------------------
     Split titles into chars for the dissolve effect
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
     Theme — paper by day, ink by night
     ---------------------------------------------------------- */
  const PALETTES = {
    light: { sil: "32, 30, 25",    seal: "194, 69, 47",  jade: "93, 125, 107" },
    dark:  { sil: "238, 234, 222", seal: "217, 91, 64",  jade: "127, 163, 141" },
  };
  let palette = PALETTES.light;

  const THEME_KEY = "majia-theme";

  function applyTheme(theme) {
    if (theme === "light") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = theme;
    }
    palette = PALETTES[theme] || PALETTES.light;
    try { localStorage.setItem(THEME_KEY, theme); } catch (_) {}
  }

  let storedTheme = "light";
  try { storedTheme = localStorage.getItem(THEME_KEY) || "light"; } catch (_) {}
  applyTheme(storedTheme === "dark" ? "dark" : "light");

  document.getElementById("themeFlip").addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });

  /* ----------------------------------------------------------
     Leaf shadows — sparse, slow, cast on the wall
     ---------------------------------------------------------- */
  const canvas = document.getElementById("field");
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  let W = 0, H = 0;
  const mouse = { x: -9999, y: -9999 };

  const LEAF_COUNT = () => Math.min(16, Math.max(8, Math.floor(W / 110)));
  let leaves = [];

  function makeLeaf(scatterY) {
    return {
      x: Math.random() * W,
      y: scatterY ? Math.random() * H : -30 - Math.random() * 60,
      vy: 0.12 + Math.random() * 0.22,
      drift: Math.random() * Math.PI * 2,
      driftSpeed: 0.004 + Math.random() * 0.006,
      size: 5 + Math.random() * 8,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.008,
      alpha: 0.08 + Math.random() * 0.14,
      blur: 1 + Math.random() * 2.5,
      tint: Math.random() > 0.92 ? "seal" : "sil",
      ix: 0,
    };
  }

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const n = LEAF_COUNT();
    while (leaves.length < n) leaves.push(makeLeaf(true));
    leaves.length = n;
  }

  window.addEventListener("resize", resize);
  resize();

  window.addEventListener("pointermove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  function drawLeaf(l) {
    ctx.save();
    ctx.translate(l.x, l.y);
    ctx.rotate(l.angle);
    ctx.filter = `blur(${l.blur}px)`;
    ctx.fillStyle = `rgba(${palette[l.tint]}, ${l.alpha})`;
    // bamboo leaf: two shallow arcs meeting at the tips
    const s = l.size;
    ctx.beginPath();
    ctx.moveTo(-s, 0);
    ctx.quadraticCurveTo(0, -s * 0.42, s, 0);
    ctx.quadraticCurveTo(0, s * 0.42, -s, 0);
    ctx.fill();
    ctx.restore();
  }

  function tickLeaves() {
    ctx.clearRect(0, 0, W, H);

    for (const l of leaves) {
      l.drift += l.driftSpeed;
      l.angle += l.spin;
      l.x += Math.sin(l.drift) * 0.4 + l.ix;
      l.y += l.vy;
      l.ix *= 0.94;

      // a passing hand stirs the shadows, gently
      const mdx = l.x - mouse.x;
      const mdy = l.y - mouse.y;
      const d2 = mdx * mdx + mdy * mdy;
      if (d2 < 9000) {
        const d = Math.sqrt(d2) || 1;
        l.ix += (mdx / d) * 0.12;
        l.y += (mdy / d) * 0.06;
      }

      if (l.y > H + 40) {
        Object.assign(l, makeLeaf(false));
      }
      if (l.x < -40) l.x = W + 30;
      if (l.x > W + 40) l.x = -30;

      drawLeaf(l);
    }

    requestAnimationFrame(tickLeaves);
  }

  function gust(dir) {
    for (const l of leaves) l.ix += dir * (1.5 + Math.random() * 2.5);
  }

  if (!reducedMotion) requestAnimationFrame(tickLeaves);

  /* ----------------------------------------------------------
     The Robit — true 3D, rendered as a flat shadow
     ---------------------------------------------------------- */
  const rCanvas = document.getElementById("robit3d");
  const rCtx = rCanvas.getContext("2d");
  const RW = rCanvas.width, RH = rCanvas.height;

  // cuboid parts: [cx, cy, cz, w, h, d]
  const PARTS = [
    [0,  1.28, 0,    1.12, 0.92, 1.0 ],  // head
    [0,  0.05, 0,    0.92, 1.05, 0.78],  // body
    [-0.72, 0.18, 0, 0.22, 0.78, 0.22],  // arm L
    [ 0.72, 0.18, 0, 0.22, 0.78, 0.22],  // arm R
    [-0.26, -0.92, 0, 0.28, 0.6, 0.3 ],  // leg L
    [ 0.26, -0.92, 0, 0.28, 0.6, 0.3 ],  // leg R
    [0, 1.95, 0,     0.07, 0.42, 0.07],  // antenna stem
  ];
  const ANTENNA_TIP = [0, 2.22, 0];
  const EYE = [0.16, 1.3, 0.51];         // on the head's front face
  const EYE2 = [-0.24, 1.3, 0.51];

  const FACES = [
    [0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4],
    [2, 3, 7, 6], [1, 2, 6, 5], [0, 3, 7, 4],
  ];

  function boxVerts([cx, cy, cz, w, h, d]) {
    const x = w / 2, y = h / 2, z = d / 2;
    return [
      [cx - x, cy - y, cz - z], [cx + x, cy - y, cz - z],
      [cx + x, cy + y, cz - z], [cx - x, cy + y, cz - z],
      [cx - x, cy - y, cz + z], [cx + x, cy - y, cz + z],
      [cx + x, cy + y, cz + z], [cx - x, cy + y, cz + z],
    ];
  }

  const TILT = 0.12;
  const SCALE = 46;

  function project([x, y, z], theta) {
    const rx = x * Math.cos(theta) + z * Math.sin(theta);
    const rz = -x * Math.sin(theta) + z * Math.cos(theta);
    const ry = y * Math.cos(TILT) - rz * Math.sin(TILT);
    return [RW / 2 + rx * SCALE, RH * 0.78 - ry * SCALE];
  }

  let theta = 0.6;
  let lastRobitDraw = 0;

  function drawRobit(now) {
    // only spend frames when the robits screen is showing
    if (rCanvas.offsetParent !== null && now - lastRobitDraw > 33) {
      lastRobitDraw = now;
      theta += 0.012;
      const bob = Math.sin(now * 0.0016) * 0.05;

      rCtx.clearRect(0, 0, RW, RH);
      rCtx.save();
      rCtx.translate(0, bob * SCALE);
      rCtx.filter = "blur(1.4px)";
      rCtx.fillStyle = `rgba(${palette.sil}, 0.88)`;

      for (const part of PARTS) {
        const verts = boxVerts(part).map((v) => project(v, theta));
        for (const face of FACES) {
          rCtx.beginPath();
          rCtx.moveTo(verts[face[0]][0], verts[face[0]][1]);
          for (let i = 1; i < 4; i++) rCtx.lineTo(verts[face[i]][0], verts[face[i]][1]);
          rCtx.closePath();
          rCtx.fill();
        }
      }

      // antenna tip
      const tip = project(ANTENNA_TIP, theta);
      rCtx.beginPath();
      rCtx.arc(tip[0], tip[1], 0.09 * SCALE, 0, Math.PI * 2);
      rCtx.fill();

      // eyes — twin embers, visible when the robit faces us
      const facing = Math.cos(theta);
      if (facing > 0.25) {
        rCtx.filter = "blur(0.5px)";
        rCtx.fillStyle = `rgba(${palette.seal}, ${Math.min(1, facing * 1.4)})`;
        for (const eye of [EYE, EYE2]) {
          const [ex, ey] = project(eye, theta);
          rCtx.beginPath();
          rCtx.arc(ex, ey, 3.2, 0, Math.PI * 2);
          rCtx.fill();
        }
      }

      rCtx.restore();
    }
    if (!reducedMotion) requestAnimationFrame(drawRobit);
  }

  if (reducedMotion) {
    drawRobit(1000);
  } else {
    requestAnimationFrame(drawRobit);
  }

  /* ----------------------------------------------------------
     Screen router — shoji doors slide between screens
     ---------------------------------------------------------- */
  const screens = [...document.querySelectorAll(".screen")];
  const navLinks = [...document.querySelectorAll("[data-nav]")];
  const shoji = document.getElementById("shoji");

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

    // 1. doors slide shut; the room dissolves
    shoji.classList.add("is-closed");
    from.classList.add("is-hidden-fx");
    gust(Math.random() > 0.5 ? 1 : -1);

    setTimeout(() => {
      // 2. swap rooms behind the paper
      from.classList.remove("is-active", "is-hidden-fx");
      to.classList.add("is-hidden-fx", "is-active");

      // 3. doors slide open onto the new room
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          shoji.classList.remove("is-closed");
          setTimeout(() => to.classList.remove("is-hidden-fx"), 180);
        });
      });

      setTimeout(() => { transitioning = false; }, 700);
    }, 580);
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
     Boot
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
