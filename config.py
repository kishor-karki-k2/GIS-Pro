# Application Configuration

class Config:
    """Base configuration"""
    DEBUG = True
    SECRET_KEY = 'your-secret-key-change-in-production'
    
    # Map Configuration
    DEFAULT_MAP_CENTER = [40.7128, -74.0060]  # New York City
    DEFAULT_ZOOM_LEVEL = 12
    
    # Application Settings
    APP_NAME = 'GIS Pro'
    APP_SUBTITLE = 'Advanced Mapping Platform'
    
    # API Settings
    ITEMS_PER_PAGE = 50
    MAX_SEARCH_RESULTS = 20
    DEFAULT_NEARBY_RADIUS = 10  # kilometers
    
    # Map Tile Providers
    TILE_PROVIDERS = {
        'street': 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        'satellite': 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    }
    
    # Marker Colors
    MARKER_COLORS = {
        'park': '#4CAF50',
        'landmark': '#2196F3',
        'infrastructure': '#9C27B0',
        'default': '#607D8B'
    }

class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True
    TESTING = False

class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False
    TESTING = False
    # Add production-specific settings here

# Configuration dictionary
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}
