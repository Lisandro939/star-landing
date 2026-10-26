// Regenera los videos del hero (desktop y mobile) a partir de video-src/hero.html.
//
// Uso:  pnpm video:hero
// Requiere Google Chrome (con H.264) y ffmpeg en el PATH.
// Variables opcionales: CHROME_PATH, FFMPEG.
//
// Cómo funciona: abre hero.html en Chrome headless, mueve el timeline de GSAP
// (window.__tl) de 0 a 1 sacando una captura por cuadro, y codifica cada
// proporción a MP4 con un keyframe por cuadro para que el scrub sea fluido.
import puppeteer from "puppeteer-core";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const PAGE = pathToFileURL(join(here, "hero.html")).href;
const OUT_DIR = resolve(here, "../public/videos");
const CHROME =
  process.env.CHROME_PATH ??
  "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FFMPEG = process.env.FFMPEG ?? "ffmpeg";

// 300 cuadros a 30 fps = 10 s; motion.ts mapea el scroll lineal a currentTime.
const FRAMES = 300;
const FPS = 30;
const VARIANTS = [
  { name: "hero-desktop", width: 1920, height: 1080 },
  { name: "hero-desktop-4x3", width: 1440, height: 1080 },
  // 9:19.5, la proporción de la mayoría de los celulares actuales.
  { name: "hero-mobile", width: 828, height: 1792 },
];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    "--hide-scrollbars",
    "--force-color-profile=srgb",
    "--allow-file-access-from-files",
  ],
});

try {
  for (const { name, width, height } of VARIANTS) {
    const frames = mkdtempSync(join(tmpdir(), `${name}-`));
    try {
      const page = await browser.newPage();
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      await page.goto(PAGE, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);

      for (let i = 0; i < FRAMES; i++) {
        await page.evaluate((p) => {
          window.__tl.progress(p);
          return new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(r)),
          );
        }, i / (FRAMES - 1));
        await page.screenshot({
          path: join(frames, `f${String(i).padStart(4, "0")}.png`),
        });
        if (i % 50 === 0) console.log(`${name}: cuadro ${i}/${FRAMES}`);
      }
      await page.close();

      // BT.709 limited range con tags explícitos: es la combinación que más
      // se acerca a #052E3E en 8 bits (Chrome muestra 4,46,62).
      // prettier-ignore
      execFileSync(FFMPEG, [
        "-y", "-loglevel", "error",
        "-framerate", String(FPS),
        "-i", join(frames, "f%04d.png"),
        "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
        "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-tune", "animation",
        "-g", "1",
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
} finally {
  await browser.close();
}
