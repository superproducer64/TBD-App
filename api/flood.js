// api/flood.js — FEMA Flood Proxy via ArcGIS Online (Edge Runtime)
// Uses FEMA's public ArcGIS Online hosted layer — no WebSEAL blocking
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

  // FEMA's ArcGIS Online hosted flood layer — publicly accessible, no WebSEAL
  // Layer 28 = S_FLD_HAZ_AR (Special Flood Hazard Areas)
  const arcgisUrl = `https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Flood_Hazard_Reduced_Set_gdb/FeatureServer/0/query` +
    `?geometry=${lng},${lat}` +
    `&geometryType=esriGeometryPoint` +
    `&inSR=4326` +
    `&spatialRel=esriSpatialRelIntersects` +
    `&outFields=FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE` +
    `&returnGeometry=false` +
    `&f=json`;

  // Backup — FEMA's own ArcGIS REST via different subdomain
  const femaArcUrl = `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query` +
    `?geometry=${lng},${lat}` +
    `&geometryType=esriGeometryPoint` +
    `&inSR=4326` +
    `&spatialRel=esriSpatialRelIntersects` +
    `&outFields=FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE,STUDY_TYP` +
    `&returnGeometry=false` +
    `&f=json`;

  for (const [label, url] of [['ArcGIS Online', arcgisUrl], ['FEMA ArcGIS', femaArcUrl]]) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TBD-HomeIntelligence/1.0)',
          'Accept': 'application/json',
          'Referer': 'https://tbd-app-chi.vercel.app'
        }
      });

      if (!res.ok) continue;
      const data = await res.json();

      if (data?.features?.length) {
        const f = data.features[0].attributes;
        return new Response(JSON.stringify({
          source: label,
          zone:      f.FLD_ZONE,
          subtype:   f.ZONE_SUBTY   || '',
          sfha:      f.SFHA_TF === 'T',
          bfe:       f.STATIC_BFE   || null,
          studyType: f.STUDY_TYP    || '',
        }), { headers });
      }

    } catch(e) {
      console.error(`${label} error:`, e.message);
    }
  }

  // Final fallback — MSC tile-based lookup
  return new Response(JSON.stringify({
    error: 'No flood data found',
    suggestion: `Check manually: https://msc.fema.gov/portal/search#searchresultsanchor`
  }), { headers });
}
