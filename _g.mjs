import fs from "fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")).trim(),l.slice(l.indexOf("=")+1).trim()]));
const model = env.GEMINI_MODEL;
const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
const t = Date.now();
const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY }, body: JSON.stringify({ contents: [{ parts: [{ text: "Say ok." }] }], generationConfig: { maxOutputTokens: 5 } }) });
const body = await r.text();
console.log("model:", model, "| status:", r.status, "|", ((Date.now() - t) / 1000).toFixed(1) + "s");
let j; try { j = JSON.parse(body); } catch { console.log(body.slice(0, 400)); process.exit(0); }
const clean = (x) => JSON.stringify(x, null, 1).replaceAll(env.GEMINI_API_KEY, "<key>");
if (r.status === 200) console.log("reply:", JSON.stringify(j.candidates?.[0]?.content?.parts?.[0]?.text ?? "").slice(0, 60));
else { console.log("message:", String(j.error?.message ?? "").slice(0, 600).replaceAll(env.GEMINI_API_KEY, "<key>")); for (const d of j.error?.details ?? []) console.log("detail:", clean(d).slice(0, 900)); }
console.log("retry-after header:", r.headers.get("retry-after") ?? "(none)");
