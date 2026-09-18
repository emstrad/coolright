// GET /api/reviews
//
// Live Google reviews, if a key and a place id are set. The cards in the page
// come from content/reviews.js and are written into the HTML by the build; this
// replaces them at runtime. That order matters: a review that only exists after
// a fetch is one an AI crawler never sees.
//
// Place Details returns at most five reviews and Google picks which five. There
// is no paging, so there is no point pretending otherwise.
import { json, requireMethod } from '../lib/http.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;

  const key = process.env.GOOGLE_MAPS_API_KEY;
  const place = process.env.GOOGLE_PLACE_ID;
  if (!key || !place) return json(res, 200, { reviews: [] });

  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(place)}&fields=reviews&reviews_no_translations=true&key=${encodeURIComponent(key)}`;
    const lookup = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!lookup.ok) return json(res, 200, { reviews: [] });

    const data = await lookup.json();
    const reviews = (data.result?.reviews || []).slice(0, 5).map((r) => ({
      // Reproduced exactly, typos included. Tidying somebody's words makes them
      // yours. The client escapes before inserting, since this is other
      // people's writing arriving over a network.
      text: String(r.text || '').slice(0, 1200),
      attr: String(r.author_name || '').slice(0, 80),
      when: String(r.relative_time_description || '').slice(0, 40),
    })).filter((r) => r.text);

    // A day at the edge, which also keeps this inside the free tier.
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');

    // Below five, the whole section ships empty and hidden. A page with a thin
    // set should have no review section rather than a thin one.
    return json(res, 200, { reviews: reviews.length >= 5 ? reviews : [] });
  } catch {
    return json(res, 200, { reviews: [] });
  }
}
