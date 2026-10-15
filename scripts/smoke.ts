export {};
// Smoke check against a running dev server: bun run dev then bun run smoke
const res = await fetch("http://localhost:3000/api/crew/run");
if (!res.ok || !res.body) throw new Error(`stream failed: ${res.status}`);
const reader = res.body.getReader();
const decoder = new TextDecoder();
let body = "";
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  body += decoder.decode(value, { stream: true });
  if (body.includes('"done"')) break;
}
if (!body.includes('"done"')) throw new Error("never received done event");
console.log("smoke ok - events:", (body.match(/^data:/gm) || []).length);