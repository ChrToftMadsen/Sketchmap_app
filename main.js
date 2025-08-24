let map;
let sidebar = document.getElementById('sidebar');
let buttons = document.getElementById('create-buttons');
let currentMode = 'idle';
let currentType = null;
let currentLayer = null;
let currentDrawer = null;
let currentlyEditing = null;
let originalLayerBeforeEdit = null;

let featureDefs = {}; // Loaded from API (or hardcoded for now)
let drawnItems = new L.FeatureGroup();
let edgeItems = new L.FeatureGroup();
let edgeMarkers = new L.FeatureGroup();
let drawControl = null;

function initMap() {
  console.log("Initializing map..."); // Add this log
  map = L.map('map', { zoomControl:false, attributionControl:false}).setView([55.505, 10.09], 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);

  // fix buggy touch handler for polyline only
  L.Draw.Polyline.prototype._onTouch = L.Util.falseFn;

  map.addLayer(drawnItems);
  map.addLayer(edgeItems);
  map.addLayer(edgeMarkers);
}

function loadFeatureDefinitions() {
  // Replace this with real API call later
  featureDefs = {
  BaseFieldBlock: {
    geometry: { type: "Polygon" },
    crs: { type: "int", default: 4326 },
    name: { type: "str", default: "FieldBlock" },
    style_color: { type: "str", default: "#75c800" },
    fieldName: { type: "str", default: null },
    workingWidth: { type: "float | int", default: null },
    headlandNum: { type: "int", default: 2 },
    headlandObstacleMerge: { type: "int", default: null },
    smoothPathline: { type: "bool", default: null },
    safetyDistance: { type: "float", default: null },
  },
  BaseObstacle: {
    geometry: { type: "Polygon" },
    crs: { type: "int", default: 4326 },
    name: { type: "str", default: "Obstacle" },
    style_color: { type: "str", default: "#0dbdae" },
    headlandNum: { type: "int", default: 1 },
    safetyDistance: { type: "float", default: null },
  },
  BaseUnit: {
    geometry: { type: "Point" },
    crs: { type: "int", default: 4326 },
    name: { type: "str", default: "Unit" },
    style_color: { type: "str", default: "#bc7c6a" },
    unitName: { type: "str", default: null },
    width: { type: "float | int", default: null },
    workingSpeed: { type: "float | int", default: null },
    traversalSpeed: { type: "float | int", default: null },
    distanceToNoseFromGps: { type: "float | int", default: null },
  },
  BaseABLine: {
    geometry: { type: "LineString" },
    crs: { type: "int", default: 4326 },
    name: { type: "str", default: "ABLine" },
    style_color: { type: "str", default: "#0f81d3" },
  },
  BaseSubfieldSplit: {
    geometry: { type: "LineString" },
    crs: { type: "int", default: 4326 },
    name: { type: "str", default: "SubfieldSplit" },
    style_color: { type: "str", default: "#000000" },
  },
  BaseEntry: {
    geometry: { type: "Point" },
    crs: { type: "int", default: 4326 },
    name: { type: "str", default: "Entry" },
    style_color: { type: "str", default: "#44960e" },
  },
  BaseRoad: {
    geometry: { type: "LineString" },
    crs: { type: "int", default: 4326 },
    name: { type: "str", default: "Road" },
    style_color: { type: "str", default: "#000000" },
  },
  BaseEdge: {
      name: { type: "str", default: "Edge" },
      style_color: { type: "str", default: "#000000" },
      headlandNum: { type: "int", default: 1 }
  }
};

  renderCreateButtons();
}

function renderCreateButtons() {
  buttons.innerHTML = '';

  Object.entries(featureDefs).forEach(([key, def]) => {
    if (!def.geometry) return; // Don't create buttons for non-drawable features like BaseEdge
    const label = def.name?.default || key;
    const btn = document.createElement('button');
    btn.textContent = `Create ${label}`;
    btn.addEventListener('click', () => {
      startCreateGeometry(key, def);
    });
    buttons.appendChild(btn);
  });
}

function startCreateGeometry(typeKey, def) {
  if (currentMode === 'editing') {
    alert('Please finish editing the current geometry first.');
    return;
  }
  currentMode = 'drawing';
  currentType = typeKey;

  const geomType = def.geometry?.type;

  let footerHTML = '<button onclick="cancelDrawing()">Cancel</button>';
  if (geomType === 'Polygon' || geomType === 'LineString') {
    footerHTML = `<button onclick="finishDrawing()">Save</button>` + footerHTML;
  }

  showSidebar(
    `Drawing: ${def.name.default}`,
    '',
    footerHTML
  );
  buttons.classList.add('hidden');

  if (drawControl) map.removeControl(drawControl);

  let drawOptions = {};
  switch (geomType) {
    case 'Polygon':
      drawOptions.polygon = { allowIntersection: false, showArea: true };
      break;
    case 'LineString':
      drawOptions.polyline = { allowIntersection: false };
      break;
    case 'Point':
      drawOptions.marker = {};
      break;
  }

  drawControl = new L.Control.Draw({
    draw: drawOptions,
    edit: {
      featureGroup: drawnItems
    }
  });

  // Start drawing immediately
  switch (geomType) {
    case 'Polygon':
      currentDrawer = new L.Draw.Polygon(map, drawControl.options.draw.polygon);
      break;
    case 'LineString':
      currentDrawer = new L.Draw.Polyline(map, drawControl.options.draw.polyline);
      break;
    case 'Point':
      currentDrawer = new L.Draw.Marker(map, drawControl.options.draw.marker);
      break;
  }
  if (currentDrawer) {
    currentDrawer.enable();
  }
}

function cancelDrawing() {
  if (currentDrawer) {
    currentDrawer.disable();
    currentDrawer = null;
  }
  currentMode = 'idle';
  currentType = null;

  if (currentLayer) {
    drawnItems.removeLayer(currentLayer);
    currentLayer = null;
  }

  if (drawControl) map.removeControl(drawControl);
  hideSidebar();
}

function finishDrawing() {
  if (!currentDrawer) return;

  const type = currentDrawer.type;
  if (type === 'polygon' || type === 'polyline') {
    const minPoints = (type === 'polygon') ? 3 : 2;
    if (currentDrawer._markers.length < minPoints) {
      alert(`A ${type} requires at least ${minPoints} vertices to be saved.`);
      return;
    }
    currentDrawer.completeShape();
  }
}

function mapEventListeners() {
  map?.on('draw:created', function (e) {
    const layer = e.layer;
    drawnItems.addLayer(layer);
    currentLayer = layer;

    if (currentDrawer) {
      currentDrawer = null;
    }

    const def = featureDefs[currentType];
    if (currentMode === 'drawing') {
      const propKeys = Object.keys(def).filter(k => !['geometry', 'crs', 'style_color', 'name'].includes(k));
      if (propKeys.length > 0) {
        showPropertyForm(def);
        currentMode = 'entering-properties';
      } else {
        saveGeometry();
      }
    }
  });

  drawnItems.on('click', onLayerClick);

  map.on('draw:edited', function (e) {
    const layers = e.layers;
    layers.eachLayer(function (layer) {
      if (layer.feature) {
        layer.feature.geometry = layer.toGeoJSON().geometry;
        if (layer.feature.properties.type === 'BaseFieldBlock' || layer.feature.properties.type === 'BaseObstacle') {
            updateEdgesForParent(layer);
        }
      }
    });
    console.log('Geometries updated after edit.');
  });
}

function onLayerClick(e) {
  if (currentMode !== 'idle') return;

  const layer = e.layer;
  if (currentlyEditing === layer) return;
  if (currentlyEditing) saveEdits();

  const properties = layer.feature?.properties || {};
  const type = properties.type;
  const def = featureDefs[type];
  const geometryName = def?.name?.default || 'Properties';

  let content = `<h4>${geometryName}</h4><hr>`;
  const propCount = Object.keys(properties).filter(k => k !== 'type').length;

  if (propCount > 0) {
    for (const key in properties) {
      if (key !== 'type') {
        content += `<b>${key}:</b> ${properties[key]}<br/>`;
      }
    }
  } else {
    content += 'No properties set.';
  }

  const layerId = L.Util.stamp(layer);
  content += `<div class="popup-buttons" style="margin-top: 10px;">
                <button onclick="editGeometry(${layerId})">Edit</button>
                <button onclick="deleteGeometry(${layerId})">Delete</button>
              </div>`;

  layer.bindPopup(content).openPopup(e.latlng);
}

function editGeometry(layerId) {
  const layer = drawnItems.getLayer(layerId);
  if (!layer) return;
  layer.closePopup();

  if (currentlyEditing && currentlyEditing !== layer) {
    saveEdits();
  }

  currentlyEditing = layer;
  currentMode = 'editing';

  const properties = JSON.parse(JSON.stringify(layer.feature.properties));
  let latlngs;

  if (layer.getLatLngs) {
    const _cloneLatLngs = (latlngs) => latlngs.map(latlng => Array.isArray(latlng) ? _cloneLatLngs(latlng) : L.latLng(latlng.lat, latlng.lng));
    latlngs = _cloneLatLngs(layer.getLatLngs());
  } else {
    const latlng = layer.getLatLng();
    latlngs = L.latLng(latlng.lat, latlng.lng);
  }
  originalLayerBeforeEdit = { latlngs, properties };

  layer.editing.enable();

  const type = layer.feature.properties.type;
  const def = featureDefs[type];
  const propKeys = Object.keys(def).filter(k => !['geometry', 'crs', 'style_color', 'name'].includes(k));
  let formHTML = '';

  propKeys.forEach(key => {
    const label = key;
    const value = properties[key] ?? def[key]?.default ?? '';
    formHTML += `
      <label>${label}*:
        <input type="text" id="prop-${key}" value="${value}" />
      </label><br/>
    `;
  });

  showSidebar(
    `Editing: ${def.name.default}`,
    formHTML,
    `<button onclick="saveEdits()">Save Changes</button>
     <button onclick="cancelEditing()">Cancel</button>`
  );
  buttons.classList.add('hidden');
}

function saveEdits() {
    console.log('saveEdits called');
    if (!currentlyEditing) {
        console.warn('No layer currently being edited');
        return;
    }

    const type = currentlyEditing.feature.properties.type;
    console.log('Saving edits for layer type:', type);

    const def = featureDefs[type];
    if (!def) {
        console.error('No definition found for type:', type);
        return;
    }

    const properties = {};
    const propKeys = Object.keys(def).filter(k => !['geometry', 'crs', 'style_color', 'name'].includes(k));

    for (let key of propKeys) {
        const element = document.getElementById(`prop-${key}`);
        if (!element) {
            console.warn(`Element not found for property: ${key}`);
            continue;
        }

        const val = element.value;
        if (!val) {
            alert(`Field '${key}' is required.`);
            return;
        }
        properties[key] = val;
    }

    console.log('Updated properties:', properties);
    currentlyEditing.feature.properties = { ...currentlyEditing.feature.properties, ...properties };

    // Disable editing mode
    currentlyEditing.editing.disable();

    // Update the geometry in the feature object
    if (currentlyEditing.toGeoJSON) {
        currentlyEditing.feature.geometry = currentlyEditing.toGeoJSON().geometry;
    }

    // Update edges if this is a field block or obstacle
    if (type === 'BaseFieldBlock' || type === 'BaseObstacle') {
        console.log('Updating edges for edited parent');
        updateEdgesForParent(currentlyEditing);
    }

    // Clean up state
    currentlyEditing = null;
    originalLayerBeforeEdit = null;
    currentMode = 'idle';
    hideSidebar();

    // Update debug counts
    updateDebugCounts();
}

function cancelEditing() {
    if (currentlyEditing && originalLayerBeforeEdit) {
        if (currentlyEditing.setLatLngs) {
            currentlyEditing.setLatLngs(originalLayerBeforeEdit.latlngs);
            currentlyEditing.redraw();
        } else if (currentlyEditing.setLatLng) {
            currentlyEditing.setLatLng(originalLayerBeforeEdit.latlngs);
        }
        currentlyEditing.feature.properties = originalLayerBeforeEdit.properties;
        currentlyEditing.editing.disable();
    }
    currentlyEditing = null;
    originalLayerBeforeEdit = null;
    currentMode = 'idle';
    hideSidebar();
}

function deleteGeometry(layerId) {
  if (!layerId) return;
  if (confirm("Are you sure you want to delete this geometry?")) {
    const layer = drawnItems.getLayer(layerId);
    if (layer) {
      if (currentlyEditing === layer) {
        cancelEditing();
      }
      if (layer.feature.properties.type === 'BaseFieldBlock' || layer.feature.properties.type === 'BaseObstacle') {
          removeEdgesForParent(layer);
      }
      drawnItems.removeLayer(layer);
      map.closePopup();
      console.log(`Layer ${layerId} deleted.`);
    } else {
      console.warn(`Could not find layer with ID ${layerId} to delete.`);
    }
  }
}

function showPropertyForm(def) {
  const propKeys = Object.keys(def).filter(k => !['geometry', 'crs', 'style_color', 'name'].includes(k));
  let formHTML = '';

  propKeys.forEach(key => {
    const label = key;
    const defaultVal = def[key]?.default ?? '';
    formHTML += `
      <label>${label}*:
        <input type="text" id="prop-${key}" value="${defaultVal}" />
      </label><br/>
    `;
  });

  showSidebar(`Properties: ${def.name.default}`, formHTML, `
    <button onclick="saveGeometry()">Save</button>
    <button onclick="cancelDrawing()">Cancel</button>
  `);
}

function saveGeometry() {
  const def = featureDefs[currentType];
  const properties = {};
  const propKeys = Object.keys(def).filter(k => !['geometry', 'crs', 'style_color', 'name'].includes(k));

  for (let key of propKeys) {
    const val = document.getElementById(`prop-${key}`).value;
    if (!val) {
      alert(`Field '${key}' is required.`);
      return;
    }
    properties[key] = val;
  }

  const color = def.style_color?.default || '#3388ff';
  currentLayer.setStyle?.({ color });

  currentLayer.feature = {
    type: 'Feature',
    geometry: currentLayer.toGeoJSON().geometry,
    properties: {
      type: currentType,
      ...properties
    }
  };

  if (currentType === 'BaseFieldBlock' || currentType === 'BaseObstacle') {
      updateEdgesForParent(currentLayer);
  }

  if (currentDrawer) {
    currentDrawer.disable();
    currentDrawer = null;
  }
  currentLayer = null;
  currentMode = 'idle';
  currentType = null;
  hideSidebar();
}

function updateEdgesForParent(parentLayer) {
    if (!parentLayer || !parentLayer.getLatLngs) {
        console.error('Invalid parent layer for edge update');
        return;
    }

    const parentId = L.Util.stamp(parentLayer);
    console.log('Updating edges for parent:', parentId);

    // First collect existing edges and their properties
    const oldEdges = [];
    edgeItems.eachLayer(layer => {
        if (layer.feature && layer.feature.properties && layer.feature.properties.parentId === parentId) {
            oldEdges.push(layer);
        }
    });
    console.log('Found', oldEdges.length, 'existing edges');

    // Remove existing edges for this parent
    removeEdgesForParent(parentLayer);

    // Get the geometry vertices
    const latlngs = parentLayer.getLatLngs();
    if (!latlngs || !latlngs.length) {
        console.error('Parent layer has no latlngs');
        return;
    }

    // Handle nested arrays (polygons have nested arrays)
    const points = Array.isArray(latlngs[0]) ? latlngs[0] : latlngs;
    console.log('Creating edges for', points.length, 'points');

    // Create new edges for each segment
    for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];

        // Try to find a matching old edge to preserve properties
        const oldEdge = oldEdges.find(edge => {
            const edgePoints = edge.getLatLngs();
            const edgeP1 = edgePoints[0];
            const edgeP2 = edgePoints[1] || edgePoints[0]; // Handle single-point edge

            return (edgeP1.equals(p1) && edgeP2.equals(p2)) ||
                   (edgeP1.equals(p2) && edgeP2.equals(p1));
        });

        // Use existing headlandNum or default from parent
        const headlandNum = oldEdge ?
            oldEdge.feature.properties.headlandNum :
            parentLayer.feature.properties.headlandNum;

        console.log('Creating edge with headlandNum:', headlandNum);
        createEdge([p1, p2], parentId, headlandNum);
    }
}

function removeEdgesForParent(parentLayer) {
    try {
        if (!parentLayer) {
            console.error('No parent layer provided for edge removal');
            return;
        }

        const parentId = L.Util.stamp(parentLayer);
        console.log('Removing edges for parent:', parentId);

        const edgesToRemove = [];
        edgeItems.eachLayer(layer => {
            if (layer.feature && layer.feature.properties && layer.feature.properties.parentId === parentId) {
                edgesToRemove.push(layer);
            }
        });

        console.log('Found', edgesToRemove.length, 'edges to remove');

        edgesToRemove.forEach(edge => {
            try {
                // Remove the associated marker first
                if (edge.feature && edge.feature.marker) {
                    edgeMarkers.removeLayer(edge.feature.marker);
                }

                // Then remove the edge itself
                edgeItems.removeLayer(edge);
            } catch (err) {
                console.error('Error removing edge:', err);
            }
        });

        // Update debug counts
        updateDebugCounts();
    } catch (error) {
        console.error('Error in removeEdgesForParent:', error);
    }
}

function createEdge(latlngs, parentId, headlandNum) {
    try {
        console.log('Creating edge with latlngs:', latlngs);

        // Get the definition for BaseEdge
        const def = featureDefs.BaseEdge;
        if (!def) {
            console.error('BaseEdge definition not found');
            return;
        }

        // Get the color from the definition
        const color = def.style_color?.default || '#000000';
        console.log('Using color:', color);

        // Create the polyline for the edge
        const edge = L.polyline(latlngs, { color: color, weight: 5, opacity: 0.7 });

        // Create the feature object with properties
        edge.feature = {
            type: 'Feature',
            geometry: edge.toGeoJSON().geometry,
            properties: {
                type: 'BaseEdge',
                parentId: parentId,
                headlandNum: headlandNum
            }
        };

        // Add the edge to the edge layer group
        edgeItems.addLayer(edge);

        // Create a marker for the edge
        createEdgeMarker(edge);

        // Update debug information
        updateDebugCounts();

        console.log('Edge created successfully');
    } catch (error) {
        console.error('Error creating edge:', error);
    }
}

function createEdgeMarker(edge) {
    try {
        // Calculate center manually to be safe
        let center;
        if (typeof edge.getCenter === 'function') {
            // Use built-in method if available
            center = edge.getCenter();
        } else {
            // Calculate center manually from latlngs
            const latlngs = edge.getLatLngs();
            if (latlngs && latlngs.length > 0) {
                if (latlngs.length === 1 && Array.isArray(latlngs[0])) {
                    // Handle nested arrays from polygons
                    const points = latlngs[0];
                    if (points.length >= 2) {
                        // Find midpoint between first two points
                        center = L.latLng(
                            (points[0].lat + points[1].lat) / 2,
                            (points[0].lng + points[1].lng) / 2
                        );
                    }
                } else if (latlngs.length >= 2) {
                    // Find midpoint between first two points for polylines
                    center = L.latLng(
                        (latlngs[0].lat + latlngs[1].lat) / 2,
                        (latlngs[0].lng + latlngs[1].lng) / 2
                    );
                }
            }

            if (!center) {
                console.error('Could not calculate center for edge');
                return;
            }
        }

        const headlandNum = edge.feature.properties.headlandNum;
        const icon = L.divIcon({
            className: 'edge-marker',
            html: `<div>${headlandNum}</div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });

        const marker = L.marker(center, { icon: icon });
        marker.on('click', () => editEdge(edge));
        edgeMarkers.addLayer(marker);
        edge.feature.marker = marker; // Link marker to edge
    } catch (error) {
        console.error('Error creating edge marker:', error);
    }
}

function editEdge(edge) {
    const edgeId = L.Util.stamp(edge);
    let formHTML = `
      <label>headlandNum*:
        <input type="text" id="prop-headlandNum" value="${edge.feature.properties.headlandNum}" />
      </label><br/>
    `;
    showSidebar(
        'Editing: Edge',
        formHTML,
        `<button onclick="saveEdge(${edgeId})">Save</button>
         <button onclick="hideSidebar()">Cancel</button>`
    );
}

function saveEdge(edgeId) {
    const edge = edgeItems.getLayer(edgeId);
    if (!edge) return;
    const newHeadlandNum = document.getElementById('prop-headlandNum').value;
    if (!newHeadlandNum) {
        alert('Field \'headlandNum\' is required.');
        return;
    }
    edge.feature.properties.headlandNum = newHeadlandNum;

    // Update marker
    if (edge.feature.marker) {
        edgeMarkers.removeLayer(edge.feature.marker);
    }
    createEdgeMarker(edge);

    hideSidebar();
}


function showSidebar(title, bodyHTML = '', footerHTML = '') {
  sidebar.classList.remove('hidden');
  document.getElementById('sidebar-header').innerText = title;
  document.getElementById('sidebar-body').innerHTML = bodyHTML;
  document.getElementById('sidebar-footer').innerHTML = footerHTML;
}

function hideSidebar() {
  sidebar.classList.add('hidden');
  document.getElementById('sidebar-header').innerText = '';
  document.getElementById('sidebar-body').innerHTML = '';
  document.getElementById('sidebar-footer').innerHTML = '';
  buttons.classList.remove('hidden');
}

function updateDebugCounts() {
  try {
    let edgeCount = 0;
    let markerCount = 0;
    let polygonCount = 0;

    edgeItems.eachLayer(() => edgeCount++);
    edgeMarkers.eachLayer(() => markerCount++);
    drawnItems.eachLayer(layer => {
      if (layer instanceof L.Polygon) polygonCount++;
    });

    document.getElementById('edge-count').textContent = edgeCount;
    document.getElementById('marker-count').textContent = markerCount;
    document.getElementById('polygon-count').textContent = polygonCount;
  } catch (error) {
    console.error('Error updating debug counts:', error);
  }
}

initMap();
mapEventListeners();
loadFeatureDefinitions();
updateDebugCounts();