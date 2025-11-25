// REPLACE THIS WITH YOUR MAPBOX ACCESS TOKEN
mapboxgl.accessToken =
  "pk.eyJ1IjoiYmFua2ppcmFwYW4iLCJhIjoiY2w1aTMxaDA4MDQ4NTNpdDh1NGlwYmRsdSJ9.9USHz6RhMCdcRWmf0ZZFoQ";

const DATA_URL = "./waterlevel_load.json";

async function initApp() {
  try {
    const response = await fetch(DATA_URL);
    const json = await response.json();
    const stations = json.waterlevel_data.data;

    if (!stations || stations.length === 0) {
      alert("No station data found.");
      return;
    }
    const map = new mapboxgl.Map({
      container: "map",
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [100.5, 13.7],
      zoom: 5,
      pitch: 45,
      bearing: 0,
      antialias: true,
      projection: "globe",
    });

    map.on("load", () => {
      map.addSource("mapbox-dem", {
        type: "raster-dem",
        url: "mapbox://mapbox.mapbox-terrain-dem-v1",
        tileSize: 512,
        maxzoom: 14,
      });
      map.setTerrain({ source: "mapbox-dem", exaggeration: 1.5 });

      map.addLayer({
        id: "sky",
        type: "sky",
        paint: {
          "sky-type": "atmosphere",
          "sky-atmosphere-sun": [0.0, 0.0],
          "sky-atmosphere-sun-intensity": 15,
        },
      });

      const stationFeatures = [];
      const floodFeatures = [];

      stations.forEach((station) => {
        if (
          !station.station.tele_station_lat ||
          !station.station.tele_station_long
        )
          return;

        const coords = [
          station.station.tele_station_long,
          station.station.tele_station_lat,
        ];
        const waterLevel = parseFloat(station.waterlevel_msl);
        const isOverflow =
          parseFloat(station.diff_wl_bank) > 0 &&
          (station.diff_wl_bank_text || "").includes("ล้นตลิ่ง");

        const floodPolygonSize = isOverflow ? 0.09 : 0.002;

        stationFeatures.push({
          type: "Feature",
          properties: {
            id: station.id,
            name_en: station.station.tele_station_name?.en || "-",
            name_th: station.station.tele_station_name?.th || "-",
            water_level: waterLevel || 0,
            is_overflow: isOverflow,
            station_data: JSON.stringify(station), // Store full data for popup
          },
          geometry: {
            type: "Point",
            coordinates: coords,
          },
        });
        if (!isNaN(waterLevel)) {
          floodFeatures.push({
            type: "Feature",
            properties: {
              color: isOverflow ? "#ff3b30" : "#007aff",
              height: waterLevel,
              base: 0,
            },
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [coords[0] - floodPolygonSize, coords[1] - floodPolygonSize],
                  [coords[0] + floodPolygonSize, coords[1] - floodPolygonSize],
                  [coords[0] + floodPolygonSize, coords[1] + floodPolygonSize],
                  [coords[0] - floodPolygonSize, coords[1] + floodPolygonSize],
                  [coords[0] - floodPolygonSize, coords[1] - floodPolygonSize],
                ],
              ],
            },
          });
        }
      });

      map.addSource("stations", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: stationFeatures,
        },
        cluster: true,
        clusterMaxZoom: 11, // Max zoom to cluster points on
        clusterRadius: 50,
      });

      map.addSource("flood-planes", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: floodFeatures,
        },
      });

      map.addLayer({
        id: "flood-fill",
        type: "fill-extrusion",
        source: "flood-planes",
        minzoom: 10, // OPTIMIZATION: Only render when zoomed in
        paint: {
          "fill-extrusion-color": ["get", "color"],
          "fill-extrusion-height": ["get", "height"],
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": 0.6,
        },
      });

      // --- Clusters ---
      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "stations",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": [
            "step",
            ["get", "point_count"],
            "#51bbd6",
            10,
            "#f1f075",
            30,
            "#f28cb1",
          ],
          "circle-radius": [
            "step",
            ["get", "point_count"],
            20,
            100,
            30,
            750,
            40,
          ],
        },
      });

      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "stations",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
          "text-size": 12,
        },
      });

      map.addLayer({
        id: "unclustered-point",
        type: "circle",
        source: "stations",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": [
            "case",
            ["get", "is_overflow"],
            "#ff3b30", // Red if overflow
            "#007aff", // Blue if normal
          ],
          "circle-radius": 8,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
        },
      });

      map.on("click", "clusters", (e) => {
        const features = map.queryRenderedFeatures(e.point, {
          layers: ["clusters"],
        });
        const clusterId = features[0].properties.cluster_id;
        map
          .getSource("stations")
          .getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err) return;

            map.easeTo({
              center: features[0].geometry.coordinates,
              zoom: zoom,
            });
          });
      });

      // Click on a station
      map.on("click", "unclustered-point", (e) => {
        const coordinates = e.features[0].geometry.coordinates.slice();
        const props = e.features[0].properties;
        const stationData = JSON.parse(props.station_data);

        updateUI(stationData);

        // Ensure that if the map is zoomed out such that multiple
        // copies of the feature are visible, the popup appears
        // over the copy being pointed to.
        while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
          coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
        }

        new mapboxgl.Popup()
          .setLngLat(coordinates)
          .setHTML(
            `<h3>${props.name_en}</h3><p>Water Level: ${props.water_level} m</p>`
          )
          .addTo(map);

        map.flyTo({
          center: coordinates,
          zoom: 14,
          pitch: 60,
        });
      });

      // Change cursor
      map.on("mouseenter", "clusters", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "clusters", () => {
        map.getCanvas().style.cursor = "";
      });
      map.on("mouseenter", "unclustered-point", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "unclustered-point", () => {
        map.getCanvas().style.cursor = "";
      });

      // Fit bounds
      const bounds = new mapboxgl.LngLatBounds();
      stationFeatures.forEach((feature) => {
        bounds.extend(feature.geometry.coordinates);
      });
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 50 });
      }
    });
  } catch (error) {
    console.error("Error loading data:", error);
    alert("Failed to load water level data.");
  }
}

function updateUI(stationData) {
  // Station Info
  const nameEn = stationData.station.tele_station_name?.en || "-";
  const nameTh = stationData.station.tele_station_name?.th || "-";
  document.getElementById("station-name").textContent = `${nameEn} (${nameTh})`;

  const tumbon = stationData.geocode?.tumbon_name?.en || "-";
  const amphoe = stationData.geocode?.amphoe_name?.en || "-";
  const province = stationData.geocode?.province_name?.en || "-";
  document.getElementById(
    "station-location"
  ).textContent = `${tumbon}, ${amphoe}, ${province}`;

  // Status
  const statusBadge = document.getElementById("status-badge");
  const isOverflow =
    parseFloat(stationData.diff_wl_bank) > 0 &&
    (stationData.diff_wl_bank_text || "").includes("ล้นตลิ่ง");

  if (isOverflow) {
    statusBadge.textContent = "Overflow / ล้นตลิ่ง";
    statusBadge.className = "status-badge status-overflow";
  } else {
    statusBadge.textContent = "Normal";
    statusBadge.className = "status-badge status-normal";
  }

  // Water Level
  document.getElementById("water-level").textContent =
    stationData.waterlevel_msl || "--";

  const diffEl = document.getElementById("water-diff");
  diffEl.textContent = `${stationData.diff_wl_bank_text || "Diff"}: ${
    stationData.diff_wl_bank || "--"
  } m`;

  // Reset classes
  diffEl.className = "diff";
  if (isOverflow) diffEl.classList.add("danger");

  // Details
  document.getElementById("bank-level").textContent = `${
    stationData.station.left_bank || "-"
  } / ${stationData.station.right_bank || "-"} m`;
  document.getElementById("ground-level").textContent =
    stationData.station.ground_level || "-";
  document.getElementById("last-updated").textContent =
    stationData.waterlevel_datetime || "-";
}

// Start the app
initApp();
