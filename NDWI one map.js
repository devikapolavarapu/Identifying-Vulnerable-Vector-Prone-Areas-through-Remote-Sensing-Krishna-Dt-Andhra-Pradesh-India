/**************************************************************
Single interactive NDWI map (one map). Dropdown contains 4 years:
2018, 2020, 2021, 2024. Change selection to update the map.
- Annual MAX NDWI (McFeeters)
- Landsat C2 Level-2 SR used with reflectance scaling; fallback to Sentinel-2 SR
- Rivers (JRC occurrence) added so Krishna River is visible
- Legend: Block Boundary (white + outline) and Waterbody/Waterlogged (blue)
**************************************************************/

// ---------------- USER PARAMETERS ----------------
var years = [2018, 2020, 2021, 2024]; // years available in dropdown
var defaultYear = years[years.length - 1]; // default selection (last year by default)
var requireMinScenes = 3;      // min Landsat scenes to prefer Landsat; else fallback to Sentinel-2
var shallowThresh = 0.05;      // NDWI threshold for transient/shallow water (tunable)
var deepThresh = 0.30;         // NDWI deep threshold (for classification if needed)
var minArea_m2 = 30;           // remove tiny vector specks
var riverThreshold = 10;       // JRC occurrence threshold for rivers (0-100). Lower -> more channels shown

// ---------------- Load Krishna district (replace with your polygon for best accuracy) ---------------
var gaul2 = ee.FeatureCollection('FAO/GAUL/2015/level2');
var krishnaFeature = gaul2.filter(ee.Filter.and(
  ee.Filter.eq('ADM1_NAME','Andhra Pradesh'),
  ee.Filter.or(
    ee.Filter.eq('ADM2_NAME','Krishna'),
    ee.Filter.eq('ADM2_NAME','KRISHNA'),
    ee.Filter.eq('ADM2_NAME','krishna')
  )
)).first();

print('GAUL Krishna feature (may be null):', krishnaFeature);

var region;
if (krishnaFeature) {
  region = ee.Geometry(krishnaFeature.geometry());
} else {
  // Replace with your uploaded/drawn Krishna polygon for highest accuracy:
  // region = ee.FeatureCollection('users/your_account/krishna_polygon').geometry();
  region = ee.Geometry.Point([80.95, 16.5]).buffer(200000); // fallback for testing only
  print('WARNING: GAUL lookup failed; replace "region" with your precise Krishna polygon.');
}

// ---------------- Helper functions: mask & scale ----------------
// Landsat C2 mask and reflectance scaling
function maskLandsatC2(image) {
  var qa = image.select('QA_PIXEL');
  var cloud = qa.bitwiseAnd(1 << 3).eq(0);
  var cloudShadow = qa.bitwiseAnd(1 << 4).eq(0);
  return image.updateMask(cloud.and(cloudShadow));
}
function toReflectanceLandsat(image) {
  var scale = 0.0000275;
  var offset = -0.2;
  var bandNames = image.bandNames();
  var srBands = bandNames.filter(ee.Filter.stringStartsWith('item','SR_'));
  var scaled = image.select(srBands).multiply(scale).add(offset);
  var others = image.select(bandNames.removeAll(srBands));
  return scaled.addBands(others);
}

// Sentinel-2 mask & reflectance scaling
function maskS2(image) {
  var qa = image.select('QA60');
  var cloudBit = 1 << 10;
  var cirrusBit = 1 << 11;
  var mask = qa.bitwiseAnd(cloudBit).eq(0).and(qa.bitwiseAnd(cirrusBit).eq(0));
  return image.updateMask(mask);
}
function toReflectanceS2(image) {
  // S2_SR stored as integers; scale to 0-1
  var bandNames = image.bandNames();
  return image.select(bandNames).multiply(0.0001);
}

// NDWI calculators per image
function ndwiLandsatImage(image) {
  var g = image.select('SR_B3');
  var n = image.select('SR_B5');
  return g.subtract(n).divide(g.add(n)).rename('NDWI');
}
function ndwiS2Image(image) {
  var g = image.select('B03');
  var n = image.select('B08');
  return g.subtract(n).divide(g.add(n)).rename('NDWI');
}

// ---------------- Build annual MAX NDWI collections ----------------
function buildMaxNDWI_Landsat(year) {
  var start = year + '-01-01';
  var end = year + '-12-31';
  var c8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
            .filterDate(start, end).filterBounds(region)
            .map(maskLandsatC2).map(toReflectanceLandsat);
  var c9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
            .filterDate(start, end).filterBounds(region)
            .map(maskLandsatC2).map(toReflectanceLandsat);
  var coll = c8.merge(c9);
  var ndwiColl = coll.map(function(img){ return ndwiLandsatImage(img); });
  var maxNDWI = ndwiColl.max().clip(region);
  return {coll: coll, maxNDWI: maxNDWI};
}
function buildMaxNDWI_S2(year) {
  var start = year + '-01-01';
  var end = year + '-12-31';
  var s2 = ee.ImageCollection('COPERNICUS/S2_SR')
            .filterDate(start, end).filterBounds(region)
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 80))
            .map(maskS2).map(toReflectanceS2);
  var ndwiColl = s2.map(function(img){ return ndwiS2Image(img); });
  var maxNDWI = ndwiColl.max().clip(region);
  return {coll: s2, maxNDWI: maxNDWI};
}

// Compute final MAX NDWI for a year with Landsat preferred else Sentinel fallback
function computeMaxNDWIforYear(year) {
  var L = buildMaxNDWI_Landsat(year);
  var lcount = L.coll.size();
  print('Year', year, 'Landsat images (annual after mask):', lcount);
  var useL = lcount.gte(requireMinScenes);
  var result = ee.Image(ee.Algorithms.If(useL, L.maxNDWI, buildMaxNDWI_S2(year).maxNDWI));
  print('Note: using Landsat if >= ' + requireMinScenes + ' scenes; otherwise using Sentinel-2.');
  return result;
}

// ---------------- Derive water masks ----------------
function deriveWaterMasks(maxNdwi) {
  var transient = maxNdwi.gt(shallowThresh).selfMask();
  var permanent = ee.Image('JRC/GSW1_3/GlobalSurfaceWater').select('occurrence').gt(80).selfMask().clip(region);
  var combined = permanent.unmask(0).add(transient.unmask(0)).gt(0).selfMask();
  return {transient: transient, permanent: permanent, combined: combined};
}

// Vectorize transient to create dots/polygons and filter small ones
function vectorizeTransient(transientRaster) {
  var vec = transientRaster.reduceToVectors({
    geometry: region, geometryType: 'polygon', scale: 30, maxPixels: 1e13
  });
  vec = vec.map(function(f){ return f.set('area_m2', f.geometry().area()); })
           .filter(ee.Filter.gt('area_m2', minArea_m2));
  return vec;
}

// River raster from JRC occurrence to ensure Krishna River appears
function buildRiverRaster(threshold) {
  var jrc = ee.Image('JRC/GSW1_3/GlobalSurfaceWater').select('occurrence');
  var rivers = jrc.gt(threshold).selfMask().clip(region);
  return rivers;
}

// ---------------- UI: single map + dropdown ----------------
ui.root.clear();
Map.clear();
Map.setOptions('SATELLITE');

// Top control panel with title and dropdown
var control = ui.Panel({style:{position:'top-center', padding:'8px 12px'}});
control.add(ui.Label('NORMALIZED DIFFERENCE WATER INDEX MAP — Krishna District, Andhra Pradesh', {fontWeight:'bold', fontSize:'14px'}));
var selectorPanel = ui.Panel({layout: ui.Panel.Layout.Flow('horizontal')});
selectorPanel.add(ui.Label('Year:'));
var yearSelect = ui.Select({
  items: years.map(function(y){ return String(y); }),
  value: String(defaultYear),
  style: {width: '120px', margin: '0 0 0 6px'}
});
selectorPanel.add(yearSelect);
control.add(selectorPanel);
ui.root.add(control);

// Shared legend
var legend = ui.Panel({style:{position:'bottom-right', padding:'8px 10px', width:'220px', backgroundColor:'ffffffDD', border:'1px solid #888'}});
legend.add(ui.Label('LEGEND', {fontWeight:'bold'}));
function legendRow(color, text) {
  var box = ui.Label('', {backgroundColor: color, padding: '8px', margin: '0 6px 0 0', border:'1px solid #999'});
  var lbl = ui.Label(text);
  return ui.Panel([box, lbl], ui.Panel.Layout.Flow('horizontal'));
}
legend.add(legendRow('#ffffff', 'Block Boundary (white fill, black outline)'));
legend.add(legendRow('#1f78b4', 'Waterbody / Waterlogged (blue)'));
legend.add(legendRow('#bfefff', 'Rivers (JRC occurrence)'));
legend.add(ui.Label('Scale approx: 0 - 10 - 20 km', {fontSize:'11px', margin:'8px 0 0 0'}));
ui.root.add(legend);

// Single map
var singleMap = ui.Map();
singleMap.setControlVisibility({all:true});
ui.root.add(singleMap);
singleMap.centerObject(region, 10);

// Update function
function updateMapForYear(y) {
  singleMap.layers().reset([]);

  // white page canvas
  var whiteCanvas = ee.Image.constant(1).visualize({palette:['ffffff'], forceRgbOutput:true}).clip(region);
  singleMap.addLayer(whiteCanvas, {}, 'white canvas');

  // district outline (black)
  if (krishnaFeature) {
    singleMap.addLayer(ee.FeatureCollection([krishnaFeature]).style({color:'000000', fillColor:'00000000', width:2}), {}, 'district outline');
  } else {
    singleMap.addLayer(ee.FeatureCollection(ee.Feature(region)).style({color:'000000', fillColor:'00000000', width:2}), {}, 'region outline');
  }

  // Add river raster (JRC occ > threshold) to highlight Krishna River
  var riverRaster = buildRiverRaster(riverThreshold);
  singleMap.addLayer(riverRaster, {min:0, max:1, palette:['#bfefff']}, 'Rivers (JRC occ > ' + riverThreshold + ')', true);

  // Compute MAX NDWI for year (Landsat preferred else S2)
  var maxNdwi = computeMaxNDWIforYear(y);

  // Derive transient/permanent masks
  var masks = deriveWaterMasks(maxNdwi);

  // Permanent water - behind
  singleMap.addLayer(masks.permanent, {min:0, max:1, palette:['#d6f5ff']}, 'Permanent water (JRC occ>80)', false);

  // Transient water (max NDWI) - visible blue
  singleMap.addLayer(masks.transient, {min:0, max:1, palette:['#1f78b4']}, 'Transient water (maxNDWI > ' + shallowThresh + ')', true);

  // Vectorize transient for paper-style small polygons/dots
  var vec = vectorizeTransient(masks.transient);
  singleMap.addLayer(vec.style({color:'#1f78b4', fillColor:'#1f78b440', width:0}), {}, 'Water polygons (vector)', true);

  // Update small year label inside control
  var yearLabel = ui.Label('Year = ' + y, {fontWeight:'bold', fontSize:'12px', margin:'6px 0 0 0'});
  if (control.widgets().length() > 1) {
    // remove previous year label if present
    if (control.widgets().length() > 2) control.remove(control.widgets().get(control.widgets().length()-1));
    control.add(yearLabel);
  } else {
    control.add(yearLabel);
  }

  // Diagnostics: print counts
  var landsatCount = buildMaxNDWI_Landsat(y).coll.size();
  print('Diagnostics — Year', y, ': Landsat images after mask =', landsatCount);
  print('Vectorized transient patch count (server-side):', vec.size());
}

// wire dropdown
yearSelect.onChange(function(val){
  var y = parseInt(val, 10);
  updateMapForYear(y);
});

// initial draw
updateMapForYear(defaultYear);

// --------------- export examples (commented) ---------------
/* Example: export vector for selected year (uncomment and run after selecting year)
Export.table.toDrive({
  collection: vectorizeTransient(deriveWaterMasks(computeMaxNDWIforYear(defaultYear)).transient),
  description: 'Krishna_water_patches_' + defaultYear,
  folder: 'GEE_exports',
  fileFormat: 'SHP'
});
*/

print('Ready. Use the dropdown to switch between 2018, 2020, 2021, and 2024. If any year looks empty, check diagnostic prints for Landsat counts or replace GAUL region with your precise district polygon.');