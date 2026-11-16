// Pruebas sin red de la lógica pura:  node tools/test.mjs
import test from "node:test"; import assert from "node:assert/strict";
import { canon, nameScore, norm, isSafeUrl, ymd } from "../lib/core.js";
import { classify, splitTitle } from "../lib/sources.js";
import { findStream } from "../lib/resolver.js";
import { isStreamEastPage } from "../lib/streameast.js";
import { decodePayload } from "../lib/futbolvivo.js";

test("normaliza y empareja nombres español/inglés", () => {
  assert.equal(canon("España"), "spain");
  assert.ok(nameScore(canon("Chequia"), canon("Czechia")) === 1);
  assert.ok(nameScore(canon("Atlético Junior"), canon("Atlético Junior")) === 1);
  assert.ok(nameScore(norm("Deportivo Pasto"), norm("Deportivo Pasto")) === 1);
  assert.ok(nameScore(canon("Boston Bruins"), canon("Toronto Maple Leafs")) < 0.6);
});
test("separa 'Liga: A vs B'", () => {
  assert.deepEqual(splitTitle("UEFA Nations League: Italia vs Francia"), { league: "UEFA Nations League", home: "Italia", away: "Francia" });
  assert.equal(splitTitle("NBA: Toronto Raptors vs Philadelphia 76ers").away, "Philadelphia 76ers");
});
test("separa eventos sin rival (torneos, carreras) de los «A vs B»", () => {
  assert.deepEqual(splitTitle("Gran Premio de Las Vegas – Práctica 1"), { league: "Gran Premio de Las Vegas", home: "Práctica 1", away: "" });
  assert.equal(splitTitle("ESPN Knockout – LFA 246 – Natalia Alves vs. Raiane Vinuto").away, "Raiane Vinuto");
  assert.equal(splitTitle("Golf – DP World Tour Championship – Segunda Ronda").away, "");
});
test("clasifica deportes", () => {
  assert.equal(classify("NBA", "NBA: A vs B"), "basketball");
  assert.equal(classify("NHL", "x"), "nhl");
  assert.equal(classify("NFL", "NFL: A vs B"), "nfl");
  assert.equal(classify("", "Tenis – WTA Finals – Round Robin – Día #6"), "tennis");
  assert.equal(classify("", "Gran Premio de Las Vegas – Práctica 1"), "f1");
  assert.equal(classify("MotoGP", "MotoGP – Gran Premio de Valencia"), "motor");
  assert.equal(classify("", "ESPN Knockout – LFA 246 – A vs. B"), "mma");
  assert.equal(classify("", "Golf – DP World Tour Championship"), "golf");
  assert.equal(classify("", "Rugby – Nations Championship"), "rugby");
  assert.equal(classify("", "Vóley – Liga de Naciones"), "other");
  assert.equal(classify("NCAA Mens Basketball", "Texas State vs. UTSA"), "basketball");   // «Basketball» completo, no solo «basket»
  assert.equal(classify("NCAA Football", "A vs B"), "nfl");
  assert.equal(classify("Liga de Colombia", "a vs b"), "football");
});
test("bloquea direcciones internas", () => {
  for (const u of ["http://localhost/a", "http://127.0.0.1/a", "http://10.0.0.5/a", "http://192.168.1.2/a", "http://169.254.169.254/a", "ftp://x.com/a", "file:///etc/passwd"]) assert.equal(isSafeUrl(u), false, u);
  assert.equal(isSafeUrl("https://example.com/a.m3u8"), true);
});
test("ymd con desfase", () => { assert.equal(ymd(new Date("2026-11-13T05:00:00Z"), -5), "20261113"); assert.equal(ymd(new Date("2026-11-13T04:00:00Z"), -5), "20261112"); });

test("resolver: lista HLS sin .m3u8 (StreamEast: const SOURCE y Clappr atob)", () => {
  const url = "https://chatgpt.hereisman.net/playlist/60249/load-playlist";
  assert.equal(findStream('const SOURCE       = "https:\\/\\/chatgpt.hereisman.net\\/playlist\\/60249\\/load-playlist";', "https://x/"), url);
  assert.equal(findStream("new Clappr.Player({ source: window.atob('" + btoa(url) + "'), x:1 })", "https://x/"), url);
  assert.equal(findStream('<a href="https://cdn.jsdelivr.net/npm/hls.js">', "https://x/"), null);
});
test("StreamEast: solo páginas propias (anti-SSRF)", () => {
  assert.equal(isStreamEastPage("https://streameast.cool/nba/a-b/123"), true);
  for (const u of ["http://streameast.cool/x", "https://evil.com/streameast.cool", "https://streameast.cool.evil.com/x", "file:///etc/passwd"]) assert.equal(isStreamEastPage(u), false, u);
});

test("futbolvivo: descifra el formato «k1» (AES-GCM + alfabeto sustituido + cadena invertida) y acepta JSON plano", async () => {
  const KEY = "vqW3n/yB1R+GwSPc4kJs2dCkV7kRmXaNy3lQ/3XkHJI=", PLAIN = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_", MIXED = "MiljRIn9PX1o63wGBYTtFsKmEkSur-pC_U02cvzAdy5e8ZqLDgJ4OhVN7QbHxfWa";
  const key = await crypto.subtle.importKey("raw", Uint8Array.from(atob(KEY), (c) => c.charCodeAt(0)), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12)), data = { matches: [{ id: 1, title: "A at B" }], n: "ñ" };
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(data))));
  const all = new Uint8Array(iv.length + ct.length); all.set(iv); all.set(ct, iv.length);
  const b64 = btoa(String.fromCharCode(...all)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const enc = "k1" + Array.from(b64).map((c) => MIXED[PLAIN.indexOf(c)]).reverse().join("");
  assert.deepEqual(await decodePayload(enc), data);
  assert.deepEqual(await decodePayload('{"a":1}'), { a: 1 });
  await assert.rejects(() => decodePayload("k1!!!"));
});
