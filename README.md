# GIS Pro - Advanced Mapping Platform

A modern, feature-rich GIS (Geographic Information System) web application built with Python Flask and Leaflet.js, featuring a stunning glassmorphism design and interactive mapping capabilities.

![GIS Pro Application](https://img.shields.io/badge/Status-Active-success)
![Python](https://img.shields.io/badge/Python-3.8+-blue)
![Flask](https://img.shields.io/badge/Flask-3.0.0-green)
![Leaflet](https://img.shields.io/badge/Leaflet-1.9.4-blue)

## ✨ Features

### 🗺️ Interactive Mapping
- **Leaflet.js Integration**: High-performance interactive maps with smooth panning and zooming
- **Multiple Base Layers**: Switch between street map and satellite imagery
- **Custom Markers**: Beautiful, color-coded markers for different location types
- **Marker Clustering**: Automatic clustering of nearby markers for better performance
- **Popups**: Rich information popups with location details

### 🎨 Premium Design
- **Glassmorphism UI**: Modern frosted-glass effect with backdrop blur
- **Dark Theme**: Eye-friendly dark color scheme
- **Vibrant Gradients**: HSL-based color palette with smooth gradients
- **Smooth Animations**: Micro-interactions and transitions throughout
- **Responsive Design**: Fully responsive from mobile to desktop

### 🔍 Search & Filter
- **Real-time Search**: Instant search as you type
- **Smart Filtering**: Filter locations by type (Parks, Landmarks, Infrastructure)
- **Search Results Preview**: Live search results with descriptions
- **Location Count Badges**: Visual indicators for each category

### 📍 Location Features
- **Geolocation**: Find your current location with one click
- **Location Details Panel**: Comprehensive information about each location
- **Properties Display**: Structured property data for each location
- **Get Directions**: Direct integration with Google Maps for directions
- **Share Locations**: Native share functionality

### 🎯 Advanced Functionality
- **RESTful API**: Complete backend API for location data
- **Nearby Search**: Find locations within a specified radius
- **Statistics**: Real-time data statistics
- **Fullscreen Mode**: Immersive map viewing experience
- **Custom Controls**: Intuitive map controls

## 🚀 Getting Started

### Prerequisites
- Python 3.8 or higher
- pip (Python package manager)

### Installation

1. **Clone or navigate to the project directory**
   ```bash
   cd "/Users/kishorkarki/GIS Project"
   ```

2. **Install dependencies**
   ```bash
   python3 -m pip install -r requirements.txt
   ```

3. **Run the application**
   ```bash
   python3 app.py
   ```

4. **Open your browser**
   Navigate to `http://127.0.0.1:5000`

## 📁 Project Structure

```
GIS Project/
├── app.py                      # Flask application with API endpoints
├── requirements.txt            # Python dependencies
├── templates/
│   └── index.html             # Main HTML template
├── static/
│   ├── css/
│   │   └── style.css          # Premium design system & styles
│   └── js/
│       └── app.js             # Frontend JavaScript application
└── README.md                  # This file
```

## 🔧 Technology Stack

### Backend
- **Flask 3.0.0**: Python web framework
- **Flask-CORS 4.0.0**: Cross-origin resource sharing
- **Werkzeug 3.0.1**: WSGI web application library

### Frontend
- **Leaflet 1.9.4**: Interactive mapping library
- **Leaflet.markercluster**: Marker clustering plugin
- **Vanilla JavaScript**: No framework dependencies
- **Modern CSS**: CSS Grid, Flexbox, Custom Properties
- **Font Awesome 6.5.1**: Icon library
- **Google Fonts**: Inter & Space Grotesk typefaces

### Map Providers
- **CartoDB Dark**: Default street map tiles
- **Esri World Imagery**: Satellite imagery tiles

## 🎨 Design System

### Color Palette
- **Primary**: HSL(220, 75%, 55%) - Vibrant Blue
- **Secondary**: HSL(280, 75%, 55%) - Purple
- **Accent**: HSL(340, 80%, 55%) - Pink
- **Success**: HSL(142, 71%, 45%) - Green
- **Background**: Dark theme with subtle gradients

### Typography
- **Primary Font**: Inter (System UI fallback)
- **Display Font**: Space Grotesk
- **Size Scale**: Modular scale from 0.75rem to 1.5rem

### Spacing
- **System**: 0.25rem base unit
- **Scale**: xs(0.25), sm(0.5), md(1), lg(1.5), xl(2), 2xl(3), 3xl(4)

### Effects
- **Glassmorphism**: backdrop-filter blur with semi-transparent backgrounds
- **Shadows**: Layered shadows for depth
- **Transitions**: Cubic-bezier easing for smooth animations

## 📡 API Endpoints

### GET `/api/locations`
Get all locations or filter by type
```
Query Parameters:
  - type: Filter by location type (park, landmark, infrastructure)

Response: Array of location objects
```

### GET `/api/location/<id>`
Get a specific location by ID
```
Response: Single location object or 404
```

### GET `/api/search`
Search locations by name or description
```
Query Parameters:
  - q: Search query string

Response: Array of matching location objects
```

### GET `/api/nearby`
Find locations within a radius
```
Query Parameters:
  - lat: Latitude
  - lng: Longitude
  - radius: Search radius in kilometers (default: 10)

Response: Array of nearby locations with distance
```

### GET `/api/stats`
Get statistics about the data
```
Response: Object with total counts and breakdown by type
```

## 🎯 Key Features Explained

### Marker Clustering
The application automatically clusters nearby markers when zoomed out, improving performance and readability. Click on clusters to zoom in and see individual markers.

### Real-time Search
As you type in the search bar, the application performs real-time searches and displays results instantly. Click any result to zoom to that location.

### Location Filters
Use the sidebar filters to show only specific types of locations. The count badges update in real-time to show how many locations match each filter.

### Geolocation
Click the crosshairs button to find your current location. The map will pan to your location and display a marker.

### Layer Switching
Toggle between street map and satellite imagery using the layer control button.

### Fullscreen Mode
Click the expand button to view the map in fullscreen mode for an immersive experience.

## 🔮 Future Enhancements

- [ ] Database integration (PostgreSQL with PostGIS)
- [ ] User authentication and saved locations
- [ ] Drawing tools for custom shapes and routes
- [ ] Heatmap visualization
- [ ] Route planning and navigation
- [ ] Custom location categories
- [ ] Export to GeoJSON/KML
- [ ] Advanced analytics dashboard
- [ ] Real-time location tracking
- [ ] Multi-language support

## 🛠️ Customization

### Adding New Locations
Edit the `sample_locations` array in `app.py`:

```python
{
    "id": 6,
    "name": "Location Name",
    "type": "park",  # or "landmark" or "infrastructure"
    "lat": 40.7128,
    "lng": -74.0060,
    "description": "Description of the location",
    "properties": {
        "key": "value"
    }
}
```

### Changing Map Center
In `static/js/app.js`, modify the `initMap()` method:

```javascript
this.map = L.map('map', {
    zoomControl: false,
    attributionControl: false
}).setView([YOUR_LAT, YOUR_LNG], YOUR_ZOOM);
```

### Adding Custom Marker Types
1. Add icon configuration in `getMarkerIcon()` method in `app.js`
2. Add corresponding CSS class in `style.css`
3. Update filter buttons in `index.html`

## 🐛 Troubleshooting

### Map not loading
- Check your internet connection (map tiles are loaded from external servers)
- Verify Flask is running on port 5000
- Check browser console for JavaScript errors

### Markers not appearing
- Verify API responses in Network tab
- Check that location data has valid lat/lng coordinates
- Ensure Leaflet libraries are loaded correctly

### Search not working
- Check Flask API is responding at `/api/search`
- Verify search input is properly connected to event listener
- Check browser console for errors

## 📄 License

This project is open source and available under the MIT License.

## 👨‍💻 Author

Built with ❤️ using Flask and Leaflet.js

## 🙏 Acknowledgments

- **Leaflet.js** - For the amazing mapping library
- **CartoDB** - For beautiful map tiles
- **Esri** - For satellite imagery
- **Font Awesome** - For the icon library
- **Google Fonts** - For Inter and Space Grotesk fonts

---

**Note**: This is a demonstration application. For production use, implement proper database storage, authentication, error handling, and security measures.
