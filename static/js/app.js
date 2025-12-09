// ============================================
// GIS Pro - Main Application JavaScript
// ============================================

class GISApp {
    constructor() {
        this.map = null;
        this.baseLayers = {};
        this.tileLayer = null; // Current main tile layer
        this.markers = {};
        this.markerCluster = null;
        this.locations = [];
        this.currentFilter = 'all';
        this.selectedLocation = null;
        this.currentLayer = 'street';
        this.userLocation = null;
        this.loadingLocations = false;
        this.lastBounds = null;

        // Prevent auto-zoom loop flags
        this.isProgrammaticMove = false;
        this.userHasSearched = false;
        this.autoLoadEnabled = true; // Enable auto-load by default per user request

        // Advanced features
        this.drawTools = null;
        this.drawnItems = null;
        this.drawToolsActive = false;
        this.radiusAnalysis = null;
        this.shortcuts = null;

        // Expose globally
        window.gisApp = this;

        // Map Styles
        this.mapStyles = {
            dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
            light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
            satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        };

        this.init();
    }

    // ========================================
    // Initialization
    // ========================================

    async init() {
        this.initMap();
        // Don't load locations initially - wait for user to search
        this.initEventListeners();
        this.setupMapMoveListener();
        this.initAdvancedFeatures(); // Phase 1 features

        // Make sidebar visible by default
        document.getElementById('sidebar').classList.add('active');
    }

    initMap() {
        // Initialize map with global view (centered on world)
        this.map = L.map('map', {
            zoomControl: false,
            attributionControl: false
        }).setView([20, 0], 2);

        // Define base layers
        this.baseLayers.street = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
            maxZoom: 19
        });

        // Initialize tileLayer with default
        this.tileLayer = this.baseLayers.street;
        this.tileLayer.addTo(this.map);

        // Add custom zoom control
        L.control.zoom({
            position: 'bottomright'
        }).addTo(this.map);

        // Initialize marker cluster group
        this.markerCluster = L.markerClusterGroup({
            chunkedLoading: true,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true,
            maxClusterRadius: 50,
            iconCreateFunction: (cluster) => {
                const count = cluster.getChildCount();
                let size = 'small';

                if (count > 10) size = 'large';
                else if (count > 5) size = 'medium';

                return L.divIcon({
                    html: '<div><span>' + count + '</span></div>',
                    className: 'marker-cluster marker-cluster-' + size,
                    iconSize: L.point(40, 40)
                });
            }
        });

        this.map.addLayer(this.markerCluster);

        // Add scale
        L.control.scale({
            position: 'bottomleft',
            imperial: true,
            metric: true
        }).addTo(this.map);
    }

    changeMapStyle(style) {
        if (!this.map || !this.tileLayer) return;

        // Use exposed mapStyles logic or internal logic
        const url = this.mapStyles[style];

        if (url) {
            this.map.removeLayer(this.tileLayer);
            this.tileLayer = L.tileLayer(url, {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19
            }).addTo(this.map);

            // Update state
            this.currentLayer = style;

            // Update UI buttons if they exist
            document.querySelectorAll('.layer-btn').forEach(btn => {
                btn.classList.toggle('active', btn.textContent.toLowerCase().includes(style));
            });

            // Safe update for optional toggle button
            const toggleBtn = document.getElementById('layerToggle');
            if (toggleBtn) {
                toggleBtn.classList.toggle('active', style === 'satellite');
            }
        }
    }


    // ========================================
    // Data Loading
    // ========================================

    async loadLocationsByBounds() {
        if (this.loadingLocations) return;

        try {
            this.loadingLocations = true;
            this.showLoadingOverlay(true);

            const bounds = this.map.getBounds();
            const south = bounds.getSouth();
            const west = bounds.getWest();
            const north = bounds.getNorth();
            const east = bounds.getEast();

            // Check if bounds have changed significantly
            if (this.lastBounds) {
                const latDiff = Math.abs(south - this.lastBounds.south) + Math.abs(north - this.lastBounds.north);
                const lngDiff = Math.abs(west - this.lastBounds.west) + Math.abs(east - this.lastBounds.east);
                const currentLatSpan = Math.abs(north - south);
                const currentLngSpan = Math.abs(east - west);

                if (latDiff < currentLatSpan * 0.2 && lngDiff < currentLngSpan * 0.2) {
                    this.loadingLocations = false;
                    this.showLoadingOverlay(false);
                    return;
                }
            }

            this.lastBounds = { south, west, north, east };

            const query = this.buildOverpassQuery(south, west, north, east, this.currentFilter === 'all' ? null : this.currentFilter);

            const response = await fetch('https://overpass-api.de/api/interpreter', {
                method: 'POST',
                body: 'data=' + encodeURIComponent(query),
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            if (!response.ok) throw new Error('Overpass API error');

            const data = await response.json();
            this.locations = this.processOverpassData(data).slice(0, 500);

            this.renderLocations();
            this.updateCounts();
            this.updateTotalCount();

        } catch (error) {
            console.error('Error loading locations:', error);
            this.showNotification('Unable to load locations. ' + error.message, 'error');
        } finally {
            this.loadingLocations = false;
            this.showLoadingOverlay(false);
        }
    }

    buildOverpassQuery(south, west, north, east, type) {
        const bbox = `(${south},${west},${north},${east})`;

        const queries = {
            park: `
                way["leisure"="park"]${bbox};
                relation["leisure"="park"]${bbox};
                way["leisure"="garden"]${bbox};
                way["leisure"="playground"]${bbox};
                node["leisure"="playground"]${bbox};
                way["leisure"="sports_centre"]${bbox};
                node["leisure"="sports_centre"]${bbox};
                way["landuse"="recreation_ground"]${bbox};
            `,
            landmark: `
                node["tourism"="attraction"]${bbox};
                node["historic"]${bbox};
                way["tourism"="attraction"]${bbox};
                way["historic"]${bbox};
                node["amenity"="place_of_worship"]${bbox};
                way["amenity"="place_of_worship"]${bbox};
                node["tourism"="museum"]${bbox};
                way["tourism"="museum"]${bbox};
            `,
            infrastructure: `
                way["highway"="motorway"]${bbox};
                way["highway"="trunk"]${bbox};
                way["railway"="rail"]${bbox};
                node["railway"="station"]${bbox};
                way["man_made"="bridge"]${bbox};
                node["man_made"="bridge"]${bbox};
                way["aeroway"="aerodrome"]${bbox};
                node["aeroway"="aerodrome"]${bbox};
                node["amenity"="hospital"]${bbox};
                way["amenity"="hospital"]${bbox};
                node["amenity"="school"]${bbox};
                way["amenity"="school"]${bbox};
                node["amenity"="university"]${bbox};
                way["amenity"="university"]${bbox};
                node["office"="government"]${bbox};
                way["office"="government"]${bbox};
            `
        };

        let content = '';
        if (type && queries[type]) {
            content = queries[type];
        } else {
            content = `
                way["leisure"="park"]${bbox};
                way["leisure"="garden"]${bbox};
                way["leisure"="playground"]${bbox};
                node["tourism"="attraction"]${bbox};
                node["historic"]${bbox};
                way["tourism"="attraction"]${bbox};
                node["amenity"="place_of_worship"]${bbox};
                way["highway"="motorway"]${bbox};
                way["man_made"="bridge"]${bbox};
                node["railway"="station"]${bbox};
                node["amenity"="hospital"]${bbox};
                node["amenity"="school"]${bbox};
             `;
        }

        return `[out:json][timeout:25];(${content});out center;`;
    }

    processOverpassData(data) {
        return (data.elements || []).map((element, idx) => {
            let lat, lon;
            if (element.lat && element.lon) {
                lat = element.lat;
                lon = element.lon;
            } else if (element.center) {
                lat = element.center.lat;
                lon = element.center.lon;
            } else {
                return null;
            }

            const tags = element.tags || {};
            const name = tags.name || `Location ${idx + 1}`;

            let loc_type = 'landmark';
            let desc = 'Point of interest';

            if (tags.leisure && ['park', 'garden', 'playground', 'sports_centre'].includes(tags.leisure)) {
                loc_type = 'park';
                desc = tags.leisure.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            } else if (tags.landuse === 'recreation_ground') {
                loc_type = 'park';
                desc = 'Recreation Ground';
            } else if (tags.tourism || tags.historic) {
                loc_type = 'landmark';
                desc = (tags.tourism || tags.historic).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            } else if (tags.amenity === 'place_of_worship') {
                loc_type = 'landmark';
                desc = tags.religion || 'Place of Worship';
            } else if (tags.highway || tags.railway || tags.man_made || tags.aeroway ||
                ['hospital', 'school', 'university'].includes(tags.amenity) ||
                tags.office === 'government') {
                loc_type = 'infrastructure';
                desc = (tags.highway || tags.railway || tags.man_made || tags.amenity || tags.office || 'Infrastructure').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            }

            return {
                id: element.id,
                name: name,
                type: loc_type,
                lat: lat,
                lng: lon,
                description: desc,
                properties: {
                    city: tags['addr:city'],
                    street: tags['addr:street'],
                    website: tags.website
                }
            };
        }).filter(loc => loc !== null);
    }

    setupMapMoveListener() {
        let moveTimeout;

        // Load locations when map movement stops
        this.map.on('moveend', () => {
            clearTimeout(moveTimeout);

            // Guidance box stays visible permanently (User Request)

            // Don't auto-load if it's a programmatic move (e.g. clicking a card)
            if (this.isProgrammaticMove) {
                this.isProgrammaticMove = false; // Reset flag
                return;
            }

            moveTimeout = setTimeout(() => {
                // Always reload based on new bounds to show relevant content
                this.loadLocationsByBounds();
            }, 500); // Reduced delay for snappier response
        });
    }

    updateTotalCount() {
        const totalElement = document.getElementById('totalLocations');
        totalElement.textContent = this.locations.length;

        // Subtle animation to show it updated
        totalElement.style.transform = 'scale(1.1)';
        setTimeout(() => {
            totalElement.style.transform = 'scale(1)';
        }, 200);
    }

    showLoadingOverlay(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (show) {
            overlay.classList.add('active');
        } else {
            overlay.classList.remove('active');
        }
    }

    // ========================================
    // Rendering
    // ========================================

    renderLocations() {
        const filteredLocations = this.currentFilter === 'all'
            ? this.locations
            : this.locations.filter(loc => loc.type === this.currentFilter);

        // Clear existing markers
        this.markerCluster.clearLayers();
        this.markers = {};

        // Add markers
        filteredLocations.forEach(location => {
            this.addMarker(location);
        });

        // Render location cards
        this.renderLocationCards(filteredLocations);

        // Only auto-fit bounds on first load or if user hasn't searched
        // This prevents the annoying auto-zoom loop
        if (filteredLocations.length > 0 && !this.userHasSearched) {
            const bounds = this.markerCluster.getBounds();
            if (bounds.isValid()) {
                this.isProgrammaticMove = true; // Mark as programmatic
                this.map.fitBounds(bounds, { padding: [50, 50] });
            }
        }
    }

    addMarker(location) {
        const icon = this.getMarkerIcon(location.type, false);

        const marker = L.marker([location.lat, location.lng], {
            icon: icon,
            title: location.name,
            locationId: location.id // Store location ID for reference
        });

        // Add popup with data attribute instead of inline onclick
        const popupContent = `
            <div class="custom-popup">
                <h3>${location.name}</h3>
                <p class="location-type ${location.type}">${location.type}</p>
                <p>${location.description}</p>
                <button class="btn btn-primary btn-sm view-details-btn" data-location-id="${location.id}">
                    View Details
                </button>
            </div>
        `;

        marker.bindPopup(popupContent);

        // Click event
        marker.on('click', () => {
            this.selectLocation(location.id);
        });

        this.markers[location.id] = marker;
        this.markerCluster.addLayer(marker);
    }

    getMarkerIcon(type, isHighlighted = false) {
        const iconMap = {
            park: { icon: 'tree', color: '#4CAF50' },
            landmark: { icon: 'landmark', color: '#2196F3' },
            infrastructure: { icon: 'road', color: '#9C27B0' }
        };

        const config = iconMap[type] || { icon: 'map-marker-alt', color: '#607D8B' };

        // Add highlight class if this marker is selected
        const highlightClass = isHighlighted ? ' highlighted' : '';

        return L.divIcon({
            html: `
                <div class="custom-marker${highlightClass}" style="background: ${config.color};">
                    <i class="fas fa-${config.icon}"></i>
                </div>
            `,
            className: 'custom-marker-wrapper',
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32]
        });
    }

    renderLocationCards(locations) {
        const listContainer = document.getElementById('locationList');

        if (locations.length === 0) {
            listContainer.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: #9ca3af;">
                    <i class="fas fa-search" style="font-size: 2rem; margin-bottom: 1rem; opacity: 0.5;"></i>
                    <p>No locations found</p>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = locations.map(location => `
            <div class="location-card ${this.selectedLocation === location.id ? 'selected' : ''}" 
                 data-location-id="${location.id}"
                 onclick="window.gisApp.selectLocation(${location.id})">
                <div class="location-header">
                    <div class="location-name">${location.name}</div>
                    <span class="location-badge">${location.type}</span>
                </div>
                <!-- Using description as the subtitle since 'Christian' was the example text -->
                <div class="location-type" style="margin-top: 2px;">${location.description || location.type}</div>
                <div class="location-coords" style="margin-top: 6px;">
                    <i class="fas fa-map-marker-alt" style="color: #ef4444; margin-right: 4px;"></i>
                    ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}
                </div>
            </div>
        `).join('');
    }

    // ========================================
    // Location Selection & Details
    // ========================================

    selectLocation(locationId) {
        this.selectedLocation = locationId;
        const location = this.locations.find(loc => loc.id === locationId);

        if (!location) return;

        // Update UI - highlight card
        document.querySelectorAll('.location-card').forEach(card => {
            const isSelected = card.dataset.locationId == locationId;
            card.classList.toggle('selected', isSelected);
            if (isSelected) card.classList.add('active'); // Optional: keep active for compatibility if CSS uses it
        });

        // Scroll to the selected card in sidebar
        const selectedCard = document.querySelector(`.location-card[data-location-id="${locationId}"]`);
        if (selectedCard) {
            selectedCard.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'nearest'
            });
        }

        // Highlight the marker by updating its icon
        this.highlightMarker(locationId);

        // Fly to marker with close zoom (mark as programmatic to prevent reload)
        this.isProgrammaticMove = true;

        // Use flyTo for smooth animation to exact location
        this.map.flyTo([location.lat, location.lng], 17, {
            animate: true,
            duration: 1.5,
            easeLinearity: 0.25
        });

        // Open marker popup after fly animation
        setTimeout(() => {
            if (this.markers[locationId]) {
                this.markers[locationId].openPopup();
            }
        }, 1600); // Wait for fly animation to complete

        // Show details in info panel
        this.showLocationDetails(locationId);

        // Auto-close sidebar on mobile to show map/info
        if (window.innerWidth < 768) {
            document.getElementById('sidebar').classList.remove('active');
            setTimeout(() => {
                if (this.map) this.map.invalidateSize();
            }, 350);
        }
    }

    highlightMarker(locationId) {
        // Remove highlight from all markers first
        Object.keys(this.markers).forEach(id => {
            const marker = this.markers[id];
            const location = this.locations.find(loc => loc.id === parseInt(id));
            if (location) {
                const isHighlighted = (parseInt(id) === locationId);
                const newIcon = this.getMarkerIcon(location.type, isHighlighted);
                marker.setIcon(newIcon);
            }
        });
    }

    showLocationDetails(locationId) {
        const location = this.locations.find(loc => loc.id === locationId);

        if (!location) {
            console.warn('Location not found:', locationId);
            this.showNotification('Location details not available. Try searching for this area first.', 'warning');
            return;
        }

        const panel = document.getElementById('infoPanel');
        const title = document.getElementById('infoPanelTitle');
        const type = document.getElementById('infoPanelType');
        const description = document.getElementById('infoPanelDescription');
        const propertiesGrid = document.getElementById('propertiesGrid');

        title.textContent = location.name || 'Unknown Location';
        type.textContent = location.type || 'Unknown';
        type.className = `location-type ${location.type || ''}`;
        description.textContent = location.description || 'No description available.';

        // Render properties
        if (location.properties && Object.keys(location.properties).length > 0) {
            propertiesGrid.innerHTML = Object.entries(location.properties)
                .map(([key, value]) => `
                    <div class="property-item">
                        <div class="property-label">${key}</div>
                        <div class="property-value">${value}</div>
                    </div>
                `).join('');
        } else {
            propertiesGrid.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.875rem;">No additional properties.</p>';
        }

        panel.classList.add('active');
    }

    closeInfoPanel() {
        document.getElementById('infoPanel').classList.remove('active');
    }

    // ========================================
    // Filtering
    // ========================================

    setFilter(filterType) {
        this.currentFilter = filterType;

        // Update filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filterType);
        });

        // Force reload by clearing lastBounds (so the bounds check doesn't block the new filter)
        this.lastBounds = null;
        this.loadLocationsByBounds();
    }

    updateCounts() {
        const counts = {
            all: this.locations.length,
            park: this.locations.filter(loc => loc.type === 'park').length,
            landmark: this.locations.filter(loc => loc.type === 'landmark').length,
            infrastructure: this.locations.filter(loc => loc.type === 'infrastructure').length
        };

        document.getElementById('countAll').textContent = counts.all;
        document.getElementById('countPark').textContent = counts.park;
        document.getElementById('countLandmark').textContent = counts.landmark;
        document.getElementById('countInfrastructure').textContent = counts.infrastructure;
    }

    // ========================================
    // Search
    // ========================================

    async search(query) {
        if (!query || query.length < 2) {
            this.hideSearchResults();
            return;
        }

        try {
            // Use Nominatim directly
            const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`;
            const response = await fetch(url, {
                headers: { 'User-Agent': 'GIS-Pro-App-Demo/1.0' }
            });

            if (!response.ok) throw new Error('Geocoding failed');

            const results = await response.json();

            const formattedResults = results.map(r => ({
                name: r.display_name,
                lat: parseFloat(r.lat),
                lng: parseFloat(r.lon),
                type: r.type,
                address: r.address
            }));

            this.displaySearchResults(formattedResults);
        } catch (error) {
            console.error('Error searching:', error);
        }
    }

    displaySearchResults(results) {
        const resultsContainer = document.getElementById('searchResults');

        if (results.length === 0) {
            resultsContainer.innerHTML = `
                <div class="search-result-item">
                    <p style="color: var(--text-tertiary); text-align: center;">No places found</p>
                </div>
            `;
        } else {
            resultsContainer.innerHTML = results.map((result, idx) => `
                <div class="search-result-item" onclick="app.navigateToPlace(${result.lat}, ${result.lng}, '${result.name.replace(/'/g, "\\'")}')">
                    <h4>${result.name}</h4>
                    <p style="font-size: 0.75rem; color: var(--text-disabled);">
                        ${result.type} • Click to view
                    </p>
                </div>
            `).join('');
        }

        resultsContainer.classList.add('active');
    }

    navigateToPlace(lat, lng, name) {
        // Hide search results
        this.hideSearchResults();

        // Keep search text showing the navigated location
        document.getElementById('searchInput').value = name;

        // Mark that user has searched - keep results stable
        this.userHasSearched = true;
        this.isProgrammaticMove = true;

        // Pan to location with animation
        this.map.flyTo([lat, lng], 13, {
            duration: 1.5,
            easeLinearity: 0.5
        });

        // Show notification
        this.showNotification(`Navigating to ${name}`, 'success');

        // Load locations for this area after navigation completes
        setTimeout(() => {
            this.isProgrammaticMove = true; // Mark as programmatic before load
            this.loadLocationsByBounds();
        }, 1600);
    }

    hideSearchResults() {
        document.getElementById('searchResults').classList.remove('active');
    }

    // ========================================
    // Map Controls
    // ========================================

    locateUser() {
        if (!navigator.geolocation) {
            this.showNotification('Geolocation not supported by your browser', 'error');
            return;
        }

        const btn = document.getElementById('locateBtn');
        btn.classList.add('active');

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;

                // Mark as programmatic move
                this.isProgrammaticMove = true;
                this.map.setView([latitude, longitude], 14, {
                    animate: true
                });

                // Add user marker
                if (this.userMarker) {
                    this.map.removeLayer(this.userMarker);
                }

                this.userMarker = L.circleMarker([latitude, longitude], {
                    radius: 8,
                    fillColor: '#4285F4',
                    color: '#fff',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.8
                }).addTo(this.map);

                this.userMarker.bindPopup('You are here').openPopup();

                btn.classList.remove('active');

                // Load locations for current area after a brief delay
                setTimeout(() => {
                    this.isProgrammaticMove = true;
                    this.loadLocationsByBounds();
                }, 500);
            },
            (error) => {
                btn.classList.remove('active');
                this.showNotification('Could not access your location. Please check permissions.', 'error');
                console.error('Geolocation error:', error);
            }
        );
    }

    toggleLayer() {
        // Cycle through styles: dark -> light -> satellite -> dark
        const styles = ['dark', 'light', 'satellite'];
        let current = this.currentLayer === 'street' ? 'dark' : this.currentLayer;

        // Find next style
        const currentIndex = styles.indexOf(current);
        const nextIndex = (currentIndex + 1) % styles.length;
        const nextStyle = styles[nextIndex];

        this.changeMapStyle(nextStyle);
    }

    toggleFullscreen() {
        const mapContainer = document.querySelector('.map-container');
        const btn = document.getElementById('fullscreenBtn');

        if (!document.fullscreenElement) {
            mapContainer.requestFullscreen().then(() => {
                btn.querySelector('i').classList.replace('fa-expand', 'fa-compress');
                btn.classList.add('active');
            });
        } else {
            document.exitFullscreen().then(() => {
                btn.querySelector('i').classList.replace('fa-compress', 'fa-expand');
                btn.classList.remove('active');
            });
        }
    }

    toggleSidebar() {
        document.getElementById('sidebar').classList.toggle('active');

        // Wait for CSS transition (300ms), then resize map to fill space
        setTimeout(() => {
            if (this.map) {
                this.map.invalidateSize();
            }
        }, 350);
    }

    // ========================================
    // Event Listeners
    // ========================================

    initEventListeners() {
        // Search input
        const searchInput = document.getElementById('searchInput');
        let searchTimeout;

        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.search(e.target.value);
            }, 300);
        });

        // Click outside search to close results
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-container')) {
                this.hideSearchResults();
            }
        });

        // Global event delegation for View Details button in popups
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('view-details-btn') ||
                e.target.closest('.view-details-btn')) {
                e.preventDefault();
                e.stopPropagation();

                const btn = e.target.classList.contains('view-details-btn')
                    ? e.target
                    : e.target.closest('.view-details-btn');

                const locationId = parseInt(btn.getAttribute('data-location-id'));
                this.showLocationDetails(locationId);
            }
        });


        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.setFilter(btn.dataset.filter);
            });
        });

        // Map controls
        document.getElementById('locateBtn').addEventListener('click', () => {
            this.locateUser();
        });

        const layerToggleBtn = document.getElementById('layerToggle');
        if (layerToggleBtn) {
            layerToggleBtn.addEventListener('click', () => {
                this.toggleLayer();
            });
        }

        document.getElementById('fullscreenBtn').addEventListener('click', () => {
            this.toggleFullscreen();
        });

        // Listen for fullscreen changes (handles Esc key too)
        document.addEventListener('fullscreenchange', () => {
            // give it a moment to resize
            setTimeout(() => {
                if (this.map) this.map.invalidateSize();
            }, 100);
        });

        document.getElementById('sidebarToggle').addEventListener('click', () => {
            this.toggleSidebar();
        });

        // Phase 1 Advanced Features
        document.getElementById('drawToolsBtn').addEventListener('click', () => {
            this.toggleDrawTools();
        });

        document.getElementById('radiusBtn').addEventListener('click', () => {
            this.startRadiusAnalysis();
        });

        document.getElementById('clearRadiusBtn').addEventListener('click', () => {
            this.clearRadiusAnalysis();
        });

        document.getElementById('exportBtn').addEventListener('click', () => {
            this.exportMap();
        });

        // Close info panel
        document.getElementById('closePanelBtn').addEventListener('click', () => {
            this.closeInfoPanel();
        });

        // Directions button
        document.getElementById('directionsBtn').addEventListener('click', () => {
            const location = this.locations.find(loc => loc.id === this.selectedLocation);
            if (location) {
                const url = `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}`;
                window.open(url, '_blank');
            }
        });

        // Share button
        document.getElementById('shareBtn').addEventListener('click', () => {
            const location = this.locations.find(loc => loc.id === this.selectedLocation);
            if (location && navigator.share) {
                navigator.share({
                    title: location.name,
                    text: location.description,
                    url: window.location.href
                });
            } else {
                this.showNotification('Link copied to clipboard!', 'success');
                navigator.clipboard.writeText(window.location.href);
            }
        });

        // Local search filter
        const localSearchInput = document.getElementById('localSearchInput');
        const localSearchClear = document.getElementById('localSearchClear');
        const localSearchInfo = document.getElementById('localSearchInfo');
        const localSearchCount = document.getElementById('localSearchCount');

        let localSearchTimeout;

        localSearchInput.addEventListener('input', (e) => {
            clearTimeout(localSearchTimeout);
            const query = e.target.value.trim();

            // Show/hide clear button
            localSearchClear.style.display = query ? 'flex' : 'none';

            localSearchTimeout = setTimeout(() => {
                this.filterLocalResults(query);
            }, 200);
        });

        // Clear button
        localSearchClear.addEventListener('click', () => {
            localSearchInput.value = '';
            localSearchClear.style.display = 'none';
            localSearchInfo.style.display = 'none';
            this.filterLocalResults('');
        });

        // Map events
        this.map.on('click', () => {
            // Close info panel when clicking on map
            // this.closeInfoPanel();
        });
    }

    // ========================================
    // Local Search Filter
    // ========================================

    filterLocalResults(query) {
        const cards = document.querySelectorAll('.location-card');
        const localSearchInfo = document.getElementById('localSearchInfo');
        const localSearchCount = document.getElementById('localSearchCount');

        if (!query) {
            // Show all cards
            cards.forEach(card => {
                card.style.display = ''; // Reset to default CSS
            });
            localSearchInfo.style.display = 'none';
            return;
        }

        const searchTerm = query.toLowerCase();
        let visibleCount = 0;

        cards.forEach(card => {
            const locationId = parseInt(card.dataset.locationId);
            const location = this.locations.find(loc => loc.id === locationId);

            if (location) {
                const matchesName = location.name.toLowerCase().includes(searchTerm);
                const matchesDescription = location.description.toLowerCase().includes(searchTerm);
                const matchesType = location.type.toLowerCase().includes(searchTerm);

                if (matchesName || matchesDescription || matchesType) {
                    card.style.display = ''; // Reset to default CSS (block)
                    visibleCount++;
                } else {
                    card.style.display = 'none';
                }
            }
        });

        // Update and show result count
        localSearchCount.textContent = visibleCount;
        localSearchInfo.style.display = 'flex';
    }

    // ========================================
    // Utilities
    // ========================================

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            padding: 1rem 1.5rem;
            background: var(--glass-bg-medium);
            backdrop-filter: blur(20px);
            border: 1px solid var(--glass-border);
            border-radius: var(--radius-lg);
            box-shadow: var(--shadow-xl);
            color: var(--text-primary);
            z-index: 10000;
            animation: slideIn 0.3s ease-out;
        `;

        const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle';
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.75rem;">
                <i class="fas fa-${icon}"></i>
                <span>${message}</span>
            </div>
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // ========================================
    // Phase 1 Advanced Features
    // ========================================

    initAdvancedFeatures() {
        // Wait for AdvancedFeatures to load
        if (typeof AdvancedFeatures === 'undefined') {
            setTimeout(() => this.initAdvancedFeatures(), 100);
            return;
        }

        // Initialize draw tools
        const { drawControl, drawnItems } = AdvancedFeatures.initDrawTools(this.map);
        this.drawTools = drawControl;
        this.drawnItems = drawnItems;

        // Initialize radius analysis
        this.radiusAnalysis = AdvancedFeatures.initRadiusAnalysis(this.map, this);

        // Initialize keyboard shortcuts
        this.shortcuts = AdvancedFeatures.initKeyboardShortcuts(this);

        // Enhance layers
        AdvancedFeatures.enhanceLayerSwitcher(this.map, this.baseLayers);

        console.log('✅ Phase 1 Advanced Features initialized');
    }

    toggleDrawTools() {
        if (!this.drawTools) return;

        const btn = document.getElementById('drawToolsBtn');

        if (!this.drawToolsActive) {
            this.map.addControl(this.drawTools);
            this.drawToolsActive = true;
            btn.classList.add('active');

            // Make toolbar draggable
            setTimeout(() => {
                const toolbar = document.querySelector('.leaflet-top.leaflet-left');
                if (toolbar) {
                    this.makeToolbarDraggable(toolbar);
                }
            }, 100);

            this.showNotification('Draw tools activated! Drag toolbar to reposition.', 'success');
        } else {
            this.map.removeControl(this.drawTools);
            this.drawToolsActive = false;
            btn.classList.remove('active');
            this.showNotification('Draw tools deactivated', 'info');
        }
    }

    makeToolbarDraggable(toolbar) {
        let isDragging = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;
        let xOffset = 0;
        let yOffset = 0;

        // Add visual indicator that it's draggable
        toolbar.style.cursor = 'move';
        toolbar.title = 'Drag to reposition';

        toolbar.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);

        function dragStart(e) {
            // Only drag if clicking on the toolbar background, not on buttons
            if (e.target.tagName === 'A' || e.target.closest('a')) {
                return;
            }

            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;

            if (e.target === toolbar || e.target.classList.contains('leaflet-draw-toolbar')) {
                isDragging = true;
                toolbar.style.transition = 'none';
            }
        }

        function drag(e) {
            if (isDragging) {
                e.preventDefault();

                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;

                xOffset = currentX;
                yOffset = currentY;

                setTranslate(currentX, currentY, toolbar);
            }
        }

        function dragEnd(e) {
            if (isDragging) {
                initialX = currentX;
                initialY = currentY;
                isDragging = false;
            }
        }

        function setTranslate(xPos, yPos, el) {
            el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
        }
    }


    startRadiusAnalysis() {
        if (!this.radiusAnalysis) return;
        this.radiusAnalysis.startRadiusMode();
        this.showNotification('Click on the map to place a radius circle', 'info');

        // Show clear button after radius is drawn
        setTimeout(() => {
            const clearBtn = document.getElementById('clearRadiusBtn');
            if (clearBtn) {
                clearBtn.style.display = 'block';
            }
        }, 500);
    }

    clearRadiusAnalysis() {
        if (!this.radiusAnalysis) return;
        this.radiusAnalysis.clearRadius();

        // Hide clear button
        const clearBtn = document.getElementById('clearRadiusBtn');
        if (clearBtn) {
            clearBtn.style.display = 'none';
        }

        this.showNotification('Radius analysis cleared', 'info');
    }

    async exportMap() {
        try {
            this.showNotification('Preparing map export...', 'info');
            await AdvancedFeatures.exportMap(this.map, 'png');
            this.showNotification('Map exported successfully!', 'success');
        } catch (error) {
            this.showNotification('Export failed. Please try again.', 'error');
            console.error('Export error:', error);
        }
    }
}

// ========================================
// Additional Styles for Custom Markers
// ========================================

const style = document.createElement('style');
style.textContent = `
    .custom-marker-wrapper {
        background: transparent !important;
        border: none !important;
    }
    
    .custom-marker {
        width: 32px;
        height: 32px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        border: 2px solid white;
    }
    
    .custom-marker i {
        transform: rotate(45deg);
        color: white;
        font-size: 14px;
    }
    
    /* Highlighted marker styles */
    .custom-marker.highlighted {
        width: 42px !important;
        height: 42px !important;
        border: 3px solid #FFD700 !important;
        box-shadow: 0 0 25px rgba(255, 215, 0, 0.8), 
                    0 0 50px rgba(255, 215, 0, 0.4),
                    0 4px 12px rgba(0, 0, 0, 0.3) !important;
        animation: markerPulse 2s ease-in-out infinite !important;
        z-index: 1000 !important;
    }
    
    .custom-marker.highlighted i {
        font-size: 16px !important;
    }
    
    @keyframes markerPulse {
        0%, 100% {
            transform: rotate(-45deg) scale(1);
            box-shadow: 0 0 25px rgba(255, 215, 0, 0.8), 
                        0 0 50px rgba(255, 215, 0, 0.4),
                        0 4px 12px rgba(0, 0, 0, 0.3);
        }
        50% {
            transform: rotate(-45deg) scale(1.1);
            box-shadow: 0 0 35px rgba(255, 215, 0, 1), 
                        0 0 70px rgba(255, 215, 0, 0.6),
                        0 6px 16px rgba(0, 0, 0, 0.4);
        }
    }
    
    
    .marker-cluster-custom {
        background: var(--gradient-primary);
        color: white;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        box-shadow: 0 4px 16px rgba(66, 133, 244, 0.4);
        border: 3px solid white;
    }
    
    .leaflet-popup-content-wrapper {
        background: var(--glass-bg-medium);
        backdrop-filter: blur(20px);
        color: var(--text-primary);
        border: 1px solid var(--glass-border);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-xl);
    }
    
    .leaflet-popup-tip {
        background: var(--glass-bg-medium);
        border: 1px solid var(--glass-border);
        border-top: none;
        border-right: none;
    }
    
    .custom-popup h3 {
        margin: 0 0 0.5rem 0;
        color: var(--text-primary);
        font-family: var(--font-display);
    }
    
    .custom-popup p {
        margin: 0.5rem 0;
        color: var(--text-secondary);
        font-size: 0.9rem;
    }
    
    .custom-popup .btn-sm {
        padding: 0.5rem 1rem;
        font-size: 0.875rem;
        margin-top: 0.75rem;
    }
    
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// ========================================
// Initialize Application
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    window.app = new GISApp();
});
