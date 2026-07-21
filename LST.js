/**********************************************************
MODIS-based LST (°C) — Immediate working script for Krishna
- Annual median MODIS LST_Day_1km (MOD11A1), scale 0.02
- Single map, year selector (2018,2020,2021,2024)
- Shows continuous LST (toggle) + optimum breeding mask (23–29 °C) in orange
- Uses GAUL level2 to find Krishna automatically (fallback polygon if missing)
**********************************************************/

// ===== USER OPTIONS =====
var YEARS = [2018, 2020, 2021, 2024];
var DEFAULT_YEAR = 2024;
var OPT_MIN = 23.0;   // optimum lower bound °C
var OPT_MAX = 29.0;   // optimum upper bound °C
var OPT_COLOR = '#f39c12'; // orange for optimum
var SCALE = 1000; // MODIS native ~1km

// ===== REGION: GAUL level2 Krishna (fallback polygon) =====
var gaul2 = ee.FeatureCollection('FAO/GAUL/2015/level2');
var krFeature = gaul2.filter(ee.Filter.and(
  ee.Filter.eq('ADM1_NAME','Andhra Pradesh'),
  ee.Filter.eq('ADM2_NAME','Krishna')
)).first();
var fallback = ee.Geometry.Polygon([
  [[80.12,17.47],[80.51,17.53],[81.06,17.37],[81.39,17.09],[81.59,16.72],
   [81.68,16.37],[81.46,16.04],[81.20,15.86],[80.76,15.82],[80.36,15.91],
   [80.08,16.24],[80.02,16.84],[80.12,17.47]]
]);
var regionFeature = ee.Feature(ee.Algorithms.If(krFeature, krFeature, ee.Feature(fallback)));
var region = ee.Geometry(regionFeature.geometry());
print('Region used (GAUL or fallback):', regionFeature);

// center view
Map.setOptions('SATELLITE');
Map.centerObject(region, 9);

// ===== FUNCTIONS =====
// Build annual MODIS median LST (°C)
function modisAnnualLST(year) {
  var start = ee.Date.fromYMD(year,1,1);
  var end   = ee.Date.fromYMD(year,12,31);
  var col = ee.ImageCollection('MODIS/061/MOD11A1')
             .filterDate(start, end)
             .filterBounds(region)
             .select('LST_Day_1km')
             .map(function(img){ return img.multiply(0.02).subtract(273.15).copyProperties(img, ['system:time_start']); });
  var cnt = col.size();
  print('Year', year, 'MODIS images (count):', cnt);
  var med = col.median().rename('LST_C').clip(region);
  return med;
}

// ===== UI =====
ui.root.clear(); Map.clear();

var top = ui.Panel({style:{position:'top-center', padding:'8px 12px'}});
top.add(ui.Label('LST (MODIS) — Krishna District (optimum breeding 23–29°C)', {fontWeight:'bold', fontSize:'14px'}));

var selRow = ui.Panel({layout: ui.Panel.Layout.Flow('horizontal')});
selRow.add(ui.Label('Year:'));
var yearSelect = ui.Select({items: YEARS.map(String), value: String(DEFAULT_YEAR), style:{width:'120px', margin:'0 8px 0 6px'}});
selRow.add(yearSelect);
top.add(selRow);
ui.root.add(top);

// Legend
var legend = ui.Panel({style:{position:'bottom-left', padding:'8px 10px', backgroundColor:'ffffffDD', border:'1px solid #888'}});
legend.add(ui.Label('LEGEND', {fontWeight:'bold'}));
legend.add(ui.Panel([ ui.Label('', {backgroundColor:'#ffffff', padding:'8px', margin:'0 6px 0 0', border:'1px solid #999'}), ui.Label('Block boundary (white fill, black outline)') ], ui.Panel.Layout.Flow('horizontal')));
legend.add(ui.Panel([ ui.Label('', {backgroundColor:OPT_COLOR, padding:'8px', margin:'0 6px 0 0', border:'1px solid #999'}), ui.Label('Optimum temperature for mosquito breeding (23–29 °C)') ], ui.Panel.Layout.Flow('horizontal')));
legend.add(ui.Label('MODIS LST = median of year; resolution ~1 km.', {fontSize:'11px'}));
ui.root.add(legend);

// Map
var map = ui.Map(); map.setControlVisibility({all:true}); ui.root.add(map);
map.centerObject(region, 9);

// ===== Update function =====
function update(year) {
  map.layers().reset();

  // white base
  var white = ee.Image.constant(1).visualize({palette:['ffffff'], forceRgbOutput:true}).clip(region);
  map.addLayer(white, {}, 'white canvas');

  // district outline
  map.addLayer(ee.FeatureCollection(region).style({color:'000000', fillColor:'00000000', width:2}), {}, 'district outline');

  // compute MODIS annual LST
  var lst = modisAnnualLST(year);

  // continuous debug layer (toggleable in Layers)
  var vis = {min:15, max:40, palette:['04006f','0000ff','00ffff','00ff00','ffff00','ff0000']};
  map.addLayer(lst, vis, 'LST continuous (°C) - MODIS (debug)', false);

  // optimum mask 23-29°C
  var optimum = lst.gte(OPT_MIN).and(lst.lte(OPT_MAX)).selfMask();
  map.addLayer(optimum, {min:0, max:1, palette:[OPT_COLOR]}, 'Optimum breeding mask (23–29°C)', true);

  // diagnostics: print min/max
  var stats = lst.reduceRegion({reducer: ee.Reducer.minMax(), geometry: region, scale: SCALE, maxPixels: 1e13});
  print('Year', year, 'MODIS LST min/max (°C):', stats);

  // status label
  var label = ui.Label('Year = ' + year + '   (MODIS annual median)', {fontWeight:'bold', fontSize:'12px', margin:'6px 0 0 0'});
  if (top.widgets().length() > 1) {
    if (top.widgets().length() > 2) top.remove(top.widgets().get(top.widgets().length()-1));
    top.add(label);
  } else { top.add(label); }
}

// wire UI
yearSelect.onChange(function(v){ update(parseInt(v,10)); });

// initial draw
update(DEFAULT_YEAR);

print('MODIS-based LST script loaded. This guarantees visible LST results immediately. If you need higher-res Landsat LST later, I will help adapt once we have reliable ST_B10 or metadata on your account.');