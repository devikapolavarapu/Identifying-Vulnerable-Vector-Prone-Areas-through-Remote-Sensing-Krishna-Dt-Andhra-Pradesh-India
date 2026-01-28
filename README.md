# Identifying Vulnerable Vector-Prone Areas through Remote Sensing  
## Krishna District, Andhra Pradesh, India

---

## Abstract
Vector-borne diseases such as dengue and chikungunya pose significant public health challenges in tropical regions. This research presents a **Remote Sensing (RS) and Geographic Information System (GIS)–based spatial framework** to identify **vulnerable mosquito vector-prone areas** in **Krishna District, Andhra Pradesh, India**. Multi-temporal **Landsat-8 satellite imagery** was integrated with environmental, climatic, population, and health-related datasets to generate a **district-level risk zonation map**. The framework supports early risk identification and enables data-driven public health planning by minimizing dependence on manual field surveys.

---

## Keywords
Remote Sensing, GIS, Vector-Borne Diseases, Risk Mapping, NDVI, NDWI, NDMI, Land Surface Temperature, Spatial Analysis

---

## 1. Introduction
The spatial distribution of mosquito vectors is strongly influenced by environmental factors such as surface water availability, moisture persistence, vegetation density, and temperature. Traditional surveillance techniques are often reactive, time-consuming, and spatially limited.

Advancements in satellite remote sensing and GIS provide an effective platform for large-scale, predictive disease risk assessment. This study aims to identify environmentally vulnerable regions conducive to mosquito breeding in Krishna District using geospatial analysis techniques.

---

## 2. Study Area

<p align="center">
  <img src="images/Krishna-map-labeled.png" width="650">
  <br>
  <em>Figure 1. Geographic location of Krishna District within Andhra Pradesh and India.</em>
</p>

**Krishna District**, located in the coastal region of **Andhra Pradesh, India**, is characterized by:
- Tropical climatic conditions  
- Dense population settlements  
- Extensive irrigation and water-logged agricultural areas  

These factors collectively increase susceptibility to mosquito vector proliferation.

---

## 3. Objectives
- To derive environmental indicators influencing mosquito breeding using satellite data  
- To integrate RS and GIS techniques for spatial risk modeling  
- To generate a **district-level vector vulnerability map**  
- To classify regions into **high, medium, and low risk zones**

---

## 4. Data Sources
- **Landsat-8 multi-temporal satellite imagery**  
- Environmental and climatic datasets  
- Population density data  
- Health and disease occurrence records (where available)

---

## 5. Methodology

### 5.1 Satellite Data Processing
Landsat-8 imagery was pre-processed and analyzed using **ArcGIS** to extract relevant environmental parameters.

---

### 5.2 Derivation of Environmental Indices

#### Elevation

<p align="center">
  <img src="images/ELEVATION.jpg" width="650">
  <br>
  <em>Figure 2. Elevation distribution of Krishna District.</em>
</p>

Low-lying and deltaic regions were identified as highly susceptible to surface water accumulation.

---

#### Land Surface Temperature (LST)

<p align="center">
  <img src="images/LST.jpg" width="650">
  <br>
  <em>Figure 3. Land Surface Temperature (LST) indicating optimal thermal ranges for mosquito breeding.</em>
</p>

Temperature ranges between **23–29 °C** were found to be favorable for mosquito survival.

---

#### Normalized Difference Vegetation Index (NDVI)

<p align="center">
  <img src="images/NDVI.jpg" width="650">
  <br>
  <em>Figure 4. NDVI showing vegetation density across Krishna District.</em>
</p>

High vegetation density provides shaded and humid microhabitats suitable for mosquito resting and breeding.

---

#### Normalized Difference Water Index (NDWI)

<p align="center">
  <img src="images/NDWI.jpg" width="650">
  <br>
  <em>Figure 5. NDWI highlighting surface water and water-logged regions.</em>
</p>

Persistent surface water bodies were identified as major contributors to vector proliferation.

---

#### Normalized Difference Moisture Index (NDMI)

<p align="center">
  <img src="images/NDMI.jpg" width="650">
  <br>
  <em>Figure 6. NDMI depicting spatial distribution of surface and sub-surface moisture.</em>
</p>

Moisture-rich regions were strongly associated with increased vector habitat suitability.

---

### 5.3 Spatial Risk Modeling
- All thematic layers were normalized  
- Weights were assigned based on vector-breeding relevance  
- A **weighted overlay analysis** was performed to compute a composite risk index  

---

### 5.4 Risk Zonation

<p align="center">
  <img src="images/final map.jpg" width="650">
  <br>
  <em>Figure 7. Final vector-borne disease risk zonation map of Krishna District.</em>
</p>

The final risk map categorizes Krishna District into:
- High vulnerability zones  
- Medium vulnerability zones  
- Low vulnerability zones  

---

## 6. Results and Discussion
The resulting risk zonation map highlights regions with persistent surface water, dense vegetation, high moisture content, and optimal temperature ranges as high-risk zones. The spatial patterns observed align with known environmental conditions favorable for mosquito breeding, validating the effectiveness of the RS–GIS approach.


---

## 7. Applications
- Early identification of vector-prone regions  
- Targeted vector-control and mitigation planning  
- Public health resource optimization  
- Scalable disease surveillance framework  

---

## 8. Limitations
- Dependence on spatial and temporal resolution of satellite data  
- Static weighting may not capture seasonal variability  
- Limited availability of high-resolution health data  

---

## 9. Future Scope
- Integration of real-time climatic datasets  
- Machine learning-based dynamic risk prediction  
- Extension to additional vector-borne diseases  
- Development of a web-based GIS decision support system  

---

## 10. Tools and Technologies
- Remote Sensing (RS)  
- Geographic Information Systems (GIS)  
- ArcGIS  
- Landsat-8 Satellite Data  
- NDVI, NDWI, NDMI  
- Land Surface Temperature (LST)  
- Spatial Analysis and Risk Mapping  

---

## 11. Conclusion
This study demonstrates the effectiveness of integrating Remote Sensing and GIS techniques for identifying vector-prone areas at a district scale. The proposed framework provides a scalable and cost-effective approach for supporting proactive public health surveillance and vector-control strategies.

---

## 12. License
This project is intended for academic and research purposes.

---

