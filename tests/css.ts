import { readFileSync } from "fs";
import { join } from "path";

/* src/app/globals.css is an import manifest — the rules live in
 * src/app/styles/*.css, in cascade order. Tests assert on the real
 * stylesheet, so read the manifest and inline the relative sheets.
 * Package imports (e.g. "tailwindcss") stay as-is: they contribute no
 * rules to the contract assertions. */
export function readStylesheet(): string {
  const dir = join(import.meta.dir, "..", "src", "app");
  const manifest = readFileSync(join(dir, "globals.css"), "utf8");
  return manifest.replace(
    /@import\s+"\.\/styles\/([^"]+)";/g,
    (_m, file: string) => readFileSync(join(dir, "styles", file), "utf8"),
  );
}
