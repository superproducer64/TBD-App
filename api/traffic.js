// api/traffic.js — Google Maps Distance Matrix Proxy
// Keeps API key server-side, never exposed to browser
// Called by browser as: /api/traffic?lat=29.76&lng=-95.57&key=YOUR_KEY

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { lat, lng, key } = req.query;

  if (!lat || !lng || !key) {
    return res.status(400).json({ error: 'lat, lng, and key required' });
  }

  // Key Houston commute destinations
  const destinations = [
    { name: 'Downtown Houston',     lat: 29.7533,  lng: -95.3676 },
    { name: 'Texas Medical Center', lat: 29.7068,  lng: -95.3985 },
    { name: 'Galleria / Uptown',    lat: 29.7371,  lng: -95.4612 },
    { name: 'Energy Corridor',      lat: 29.7602,  lng: -95.6355 },
    { name: 'Greenway Plaza',       lat: 29.7366,  lng: -95.4365 },
  ];

  const destStr = destinations.map(d => `${d.lat},${d.lng}`).join('|');

  // Next Monday 8am UTC-6 (Houston)
  const now = new Date();
  const day = now.getDay();
  const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7 || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() + daysUntilMonday);
  monday.setHours(14, 0, 0, 0); // 8am CST = 14:00 UTC
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
      return res.status(200).json({ error: `Google API status: ${data.status}` });
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
      const delayMins   = Math.round((trafficSecs - baseSecs) / 60);
      const trafficMins = Math.round(trafficSecs / 60);
      const baseMins    = Math.round(baseSecs / 60);

      routes.push({
        destination: dest.name,
        distMiles,
        baseMins,
        trafficMins,
        delayMins,
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

  } catch (e) {
    console.error('Traffic proxy error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
