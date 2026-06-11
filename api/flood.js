// api/flood.js — FEMA NFHL Proxy (Edge Runtime) with debug
export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');
  const debug = searchParams.get('debug') === '1';

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (!lat || !lng) {
    return new Response(JSON.stringify({ error: 'lat and lng required' }), { status: 400, headers });
  }

  const latDelta = 0.00145;
  const lngDelta = 0.00145 / Math.cos(parseFloat(lat) * Math.PI / 180);
  const minLng = parseFloat(lng) - lngDelta;
  const minLat = parseFloat(lat) - latDelta;
  const maxLng = parseFloat(lng) + lngDelta;
  const maxLat = parseFloat(lat) + latDelta;
  const bbox = `${minLng},${minLat},${maxLng},${maxLat}`;

  // Try REST endpoint with point query
  const restUrl = `https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/28/query` +
    `?geometry=${lng},${lat}` +
    `&geometryType=esriGeometryPoint` +
    `&inSR=4326` +
    `&spatialRel=esriSpatialRelIntersects` +
    `&outFields=FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE,STUDY_TYP` +
    `&returnGeometry=false` +
    `&f=json`;

  // Try WFS
  const wfsUrl = `https://hazards.fema.gov/gis/nfhl/services/public/NFHL/MapServer/WFSServer` +
    `?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
    `&TYPENAMES=NFHL:S_FLD_HAZ_AR` +
    `&BBOX=${bbox},EPSG:4326` +
    `&SRSNAME=EPSG:4326` +
    `&outputFormat=GEOJSON` +
    `&COUNT=10`;

  const debugLog = [];

  for (const [label, url] of [['REST', restUrl], ['WFS', wfsUrl]]) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'TBD-HomeIntelligence/1.0' }
      });
      const status = res.status;
      const text = await res.text();

      debugLog.push({ label, status, url, responsePreview: text.slice(0, 300) });

      let data;
      try { data = JSON.parse(text); } catch(e) {
        debugLog.push({ label, parseError: e.message });
        continue;
      }

      if (label === 'REST' && data?.features?.length) {
        const f = data.features[0].attributes;
        return new Response(JSON.stringify({
          source: 'FEMA REST',
          zone: f.FLD_ZONE, subtype: f.ZONE_SUBTY || '',
          sfha: f.SFHA_TF === 'T', bfe: f.STATIC_BFE || null,
          studyType: f.STUDY_TYP || '',
          ...(debug ? { debug: debugLog } : {})
        }), { headers });
      }

      if (label === 'WFS' && data?.features?.length) {
        const f = data.features[0].properties;
        return new Response(JSON.stringify({
          source: 'FEMA WFS',
          zone: f.FLD_ZONE || f.fld_zone, subtype: f.ZONE_SUBTY || f.zone_subty || '',
          sfha: (f.SFHA_TF || f.sfha_tf) === 'T', bfe: f.STATIC_BFE || f.static_bfe || null,
          studyType: f.STUDY_TYP || f.study_typ || '',
          ...(debug ? { debug: debugLog } : {})
        }), { headers });
      }

    } catch(e) {
      debugLog.push({ label, fetchError: e.message });
    }
  }

  return new Response(JSON.stringify({
    error: 'No flood data found',
    ...(debug ? { debug: debugLog } : {})
  }), { headers });
}
