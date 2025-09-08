const center = [99.80477094988949, 17.569727136576596];
let currentRadarTime = 1756957200;
let availableRadarTimes = [];
let currentTimeIndex = 0;
let isTransitioning = false;
let loadedLayers = new Set();

const style = {
  version: 8,
  sources: {
    radar: {
      type: "raster",
      scheme: "tms",
      tiles: [
        `https://weather.thutil.com/radar/${currentRadarTime}/{z}/{x}/{y}.png`,
      ],
      minzoom: 5,
      maxzoom: 11,
      tileSize: 256,
      attribution: "",
    },
  },
  layers: [
    {
      id: "base-gray",
      type: "raster",
      source: "base-gray",
      paint: {
        "raster-opacity": 1,
        "raster-resampling": "linear",
        "raster-fade-duration": 0,
      },
    },
    {
      id: "radar",
      type: "raster",
      source: "radar",
      paint: {
        "raster-opacity": 0.7,
        "raster-resampling": "linear",
        "raster-fade-duration": 0,
      },
    },
  ],
};

const map = new longdo.Map({
  placeholder: document.getElementById("map"),
});

function formatTimestamp(timestamp) {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString("th-TH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  });
}

async function fetchRadarTimes() {
  const refreshBtn = document.getElementById("refresh-times");
  const timeSelect = document.getElementById("time-select");

  try {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "Loading...";
    timeSelect.innerHTML = '<option value="">Loading...</option>';

    const response = await fetch("https://weather.thutil.com/api/v1/weather");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.radar && data.radar.past) {
      availableRadarTimes = data.radar.past.sort((a, b) => b.time - a.time);
      const exists = availableRadarTimes.some(
        (t) => t.time === currentRadarTime
      );
      if (!currentRadarTime || !exists) {
        currentRadarTime = availableRadarTimes[0].time;
        currentTimeIndex = 0;
      } else {
        const idx = availableRadarTimes.findIndex(
          (t) => t.time === currentRadarTime
        );
        currentTimeIndex = idx !== -1 ? idx : 0;
      }
      updateTimeSelect();
      await loadLayerIfNeeded(currentRadarTime);
      updateNavigationControls();
    } else {
      throw new Error("Invalid API response format");
    }
  } catch (error) {
    console.error("Error fetching radar times:", error);
    timeSelect.innerHTML = '<option value="">Error loading...</option>';
    alert("Unable to load radar time data: " + error.message);
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "Refresh";
  }
}

function updateTimeSelect() {
  const timeSelect = document.getElementById("time-select");
  timeSelect.innerHTML = "";

  if (availableRadarTimes.length === 0) {
    timeSelect.innerHTML = '<option value="">No data available</option>';
    updateNavigationControls();
    return;
  }

  let found = false;
  availableRadarTimes.forEach((radarData, index) => {
    const option = document.createElement("option");
    option.value = radarData.time;
    option.textContent = formatTimestamp(radarData.time);

    if (radarData.time === currentRadarTime) {
      option.selected = true;
      currentTimeIndex = index;
      found = true;
    }

    timeSelect.appendChild(option);
  });
  if (!found) {
    timeSelect.selectedIndex = 0;
    currentTimeIndex = 0;
    currentRadarTime = availableRadarTimes[0].time;
  }
}

function updateNavigationControls() {
  const prevBtn = document.getElementById("prev-button");
  const nextBtn = document.getElementById("next-button");
  const currentTimeDiv = document.getElementById("current-time");

  if (availableRadarTimes.length === 0) {
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    currentTimeDiv.textContent = "No data available";
    return;
  }

  const currentRadarData = availableRadarTimes[currentTimeIndex];
  currentTimeDiv.textContent = currentRadarData
    ? formatTimestamp(currentRadarData.time)
    : "Loading...";

  prevBtn.disabled =
    currentTimeIndex >= availableRadarTimes.length - 1 || isTransitioning;
  nextBtn.disabled = currentTimeIndex <= 0 || isTransitioning;
}

function navigateRadarTime(direction) {
  if (isTransitioning || availableRadarTimes.length === 0) return;

  let newIndex;
  if (direction === "next") {
    newIndex = Math.max(0, currentTimeIndex - 1);
  } else {
    newIndex = Math.min(availableRadarTimes.length - 1, currentTimeIndex + 1);
  }

  if (newIndex === currentTimeIndex) return;

  const newTime = availableRadarTimes[newIndex].time;
  currentTimeIndex = newIndex;

  const timeSelect = document.getElementById("time-select");
  timeSelect.value = newTime;

  updateRadarLayerSmooth(newTime);
}

function updateRadarLayer(newTime) {
  if (!newTime || newTime === currentRadarTime) return;

  currentRadarTime = newTime;

  const timeIndex = availableRadarTimes.findIndex(
    (item) => item.time === newTime
  );
  if (timeIndex !== -1) {
    currentTimeIndex = timeIndex;
  }
  const newTilesUrl = `https://weather.thutil.com/radar/${currentRadarTime}/{z}/{x}/{y}.png`;

  if (map.Renderer.getSource("radar")) {
    map.Renderer.removeLayer("radar");
    map.Renderer.removeSource("radar");
  }

  map.Renderer.addSource("radar", {
    type: "raster",
    scheme: "tms",
    tiles: [newTilesUrl],
    minzoom: 5,
    maxzoom: 11,
    tileSize: 256,
    attribution: "",
  });

  map.Renderer.addLayer({
    id: "radar",
    type: "raster",
    source: "radar",
    paint: {
      "raster-opacity": parseFloat(document.getElementById("opacity").value),
      "raster-resampling": "linear",
      "raster-fade-duration": 0,
    },
  });

  const toggle = document.getElementById("toggle-overlay");
  const visibility = toggle.checked ? "visible" : "none";
  map.Renderer.setLayoutProperty("radar", "visibility", visibility);

  updateNavigationControls();
}

function updateRadarLayerSmooth(newTime) {
  if (!newTime || newTime === currentRadarTime || isTransitioning) return;

  isTransitioning = true;
  updateNavigationControls();

  const previousTime = currentRadarTime;
  currentRadarTime = newTime;

  const timeIndex = availableRadarTimes.findIndex(
    (item) => item.time === newTime
  );
  if (timeIndex !== -1) {
    currentTimeIndex = timeIndex;
  }

  loadLayerIfNeeded(newTime).then(() => {
    const prevLayerId = `radar_${previousTime}`;
    const newLayerId = `radar_${currentRadarTime}`;

    if (map.Renderer.getLayer(prevLayerId)) {
      animateOpacity(prevLayerId, 0, 200);
    } else if (map.Renderer.getLayer("radar")) {
      animateOpacity("radar", 0, 200);
    }

    if (map.Renderer.getLayer(newLayerId)) {
      const targetOpacity = parseFloat(
        document.getElementById("opacity").value
      );
      animateOpacity(newLayerId, targetOpacity, 200);
    }

    const toggle = document.getElementById("toggle-overlay");
    const visibility = toggle.checked ? "visible" : "none";

    if (map.Renderer.getLayer(newLayerId)) {
      map.Renderer.setLayoutProperty(newLayerId, "visibility", visibility);
    }

    setTimeout(() => {
      isTransitioning = false;
      updateNavigationControls();
    }, 200);
  });
}

function loadLayerIfNeeded(time) {
  return new Promise((resolve) => {
    const layerId = `radar_${time}`;
    const sourceId = `radar_source_${time}`;

    if (loadedLayers.has(time) || map.Renderer.getSource(sourceId)) {
      resolve();
      return;
    }
    if (map.Renderer.getLayer("radar") && loadedLayers.size === 0) {
      map.Renderer.removeLayer("radar");
      if (map.Renderer.getSource("radar")) {
        map.Renderer.removeSource("radar");
      }
    }

    // Add source
    map.Renderer.addSource(sourceId, {
      type: "raster",
      scheme: "tms",
      tiles: [`https://weather.thutil.com/radar/${time}/{z}/{x}/{y}.png`],
      minzoom: 5,
      maxzoom: 11,
      tileSize: 256,
      attribution: "",
    });

    const isCurrentLayer = time === currentRadarTime;
    map.Renderer.addLayer({
      id: layerId,
      type: "raster",
      source: sourceId,
      paint: {
        "raster-opacity": isCurrentLayer
          ? parseFloat(document.getElementById("opacity").value)
          : 0,
        "raster-resampling": "linear",
        "raster-fade-duration": 0,
      },
    });

    const toggle = document.getElementById("toggle-overlay");
    const visibility = toggle.checked ? "visible" : "none";
    map.Renderer.setLayoutProperty(layerId, "visibility", visibility);

    loadedLayers.add(time);
    resolve();
  });
}

function animateOpacity(layerId, targetOpacity, duration) {
  if (!map.Renderer.getLayer(layerId)) return;

  const startTime = Date.now();
  const startOpacity =
    map.Renderer.getPaintProperty(layerId, "raster-opacity") || 0;
  const opacityDiff = targetOpacity - startOpacity;

  function updateOpacity() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);

    const easedProgress = 1 - Math.pow(1 - progress, 3);
    const currentOpacity = startOpacity + opacityDiff * easedProgress;

    map.Renderer.setPaintProperty(layerId, "raster-opacity", currentOpacity);

    if (progress < 1) {
      requestAnimationFrame(updateOpacity);
    }
  }

  requestAnimationFrame(updateOpacity);
}
const toggle = document.getElementById("toggle-overlay");
toggle.addEventListener("change", () => {
  const visibility = toggle.checked ? "visible" : "none";
  loadedLayers.forEach((time) => {
    const layerId = `radar_${time}`;
    if (map.Renderer.getLayer(layerId)) {
      map.Renderer.setLayoutProperty(layerId, "visibility", visibility);
    }
  });
  if (map.Renderer.getLayer("radar")) {
    map.Renderer.setLayoutProperty("radar", "visibility", visibility);
  }
});

const opacity = document.getElementById("opacity");
opacity.addEventListener("input", () => {
  const opacityValue = parseFloat(opacity.value);
  const currentLayerId = `radar_${currentRadarTime}`;
  if (map.Renderer.getLayer(currentLayerId)) {
    map.Renderer.setPaintProperty(
      currentLayerId,
      "raster-opacity",
      opacityValue
    );
  }
  if (map.Renderer.getLayer("radar")) {
    map.Renderer.setPaintProperty("radar", "raster-opacity", opacityValue);
  }
});

const timeSelect = document.getElementById("time-select");
timeSelect.addEventListener("change", (e) => {
  const selectedTime = parseInt(e.target.value);
  if (selectedTime && selectedTime !== currentRadarTime) {
    updateRadarLayerSmooth(selectedTime);
  }
});

const refreshBtn = document.getElementById("refresh-times");
refreshBtn.addEventListener("click", fetchRadarTimes);
const prevBtn = document.getElementById("prev-button");
const nextBtn = document.getElementById("next-button");

prevBtn.addEventListener("click", () => navigateRadarTime("prev"));
nextBtn.addEventListener("click", () => navigateRadarTime("next"));
document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
    e.preventDefault();
    navigateRadarTime("prev");
  } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
    e.preventDefault();
    navigateRadarTime("next");
  }
});

map.Event.bind(longdo.EventName.Ready, function () {
  fetchRadarTimes();
});
