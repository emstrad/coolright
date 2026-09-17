// GET /api/address?postcode=SW11+3AB
//
// Optional convenience only. The typed fields are the truth and this just fills
// them in, so no key, no results and a provider that is down all end at the
// same place: the visitor types the address exactly as they would have anyway.
import { json, requireMethod, str } from '../lib/http.js';
import { normalisePostcode } from '../lib/validate.js';
import { limit } from '../lib/ratelimit.js';
import { clientIp, ipHash } from '../lib/http.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;

  const postcode = normalisePostcode(str(req.query?.postcode, 12));
  if (!postcode) return json(res, 200, { addresses: [] });

  const key = process.env.ADDRESS_API_KEY;
  if (!key) return json(res, 200, { addresses: [] });

  const throttle = await limit({
    bucket: 'address', key: ipHash(clientIp(req)), windowSeconds: 600, max: 30, failOpen: true,
  });
  if (!throttle.allowed) return json(res, 200, { addresses: [] });

  try {
    const url = `https://api.getaddress.io/find/${encodeURIComponent(postcode)}?api-key=${encodeURIComponent(key)}&expand=true`;
    const lookup = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!lookup.ok) return json(res, 200, { addresses: [] });
    const data = await lookup.json();

    const addresses = (data.addresses || []).slice(0, 60).map((a) => ({
      line: [a.line_1, a.line_2].filter(Boolean).join(', ').slice(0, 160),
      town: str(a.town_or_city, 80),
    })).filter((a) => a.line);

    // A day at the edge. The postcode to address mapping does not change often
    // and the provider bills per lookup.
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');
    return json(res, 200, { postcode, addresses });
  } catch (err) {
    return json(res, 200, { addresses: [] });
  }
}
