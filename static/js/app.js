// ============================================
// GIS Pro - Main Application JavaScript
// ============================================

class GISApp {
    constructor() {
        this.map = null;
        this.markers = {};
        this.markerCluster = null;
        this.locations = [];
        this.currentFilter = 'all';
        this.selectedLocation = null;
        this.baseLayers = {};
        this.currentLayer = 'street';
        this.loadingLocations = false;
        this.lastBounds = null;

        // Advanced features (Phase 1)
        this.drawTools = null;
        this.drawnItems = null;
        this.drawToolsActive = false; // Track draw control state
        this.radiusAnalysis = null;
        this.shortcuts = null;

        this.init();
    }

    // ========================================
    // Initialization
    // ========================================

    async init() {
        this.initMap();
        // Don't load locations initially - wait for user to search
        // await this.loadLocationsByBounds();
        this.initEventListeners();
        this.setupMapMoveListener();
        this.initAdvancedFeatures(); // Phase 1 features
    }

    initMap() {
        // Initialize map with global view (centered on world)
        this.map = L.map('map', {
            zoomControl: false,
            attributionControl: false
        }).setView([20, 0], 2); // Global view - zoom level 2 shows whole world

        // Street Map Layer
        this.baseLayers.street = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
            maxZoom: 19
        });

        // Satellite Layer
        this.baseLayers.satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri',
            maxZoom: 19
        });

        // Add default layer
        this.baseLayers.street.addTo(this.map);

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
                    html: `<div class="marker-cluster-custom"><span>${count}</span></div>`,
                    className: `marker-cluster-${size}`,
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

    // ========================================
    // Data Loading
    // ========================================

    async loadLocationsByBounds() {
        if (this.loadingLocations) return;

        try {
            this.loadingLocations = true;
            this.showLoadingIndicator(true);

            const bounds = this.map.getBounds();
            const south = bounds.getSouth();
            const west = bounds.getWest();
            const north = bounds.getNorth();
            const east = bounds.getEast();

            // Check if bounds have changed significantly (prevent redundant calls)
            if (this.lastBounds) {
                const latDiff = Math.abs(south - this.lastBounds.south) + Math.abs(north - this.lastBounds.north);
                const lngDiff = Math.abs(west - this.lastBounds.west) + Math.abs(east - this.lastBounds.east);
                const currentLatSpan = Math.abs(north - south);
                const currentLngSpan = Math.abs(east - west);

                // Only fetch if map moved more than 20% of current viewport
                if (latDiff < currentLatSpan * 0.2 && lngDiff < currentLngSpan * 0.2) {
                    this.loadingLocations = false;
                    this.showLoadingIndicator(false);
                    return;
                }
            }

            // Store bounds to avoid duplicate calls
            this.lastBounds = { south, west, north, east };

            const typeParam = this.currentFilter !== 'all' ? `&type=${this.currentFilter}` : '';
            const url = `/api/locations/bounds?south=${south}&west=${west}&north=${north}&east=${east}${typeParam}`;

            const response = await fetch(url);
            const newLocations = await response.json();

            // Only update if we got different data
            if (JSON.stringify(newLocations) !== JSON.stringify(this.locations)) {
                this.locations = newLocations;
                this.renderLocations();
                this.updateCounts();
                this.updateTotalCount();
            }

            // No notification on successful load - just update quietly in background
        } catch (error) {
            console.error('Error loading locations:', error);
            // Only show notification on errors
            this.showNotification('Unable to load locations. Using cached data.', 'error');
        } finally {
            this.loadingLocations = false;
            this.showLoadingIndicator(false);
        }
    }

    setupMapMoveListener() {
        let moveTimeout;

        // Load locations when map movement stops (only if zoomed in enough)
        this.map.on('moveend', () => {
            clearTimeout(moveTimeout);
            moveTimeout = setTimeout(() => {
                // Only load locations if zoomed in enough (zoom > 8)
                if (this.map.getZoom() > 8) {
                    this.loadLocationsByBounds();
                }
            }, 2000); // 2 seconds delay to prevent continuous fetching
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

    showLoadingIndicator(show) {
        const badge = document.querySelector('.stat-badge');
        if (show) {
            badge.style.opacity = '0.85'; // More subtle opacity change
            badge.classList.add('pulse');
        } else {
            badge.style.opacity = '1';
            badge.classList.remove('pulse');
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

        // Fit bounds if there are locations
        if (filteredLocations.length > 0) {
            const bounds = this.markerCluster.getBounds();
            if (bounds.isValid()) {
                this.map.fitBounds(bounds, { padding: [50, 50] });
            }
        }
    }

    addMarker(location) {
        const icon = this.getMarkerIcon(location.type);

        const marker = L.marker([location.lat, location.lng], {
            icon: icon,
            title: location.name
        });

        // Add popup
        const popupContent = `
            <div class="custom-popup">
                <h3>${location.name}</h3>
                <p class="location-type ${location.type}">${location.type}</p>
                <p>${location.description}</p>
                <button class="btn btn-primary btn-sm" onclick="app.showLocationDetails(${location.id})">
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

    getMarkerIcon(type) {
        const iconMap = {
            park: { icon: 'tree', color: '#4CAF50' },
            landmark: { icon: 'landmark', color: '#2196F3' },
            infrastructure: { icon: 'road', color: '#9C27B0' }
        };

        const config = iconMap[type] || { icon: 'map-marker-alt', color: '#607D8B' };

        return L.divIcon({
            html: `
                <div class="custom-marker" style="background: ${config.color};">
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
                <div style="text-align: center; padding: 2rem; color: var(--text-tertiary);">
                    <i class="fas fa-map-marked-alt" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.3;"></i>
                    <p>No locations found</p>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = locations.map(location => `
            <div class="location-card ${this.selectedLocation === location.id ? 'active' : ''}" 
                 data-location-id="${location.id}"
                 onclick="app.selectLocation(${location.id})">
                <div class="location-header">
                    <div>
                        <h3 class="location-title">${location.name}</h3>
                        <span class="location-type ${location.type}">${location.type}</span>
                    </div>
                </div>
                <p class="location-description">${location.description}</p>
                <div class="location-meta">
                    <span>
                        <i class="fas fa-map-marker-alt"></i>
                        ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}
                    </span>
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

        // Update UI
        document.querySelectorAll('.location-card').forEach(card => {
            card.classList.toggle('active', card.dataset.locationId == locationId);
        });

        // Pan to marker
        this.map.setView([location.lat, location.lng], 15, {
            animate: true,
            duration: 1
        });

        // Open marker popup
        if (this.markers[locationId]) {
            this.markers[locationId].openPopup();
        }

        // Show details in info panel
        this.showLocationDetails(locationId);
    }

    showLocationDetails(locationId) {
        const location = this.locations.find(loc => loc.id === locationId);
        if (!location) return;

        const panel = document.getElementById('infoPanel');
        const title = document.getElementById('infoPanelTitle');
        const type = document.getElementById('infoPanelType');
        const description = document.getElementById('infoPanelDescription');
        const propertiesGrid = document.getElementById('propertiesGrid');

        title.textContent = location.name;
        type.textContent = location.type;
        type.className = `location-type ${location.type}`;
        description.textContent = location.description;

        // Render properties
        if (location.properties) {
            propertiesGrid.innerHTML = Object.entries(location.properties)
                .map(([key, value]) => `
                    <div class="property-item">
                        <div class="property-label">${key}</div>
                        <div class="property-value">${value}</div>
                    </div>
                `).join('');
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

        // Reload locations with new filter
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
            // Use geocoding API to search for places worldwide
            const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
            const results = await response.json();
            this.displaySearchResults(results);
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

        // Clear search input
        document.getElementById('searchInput').value = '';

        // Pan to location with animation
        this.map.flyTo([lat, lng], 13, {
            duration: 1.5,
            easeLinearity: 0.5
        });

        // Show notification
        this.showNotification(`Navigating to ${name}`, 'success');

        // Force load locations for this area after navigation
        setTimeout(() => {
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

                // Load locations for this area (will happen automatically via moveend event)
            },
            (error) => {
                btn.classList.remove('active');
                this.showNotification('Could not access your location. Please check permissions.', 'error');
                console.error('Geolocation error:', error);
            }
        );
    }

    toggleLayer() {
        const btn = document.getElementById('layerToggle');

        if (this.currentLayer === 'street') {
            this.map.removeLayer(this.baseLayers.street);
            this.baseLayers.satellite.addTo(this.map);
            this.currentLayer = 'satellite';
            btn.classList.add('active');
        } else {
            this.map.removeLayer(this.baseLayers.satellite);
            this.baseLayers.street.addTo(this.map);
            this.currentLayer = 'street';
            btn.classList.remove('active');
        }
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

        document.getElementById('layerToggle').addEventListener('click', () => {
            this.toggleLayer();
        });

        document.getElementById('fullscreenBtn').addEventListener('click', () => {
            this.toggleFullscreen();
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

        // Map events
        this.map.on('click', () => {
            // Close info panel when clicking on map
            // this.closeInfoPanel();
        });
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

        // Track state with boolean flag (controls are not layers!)
        if (!this.drawToolsActive) {
            this.map.addControl(this.drawTools);
            this.drawToolsActive = true;
            btn.classList.add('active');
            this.showNotification('Draw tools activated! Select a shape to draw.', 'success');
        } else {
            this.map.removeControl(this.drawTools);
            this.drawToolsActive = false;
            btn.classList.remove('active');
            this.showNotification('Draw tools deactivated', 'info');
        }
    }


    startRadiusAnalysis() {
        if (!this.radiusAnalysis) return;
        this.radiusAnalysis.startRadiusMode();
        this.showNotification('Click on the map to place a radius circle', 'info');
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

let app;

document.addEventListener('DOMContentLoaded', () => {
    app = new GISApp();
});
