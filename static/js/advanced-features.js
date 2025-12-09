// ============================================
// Phase 1 Advanced Features Module
// Draw Tools, Radius Analysis, Export, Keyboard Shortcuts
// ============================================

// Add to GISApp class in app.js - new methods for advanced features

const AdvancedFeatures = {
    // Draw Tools
    initDrawTools(map) {
        // Create a feature group to store drawn items
        const drawnItems = new L.FeatureGroup();
        map.addLayer(drawnItems);

        // Initialize the draw control
        const drawControl = new L.Control.Draw({
            position: 'topleft',
            draw: {
                polygon: {
                    allowIntersection: false,
                    drawError: {
                        color: '#e74c3c',
                        message: '<strong>Error:</strong> Shape edges cannot cross!'
                    },
                    shapeOptions: {
                        color: '#4285F4',
                        weight: 3,
                        opacity: 0.8,
                        fillOpacity: 0.3
                    }
                },
                polyline: {
                    shapeOptions: {
                        color: '#9C27B0',
                        weight: 4,
                        opacity: 0.8
                    },
                    metric: true,
                    feet: false
                },
                rectangle: {
                    shapeOptions: {
                        color: '#FF5722',
                        weight: 3,
                        opacity: 0.8,
                        fillOpacity: 0.3
                    }
                },
                circle: {
                    shapeOptions: {
                        color: '#4CAF50',
                        weight: 3,
                        opacity: 0.8,
                        fillOpacity: 0.3
                    },
                    metric: true
                },
                marker: {
                    icon: L.divIcon({
                        className: 'custom-draw-marker',
                        html: '<i class="fas fa-map-pin" style="font-size: 24px; color: #4285F4;"></i>',
                        iconSize: [24, 24],
                        iconAnchor: [12, 24]
                    })
                },
                circlemarker: false
            },
            edit: {
                featureGroup: drawnItems,
                remove: true
            }
        });

        // Add draw control to map (but don't show it yet)
        map.drawControl = drawControl;
        map.drawnItems = drawnItems;

        // FORCE VISIBILITY: Add custom styling to edit/delete buttons after they're created
        // This ensures the icons are visible regardless of CSS conflicts
        setTimeout(() => {
            const forceButtonVisibility = () => {
                // Find edit and delete buttons
                const editButton = document.querySelector('.leaflet-draw-edit-edit');
                const deleteButton = document.querySelector('.leaflet-draw-edit-remove');

                if (editButton) {
                    const editLink = editButton.querySelector('a');
                    if (editLink) {
                        // Force inline styles to match default toolbar
                        editLink.style.backgroundImage = 'none';
                        editLink.style.position = 'relative';
                        editLink.style.display = 'flex';
                        editLink.style.alignItems = 'center';
                        editLink.style.justifyContent = 'center';

                        // Add visible icon if not already present
                        if (!editLink.querySelector('.custom-icon')) {
                            editLink.innerHTML = '<span class="custom-icon" style="font-size: 18px; filter: none;">✏️</span>';
                        }
                    }
                }

                if (deleteButton) {
                    const deleteLink = deleteButton.querySelector('a');
                    if (deleteLink) {
                        // Force inline styles to match default toolbar
                        deleteLink.style.backgroundImage = 'none';
                        deleteLink.style.position = 'relative';
                        deleteLink.style.display = 'flex';
                        deleteLink.style.alignItems = 'center';
                        deleteLink.style.justifyContent = 'center';

                        // Add visible icon if not already present
                        if (!deleteLink.querySelector('.custom-icon')) {
                            deleteLink.innerHTML = '<span class="custom-icon" style="font-size: 18px; filter: none;">🗑️</span>';
                        }
                    }
                }
            };

            // Call immediately
            forceButtonVisibility();

            // Also watch for DOM changes to catch buttons added later
            const observer = new MutationObserver(() => {
                forceButtonVisibility();
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }, 500);


        // Handle draw events
        map.on(L.Draw.Event.CREATED, function (event) {
            const layer = event.layer;
            const type = event.layerType;
            let measurementText = '';

            // Add measurement info
            if (type === 'polygon' || type === 'rectangle') {
                const area = L.GeometryUtil.geodesicArea(layer.getLatLngs()[0]);
                const areaText = area > 1000000
                    ? `${(area / 1000000).toFixed(2)} km²`
                    : `${area.toFixed(2)} m²`;

                measurementText = `Area: ${areaText}`;

                layer.bindPopup(`
                    <div class="measurement-popup">
                        <strong>${type.charAt(0).toUpperCase() + type.slice(1)}</strong><br>
                        ${measurementText}
                    </div>
                `);

                // Add permanent label
                const center = layer.getBounds().getCenter();
                const label = L.tooltip({
                    permanent: true,
                    direction: 'center',
                    className: 'measurement-label'
                })
                    .setContent(areaText)
                    .setLatLng(center);

                label.addTo(map);
                layer._measurementLabel = label;

            } else if (type === 'polyline') {
                let distance = 0;
                const latlngs = layer.getLatLngs();
                for (let i = 0; i < latlngs.length - 1; i++) {
                    distance += latlngs[i].distanceTo(latlngs[i + 1]);
                }
                const distanceText = distance > 1000
                    ? `${(distance / 1000).toFixed(2)} km`
                    : `${distance.toFixed(2)} m`;

                measurementText = `Distance: ${distanceText}`;

                layer.bindPopup(`
                    <div class="measurement-popup">
                        <strong>Line</strong><br>
                        ${measurementText}
                    </div>
                `);

                // Add label at midpoint
                const midIndex = Math.floor(latlngs.length / 2);
                const labelPos = latlngs[midIndex];
                const label = L.tooltip({
                    permanent: true,
                    direction: 'top',
                    className: 'measurement-label',
                    offset: [0, -10]
                })
                    .setContent(distanceText)
                    .setLatLng(labelPos);

                label.addTo(map);
                layer._measurementLabel = label;

            } else if (type === 'circle') {
                const radius = layer.getRadius();
                const radiusText = radius > 1000
                    ? `${(radius / 1000).toFixed(2)} km`
                    : `${radius.toFixed(2)} m`;
                const area = Math.PI * radius * radius;
                const areaText = area > 1000000
                    ? `${(area / 1000000).toFixed(2)} km²`
                    : `${area.toFixed(2)} m²`;

                measurementText = `Radius: ${radiusText}<br>Area: ${areaText}`;

                layer.bindPopup(`
                    <div class="measurement-popup">
                        <strong>Circle</strong><br>
                        ${measurementText}
                    </div>
                `);

                // Add label at center
                const center = layer.getLatLng();
                const label = L.tooltip({
                    permanent: true,
                    direction: 'center',
                    className: 'measurement-label'
                })
                    .setContent(`R: ${radiusText}<br>A: ${areaText}`)
                    .setLatLng(center);

                label.addTo(map);
                layer._measurementLabel = label;
            }

            // Store reference to remove label when shape is deleted
            layer.on('remove', function () {
                if (layer._measurementLabel) {
                    map.removeLayer(layer._measurementLabel);
                }
            });

            drawnItems.addLayer(layer);
        });

        map.on(L.Draw.Event.EDITED, function (event) {
            // Update measurements for edited shapes
            event.layers.eachLayer(function (layer) {
                // Remove old label
                if (layer._measurementLabel) {
                    map.removeLayer(layer._measurementLabel);
                }

                // Recalculate measurements
                if (layer instanceof L.Polygon || layer instanceof L.Rectangle) {
                    const area = L.GeometryUtil.geodesicArea(layer.getLatLngs()[0]);
                    const areaText = area > 1000000
                        ? `${(area / 1000000).toFixed(2)} km²`
                        : `${area.toFixed(2)} m²`;

                    const center = layer.getBounds().getCenter();
                    const label = L.tooltip({
                        permanent: true,
                        direction: 'center',
                        className: 'measurement-label'
                    })
                        .setContent(areaText)
                        .setLatLng(center);

                    label.addTo(map);
                    layer._measurementLabel = label;

                } else if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
                    let distance = 0;
                    const latlngs = layer.getLatLngs();
                    for (let i = 0; i < latlngs.length - 1; i++) {
                        distance += latlngs[i].distanceTo(latlngs[i + 1]);
                    }
                    const distanceText = distance > 1000
                        ? `${(distance / 1000).toFixed(2)} km`
                        : `${distance.toFixed(2)} m`;

                    const midIndex = Math.floor(latlngs.length / 2);
                    const labelPos = latlngs[midIndex];
                    const label = L.tooltip({
                        permanent: true,
                        direction: 'top',
                        className: 'measurement-label',
                        offset: [0, -10]
                    })
                        .setContent(distanceText)
                        .setLatLng(labelPos);

                    label.addTo(map);
                    layer._measurementLabel = label;

                } else if (layer instanceof L.Circle) {
                    const radius = layer.getRadius();
                    const radiusText = radius > 1000
                        ? `${(radius / 1000).toFixed(2)} km`
                        : `${radius.toFixed(2)} m`;
                    const area = Math.PI * radius * radius;
                    const areaText = area > 1000000
                        ? `${(area / 1000000).toFixed(2)} km²`
                        : `${area.toFixed(2)} m²`;

                    const center = layer.getLatLng();
                    const label = L.tooltip({
                        permanent: true,
                        direction: 'center',
                        className: 'measurement-label'
                    })
                        .setContent(`R: ${radiusText}<br>A: ${areaText}`)
                        .setLatLng(center);

                    label.addTo(map);
                    layer._measurementLabel = label;
                }
            });
        });

        // Handle deletion to clean up labels
        map.on(L.Draw.Event.DELETED, function (event) {
            event.layers.eachLayer(function (layer) {
                if (layer._measurementLabel) {
                    map.removeLayer(layer._measurementLabel);
                }
            });
        });

        return { drawControl, drawnItems };
    },

    // Radius Analysis
    initRadiusAnalysis(map, appInstance) {
        let radiusCircle = null;
        let radiusMode = false;
        let clickHandler = null;

        const showRadiusModal = (callback) => {
            const modal = document.getElementById('radiusModal');
            const input = document.getElementById('radiusInput');
            const unitSelect = document.getElementById('radiusUnit');
            const confirmBtn = document.getElementById('radiusConfirmBtn');
            const cancelBtn = document.getElementById('radiusCancelBtn');
            const closeBtn = document.getElementById('radiusModalClose');

            // Reset and show modal
            input.value = '1.0';
            unitSelect.value = 'km';
            modal.classList.add('active');
            input.focus();

            // Remove old listeners
            const newConfirmBtn = confirmBtn.cloneNode(true);
            const newCancelBtn = cancelBtn.cloneNode(true);
            const newCloseBtn = closeBtn.cloneNode(true);
            confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
            cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
            closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

            const hideModal = () => {
                modal.classList.remove('active');
            };

            // Confirm action
            newConfirmBtn.addEventListener('click', () => {
                const value = parseFloat(input.value);
                const unit = unitSelect.value;

                if (!isNaN(value) && value > 0) {
                    // Convert to meters
                    let radiusInMeters;
                    switch (unit) {
                        case 'km':
                            radiusInMeters = value * 1000;
                            break;
                        case 'mi':
                            radiusInMeters = value * 1609.34; // miles to meters
                            break;
                        case 'm':
                            radiusInMeters = value;
                            break;
                        default:
                            radiusInMeters = value * 1000;
                    }

                    callback(radiusInMeters);
                    hideModal();
                }
            });

            // Cancel actions
            newCancelBtn.addEventListener('click', () => {
                callback(null);
                hideModal();
            });

            newCloseBtn.addEventListener('click', () => {
                callback(null);
                hideModal();
            });

            // Enter key to confirm
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    newConfirmBtn.click();
                }
            });

            // Escape key to cancel
            modal.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    newCancelBtn.click();
                }
            });
        };

        const startRadiusMode = () => {
            radiusMode = true;
            map.getContainer().style.cursor = 'crosshair';

            clickHandler = (e) => {
                if (!radiusMode) return;

                const center = e.latlng;

                showRadiusModal((radius) => {
                    if (!radius || radius <= 0) {
                        map.getContainer().style.cursor = '';
                        radiusMode = false;
                        map.off('click', clickHandler);
                        return;
                    }

                    // Remove existing circle
                    if (radiusCircle) {
                        map.removeLayer(radiusCircle);
                    }

                    // Create new circle
                    radiusCircle = L.circle(center, {
                        radius: radius,
                        color: '#4285F4',
                        fillColor: '#4285F4',
                        fillOpacity: 0.2,
                        weight: 2
                    }).addTo(map);

                    // Find locations within radius
                    const locationsInRadius = appInstance.locations.filter(loc => {
                        const distance = center.distanceTo([loc.lat, loc.lng]);
                        return distance <= radius;
                    });

                    radiusCircle.bindPopup(`
                        <div class="radius-popup">
                            <strong>Radius Analysis</strong><br>
                            Radius: ${(radius / 1000).toFixed(2)} km<br>
                            Locations found: ${locationsInRadius.length}
                        </div>
                    `).openPopup();

                    // Reset
                    map.getContainer().style.cursor = '';
                    radiusMode = false;
                    map.off('click', clickHandler);
                });
            };

            map.on('click', clickHandler);
        };

        const clearRadius = () => {
            if (radiusCircle) {
                map.removeLayer(radiusCircle);
                radiusCircle = null;
                radiusMode = false;
                map.getContainer().style.cursor = '';
                if (clickHandler) {
                    map.off('click', clickHandler);
                }
            }
        };

        return { startRadiusMode, clearRadius };
    },

    // Export Map
    async exportMap(map, format = 'png') {
        try {
            // Use leaflet-image or html2canvas for export
            const mapContainer = map.getContainer();

            // Simple approach using canvas
            return new Promise((resolve, reject) => {
                // Load html2canvas dynamically
                if (!window.html2canvas) {
                    const script = document.createElement('script');
                    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
                    script.onload = () => this.captureMap(mapContainer, format, resolve, reject);
                    document.head.appendChild(script);
                } else {
                    this.captureMap(mapContainer, format, resolve, reject);
                }
            });
        } catch (error) {
            console.error('Export error:', error);
            throw error;
        }
    },

    captureMap(container, format, resolve, reject) {
        html2canvas(container, {
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#1a1d29'
        }).then(canvas => {
            const link = document.createElement('a');
            link.download = `gis-map-${Date.now()}.${format}`;
            link.href = canvas.toDataURL(`image/${format}`);
            link.click();
            resolve();
        }).catch(reject);
    },

    // Keyboard Shortcuts
    initKeyboardShortcuts(appInstance) {
        const shortcuts = {
            's': () => document.getElementById('searchInput').focus(), // Focus search
            'd': () => appInstance.toggleDrawTools(), // Toggle draw tools
            'r': () => appInstance.startRadiusAnalysis(), // Radius analysis
            'e': () => appInstance.exportMap(), // Export map
            'l': () => appInstance.toggleLayer(), // Toggle layer
            'f': () => appInstance.toggleFullscreen(), // Fullscreen
            'm': () => appInstance.locateUser(), // My location
            'Escape': () => {
                // Cancel any active mode
                appInstance.map.getContainer().style.cursor = '';
                if (appInstance.map.drawControl) {
                    appInstance.map.drawControl.disable();
                }
            }
        };

        document.addEventListener('keydown', (e) => {
            // Don't trigger if user is typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                if (e.key !== 'Escape') return;
            }

            const handler = shortcuts[e.key.toLowerCase()];
            if (handler) {
                e.preventDefault();
                handler();
            }
        });

        return shortcuts;
    },

    // Layer Switcher Enhancement
    enhanceLayerSwitcher(map, baseLayers) {
        // Add terrain layer
        baseLayers.terrain = L.tileLayer('https://stamen-tiles-{s}.a.ssl.fastly.net/terrain/{z}/{x}/{y}.png', {
            attribution: 'Map tiles by Stamen Design',
            maxZoom: 18
        });

        // Add dark custom layer  
        baseLayers.darkCustom = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
            maxZoom: 19
        });

        return baseLayers;
    }
};

// Export for use in main app
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AdvancedFeatures;
}
