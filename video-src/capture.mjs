// Regenera los videos scrubbeados por scroll a partir de video-src/<escena>.html.
//
// Uso:  pnpm video          (todas las escenas)
//       pnpm video:hero     (solo una; también video:quote)
// Requiere Google Chrome (con H.264) y ffmpeg en el PATH.
// Variables opcionales: CHROME_PATH, FFMPEG.
//
// Cómo funciona: abre cada <escena>.html en Chrome headless, mueve el timeline
// de GSAP (window.__tl) de 0 a 1 sacando una captura por cuadro, y codifica
// cada proporción a MP4 con keyframes frecuentes para que el scrub sea fluido.
import puppeteer from "puppeteer-core";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(here, "../public/videos");
const CHROME =
  process.env.CHROME_PATH ??
  "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FFMPEG = process.env.FFMPEG ?? "ffmpeg";

// Cuadros por escena a 30 fps; motion.ts mapea el scroll lineal a currentTime.
const SCENES = {
  hero: { frames: 300 },
  quote: { frames: 150 },
};
const FPS = 30;
const VARIANTS = [
  { suffix: "desktop", width: 1920, height: 1080 },
  { suffix: "desktop-4x3", width: 1440, height: 1080 },
  // 9:19.5, la proporción de la mayoría de los celulares actuales.
  { suffix: "mobile", width: 828, height: 1792 },
];

const requested = process.argv.slice(2);
const scenes = requested.length > 0 ? requested : Object.keys(SCENES);
for (const scene of scenes) {
  if (!SCENES[scene]) throw new Error(`Escena desconocida: ${scene}`);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    "--hide-scrollbars",
    "--force-color-profile=srgb",
    "--allow-file-access-from-files",
  ],
});

async function render(page, { name, width, height, frames: total }) {
  const frames = mkdtempSync(join(tmpdir(), `${name}-`));
  try {
    const tab = await browser.newPage();
    await tab.setViewport({ width, height, deviceScaleFactor: 1 });
    await tab.goto(page, { waitUntil: "load" });
    await tab.evaluate(() => document.fonts.ready);

    for (let i = 0; i < total; i++) {
      await tab.evaluate((p) => {
        window.__tl.progress(p);
        return new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        );
      }, i / (total - 1));
      await tab.screenshot({
        path: join(frames, `f${String(i).padStart(4, "0")}.png`),
      });
      if (i % 50 === 0) console.log(`${name}: cuadro ${i}/${total}`);
    }
    await tab.close();

    // BT.709 limited range con tags explícitos: es la combinación que más
    // se acerca a #052E3E en 8 bits (Chrome muestra 4,46,62).
    // Keyframe cada 5 cuadros: ~4x más liviano que todo-keyframes y el seek
    // sigue por debajo de un frame a 60 fps (~11 ms en Chrome desktop).
    // CRF 20 da la misma calidad visible (SSIM ≥ 0.9988 contra los PNG).
    // prettier-ignore
    execFileSync(FFMPEG, [
      "-y", "-loglevel", "error",
      "-framerate", String(FPS),
      "-i", join(frames, "f%04d.png"),
      "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
      "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-tune", "animation",
      "-g", "5",
      "-colorspace", "bt709", "-color_primaries", "bt709",
      "-color_trc", "bt709", "-color_range", "tv",
      "-movflags", "+faststart", "-an",
      join(OUT_DIR, `${name}.mp4`),
    ], { stdio: "inherit" });
    console.log(`${name}: listo`);
  } finally {
    rmSync(frames, { recursive: true, force: true });
  }
}

try {
  for (const scene of scenes) {
    const page = pathToFileURL(join(here, `${scene}.html`)).href;
    for (const { suffix, width, height } of VARIANTS) {
      await render(page, {
        name: `${scene}-${suffix}`,
        width,
        height,
        frames: SCENES[scene].frames,
      });
    }
  }
} finally {
  await browser.close();
}
