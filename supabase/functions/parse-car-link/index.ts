// Supabase Edge Function: parse-car-link
// POST { url } -> { title, price, currency, year, image } or { error }
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
const PRIVATE = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[|.*\.local$|.*\.internal$)/i;
const out = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: CORS });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { url } = await req.json();
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol) || PRIVATE.test(u.hostname)) return out({ error: "bad url" }, 400);

    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 6000);
    const r = await fetch(u.toString(), {
      signal: ctl.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; YaadAdzBot/1.0; +https://yaadadz.com)", Accept: "text/html" },
    });
    clearTimeout(t);
    if (!r.ok) return out({ error: "blocked " + r.status }, 200);
    const html = (await r.text()).slice(0, 1_500_000);

    const meta = (p: string) => {
      const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]*content=["']([^"']*)["']`, "i"))
        || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${p}["']`, "i"));
      return m ? m[1] : "";
    };

    let title = "", price = 0, currency = "USD", image = "";
    for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const walk = (n: any): void => {
          if (!n || typeof n !== "object") return;
          if (Array.isArray(n)) return n.forEach(walk);
          const ty = [].concat(n["@type"] || []).join(",");
          if (/Vehicle|Car|Product/i.test(ty)) {
            title ||= n.name || "";
            image ||= [].concat(n.image || [])[0] || "";
            const o = [].concat(n.offers || [])[0] as any;
            if (o && !price) { price = parseFloat(o.price || o.lowPrice || 0) || 0; currency = o.priceCurrency || currency; }
          }
          Object.values(n).forEach(walk);
        };
        walk(JSON.parse(m[1]));
      } catch (_) { /* ignore bad JSON-LD */ }
    }
    title ||= meta("og:title") || (html.match(/<title>([^<]*)/i)?.[1] ?? "");
    if (!price) price = parseFloat(meta("product:price:amount") || meta("og:price:amount") || "0") || 0;
    currency = meta("product:price:currency") || meta("og:price:currency") || currency;
    image ||= meta("og:image");
    title = title.replace(/\s+/g, " ").trim().slice(0, 140);
    const year = parseInt((title.match(/\b(19|20)\d\d\b/) || [])[0] || "0") || 0;

    // Only trust USD prices; calculator is in USD
    if (currency !== "USD") price = 0;
    if (!title && !price) return out({ error: "nothing found" });
    return out({ title, price, currency, year, image });
  } catch (e) {
    return out({ error: String(e) }, 200);
  }
});
