/**
 * Browser detection and print arguments for `npm run cv:pdf`.
 *
 * Decision 16: markdown first → the user approves → PDF. The PDF is produced by
 * a **browser the user already has** (Chrome, Edge, Brave, Chromium), driven
 * headlessly. Puppeteer was rejected outright: a ~300 MB Chromium download in
 * `npx create-achieve` is a heavy price for a document the dashboard can also
 * print, and the PDF is a derived artifact either way (gitignored, regenerable
 * in one command).
 *
 * Framework-free and dependency-free, and the detection is pure: the caller
 * supplies the platform, the environment and an `exists` predicate, so the
 * fallback path can be tested on a machine that does have a browser installed.
 */

import path from "node:path"

/** The CV the script was pointed at, as vault-relative paths. */
export interface CvTarget {
  /** `jobs/<slug>/cv.md` — the markdown, which stays the source of truth. */
  cv: string
  /** `jobs/<slug>/cv.pdf` — the derived artifact, gitignored. */
  pdf: string
  slug: string
}

/**
 * Accept the shapes a user would actually type: the folder
 * (`jobs/acme-platform-engineer`), the file inside it (`.../cv.md`), or just
 * the slug. Everything resolves to one CV inside `jobs/`, and a path that tries
 * to climb out of it is refused rather than normalized into something else.
 */
export function resolveCvTarget(arg: string): CvTarget {
  const cleaned = arg
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/+$/, "")
  if (!cleaned) throw new Error("Which CV? Pass a path like jobs/<company>-<role>.")

  const dir = cleaned.endsWith(".md")
    ? cleaned.slice(0, cleaned.lastIndexOf("/"))
    : cleaned
  const withPrefix = dir.startsWith("jobs/") ? dir : `jobs/${dir}`
  const slug = withPrefix.slice("jobs/".length)

  if (!slug || slug.includes("/") || slug === "." || slug === "..") {
    throw new Error(
      `Not an application folder: ${arg}. Expected jobs/<company>-<role>.`,
    )
  }

  return { cv: `${withPrefix}/cv.md`, pdf: `${withPrefix}/cv.pdf`, slug }
}

/** Env vars that name a browser explicitly, checked before anything is probed. */
export const BROWSER_ENV_VARS = ["ACHIEVE_CHROME", "CHROME_PATH"] as const

/**
 * Where an installed Chromium-family browser lives, per platform, most
 * preferred first. Absolute paths only — probing `PATH` would mean running
 * something to find out, and this stage must be side-effect free.
 *
 * A browser named in the environment is the **whole** list, not the head of it:
 * if `ACHIEVE_CHROME` points somewhere wrong, that is worth a clear failure
 * rather than a silent fall back to a different browser than the one asked for.
 */
export function browserCandidates(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined> = process.env,
): string[] {
  const named = BROWSER_ENV_VARS.map((key) => env[key]?.trim()).filter(
    (value): value is string => Boolean(value),
  )
  if (named.length > 0) return named

  if (platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ]
  }

  if (platform === "win32") {
    const programFiles = [
      env["PROGRAMFILES"],
      env["PROGRAMFILES(X86)"],
      env["LOCALAPPDATA"],
    ].filter((dir): dir is string => Boolean(dir))
    const relative = [
      "Google\\Chrome\\Application\\chrome.exe",
      "Microsoft\\Edge\\Application\\msedge.exe",
      "BraveSoftware\\Brave-Browser\\Application\\brave.exe",
      "Chromium\\Application\\chrome.exe",
    ]
    return programFiles.flatMap((dir) => relative.map((rel) => path.join(dir, rel)))
  }

  return [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
    "/usr/bin/brave-browser",
    "/snap/bin/chromium",
    "/var/lib/flatpak/exports/bin/com.google.Chrome",
  ]
}

/** The first candidate that exists, or `null` when the user has none of them. */
export function findBrowser(
  candidates: readonly string[],
  exists: (candidate: string) => boolean,
): string | null {
  return candidates.find((candidate) => exists(candidate)) ?? null
}

/**
 * Headless print arguments.
 *
 * `--headless` (rather than `--headless=new`) is the portable spelling: recent
 * Chrome maps it to the new headless mode, and older builds still understand
 * it. Header/footer are suppressed so the page carries no browser chrome —
 * a CV with "about:blank 1/2" printed across the top is not a CV you send.
 */
export function printArgs(htmlPath: string, pdfPath: string): string[] {
  return [
    "--headless",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--no-pdf-header-footer",
    `--print-to-pdf=${pdfPath}`,
    fileUrl(htmlPath),
  ]
}

/** `file://` URL for a local path, with each segment encoded. */
export function fileUrl(absPath: string): string {
  const normalized = absPath.replace(/\\/g, "/")
  const withSlash = normalized.startsWith("/") ? normalized : `/${normalized}`
  return `file://${withSlash.split("/").map(encodeURIComponent).join("/")}`
}

/**
 * What to print when no browser is installed. Not an error dump: the markdown
 * CV already exists and is the source of truth, so the user is one Cmd-P away
 * from the same document through the dashboard's print view.
 */
export function noBrowserMessage(slug: string, cvPath: string): string {
  return [
    "✗ No Chrome, Edge, Brave or Chromium found, so the PDF was not written.",
    "",
    `  ${cvPath} is unchanged — the markdown CV is the source of truth, and the`,
    "  PDF is only a derived artifact. Two ways to get one:",
    "",
    `  1. Print it from the dashboard: npm run dev, then open /jobs/${slug}/cv`,
    "     and print to PDF (Cmd-P / Ctrl-P). Same layout, same stylesheet.",
    "  2. Install one of those browsers, or point this script at an existing",
    "     one: ACHIEVE_CHROME=/path/to/chrome npm run cv:pdf <path>",
  ].join("\n")
}
