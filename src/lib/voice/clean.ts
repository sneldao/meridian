// Strips markdown decoration before synthesis while keeping an index map back
// to the ORIGINAL string, so ElevenLabs character alignment (which describes
// the cleaned text) can be projected onto the text the feed actually displays.

const STRIP = new Set(["*", "_", "`", "#", "~"]);

export function cleanForTts(text: string): { clean: string; map: number[] } {
  const out: string[] = [];
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (STRIP.has(c)) continue;
    out.push(c === "\n" || c === "\t" ? " " : c);
    map.push(i);
  }
  // Trim outer whitespace — indices shift together so the map stays aligned.
  let s = 0;
  let e = out.length;
  while (s < e && out[s] === " ") s++;
  while (e > s && out[e - 1] === " ") e--;
  return { clean: out.slice(s, e).join(""), map: map.slice(s, e) };
}
