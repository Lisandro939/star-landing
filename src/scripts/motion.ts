import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import Lenis from "lenis";

/**
 * Motor único de animación del sitio (GSAP + ScrollTrigger + SplitText + Lenis).
 *
 * API declarativa via data-attributes:
 * - data-reveal="lines | words | fade-up | fade | stagger"
 *   - data-reveal-delay="0.2"    → delay en segundos
 *   - data-reveal-stagger="0.1"  → stagger entre líneas/palabras/hijos
 * - data-scrub-words             → palabras opacity 0.12→1 scrubbed al scroll
 *   - data-scrub-container       → ancestro que actúa de trigger (pinneable)
 *   - data-scrub-start / data-scrub-end / data-scrub-stagger
 * - data-parallax="0.2"          → yPercent proporcional scrubbed
 * - data-nav-theme="light|dark"  → en <section>, setea el tema del nav al entrar
 *
 * Piezas firma (markup específico):
 * - initHero()       → #inicio (200dvh) + #hero-pin pinneado con scrub:
 *                      el logo de marca gana profundidad al scrollear.
 * - initWordCycler() → [data-word-cycler data-words='[{"text","color"},...]']
 *                      rota palabras con clip vertical + tween de width.
 *
 * REGLA DE ORO de los reveals: NUNCA `gsap.from(..., { scrollTrigger })`.
 * Los ScrollTrigger.refresh() (fonts, load, resize) revierten y re-inicializan
 * los from(); si eso pasa mientras el target tiene aplicado el estado oculto
 * de immediateRender, el tween graba "oculto" como estado FINAL (anima de 0 a
 * 0) y con once:true el contenido queda invisible para siempre. El patrón
 * seguro es: gsap.set(oculto) + ScrollTrigger.create + tween creado en
 * onEnter con valores finales explícitos.
 */

const REVEAL_START = "top 82%";

let initialized = false;
let lenis: Lenis | null = null;

function num(value: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Ejecuta un subsistema del init aislado: si falla, avisa por consola y el
 * resto del motor sigue funcionando. Un fallo NUNCA debe romper el init.
 */
function safeInit(name: string, fn: () => void): void {
  try {
    fn();
  } catch (error) {
    console.warn(`[motion] "${name}" falló — se continúa sin él:`, error);
  }
}

/** Último recurso ante un fallo en un reveal: el contenido SIEMPRE visible. */
function restoreVisible(targets: Element | Element[]): void {
  try {
    gsap.set(targets, { autoAlpha: 1, y: 0, yPercent: 0, clearProps: "all" });
  } catch {
    for (const el of Array.isArray(targets) ? targets : [targets]) {
      if (el instanceof HTMLElement) {
        el.style.opacity = "";
        el.style.visibility = "";
        el.style.transform = "";
      }
    }
  }
}

/** Navegación interna (#planes, #contacto...) con scroll nativo y snap. */
function initLenis(): void {
  lenis = new Lenis({
    duration: 1.15,
    smoothWheel: true,
    wheelMultiplier: 0.9,
    touchMultiplier: 1,
    overscroll: true,
  });

  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => {
    lenis?.raf(time * 1000);
  });
  gsap.ticker.lagSmoothing(0);
}

function initAnchors(): void {
  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>('a[href^="#"]');
    if (!link) return;

    const hash = link.getAttribute("href");
    if (!hash || hash === "#") return;

    let destination: HTMLElement | null = null;
    try {
      destination = document.querySelector<HTMLElement>(hash);
    } catch {
      return;
    }
    if (!destination) return;

    event.preventDefault();
    if (lenis) {
      lenis.scrollTo(destination, { duration: 1.1 });
    } else {
      destination.scrollIntoView({ block: "start" });
    }
    history.pushState(null, "", hash);
  });
}

/**
 * Nav camaleón: cada <section data-nav-theme="light|dark"> propaga su tema
 * al root y a #site-nav; el CSS reacciona via [data-nav-theme] con vars.
 */
function initNavTheme(): void {
  const sections = gsap.utils.toArray<HTMLElement>("section[data-nav-theme]");
  if (sections.length === 0) return;

  const nav = document.getElementById("site-nav");
  const setTheme = (theme: string): void => {
    document.documentElement.setAttribute("data-nav-theme", theme);
    nav?.setAttribute("data-nav-theme", theme);
  };

  for (const section of sections) {
    const theme = section.dataset.navTheme;
    if (theme !== "light" && theme !== "dark") continue;

    ScrollTrigger.create({
      trigger: section,
      start: "top 80px",
      end: "bottom 80px",
      onEnter: () => setTheme(theme),
      onEnterBack: () => setTheme(theme),
    });
  }

  // Una sección pinneada puede solaparse geométricamente con la siguiente y
  // activar ambos ScrollTriggers. La sección visible bajo el nav es la fuente
  // de verdad para evitar que herede prematuramente el tema siguiente.
  let themeFrame = 0;
  const syncVisibleTheme = (): void => {
    themeFrame = 0;
    const sampleY = Math.min(88, Math.max(1, window.innerHeight - 1));
    const visibleSection = document
      .elementsFromPoint(8, sampleY)
      .map((element) => element.closest<HTMLElement>("section[data-nav-theme]"))
      .find((section): section is HTMLElement => section !== null);
    const theme = visibleSection?.dataset.navTheme;
    if (theme === "light" || theme === "dark") setTheme(theme);
  };
  const requestThemeSync = (): void => {
    if (themeFrame) return;
    themeFrame = window.requestAnimationFrame(syncVisibleTheme);
  };

  window.addEventListener("scroll", requestThemeSync, { passive: true });
  window.addEventListener("resize", requestThemeSync, { passive: true });
  requestThemeSync();
}

/** Reveals sin dependencia de fuentes: fade-up, fade y stagger de hijos. */
function initSimpleReveals(): void {
  for (const el of gsap.utils.toArray<HTMLElement>("[data-reveal]")) {
    const kind = el.dataset.reveal;
    if (kind !== "fade-up" && kind !== "fade" && kind !== "stagger") continue;

    const targets: Element[] =
      kind === "stagger" ? Array.from(el.children) : [el];
    if (targets.length === 0) continue;

    try {
      gsap.set(targets, { autoAlpha: 0, y: kind === "fade" ? 0 : 32 });

      ScrollTrigger.create({
        trigger: el,
        start: REVEAL_START,
        once: true,
        onEnter: () => {
          gsap.to(targets, {
            autoAlpha: 1,
            y: 0,
            duration: 0.8,
            delay: num(el.dataset.revealDelay, 0),
            ease: "power2.out",
            stagger:
              kind === "stagger" ? num(el.dataset.revealStagger, 0.12) : 0,
            overwrite: "auto",
          });
        },
      });
    } catch (error) {
      console.warn("[motion] reveal falló — restaurando visibilidad:", error);
      restoreVisible(targets);
    }
  }
}

/** Reveals tipográficos (SplitText). Requieren document.fonts.ready. */
function initTextReveals(): void {
  for (const el of gsap.utils.toArray<HTMLElement>("[data-reveal]")) {
    const kind = el.dataset.reveal;
    if (kind !== "lines" && kind !== "words") continue;

    const delay = num(el.dataset.revealDelay, 0);

    try {
      if (kind === "lines") {
        // Estado compartido entre re-splits: autoSplit re-corre onSplit
        // en cada resize, pero el trigger es uno solo por elemento.
        let lines: Element[] = [];
        let revealed = false;
        let triggerCreated = false;

        SplitText.create(el, {
          type: "lines",
          autoSplit: true,
          onSplit: (self) => {
            lines = self.lines;
            gsap.set(el, { autoAlpha: 1 });
            // Re-split posterior al reveal: las líneas quedan visibles.
            if (revealed) return;
            gsap.set(lines, { yPercent: 100 });
            if (triggerCreated) return;
            triggerCreated = true;

            ScrollTrigger.create({
              trigger: el,
              start: REVEAL_START,
              once: true,
              onEnter: () => {
                revealed = true;
                gsap.to(lines, {
                  yPercent: 0,
                  duration: 0.9,
                  delay,
                  ease: "power3.out",
                  stagger: num(el.dataset.revealStagger, 0.08),
                  overwrite: "auto",
                });
              },
            });
          },
        });
      } else {
        const split = SplitText.create(el, { type: "words" });
        gsap.set(el, { autoAlpha: 1 });
        gsap.set(split.words, { opacity: 0, y: 12 });

        ScrollTrigger.create({
          trigger: el,
          start: REVEAL_START,
          once: true,
          onEnter: () => {
            gsap.to(split.words, {
              opacity: 1,
              y: 0,
              duration: 0.6,
              delay,
              ease: "power2.out",
              stagger: num(el.dataset.revealStagger, 0.03),
              overwrite: "auto",
            });
          },
        });
      }
    } catch (error) {
      console.warn(
        "[motion] text reveal falló — restaurando visibilidad:",
        error,
      );
      restoreVisible(el);
    }
  }
}

/**
 * Quote scrubbed: [data-scrub-words] dentro de [data-scrub-container].
 * Palabras van de opacity 0.12 a 1 con stagger, atado al scroll (scrub).
 * fromTo con ambos extremos explícitos → inmune a re-inits de refresh.
 */
function initScrubWords(): void {
  for (const el of gsap.utils.toArray<HTMLElement>("[data-scrub-words]")) {
    try {
      const container = el.closest<HTMLElement>("[data-scrub-container]") ?? el;
      const split = SplitText.create(el, { type: "words" });
      const withMotion = el.hasAttribute("data-scrub-motion");

      gsap.fromTo(
        split.words,
        { opacity: 0.1, yPercent: withMotion ? 55 : 0 },
        {
          opacity: 1,
          yPercent: 0,
          ease: "none",
          stagger: num(el.dataset.scrubStagger, 0.05),
          scrollTrigger: {
            trigger: container,
            start: el.dataset.scrubStart ?? "top 75%",
            end: el.dataset.scrubEnd ?? "bottom 60%",
            scrub: true,
          },
        },
      );
    } catch (error) {
      console.warn(
        "[motion] scrub-words falló — restaurando visibilidad:",
        error,
      );
      restoreVisible(el);
    }
  }
}

/**
 * Hero pinneado: el copy centrado responde al scroll y la pieza de marca
 * (watermark de fondo, opacidad capada por su wrapper en el markup) recibe
 * solo transforms sutiles — NUNCA autoAlpha, para no pisar ese cap ni
 * dejarla invisible en el estado inicial.
 */
function initHero(): void {
  const section = document.getElementById("inicio");
  const pinTarget = document.getElementById("hero-pin");
  if (!section || !pinTarget) return;

  const background = section.querySelector<HTMLElement>("[data-hero-background]");
  const frame = pinTarget.querySelector<HTMLElement>("[data-hero-frame]");
  const copy = pinTarget.querySelector<HTMLElement>("[data-hero-copy]");
  const caption = pinTarget.querySelector<HTMLElement>("[data-hero-caption]");
  const feature = pinTarget.querySelector<HTMLElement>("[data-hero-feature]");
  const dataPanel = pinTarget.querySelector<HTMLElement>("[data-hero-data]");
  const scrollCue = pinTarget.querySelector<HTMLElement>("[data-hero-scroll-cue]");
  const header = document.getElementById("site-nav");
  if (!background || !frame || !copy || !caption || !feature || !dataPanel || !header) return;

  const isDesktop = window.matchMedia("(min-width: 768px)").matches;
  const forwardStops = [0, 0.98 / 2.46, 1.7 / 2.46, 1];

  const tl = gsap.timeline({
    defaults: { ease: "power2.inOut" },
    scrollTrigger: {
      trigger: section,
      start: "top top",
      end: "bottom bottom",
      pin: pinTarget,
      pinSpacing: false,
      scrub: 0.7,
      snap: {
        snapTo: (progress) =>
          forwardStops.find((stop) => stop >= progress - 0.0001) ?? 1,
        duration: { min: 0.28, max: 0.62 },
        delay: 0.02,
        ease: "power2.inOut",
        inertia: false,
      },
      invalidateOnRefresh: true,
    },
  });

  // Cierra el encuadre hasta el equivalente visual de 80rem sin animar layout.
  // El inset se recalcula en cada refresh para respetar cualquier viewport.
  tl.to(
    frame,
    {
      clipPath: () => {
        const targetWidth = 80 * 16;
        const inset = Math.max(0, ((frame.offsetWidth - targetWidth) / frame.offsetWidth) * 50);
        return `inset(0 ${inset}% round 1.75rem)`;
      },
      duration: 0.28,
    },
    0,
  );
  tl.to(header, { autoAlpha: 0, y: -24, duration: 0.18 }, 0);
  if (scrollCue) tl.to(scrollCue, { autoAlpha: 0, y: 12, duration: 0.16 }, 0);
  tl.to(copy, { autoAlpha: 0, scale: 0.94, duration: 0.22 }, 0);
  tl.to(background, { autoAlpha: 1, duration: 0.72 }, 0);
  tl.to(
    frame,
    {
      scale: isDesktop ? 0.57 : 0.6,
      yPercent: isDesktop ? -18 : -42,
      rotationX: isDesktop ? 3 : 2,
      rotationY: isDesktop ? -16 : -10,
      rotationZ: 0,
      transformPerspective: 1200,
      transformOrigin: "50% 50%",
      force3D: true,
      duration: 0.78,
    },
    0.08,
  );
  tl.fromTo(
    caption,
    { autoAlpha: 0, y: 36 },
    { autoAlpha: 1, y: 0, duration: 0.3 },
    0.68,
  );

  // Segunda escena: el visual se abre hacia la derecha y deja lugar al
  // mensaje editorial, manteniendo una Ãºnica secuencia ligada al scroll.
  tl.to(caption, { autoAlpha: 0, y: -24, duration: 0.22 }, 0.98);
  tl.to(
    frame,
    {
      scale: isDesktop ? 0.43 : 0.54,
      x: () => (isDesktop ? window.innerWidth * 0.24 : 0),
      xPercent: 0,
      yPercent: isDesktop ? 0 : -52,
      rotationX: isDesktop ? 3 : 2,
      rotationY: isDesktop ? -18 : -10,
      duration: 0.62,
    },
    0.96,
  );
  tl.fromTo(
    feature,
    { autoAlpha: 0, x: isDesktop ? -42 : 0, y: isDesktop ? 0 : 28 },
    { autoAlpha: 1, x: 0, y: 0, duration: 0.38 },
    1.22,
  );

  // Escena final: la composiciÃ³n se espeja. El video cruza hacia la izquierda
  // y cambia el sentido de la perspectiva mientras entra el bloque de datos.
  tl.to(feature, { autoAlpha: 0, x: -32, duration: 0.24 }, 1.74);
  tl.to(
    frame,
    {
      x: () => (isDesktop ? window.innerWidth * -0.24 : 0),
      yPercent: isDesktop ? 0 : -52,
      rotationX: isDesktop ? 3 : 2,
      rotationY: isDesktop ? 18 : 10,
      duration: 0.7,
    },
    1.7,
  );
  tl.fromTo(
    dataPanel,
    { autoAlpha: 0, x: isDesktop ? 42 : 0, y: isDesktop ? 0 : 28 },
    { autoAlpha: 1, x: 0, y: 0, duration: 0.38 },
    2.08,
  );

  // Paradas estables: al terminar el gesto, nunca queda una escena a medias.
  tl.addLabel("hero", 0);
  tl.addLabel("overview", 0.98);
  tl.addLabel("solutions", 1.7);
  tl.addLabel("data", 2.46);
}

interface CyclerWord {
  text: string;
  color: string;
}

function parseCyclerWords(raw: string | undefined): CyclerWord[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const words: CyclerWord[] = [];
    for (const item of parsed) {
      if (typeof item !== "object" || item === null) continue;
      const { text, color } = item as Record<string, unknown>;
      if (typeof text === "string" && typeof color === "string") {
        words.push({ text, color });
      }
    }
    return words;
  } catch {
    return [];
  }
}

/**
 * Word-cycler estilo "Real ___" de Scale: la palabra actual sale hacia
 * arriba (clipeada), la nueva entra desde abajo y el contenedor tweenea
 * su width al ancho de la entrante. Llamar tras document.fonts.ready
 * (mide anchos). Pausado fuera de viewport; en reduced-motion no se
 * inicializa y queda la primera palabra fija (estado SSR).
 */
function initWordCycler(): void {
  for (const el of gsap.utils.toArray<HTMLElement>("[data-word-cycler]")) {
    try {
      initSingleWordCycler(el);
    } catch (error) {
      // El estado SSR (primera palabra fija) queda intacto y visible.
      console.warn("[motion] word-cycler falló — palabra fija:", error);
    }
  }
}

function initSingleWordCycler(el: HTMLElement): void {
  const words = parseCyclerWords(el.dataset.words);
  const firstWord = el.querySelector<HTMLElement>("[data-cycler-word]");
  if (!firstWord || words.length < 2) return;

  const interval = num(el.dataset.cyclerInterval, 2.2);

  // Span fantasma para medir el ancho de cada palabra con la misma tipografía.
  const ghost = document.createElement("span");
  ghost.className = firstWord.className;
  ghost.setAttribute("aria-hidden", "true");
  gsap.set(ghost, {
    position: "absolute",
    left: 0,
    top: 0,
    visibility: "hidden",
    pointerEvents: "none",
    whiteSpace: "nowrap",
  });
  el.appendChild(ghost);

  const measure = (text: string): number => {
    ghost.textContent = text;
    return ghost.offsetWidth;
  };

  // Congela el layout actual (el zwsp del markup mantiene la altura de
  // línea) y absolutiza la palabra activa para poder animarla clipeada.
  let index = 0;
  let active = firstWord;
  gsap.set(el, {
    width: measure(words[index]?.text ?? ""),
    position: "relative",
  });
  gsap.set(active, {
    position: "absolute",
    left: 0,
    top: 0,
    whiteSpace: "nowrap",
  });

  let inView = false;
  ScrollTrigger.create({
    trigger: el,
    start: "top bottom",
    end: "bottom top",
    onToggle: (self) => {
      inView = self.isActive;
    },
  });

  const swap = (): void => {
    index = (index + 1) % words.length;
    const word = words[index];
    if (!word) return;

    const incoming = document.createElement("span");
    incoming.className = firstWord.className;
    incoming.dataset.cyclerWord = "";
    incoming.textContent = word.text;
    incoming.style.color = word.color;
    gsap.set(incoming, {
      position: "absolute",
      left: 0,
      top: 0,
      whiteSpace: "nowrap",
      yPercent: 100,
    });
    el.appendChild(incoming);

    const outgoing = active;
    active = incoming;

    gsap.to(outgoing, {
      yPercent: -100,
      duration: 0.5,
      ease: "expo.out",
      onComplete: () => {
        outgoing.remove();
      },
    });
    gsap.to(incoming, { yPercent: 0, duration: 0.5, ease: "expo.out" });
    gsap.to(el, {
      width: measure(word.text),
      duration: 0.55,
      ease: "expo.out",
    });
  };

  const schedule = (): void => {
    gsap.delayedCall(interval, () => {
      try {
        if (inView && !document.hidden) swap();
      } catch (error) {
        console.warn("[motion] word-cycler swap falló:", error);
      }
      schedule();
    });
  };
  schedule();
}

/** Parallax genérico para capas decorativas: data-parallax="0.2". */
function initParallax(): void {
  for (const el of gsap.utils.toArray<HTMLElement>("[data-parallax]")) {
    try {
      const amount = num(el.dataset.parallax, 0.2);
      gsap.fromTo(
        el,
        { yPercent: amount * 100 },
        {
          yPercent: -amount * 100,
          ease: "none",
          scrollTrigger: {
            trigger: el.parentElement ?? el,
            start: "top bottom",
            end: "bottom top",
            scrub: true,
          },
        },
      );
    } catch (error) {
      console.warn("[motion] parallax falló:", error);
    }
  }
}

/**
 * Escenas de un viewport: el contenido permanece clavado durante un tramo
 * corto de scroll antes de entregar la siguiente sección.
 */
function initPinnedSections(): void {
  for (const section of gsap.utils.toArray<HTMLElement>("[data-pin-section]")) {
    if (
      section.hasAttribute("data-pin-desktop") &&
      !window.matchMedia("(min-width: 1024px)").matches
    )
      continue;

    ScrollTrigger.create({
      trigger: section,
      start: "top top",
      end: () => `+=${Math.round(window.innerHeight * 0.35)}`,
      pin: true,
      pinSpacing: true,
      anticipatePin: 1,
      invalidateOnRefresh: true,
    });
  }
}

export function initMotion(): void {
  if (initialized) return;
  initialized = true;

  gsap.registerPlugin(ScrollTrigger, SplitText);

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const desktopMotion = window.matchMedia("(min-width: 768px)").matches;
  safeInit("nav-theme", initNavTheme);

  // Reduced motion: sin Lenis, sin reveals ni scrubs — todo queda visible.
  // El estado oculto SOLO se aplica desde JS, nunca en CSS estático.
  if (reduced) {
    safeInit("anchors", initAnchors);
    return;
  }

  safeInit("lenis", initLenis);
  safeInit("anchors", initAnchors);

  // Ocultar textos a splitear cuanto antes para evitar flash pre-split.
  const textReveals = gsap.utils.toArray<HTMLElement>(
    '[data-reveal="lines"], [data-reveal="words"]',
  );
  safeInit("pre-hide", () => {
    if (textReveals.length > 0) gsap.set(textReveals, { autoAlpha: 0 });
  });

  safeInit("hero", initHero);
  safeInit("pinned-sections", initPinnedSections);
  safeInit("simple-reveals", initSimpleReveals);
  if (desktopMotion) safeInit("parallax", initParallax);
  safeInit("refresh:setup", () => ScrollTrigger.refresh());

  // SplitText y el word-cycler esperan a las fuentes (evitan layout shift
  // y miden anchos reales respectivamente). Con red de seguridad: si
  // fonts.ready no resuelve, a los 3s se inicializa igual — el contenido
  // pre-oculto no puede quedar invisible por una fuente colgada.
  let fontPhaseDone = false;
  const runFontPhase = (): void => {
    if (fontPhaseDone) return;
    fontPhaseDone = true;
    safeInit("text-reveals", initTextReveals);
    safeInit("scrub-words", initScrubWords);
    safeInit("word-cycler", initWordCycler);
    safeInit("refresh:fonts", () => ScrollTrigger.refresh());
  };
  document.fonts.ready.then(runFontPhase, runFontPhase);
  window.setTimeout(runFontPhase, 3000);

  // Refresh final tras cargar imágenes.
  window.addEventListener("load", () => {
    safeInit("refresh:load", () => ScrollTrigger.refresh());
  });
}
