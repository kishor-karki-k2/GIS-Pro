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
        this.initSearchSystem(); // Initialize new search system
        // Don't load locations initially - wait for user to search
        this.initEventListeners();
        this.setupMapMoveListener();
        this.initAdvancedFeatures(); // Phase 1 features

        // Initialize sidebar based on screen size
        const sidebar = document.getElementById('sidebar');
        if (window.innerWidth <= 768) {
            // Mobile: Start in peek state (not expanded)
            sidebar.classList.remove('active');
        } else {
            // Desktop: Start expanded
            sidebar.classList.add('active');
        }

        // Handle orientation/resize changes
        window.addEventListener('resize', () => {
            if (this.map) {
                this.map.invalidateSize();
            }
        });

        // Initial zoom prompt removed per user request
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

        // Check if zoomed out too far (minimum zoom level 6 for reasonable data)
        const currentZoom = this.map.getZoom();
        const MIN_ZOOM_FOR_DATA = 6;

        if (currentZoom < MIN_ZOOM_FOR_DATA) {
            // Silently skip loading when area too large - no popup
            return;
        }

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

            // Empty state handling with suggestions
            if (this.locations.length === 0) {
                const currentZoom = this.map.getZoom();
                let suggestion = '';

                if (currentZoom < 14) {
                    suggestion = 'Zoom in to see more detailed locations.';
                } else if (currentZoom > 17) {
                    suggestion = 'Zoom out to find locations in a wider area.';
                } else {
                    suggestion = 'Try moving the map or changing filters.';
                }

                this.showNotification(`No results found. ${suggestion}`, 'info');
            }

            this.renderLocations();
            this.updateCounts();
            this.updateTotalCount();

        } catch (error) {
            console.error('Error loading locations:', error);

            // Add actionable suggestion based on zoom level
            const currentZoom = this.map.getZoom();
            let suggestion = '';

            if (currentZoom < 14) {
                suggestion = 'Area too large. Please zoom in to reduce data load.';
            } else {
                suggestion = 'Please try zooming out slightly or moving the map.';
            }

            this.showNotification(`Unable to load locations. ${suggestion}`, 'error');
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
            const sidebar = document.getElementById('sidebar');
            const backdrop = document.getElementById('mobileBackdrop');
            sidebar.classList.remove('active');
            if (backdrop) backdrop.classList.remove('active');

            // Reset mobile nav button icon
            const mobileNavBtn = document.getElementById('mobileNavBtn');
            if (mobileNavBtn) {
                mobileNavBtn.classList.remove('active');
                const icon = mobileNavBtn.querySelector('i');
                if (icon) {
                    icon.classList.remove('fa-times');
                    icon.classList.add('fa-bars');
                }
            }

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
    // Advanced Search System - Completely Rewritten
    // ========================================

    initSearchSystem() {
        // Search state management
        this.searchState = {
            query: '',
            results: [],
            cache: new Map(), // LRU cache for search results
            cacheMaxSize: 50,
            abortController: null,
            isSearching: false,
            debounceTimer: null,
            selectedIndex: -1
        };

        this.setupSearchListeners();
    }

    setupSearchListeners() {
        const searchInput = document.getElementById('searchInput');
        const searchResults = document.getElementById('searchResults');

        if (!searchInput) return;

        // Input event with debouncing
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            this.handleSearchInput(query);
        });

        // Keyboard navigation
        searchInput.addEventListener('keydown', (e) => {
            this.handleSearchKeyboard(e);
        });

        // Clear on focus (optional)
        searchInput.addEventListener('focus', () => {
            if (this.searchState.results.length > 0 && this.searchState.query) {
                this.showSearchResults();
            }
        });

        // Click outside to close
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
                this.hideSearchResults();
            }
        });
    }

    handleSearchInput(query) {
        // Cancel previous debounce timer
        if (this.searchState.debounceTimer) {
            clearTimeout(this.searchState.debounceTimer);
        }

        // Update state
        this.searchState.query = query;
        this.searchState.selectedIndex = -1;

        // Clear if query too short
        if (!query || query.length < 2) {
            this.hideSearchResults();
            this.cancelSearch();
            return;
        }

        // Show loading state immediately
        this.showSearchLoading();

        // Debounce search (300ms for responsive feel)
        this.searchState.debounceTimer = setTimeout(() => {
            this.performSearch(query);
        }, 300);
    }

    async performSearch(query) {
        // Check cache first
        const cached = this.searchState.cache.get(query);
        if (cached) {
            this.displaySearchResults(cached);
            return;
        }

        // Cancel previous request
        this.cancelSearch();

        // Create new abort controller
        this.searchState.abortController = new AbortController();
        this.searchState.isSearching = true;

        try {
            const url = `https://nominatim.openstreetmap.org/search?` + new URLSearchParams({
                q: query,
                format: 'json',
                limit: '8',
                addressdetails: '1',
                extratags: '1'
            });

            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'GIS-Pro-App/2.0',
                    'Accept-Language': 'en'
                },
                signal: this.searchState.abortController.signal
            });

            if (!response.ok) {
                throw new Error(`Search failed: ${response.status}`);
            }

            const results = await response.json();

            // Format results
            const formattedResults = results.map(r => {
                const lat = parseFloat(r.lat);
                const lng = parseFloat(r.lon);

                // Determine icon based on type
                let icon = 'map-marker-alt';
                if (r.type === 'city' || r.type === 'town' || r.type === 'village') {
                    icon = 'city';
                } else if (r.type === 'state' || r.type === 'country') {
                    icon = 'globe-americas';
                } else if (r.class === 'building') {
                    icon = 'building';
                } else if (r.class === 'highway' || r.class === 'railway') {
                    icon = 'road';
                } else if (r.class === 'amenity') {
                    icon = 'store';
                }

                // Get short name for display
                const displayName = r.display_name;
                const shortName = r.name || displayName.split(',')[0];

                return {
                    name: displayName,
                    shortName: shortName,
                    lat: lat,
                    lng: lng,
                    type: r.type || 'place',
                    class: r.class || 'unknown',
                    icon: icon,
                    importance: r.importance || 0,
                    boundingbox: r.boundingbox
                };
            });

            // Store in cache (with LRU eviction)
            this.addToCache(query, formattedResults);

            // Update state and display
            this.searchState.results = formattedResults;
            this.displaySearchResults(formattedResults);

        } catch (error) {
            if (error.name === 'AbortError') {
                // Request was cancelled, ignore
                return;
            }

            console.error('Search error:', error);
            this.displaySearchError(error.message);

        } finally {
            this.searchState.isSearching = false;
            this.searchState.abortController = null;
        }
    }

    cancelSearch() {
        if (this.searchState.abortController) {
            this.searchState.abortController.abort();
            this.searchState.abortController = null;
        }
        this.searchState.isSearching = false;
    }

    addToCache(query, results) {
        // LRU cache implementation
        if (this.searchState.cache.size >= this.searchState.cacheMaxSize) {
            // Remove oldest entry
            const firstKey = this.searchState.cache.keys().next().value;
            this.searchState.cache.delete(firstKey);
        }
        this.searchState.cache.set(query, results);
    }

    showSearchLoading() {
        const resultsContainer = document.getElementById('searchResults');
        resultsContainer.innerHTML = `
            <div class="search-result-item" style="text-align: center; opacity: 0.7;">
                <div class="search-loading-spinner"></div>
                <p style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 0.5rem;">
                    Searching...
                </p>
            </div>
        `;
        resultsContainer.classList.add('active');
    }

    displaySearchResults(results) {
        const resultsContainer = document.getElementById('searchResults');

        if (results.length === 0) {
            resultsContainer.innerHTML = `
                <div class="search-result-item" style="text-align: center;">
                    <i class="fas fa-search" style="font-size: 2rem; opacity: 0.3; color: var(--text-disabled);"></i>
                    <p style="color: var(--text-tertiary); margin-top: 0.5rem;">No places found</p>
                    <p style="color: var(--text-disabled); font-size: 0.75rem;">Try a different search term</p>
                </div>
            `;
        } else {
            resultsContainer.innerHTML = results.map((result, idx) => `
                <div class="search-result-item ${idx === this.searchState.selectedIndex ? 'selected' : ''}" 
                     data-index="${idx}"
                     data-lat="${result.lat}" 
                     data-lng="${result.lng}" 
                     data-name="${this.escapeHtml(result.name)}">
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <div class="search-result-icon">
                            <i class="fas fa-${result.icon}"></i>
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <h4 style="margin: 0; font-size: 0.9rem; font-weight: 600; color: var(--text-primary); 
                                       overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                ${result.shortName}
                            </h4>
                            <p style="margin: 0.25rem 0 0 0; font-size: 0.75rem; color: var(--text-secondary); 
                                      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                ${result.name}
                            </p>
                            <div style="display: flex; gap: 0.5rem; margin-top: 0.25rem; font-size: 0.7rem; color: var(--text-disabled);">
                                <span><i class="fas fa-tag" style="margin-right: 0.25rem;"></i>${result.type}</span>
                                <span><i class="fas fa-layer-group" style="margin-right: 0.25rem;"></i>${result.class}</span>
                            </div>
                        </div>
                        <i class="fas fa-chevron-right" style="color: var(--text-disabled); font-size: 0.75rem;"></i>
                    </div>
                </div>
            `).join('');

            // Add click listeners
            this.attachSearchResultListeners();
        }

        resultsContainer.classList.add('active');
    }

    attachSearchResultListeners() {
        const resultItems = document.querySelectorAll('.search-result-item[data-index]');

        resultItems.forEach((item, idx) => {
            item.addEventListener('click', () => {
                const lat = parseFloat(item.dataset.lat);
                const lng = parseFloat(item.dataset.lng);
                const name = item.dataset.name;
                this.navigateToPlace(lat, lng, name);
            });

            // Hover effect updates selected index
            item.addEventListener('mouseenter', () => {
                this.searchState.selectedIndex = idx;
                this.updateSelectedResult();
            });
        });
    }

    displaySearchError(message) {
        const resultsContainer = document.getElementById('searchResults');
        resultsContainer.innerHTML = `
            <div class="search-result-item" style="text-align: center;">
                <i class="fas fa-exclamation-triangle" style="font-size: 2rem; color: #ef4444; opacity: 0.7;"></i>
                <p style="color: var(--text-primary); margin-top: 0.5rem; font-weight: 500;">Search Error</p>
                <p style="color: var(--text-secondary); font-size: 0.75rem;">${this.escapeHtml(message)}</p>
            </div>
        `;
        resultsContainer.classList.add('active');
    }

    handleSearchKeyboard(e) {
        const results = this.searchState.results;
        if (results.length === 0) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.searchState.selectedIndex = Math.min(
                    this.searchState.selectedIndex + 1,
                    results.length - 1
                );
                this.updateSelectedResult();
                break;

            case 'ArrowUp':
                e.preventDefault();
                this.searchState.selectedIndex = Math.max(
                    this.searchState.selectedIndex - 1,
                    0
                );
                this.updateSelectedResult();
                break;

            case 'Enter':
                e.preventDefault();
                if (this.searchState.selectedIndex >= 0) {
                    const result = results[this.searchState.selectedIndex];
                    this.navigateToPlace(result.lat, result.lng, result.name);
                }
                break;

            case 'Escape':
                e.preventDefault();
                this.hideSearchResults();
                e.target.blur();
                break;
        }
    }

    updateSelectedResult() {
        const resultItems = document.querySelectorAll('.search-result-item[data-index]');
        resultItems.forEach((item, idx) => {
            if (idx === this.searchState.selectedIndex) {
                item.classList.add('selected');
                // Scroll into view if needed
                item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
                item.classList.remove('selected');
            }
        });
    }

    navigateToPlace(lat, lng, name) {
        // Hide search results
        this.hideSearchResults();

        // Update search input
        document.getElementById('searchInput').value = name;

        // Mark that user has searched
        this.userHasSearched = true;
        this.isProgrammaticMove = true;

        // Determine appropriate zoom level based on location importance
        let zoomLevel = 13;
        const result = this.searchState.results.find(r => r.lat === lat && r.lng === lng);
        if (result) {
            if (result.type === 'country') zoomLevel = 6;
            else if (result.type === 'state') zoomLevel = 8;
            else if (result.type === 'city') zoomLevel = 12;
            else if (result.type === 'town') zoomLevel = 14;
            else if (result.type === 'village') zoomLevel = 15;
        }

        // Fly to location with smooth animation
        this.map.flyTo([lat, lng], zoomLevel, {
            duration: 1.5,
            easeLinearity: 0.25
        });

        // Show notification
        this.showNotification(`📍 Navigating to ${name.split(',')[0]}`, 'success');

        // Load locations after navigation
        setTimeout(() => {
            this.isProgrammaticMove = true;
            this.loadLocationsByBounds();
        }, 1600);
    }

    showSearchResults() {
        document.getElementById('searchResults').classList.add('active');
    }

    hideSearchResults() {
        document.getElementById('searchResults').classList.remove('active');
        this.searchState.selectedIndex = -1;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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
        const sidebar = document.getElementById('sidebar');
        const backdrop = document.getElementById('mobileBackdrop');
        const isMobile = window.innerWidth <= 768;

        if (isMobile) {
            // Mobile: Toggle sidebar slide-in
            if (sidebar.classList.contains('active')) {
                sidebar.classList.remove('active');
                if (backdrop) backdrop.classList.remove('active');
            } else {
                sidebar.classList.add('active');
                if (backdrop) backdrop.classList.add('active');
            }
        } else {
            // Desktop: Traditional sidebar toggle
            sidebar.classList.toggle('active');
        }

        // Wait for CSS transition, then resize map
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

        // Mobile backdrop - close sidebar when tapping outside
        const mobileBackdrop = document.getElementById('mobileBackdrop');
        if (mobileBackdrop) {
            mobileBackdrop.addEventListener('click', () => {
                this.toggleSidebar();
                // Reset mobile nav button state
                const mobileNavBtn = document.getElementById('mobileNavBtn');
                if (mobileNavBtn) {
                    mobileNavBtn.classList.remove('active');
                    const icon = mobileNavBtn.querySelector('i');
                    icon.classList.remove('fa-times');
                    icon.classList.add('fa-bars');
                }
            });
        }

        // Mobile navigation FAB button
        const mobileNavBtn = document.getElementById('mobileNavBtn');
        if (mobileNavBtn) {
            mobileNavBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleSidebar();
                // Toggle button active state and icon
                mobileNavBtn.classList.toggle('active');
                const icon = mobileNavBtn.querySelector('i');
                if (mobileNavBtn.classList.contains('active')) {
                    icon.classList.remove('fa-bars');
                    icon.classList.add('fa-times');
                } else {
                    icon.classList.remove('fa-times');
                    icon.classList.add('fa-bars');
                }
            });
        }

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

        // Mobile backdrop - close sidebar when clicking outside
        document.getElementById('mobileBackdrop').addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                this.toggleSidebar();
            }
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

        // Mobile touch gestures for bottom sheet
        this.initMobileGestures();
    }

    initMobileGestures() {
        const sidebar = document.getElementById('sidebar');
        const backdrop = document.getElementById('mobileBackdrop');
        let startY = 0;
        let currentY = 0;
        let isDragging = false;

        // Only enable on mobile
        if (window.innerWidth > 768) return;

        sidebar.addEventListener('touchstart', (e) => {
            // Only track if touching the top area (drag handle zone)
            const touch = e.touches[0];
            const rect = sidebar.getBoundingClientRect();

            // Allow dragging from top 60px of the sidebar
            if (touch.clientY - rect.top < 60) {
                startY = touch.clientY;
                isDragging = true;
            }
        }, { passive: true });

        sidebar.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            currentY = e.touches[0].clientY;
        }, { passive: true });

        sidebar.addEventListener('touchend', () => {
            if (!isDragging) return;
            isDragging = false;

            const deltaY = currentY - startY;

            // Swipe down: collapse
            if (deltaY > 50) {
                sidebar.classList.remove('active');
                backdrop.classList.remove('active');
            }
            // Swipe up: expand
            else if (deltaY < -50) {
                sidebar.classList.add('active');
                backdrop.classList.add('active');
            }

            startY = 0;
            currentY = 0;
        }, { passive: true });
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

        // Subtle type = text only, no background
        const isSubtle = type === 'subtle';

        notification.style.cssText = isSubtle ? `
            position: fixed;
            top: 100px;
            right: 20px;
            padding: 0.5rem 1rem;
            background: transparent;
            border: none;
            color: #ffffff;
            font-size: 0.9rem;
            font-weight: 500;
            text-shadow: 0 1px 3px rgba(0,0,0,0.8);
            z-index: 10000;
            animation: slideIn 0.3s ease-out;
        ` : `
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

        const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : type === 'subtle' ? '' : 'info-circle';

        notification.innerHTML = isSubtle ? `<span>${message}</span>` : `
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
    // Zoom Prompt Modal
    // ========================================

    showZoomPrompt() {
        // Don't show if already showing
        if (document.getElementById('zoomPromptModal')) return;

        const modal = document.createElement('div');
        modal.id = 'zoomPromptModal';
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(30, 32, 41, 0.98);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 16px;
            padding: 2rem;
            max-width: 400px;
            width: 90%;
            z-index: 10000;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
            animation: fadeIn 0.3s ease-out;
            text-align: center;
            color: #e0e0e0;
        `;

        modal.innerHTML = `
            <div style="margin-bottom: 1.5rem;">
                <i class="fas fa-globe-americas" style="font-size: 3rem; color: #667eea; margin-bottom: 1rem; display: block;"></i>
                <h3 style="color: #ffffff; margin-bottom: 0.5rem; font-size: 1.25rem;">Area Too Large</h3>
                <p style="color: #9ca3af; font-size: 0.9rem; margin: 0;">
                    Please zoom in or search for a specific city/state to load locations.
                </p>
            </div>
            
            <div style="margin-bottom: 1.5rem;">
                <input type="text" 
                    id="zoomPromptSearch" 
                    placeholder="Enter city, state, or country..." 
                    style="
                        width: 100%;
                        padding: 0.75rem 1rem;
                        background: rgba(255, 255, 255, 0.05);
                        border: 1px solid rgba(255, 255, 255, 0.15);
                        border-radius: 10px;
                        color: #e0e0e0;
                        font-size: 1rem;
                        outline: none;
                        box-sizing: border-box;
                    "
                />
            </div>
            
            <div style="display: flex; gap: 0.75rem; justify-content: center;">
                <button id="zoomPromptSearchBtn" style="
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    padding: 0.75rem 1.5rem;
                    border-radius: 10px;
                    font-size: 0.95rem;
                    font-weight: 600;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                ">
                    <i class="fas fa-search"></i>
                    Search Location
                </button>
                <button id="zoomPromptCloseBtn" style="
                    background: rgba(255, 255, 255, 0.05);
                    color: #9ca3af;
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    padding: 0.75rem 1.25rem;
                    border-radius: 10px;
                    font-size: 0.95rem;
                    cursor: pointer;
                ">
                    Close
                </button>
            </div>
            
            <p style="margin-top: 1rem; font-size: 0.8rem; color: #6b7280;">
                Tip: Zoom level 6+ is required to fetch location data
            </p>
        `;

        // Add backdrop
        const backdrop = document.createElement('div');
        backdrop.id = 'zoomPromptBackdrop';
        backdrop.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.6);
            z-index: 9999;
        `;

        document.body.appendChild(backdrop);
        document.body.appendChild(modal);

        // Focus input
        setTimeout(() => {
            document.getElementById('zoomPromptSearch')?.focus();
        }, 100);

        // Event listeners
        document.getElementById('zoomPromptSearchBtn').addEventListener('click', () => {
            const query = document.getElementById('zoomPromptSearch').value.trim();
            if (query) {
                this.hideZoomPrompt();
                // Add space after query to trigger search suggestions
                const searchInput = document.getElementById('searchInput');
                searchInput.value = query + ' ';
                searchInput.focus();
                // Trigger input event to show suggestions
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });

        document.getElementById('zoomPromptSearch').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('zoomPromptSearchBtn').click();
            }
        });

        document.getElementById('zoomPromptCloseBtn').addEventListener('click', () => {
            this.hideZoomPrompt();
        });

        backdrop.addEventListener('click', () => {
            this.hideZoomPrompt();
        });
    }

    hideZoomPrompt() {
        document.getElementById('zoomPromptModal')?.remove();
        document.getElementById('zoomPromptBackdrop')?.remove();
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

            this.showNotification('Draw tools activated', 'subtle');
        } else {
            this.map.removeControl(this.drawTools);
            this.drawToolsActive = false;
            btn.classList.remove('active');
            this.showNotification('Draw tools deactivated', 'subtle');
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
