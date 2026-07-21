// Elevation map — Krishna District, Andhra Pradesh (CORRECTED)
// Paste into Google Earth Engine Code Editor and run.

// ---------- User parameters ----------
var palette = [
  '#fff5f0', // <100
  '#fee0d2', // 100-200
  '#fcbba1', // 200-300
  '#fc9272', // 300-400
  '#fb6a4a', // 400-500
  '#de2d26', // 500-600
  '#a50f15'  // >=600
];

var breaks = [0, 100, 200, 300, 400, 500, 600]; // class break lower bounds
var titleText = 'ELEVATION MAP\nKrishna District, Andhra Pradesh';
var legendTitle = 'Elevation in Mtrs (above mean sea level)';
var legendLabels = ['Less than 100', '100 - 200', '200 - 300', '300 - 400', '400 - 500', '500 - 600', '600 & above'];

// ---------- Region: GAUL level2 (fallback polygon) ----------
var gaul = ee.FeatureCollection('FAO/GAUL/2015/level2');
var krFeature = gaul.filter(ee.Filter.and(
  ee.Filter.eq('ADM1_NAME','Andhra Pradesh'),
  ee.Filter.or(
    ee.Filter.eq('ADM2_NAME','Krishna'),
    ee.Filter.eq('ADM2_NAME','KRISHNA'),
    ee.Filter.eq('ADM2_NAME','krishna')
  )
)).first();

// fallback polygon if GAUL lookup fails (tight coastal shape)
var fallback = ee.Geometry.Polygon([
  [[80.12,17.47],[80.51,17.53],[81.06,17.37],[81.39,17.09],[81.59,16.72],
   [81.68,16.37],[81.46,16.04],[81.20,15.86],[80.76,15.82],[80.36,15.91],
   [80.08,16.24],[80.02,16.84],[80.12,17.47]]
]);

var regionFeature = ee.Feature(ee.Algorithms.If(krFeature, krFeature, ee.Feature(fallback)));
var region = ee.Geometry(regionFeature.geometry());
print('Region used (GAUL or fallback):', regionFeature);

// ---------- Load elevation & derive hillshade ----------
var srtm = ee.Image('USGS/SRTMGL1_003').select('elevation').clip(region);

// create hillshade for gentle relief
var hillshade = ee.Terrain.hillshade(srtm);

// mask out permanent water (JRC) so rivers are blue and not colored as land
var jrcWater = ee.Image('JRC/GSW1_3/GlobalSurfaceWater').select('occurrence').gt(80).clip(region);

// ---------- Classify elevation into bins ----------
var elev = srtm;
var classified = ee.Image(0).clip(region)
  .where(elev.gte(breaks[0]).and(elev.lt(breaks[1])), 0)
  .where(elev.gte(breaks[1]).and(elev.lt(breaks[2])), 1)
  .where(elev.gte(breaks[2]).and(elev.lt(breaks[3])), 2)
  .where(elev.gte(breaks[3]).and(elev.lt(breaks[4])), 3)
  .where(elev.gte(breaks[4]).and(elev.lt(breaks[5])), 4)
  .where(elev.gte(breaks[5]).and(elev.lt(breaks[6])), 5)
  .where(elev.gte(breaks[6]), 6)
  .updateMask(jrcWater.not()); // do not classify permanent water

// Create a white canvas clipped to the region
var whiteCanvas = ee.Image.constant(1).visualize({palette:['ffffff'], forceRgbOutput:true}).clip(region);

// Vector style for district boundary (use regionFeature safely)
var regionOutline = ee.FeatureCollection([regionFeature]).style({
  color: '000000', // black outline
  fillColor: '00000000',
  width: 2
});

// Rivers (JRC permanent water)
var rivers = jrcWater.updateMask(jrcWater).selfMask();

// ---------- Map layers ----------
Map.setOptions('SATELLITE');
Map.centerObject(region, 10);

// white interior
Map.addLayer(whiteCanvas, {}, 'white canvas', false);

// subtle hillshade below classes (low opacity)
Map.addLayer(hillshade.visualize({min:0, max:255, palette:['000000','ffffff']}), {opacity:0.25}, 'hillshade (subtle)', false);

// elevation classes
var elevVis = {min: 0, max: 6, palette: palette};
Map.addLayer(classified.visualize(elevVis), {}, 'Elevation classes', true);

// rivers in blue (light)
Map.addLayer(rivers.visualize({palette: ['#bfefff']}), {}, 'Rivers / water (JRC)', true);

// district outline last for crisp border
Map.addLayer(regionOutline, {}, 'District boundary', true);

// continuous elevation debug (off by default)
Map.addLayer(srtm, {min:0, max:800, palette:['ffffff','ffffe0','fdd49e','fdbb84','fc8d59','e34a33','b30000']}, 'Elevation continuous (m) - debug', false);

// ---------- Legend: bottom-right (near district) ----------
function makeLegendPanel(title, colors, labels) {
  var legendPanel = ui.Panel({style:{position:'bottom-right', padding:'8px 12px', width:'260px', backgroundColor:'ffffffDD', border:'1px solid #888'}});
  legendPanel.add(ui.Label(title, {fontWeight:'bold'}));
  legendPanel.add(ui.Label(''));

  for (var i = 0; i < colors.length; i++) {
    var colorBox = ui.Label('', {backgroundColor: colors[i], padding: '8px', margin: '0 8px 0 0', border: '1px solid #999'});
    var label = ui.Label(labels[i], {fontSize: '12px'});
    var row = ui.Panel([colorBox, label], ui.Panel.Layout.Flow('horizontal'));
    legendPanel.add(row);
  }
  legendPanel.add(ui.Label('Scale approx: 0 - 10 - 20 km', {fontSize:'11px', margin: '8px 0 0 0'}));
  return legendPanel;
}

var legend = makeLegendPanel(legendTitle, palette, legendLabels);
ui.root.add(legend);

// ---------- Add title (top-center) ----------
var title = ui.Label(titleText, {fontWeight:'bold', fontSize: '16px', margin: '6px 0 0 6px', textAlign:'center'});
var titlePanel = ui.Panel([title], ui.Panel.Layout.Flow('horizontal'), {position: 'top-center'});
ui.root.add(titlePanel);

// ---------- Print diagnostic stats ----------
var stats = srtm.reduceRegion({
  reducer: ee.Reducer.minMax().combine(ee.Reducer.mean(), '', true),
  geometry: region,
  scale: 30,
  maxPixels: 1e13
});
print('SRTM elevation stats (min/max/mean) for region:', stats);

// ---------- End ----------