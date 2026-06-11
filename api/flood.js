// api/flood.js — FEMA NFHL Proxy
// Bypasses CORS by calling FEMA server-side from Vercel edge function
// Called by browser as: /api/flood?lat=29.76&lng=-95.57

export default async function handler(req, res) {
  // CORS headers — allow your Vercel domain
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { lat, lng } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat and lng required' });
  }

  // Build small bounding box (~0.1 mile radius)
  const latDelta = 0.00145;
  const lngDelta = 0.00145 / Math.cos(parseFloat(lat) * Math.PI / 180);
  const bbox = `${parseFloat(lng) - lngDelta},${parseFloat(lat) - latDelta},${parseFloat(lng) + lngDelta},${parseFloat(lat) + latDelta}`;

  // Try WFS first
  const wfsUrl = `https://hazards.fema.gov/gis/nfhl/services/public/NFHL/MapServer/WFSServer` +
    `?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
    `&TYPENAMES=NFHL:S_FLD_HAZ_AR` +
    `&BBOX=${bbox},EPSG:4326` +
    `&SRSNAME=EPSG:4326` +
    `&outputFormat=GEOJSON` +
    `&COUNT=10`;

  // REST fallback
  const restUrl = `https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/28/query` +
    `?geometry=${lng},${lat}` +
    `&geometryType=esriGeometryPoint` +
    `&inSR=4326` +
    `&spatialRel=esriSpatialRelIntersects` +
    `&outFields=FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE,STUDY_TYP` +
    `&returnGeometry=false` +
    `&f=json`;

  for (const [label, url] of [['WFS', wfsUrl], ['REST', restUrl]]) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'TBD-HomeIntelligence/1.0' }
      });

      if (!response.ok) continue;
      const data = await response.json();

      // Parse WFS GeoJSON
      if (label === 'WFS' && data?.features?.length) {
        const f = data.features[0].properties;
        return res.status(200).json({
          source: 'FEMA WFS',
          zone:      f.FLD_ZONE      || f.fld_zone,
          subtype:   f.ZONE_SUBTY    || f.zone_subty || '',
          sfha:      (f.SFHA_TF      || f.sfha_tf) === 'T',
          bfe:       f.STATIC_BFE    || f.static_bfe || null,
          studyType: f.STUDY_TYP     || f.study_typ  || '',
        });
      }

      // Parse REST JSON
      if (label === 'REST' && data?.features?.length) {
        const f = data.features[0].attributes;
        return res.status(200).json({
          source: 'FEMA REST',
          zone:      f.FLD_ZONE,
          subtype:   f.ZONE_SUBTY || '',
          sfha:      f.SFHA_TF === 'T',
          bfe:       f.STATIC_BFE || null,
          studyType: f.STUDY_TYP  || '',
        });
      }
    } catch (e) {
      console.error(`FEMA ${label} error:`, e.message);
    }
  }

  return res.status(200).json({ error: 'No flood data found for this location' });
}
