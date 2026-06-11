// api/flood.js — FEMA NFHL Proxy (Edge Runtime)
export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (!lat || !lng) {
    return new Response(JSON.stringify({ error: 'lat and lng required' }), { status: 400, headers });
  }

  const latDelta = 0.00145;
  const lngDelta = 0.00145 / Math.cos(parseFloat(lat) * Math.PI / 180);
  const bbox = `${parseFloat(lng) - lngDelta},${parseFloat(lat) - latDelta},${parseFloat(lng) + lngDelta},${parseFloat(lat) + latDelta}`;

  const wfsUrl = `https://hazards.fema.gov/gis/nfhl/services/public/NFHL/MapServer/WFSServer?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=NFHL:S_FLD_HAZ_AR&BBOX=${bbox},EPSG:4326&SRSNAME=EPSG:4326&outputFormat=GEOJSON&COUNT=10`;
  const restUrl = `https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/28/query?geometry=${lng},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE,STUDY_TYP&returnGeometry=false&f=json`;

  for (const [label, url] of [['WFS', wfsUrl], ['REST', restUrl]]) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();

      if (label === 'WFS' && data?.features?.length) {
        const f = data.features[0].properties;
        return new Response(JSON.stringify({
          source: 'FEMA WFS',
          zone:      f.FLD_ZONE   || f.fld_zone,
          subtype:   f.ZONE_SUBTY || f.zone_subty || '',
          sfha:      (f.SFHA_TF   || f.sfha_tf) === 'T',
          bfe:       f.STATIC_BFE || f.static_bfe || null,
          studyType: f.STUDY_TYP  || f.study_typ  || '',
        }), { headers });
      }

      if (label === 'REST' && data?.features?.length) {
        const f = data.features[0].attributes;
        return new Response(JSON.stringify({
          source: 'FEMA REST',
          zone:      f.FLD_ZONE,
          subtype:   f.ZONE_SUBTY || '',
          sfha:      f.SFHA_TF === 'T',
          bfe:       f.STATIC_BFE || null,
          studyType: f.STUDY_TYP  || '',
        }), { headers });
      }
    } catch(e) {
      console.error(`FEMA ${label} error:`, e.message);
    }
  }

  return new Response(JSON.stringify({ error: 'No flood data found' }), { headers });
}
