/**************************************************************
NDMI map (paper style) — Krishna District, Andhra Pradesh
Four years in dropdown: 2018, 2020, 2021, 2024
NDMI = (NIR - SWIR1) / (NIR + SWIR1)
 - Landsat-8/9 (Collection 2 Level-2 SR): SR_B5 = NIR, SR_B6 = SWIR1 (apply SR scaling)
 - Sentinel-2 SR fallback: B08 = NIR, B11 = SWIR1 (scaled to reflectance)
Annual MEDIAN NDMI (per base paper approach)
Legend: Block boundary (white + outline), Low moisture (light pink), High moisture (dark pink)
**************************************************************/

// ---------------- USER PARAMETERS ----------------
var years = [2018, 2020, 2021, 2024];
var defaultYear = years[years.length - 1]; // default selection (2024)
var requireMinScenes = 3;   // if Landsat scenes >= this, use Landsat; else fallback to S2
// Classification thresholds (tunable)
var lowThresh  = 0.05;   // NDMI > lowThresh => low moisture
var highThresh = 0.15;   // NDMI > highThresh => high moisture
var minArea_m2 = 30;     // remove tiny polygons

// ---------------- Load Krishna district ----------------
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
  region = ee.Geometry.Point([80.95, 16.5]).buffer(200000); // fallback
  print('WARNING: GAUL lookup failed; replace "region" with your precise Krishna polygon.');
}

// ---------------- Helpers (masking & scaling) ----------------

// Landsat Collection-2 SR cloud/shadow mask (QA_PIXEL)
function maskLandsatC2(image) {
  var qa = image.select('QA_PIXEL');
  var cloud = qa.bitwiseAnd(1 << 3).eq(0);
  var cloudShadow = qa.bitwiseAnd(1 << 4).eq(0);
  return image.updateMask(cloud.and(cloudShadow));
}

// Scale Landsat SR to reflectance (C2): reflectance = SR * 0.0000275 + (-0.2)
function toReflectanceLandsat(image) {
  var scale = 0.0000275;
  var offset = -0.2;
  var bandNames = image.bandNames();
  var srBands = bandNames.filter(ee.Filter.stringStartsWith('item','SR_'));
  var scaled = image.select(srBands).multiply(scale).add(offset);
  var others = image.select(bandNames.removeAll(srBands));
  return scaled.addBands(others);
}

// Sentinel-2 mask and reflectance scaling (SR is 1e4 scaled)
function maskS2(image) {
  var qa = image.select('QA60');
  var cloudBit = 1 << 10;
  var cirrusBit = 1 << 11;
  var mask = qa.bitwiseAnd(cloudBit).eq(0).and(qa.bitwiseAnd(cirrusBit).eq(0));
  return image.updateMask(mask);
}
function toReflectanceS2(image) {
  return image.select(image.bandNames()).multiply(0.0001);
}

// ---------------- NDMI per-image calculators ----------------
// Landsat NDMI (expects reflectance-scaled SR_B5, SR_B6)
function ndmiLandsatImage(image) {
  var nir = image.select('SR_B5');
  var sw1 = image.select('SR_B6');
  return nir.subtract(sw1).divide(nir.add(sw1)).rename('NDMI');
}
// Sentinel-2 NDMI (expects reflectance-scaled B08, B11)
function ndmiS2Image(image) {
  var nir = image.select('B08');
  var sw1 = image.select('B11');
  return nir.subtract(sw1).divide(nir.add(sw1)).rename('NDMI');
}

// ---------------- Build annual MEDIAN NDMI ----------------
function buildNDMI_Landsat(year) {
  var start = year + '-01-01';
  var end = year + '-12-31';
  var c8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
            .filterDate(start, end).filterBounds(region)
            .map(maskLandsatC2).map(toReflectanceLandsat);
  var c9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
            .filterDate(start, end).filterBounds(region)
            .map(maskLandsatC2).map(toReflectanceLandsat);
  var coll = c8.merge(c9);
  var ndmiColl = coll.map(ndmiLandsatImage);
  var ndmiMed = ndmiColl.median().clip(region);
  return {coll: coll, ndmi: ndmiMed};
}

function buildNDMI_S2(year) {
  var start = year + '-01-01';
  var end = year + '-12-31';
  var s2 = ee.ImageCollection('COPERNICUS/S2_SR')
            .filterDate(start, end).filterBounds(region)
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 80))
            .map(maskS2).map(toReflectanceS2);
  var ndmiColl = s2.map(ndmiS2Image);
  var ndmiMed = ndmiColl.median().clip(region);
  return {coll: s2, ndmi: ndmiMed};
}

// Choose Landsat if enough scenes, else S2
function computeNDMIforYear(year) {
  var L = buildNDMI_Landsat(year);
  var lcount = L.coll.size();
  print('Year', year, 'Landsat NDMI scenes (after mask):', lcount);
  var useL = lcount.gte(requireMinScenes);
  var ndmiFinal = ee.Image(ee.Algorithms.If(useL, L.ndmi, buildNDMI_S2(year).ndmi));
  print('NDMI for year ' + year + ' uses ' + (useL ? 'Landsat' : 'Sentinel-2') + ' median.');
  return ndmiFinal;
}

// ---------------- Classify NDMI into low/high moisture & vectorize ----------------
function classifyNDMI(ndmi) {
  var high = ndmi.gt(highThresh).rename('high_moist');   // high moisture
  var low  = ndmi.gt(lowThresh).and(ndmi.lte(highThresh)).rename('low_moist'); // low moisture
  // Masked rasters for display
  var highMask = high.selfMask();
  var lowMask  = low.selfMask();
  // Vectorize low & high separately (for paper-like dots/polygons)
  var lowVec = lowMask.reduceToVectors({
    geometry: region, geometryType: 'polygon', scale: 30, maxPixels: 1e13
  }).map(function(f){ return f.set('area_m2', f.geometry().area()); })
    .filter(ee.Filter.gt('area_m2', minArea_m2));
  var highVec = highMask.reduceToVectors({
    geometry: region, geometryType: 'polygon', scale: 30, maxPixels: 1e13
  }).map(function(f){ return f.set('area_m2', f.geometry().area()); })
    .filter(ee.Filter.gt('area_m2', minArea_m2));
  return {lowMask: lowMask, highMask: highMask, lowVec: lowVec, highVec: highVec};
}

// ---------------- UI (single map + dropdown + legend) ----------------
ui.root.clear();
Map.clear();
Map.setOptions('SATELLITE');

// Top control panel
var control = ui.Panel({style:{position:'top-center', padding:'8px 12px'}});
control.add(ui.Label('NORMALIZED DIFFERENCE MOISTURE INDEX MAP — Krishna District, Andhra Pradesh',
                     {fontWeight:'bold', fontSize:'14px', textAlign:'center'}));
var selectorRow = ui.Panel({layout: ui.Panel.Layout.Flow('horizontal')});
selectorRow.add(ui.Label('Year:'));
var yearSelect = ui.Select({
  items: years.map(function(y){ return String(y); }),
  value: String(defaultYear),
  style: {width:'120px', margin: '0 0 0 6px'}
});
selectorRow.add(yearSelect);
control.add(selectorRow);
ui.root.add(control);

// Legend (three components)
var legend = ui.Panel({style:{position:'bottom-right', padding:'8px 10px', width:'220px', backgroundColor:'ffffffDD', border:'1px solid #888'}});
legend.add(ui.Label('LEGEND', {fontWeight:'bold'}));
function legendRow(color, text) {
  var box = ui.Label('', {backgroundColor: color, padding:'8px', margin:'0 6px 0 0', border:'1px solid #999'});
  var lbl = ui.Label(text);
  return ui.Panel([box, lbl], ui.Panel.Layout.Flow('horizontal'));
}
legend.add(legendRow('#ffffff', 'Block Boundary (white fill, outline shown)'));
legend.add(legendRow('#ffb6c1', 'Low moisture content'));
legend.add(legendRow('#d6008f', 'High moisture content'));
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

  // White canvas for paper background
  var whiteCanvas = ee.Image.constant(1).visualize({palette:['ffffff'], forceRgbOutput:true}).clip(region);
  singleMap.addLayer(whiteCanvas, {}, 'white canvas');

  // District outline (black)
  if (krishnaFeature) {
    singleMap.addLayer(ee.FeatureCollection([krishnaFeature]).style({color:'000000', fillColor:'00000000', width:2}), {}, 'District outline');
  } else {
    singleMap.addLayer(ee.FeatureCollection(ee.Feature(region)).style({color:'000000', fillColor:'00000000', width:2}), {}, 'Region outline');
  }

  // Compute NDMI (annual median per chosen source)
  var ndmi = computeNDMIforYear(y);

  // Classify into low/high moisture and vectorize
  var classified = classifyNDMI(ndmi);

  // Add low moisture raster (light pink) behind high so both visible
  singleMap.addLayer(classified.lowMask,  {min:0, max:1, palette: ['#ffb6c1']}, 'Low moisture (NDMI > ' + lowThresh + ')', true);

  // Add high moisture raster (dark pink)
  singleMap.addLayer(classified.highMask, {min:0, max:1, palette: ['#d6008f']}, 'High moisture (NDMI > ' + highThresh + ')', true);

  // Add vector polygons for a paper-like dotted texture (semi-transparent fill)
  singleMap.addLayer(classified.lowVec.style({color:'#ffb6c1', fillColor:'#ffb6c140', width:0}), {}, 'Low moisture polygons', true);
  singleMap.addLayer(classified.highVec.style({color:'#d6008f', fillColor:'#d6008f40', width:0}), {}, 'High moisture polygons', true);

  // Update small year label
  var yearLabel = ui.Label('Year = ' + y, {fontWeight:'bold', fontSize:'12px', margin:'6px 0 0 0'});
  if (control.widgets().length() > 1) {
    if (control.widgets().length() > 2) control.remove(control.widgets().get(control.widgets().length()-1));
    control.add(yearLabel);
  } else { control.add(yearLabel); }

  // Diagnostics
  var landsatCount = buildNDMI_Landsat(y).coll.size();
  print('Diagnostics — Year', y, ': Landsat NDMI scenes after mask =', landsatCount);
  print('Low-moisture polygons count (server-side):', classified.lowVec.size());
  print('High-moisture polygons count (server-side):', classified.highVec.size());
}

// wire dropdown
yearSelect.onChange(function(val) {
  var y = parseInt(val, 10);
  updateMapForYear(y);
});

// initial draw
updateMapForYear(defaultYear);

// -------------- Export examples (commented) --------------
// Export raster preview example (uncomment & adapt)
/*
var ndmiFinal = computeNDMIforYear(defaultYear);
var viz = ee.Image.constant(1).visualize({palette:['ffffff']}).clip(region)
          .blend(ndmiFinal.gt(lowThresh).visualize({min:0,max:1,palette:['#ffb6c1']}))
          .blend(ndmiFinal.gt(highThresh).visualize({min:0,max:1,palette:['#d6008f']}));

Export.image.toDrive({
  image: viz,
  description: 'Krishna_NDMI_' + defaultYear,
  folder: 'GEE_exports',
  region: region,
  scale: 30,
  crs: 'EPSG:4326',
  maxPixels: 1e13
});
*/

// Export polygons shapefile example (uncomment & adapt)
/*
Export.table.toDrive({
  collection: classifyNDMI(computeNDMIforYear(defaultYear)).highVec,
  description: 'Krishna_NDMI_high_' + defaultYear,
  folder: 'GEE_exports',
  fileFormat: 'SHP'
});
*/

print('Done. Adjust lowThresh/highThresh to tune low/high moisture sensitivity to match the base paper visually.');