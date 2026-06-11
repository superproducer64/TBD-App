// api/traffic.js — Google Maps Distance Matrix Proxy
// Node.js runtime (not edge) for reliable process.env access
export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { lat, lng } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat and lng required' });
  }

  const key = process.env.GOOGLE_MAPS_KEY;
  if (!key) {
    return res.status(500).json({ 
      error: 'API key not configured',
      hint: 'Set GOOGLE_MAPS_KEY in Vercel environment variables'
    });
  }

  const destinations = [
    { name: 'Downtown Houston',     lat: 29.7533,  lng: -95.3676 },
    { name: 'Texas Medical Center', lat: 29.7068,  lng: -95.3985 },
    { name: 'Galleria / Uptown',    lat: 29.7371,  lng: -95.4612 },
    { name: 'Energy Corridor',      lat: 29.7602,  lng: -95.6355 },
    { name: 'Greenway Plaza',       lat: 29.7366,  lng: -95.4365 },
  ];

  const destStr = destinations.map(d => `${d.lat},${d.lng}`).join('|');

  const now = new Date();
  const day = now.getDay();
  const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7 || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() + daysUntilMonday);
  monday.setHours(14, 0, 0, 0);
  const departureTime = Math.floor(monday.getTime() / 1000);

  const url = `https://maps.googleapis.com/maps/api/distancematrix/json` +
    `?origins=${lat},${lng}` +
    `&destinations=${encodeURIComponent(destStr)}` +
    `&departure_time=${departureTime}` +
    `&traffic_model=best_guess` +
    `&key=${key}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK') {
      return res.status(200).json({ error: `Google API: ${data.status}` });
    }

    const routes = [];
    const elements = data.rows?.[0]?.elements || [];

    elements.forEach((el, i) => {
      if (el.status !== 'OK') return;
      const dest = destinations[i];
      const baseSecs    = el.duration?.value || 0;
      const trafficSecs = el.duration_in_traffic?.value || baseSecs;
      const distMiles   = ((el.distance?.value || 0) / 1609.34).toFixed(1);
      const congestionRatio = trafficSecs / (baseSecs || 1);

      routes.push({
        destination:     dest.name,
        distMiles,
        baseMins:        Math.round(baseSecs / 60),
        trafficMins:     Math.round(trafficSecs / 60),
        delayMins:       Math.round((trafficSecs - baseSecs) / 60),
        congestionRatio: parseFloat(congestionRatio.toFixed(2)),
        routeScore: Math.min(100, Math.round(
          congestionRatio >= 2.0  ? 90 :
          congestionRatio >= 1.5  ? 70 :
          congestionRatio >= 1.25 ? 45 :
          congestionRatio >= 1.1  ? 25 : 10
        )),
      });
    });

    const sorted = [...routes].sort((a, b) => b.routeScore - a.routeScore);
    const overallScore = Math.round(
      sorted.slice(0, 3).reduce((s, r) => s + r.routeScore, 0) / Math.min(3, sorted.length)
    );

    return res.status(200).json({ routes, overallScore });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
