/***************************************************************
NDVI & NDWI — Krishna district (no external URL loading)
- Uses FAO GAUL level2 to select Krishna district (robust)
- Fallback: an embedded polygon (tight) if GAUL lookup fails
- Years: 2018, 2020, 2021, 2024
- NDVI = (NIR - Red)/(NIR + Red)  -> annual MEDIAN (Landsat C2 L2 SR scaled; Sentinel-2 fallback)
- NDWI = (Green - NIR)/(Green + NIR) -> annual MAX (McFeeters) (Landsat preferred)
- Single interactive map with dropdowns. Non-classified area remains white.
***************************************************************/

// ---------------- USER TUNABLE PARAMETERS ----------------
var years = [2018, 2020, 2021, 2024];
var defaultYear = 2024;
var requireMinScenes = 3;    // min Landsat scenes to prefer Landsat; otherwise Sentinel-2

// NDVI classification thresholds (tweak to match paper)
var waterThresh = 0.00;    // NDVI <= waterThresh => water/swamp (also JRC permanent water included)
var builtUpLow  = 0.01;    // NDVI > waterThresh and <= builtUpHigh => built-up
var builtUpHigh = 0.25;
var shrubThresh  = 0.40;   // NDVI >= shrubThresh => shrub/grass (set high to avoid "all green")

// NDWI transient threshold (tunable)
var ndwi_shallow = 0.05;

// Colors (paper-like)
var colorWater = '#bfefff'; // water / swamp
var colorBuilt = '#f39c12'; // built-up orange
var colorShrub = '#66c2a5'; // shrub/grass green
var colorNDWI  = '#1f78b4'; // NDWI blue

// ---------------- FIND KRISHNA DISTRICT (GAUL) ----------------
var gaul2 = ee.FeatureCollection('FAO/GAUL/2015/level2');

// Try common variants for ADM2 name
var krishnaGaul = gaul2.filter(ee.Filter.and(
  ee.Filter.eq('ADM1_NAME', 'Andhra Pradesh'),
  ee.Filter.or(
    ee.Filter.eq('ADM2_NAME', 'Krishna'),
    ee.Filter.eq('ADM2_NAME', 'KRISHNA'),
    ee.Filter.eq('ADM2_NAME', 'krishna'),
    ee.Filter.eq('ADM2_NAME', 'Krishna District')
  )
)).first();

// Fallback polygon (tight approximate boundary) — used only if GAUL lookup fails.
// I refined this to follow the coastal shape more closely than the earlier wide box.
// If GAUL works you will NOT use this fallback.
var fallbackPoly = ee.Geometry.Polygon([
  [
    [80.120, 17.470],
    [80.510, 17.530],
    [81.060, 17.370],
    [81.390, 17.090],
    [81.590, 16.720],
    [81.680, 16.370],
    [81.460, 16.040],
    [81.200, 15.860],
    [80.760, 15.820],
    [80.360, 15.910],
    [80.080, 16.240],
    [80.020, 16.840],
    [80.120, 17.470]
  ]
]);

// Decide geometry: prefer GAUL if found, else fallback polygon
var regionFeature = ee.Algorithms.If(krishnaGaul, krishnaGaul, ee.Feature(fallbackPoly));
regionFeature = ee.Feature(regionFeature); // ensure Feature type
var region = ee.Geometry(regionFeature.geometry());
print('Region feature used (GAUL or fallback):', regionFeature);

// Center map on region
Map.setOptions('SATELLITE');
Map.centerObject(region, 10);

// ---------------- MASKING & REFLECTANCE HELPERS ----------------
function maskLandsatC2(image) {
  var qa = image.select('QA_PIXEL');
  var cloud = qa.bitwiseAnd(1 << 3).eq(0);
  var shadow = qa.bitwiseAnd(1 << 4).eq(0);
  return image.updateMask(cloud.and(shadow));
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
function maskS2(image) {
  var qa = image.select('QA60');
  var cloudBit = 1 << 10;
  var cirrusBit = 1 << 11;
  var m = qa.bitwiseAnd(cloudBit).eq(0).and(qa.bitwiseAnd(cirrusBit).eq(0));
  return image.updateMask(m);
}
function toReflectanceS2(image) {
  return image.select(image.bandNames()).multiply(0.0001);
}

// ---------------- INDEX CALCULATORS ----------------
function ndviLandsat(img) { return img.normalizedDifference(['SR_B5','SR_B4']).rename('NDVI'); }
function ndviS2(img)     { return img.normalizedDifference(['B08','B04']).rename('NDVI'); }
function ndwiLandsat(img) { return img.normalizedDifference(['SR_B3','SR_B5']).rename('NDWI'); }
function ndwiS2(img)      { return img.normalizedDifference(['B03','B08']).rename('NDWI'); }

// ---------------- BUILD ANNUAL COMPOSITES ----------------
function buildAnnualNDVI_Landsat(year) {
  var s = year + '-01-01', e = year + '-12-31';
  var c8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2').filterBounds(region).filterDate(s,e).map(maskLandsatC2).map(toReflectanceLandsat);
  var c9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2').filterBounds(region).filterDate(s,e).map(maskLandsatC2).map(toReflectanceLandsat);
  var coll = c8.merge(c9);
  return {coll: coll, ndviMed: coll.map(ndviLandsat).median().clip(region)};
}
function buildAnnualNDVI_S2(year) {
  var s = year + '-01-01', e = year + '-12-31';
  var s2 = ee.ImageCollection('COPERNICUS/S2_SR').filterBounds(region).filterDate(s,e).filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE',80)).map(maskS2).map(toReflectanceS2);
  return {coll: s2, ndviMed: s2.map(ndviS2).median().clip(region)};
}
function buildAnnualNDWI_Landsat(year) {
  var s = year + '-01-01', e = year + '-12-31';
  var c8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2').filterBounds(region).filterDate(s,e).map(maskLandsatC2).map(toReflectanceLandsat);
  var c9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2').filterBounds(region).filterDate(s,e).map(maskLandsatC2).map(toReflectanceLandsat);
  var coll = c8.merge(c9);
  return {coll: coll, ndwiMax: coll.map(ndwiLandsat).max().clip(region)};
}
function buildAnnualNDWI_S2(year) {
  var s = year + '-01-01', e = year + '-12-31';
  var s2 = ee.ImageCollection('COPERNICUS/S2_SR').filterBounds(region).filterDate(s,e).filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE',80)).map(maskS2).map(toReflectanceS2);
  return {coll: s2, ndwiMax: s2.map(ndwiS2).max().clip(region)};
}

// Prefer Landsat if enough scenes else S2
function computeAnnualNDVI(year) {
  var L = buildAnnualNDVI_Landsat(year);
  var count = L.coll.size();
  print('Year', year, '>> Landsat scenes after mask =', count);
  var useL = count.gte(requireMinScenes);
  var img = ee.Image(ee.Algorithms.If(useL, L.ndviMed, buildAnnualNDVI_S2(year).ndviMed));
  print('NDVI source:', ee.Algorithms.If(useL, 'Landsat', 'Sentinel-2'));
  return img;
}
function computeAnnualNDWI(year) {
  var L = buildAnnualNDWI_Landsat(year);
  var count = L.coll.size();
  print('Year', year, '>> Landsat scenes after mask for NDWI =', count);
  var useL = count.gte(requireMinScenes);
  var img = ee.Image(ee.Algorithms.If(useL, L.ndwiMax, buildAnnualNDWI_S2(year).ndwiMax));
  print('NDWI source:', ee.Algorithms.If(useL, 'Landsat', 'Sentinel-2'));
  return img;
}

// ---------------- CLASSIFICATION (NDVI) ----------------
function classifyNDVI(ndviImg) {
  // permanent water (JRC occurrence > 80)
  var permanent = ee.Image('JRC/GSW1_3/GlobalSurfaceWater').select('occurrence').gt(80).selfMask().clip(region);

  var waterByNDVI = ndviImg.lte(waterThresh).selfMask();
  var water = waterByNDVI.or(permanent);

  var built = ndviImg.gt(waterThresh).and(ndviImg.lte(builtUpHigh)).and(ndviImg.gte(builtUpLow)).selfMask();
  var shrub = ndviImg.gte(shrubThresh).selfMask();

  return {water: water, built: built, shrub: shrub, permanent: permanent};
}

// ---------------- UI: single map + controls + legend ----------------
ui.root.clear();
Map.clear();

// Top control
var control = ui.Panel({style:{position:'top-center', padding:'8px 12px'}});
control.add(ui.Label('VEGETATION / WATER MAP — Krishna District, Andhra Pradesh', {fontWeight:'bold', fontSize:'14px'}));
var selRow = ui.Panel({layout: ui.Panel.Layout.Flow('horizontal')});
selRow.add(ui.Label('Year:'));
var yearSelect = ui.Select({items: years.map(String), value: String(defaultYear), style:{width:'120px', margin:'0 8px 0 6px'}});
selRow.add(yearSelect);
selRow.add(ui.Label('Index:'));
var indexSelect = ui.Select({items:['NDVI','NDWI'], value:'NDVI', style:{width:'100px', margin:'0 0 0 6px'}});
selRow.add(indexSelect);
control.add(selRow);
ui.root.add(control);

// Legend (paper style)
var legend = ui.Panel({style:{position:'bottom-right', padding:'8px 10px', width:'240px', backgroundColor:'ffffffDD', border:'1px solid #888'}});
legend.add(ui.Label('LEGEND', {fontWeight:'bold'}));
function legendRow(color, text){ return ui.Panel([ ui.Label('', {backgroundColor: color, padding:'8px', margin:'0 6px 0 0', border:'1px solid #999'}), ui.Label(text) ], ui.Panel.Layout.Flow('horizontal')); }
legend.add(legendRow('#ffffff', 'Block Boundary (white fill, black outline)'));
legend.add(legendRow(colorWater, 'Waterlogged / Swampy area'));
legend.add(legendRow(colorBuilt, 'Built up land / settlement'));
legend.add(legendRow(colorShrub, 'Shrub / Grassland'));
legend.add(ui.Label('NDWI shows annual MAX (transient water shown).', {fontSize:'11px'}));
ui.root.add(legend);

// Map
var map = ui.Map(); map.setControlVisibility({all:true}); ui.root.add(map);
map.centerObject(region, 10);

// Update function
function updateMap(year, index) {
  map.layers().reset([]);

  // white canvas so inside is white like the paper
  var white = ee.Image.constant(1).visualize({palette:['ffffff'], forceRgbOutput:true}).clip(region);
  map.addLayer(white, {}, 'white canvas');

  // district outline (black)
  map.addLayer(ee.FeatureCollection(region).style({color:'000000', fillColor:'00000000', width:2}), {}, 'district outline');

  if (index === 'NDVI') {
    var ndvi = computeAnnualNDVI(year);
    var cls = classifyNDVI(ndvi);

    // Water (sky-blue) including permanent JRC
    map.addLayer(cls.water, {min:0, max:1, palette:[colorWater]}, 'Waterlogged / Swampy area', true);

    // Built-up (orange)
    map.addLayer(cls.built, {min:0, max:1, palette:[colorBuilt]}, 'Built up land / settlement', true);

    // Shrub/Grass (green) - note threshold set to capture only strong vegetation
    map.addLayer(cls.shrub, {min:0, max:1, palette:[colorShrub]}, 'Shrub / Grassland', true);

    // Optional vectorized overlays (paper dotted look) - added but can be toggled in Layers
    var vW = cls.water.reduceToVectors({geometry: region, geometryType:'polygon', scale:30, maxPixels:1e13});
    var vB = cls.built.reduceToVectors({geometry: region, geometryType:'polygon', scale:30, maxPixels:1e13});
    var vS = cls.shrub.reduceToVectors({geometry: region, geometryType:'polygon', scale:30, maxPixels:1e13});

    map.addLayer(vW.style({color: colorWater, fillColor: colorWater + '80', width:0}), {}, 'water polygons', false);
    map.addLayer(vB.style({color: colorBuilt, fillColor: colorBuilt + '60', width:0}), {}, 'built polygons', false);
    map.addLayer(vS.style({color: colorShrub, fillColor: colorShrub + '60', width:0}), {}, 'shrub polygons', false);

  } else { // NDWI
    var ndwi = computeAnnualNDWI(year);
    var permanent = ee.Image('JRC/GSW1_3/GlobalSurfaceWater').select('occurrence').gt(80).selfMask().clip(region);
    var transient = ndwi.gt(ndwi_shallow).selfMask();

    // Permanent water (optional, behind)
    map.addLayer(permanent, {min:0, max:1, palette:[colorWater]}, 'Permanent water (JRC)', false);

    // Transient NDWI (blue)
    map.addLayer(transient, {min:0, max:1, palette:[colorNDWI]}, 'Transient water (max NDWI > ' + ndwi_shallow + ')', true);

    var v = transient.reduceToVectors({geometry: region, geometryType:'polygon', scale:30, maxPixels:1e13});
    map.addLayer(v.style({color: colorNDWI, fillColor: colorNDWI + '80', width:0}), {}, 'ndwi polygons', false);
  }

  // update small status label
  var status = ui.Label('Year = ' + year + '    Index = ' + index, {fontWeight:'bold', fontSize:'12px', margin:'6px 0 0 0'});
  if (control.widgets().length() > 1) {
    if (control.widgets().length() > 2) control.remove(control.widgets().get(control.widgets().length()-1));
    control.add(status);
  } else { control.add(status); }
}

// wire controls
yearSelect.onChange(function(v){ updateMap(parseInt(v,10), indexSelect.getValue()); });
indexSelect.onChange(function(v){ updateMap(parseInt(yearSelect.getValue(),10), v); });

// initial draw
updateMap(defaultYear, 'NDVI');

print('Script ready. If the map still looks "too green" paste the Console output here (the printed Landsat counts and "Region feature used"). I will adjust shrub/water thresholds or refine the fallback polygon immediately.');