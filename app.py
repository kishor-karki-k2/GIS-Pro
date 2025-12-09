from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
import json
import requests
from datetime import datetime
from math import radians, cos, sin, asin, sqrt

app = Flask(__name__)
CORS(app)

# Sample GIS data - Empty by default, will be populated from OpenStreetMap
sample_locations = []

def fetch_osm_locations(south, west, north, east, location_type=None):
    """
    Fetch real locations from OpenStreetMap Overpass API
    based on map bounds and location type
    """
    
    # Define Overpass queries for different types
    queries = {
        'park': f"""
            [out:json][timeout:25];
            (
                way["leisure"="park"]({south},{west},{north},{east});
                relation["leisure"="park"]({south},{west},{north},{east});
                way["leisure"="garden"]({south},{west},{north},{east});
                way["leisure"="playground"]({south},{west},{north},{east});
                node["leisure"="playground"]({south},{west},{north},{east});
                way["leisure"="sports_centre"]({south},{west},{north},{east});
                node["leisure"="sports_centre"]({south},{west},{north},{east});
                way["landuse"="recreation_ground"]({south},{west},{north},{east});
            );
            out center;
        """,
        'landmark': f"""
            [out:json][timeout:25];
            (
                node["tourism"="attraction"]({south},{west},{north},{east});
                node["historic"]({south},{west},{north},{east});
                way["tourism"="attraction"]({south},{west},{north},{east});
                way["historic"]({south},{west},{north},{east});
                node["amenity"="place_of_worship"]({south},{west},{north},{east});
                way["amenity"="place_of_worship"]({south},{west},{north},{east});
                node["tourism"="museum"]({south},{west},{north},{east});
                way["tourism"="museum"]({south},{west},{north},{east});
            );
            out center;
        """,
        'infrastructure': f"""
            [out:json][timeout:25];
            (
                way["highway"="motorway"]({south},{west},{north},{east});
                way["highway"="trunk"]({south},{west},{north},{east});
                way["railway"="rail"]({south},{west},{north},{east});
                node["railway"="station"]({south},{west},{north},{east});
                way["man_made"="bridge"]({south},{west},{north},{east});
                node["man_made"="bridge"]({south},{west},{north},{east});
                way["aeroway"="aerodrome"]({south},{west},{north},{east});
                node["aeroway"="aerodrome"]({south},{west},{north},{east});
                node["amenity"="hospital"]({south},{west},{north},{east});
                way["amenity"="hospital"]({south},{west},{north},{east});
                node["amenity"="school"]({south},{west},{north},{east});
                way["amenity"="school"]({south},{west},{north},{east});
                node["amenity"="university"]({south},{west},{north},{east});
                way["amenity"="university"]({south},{west},{north},{east});
                node["office"="government"]({south},{west},{north},{east});
                way["office"="government"]({south},{west},{north},{east});
            );
            out center;
        """
    }
    
    # Build query based on type
    if location_type and location_type in queries:
        query = queries[location_type]
    else:
        # Combine all queries for 'all' type (enhanced)
        query = f"""
            [out:json][timeout:25];
            (
                way["leisure"="park"]({south},{west},{north},{east});
                way["leisure"="garden"]({south},{west},{north},{east});
                way["leisure"="playground"]({south},{west},{north},{east});
                node["tourism"="attraction"]({south},{west},{north},{east});
                node["historic"]({south},{west},{north},{east});
                way["tourism"="attraction"]({south},{west},{north},{east});
                node["amenity"="place_of_worship"]({south},{west},{north},{east});
                way["highway"="motorway"]({south},{west},{north},{east});
                way["man_made"="bridge"]({south},{west},{north},{east});
                node["railway"="station"]({south},{west},{north},{east});
                node["amenity"="hospital"]({south},{west},{north},{east});
                node["amenity"="school"]({south},{west},{north},{east});
            );
            out center;
        """
    
    try:
        # Query Overpass API
        overpass_url = "http://overpass-api.de/api/interpreter"
        response = requests.post(overpass_url, data={'data': query}, timeout=30)
        
        if response.status_code != 200:
            return []
        
        data = response.json()
        locations = []
        
        for idx, element in enumerate(data.get('elements', [])[:100]):  # Limit to 100
            # Get coordinates
            if 'lat' in element and 'lon' in element:
                lat = element['lat']
                lon = element['lon']
            elif 'center' in element:
                lat = element['center']['lat']
                lon = element['center']['lon']
            else:
                continue
            
            # Get tags
            tags = element.get('tags', {})
            name = tags.get('name', f"Location {idx + 1}")
            
            # Determine type based on tags
            tags = element.get('tags', {})
            
            if 'leisure' in tags and tags['leisure'] in ['park', 'garden', 'playground', 'sports_centre']:
                loc_type = 'park'
                desc = f"{tags.get('leisure', 'Park').title().replace('_', ' ')}"
            elif 'landuse' in tags and tags['landuse'] == 'recreation_ground':
                loc_type = 'park'
                desc = "Recreation Ground"
            elif 'tourism' in tags or 'historic' in tags:
                loc_type = 'landmark'
                if 'tourism' in tags:
                    desc = f"{tags.get('tourism', 'Attraction').title().replace('_', ' ')}"
                else:
                    desc = f"{tags.get('historic', 'Historic site').title().replace('_', ' ')}"
            elif 'amenity' in tags and tags['amenity'] == 'place_of_worship':
                loc_type = 'landmark'
                desc = f"{tags.get('religion', 'Place of worship').title()}"
            elif 'highway' in tags or 'railway' in tags or 'man_made' in tags or 'aeroway' in tags:
                loc_type = 'infrastructure'
                if 'highway' in tags:
                    desc = f"{tags.get('highway', 'Road').title().replace('_', ' ')}"
                elif 'railway' in tags:
                    desc = f"{tags.get('railway', 'Railway').title()} Station" if tags['railway'] == 'station' else "Railway"
                elif 'aeroway' in tags:
                    desc = "Airport" if tags['aeroway'] == 'aerodrome' else "Aeroway"
                else:
                    desc = f"{tags.get('man_made', 'Infrastructure').title().replace('_', ' ')}"
            elif 'amenity' in tags and tags['amenity'] in ['hospital', 'school', 'university']:
                loc_type = 'infrastructure'
                desc = f"{tags.get('amenity', 'Building').title()}"
            elif 'office' in tags and tags['office'] == 'government':
                loc_type = 'infrastructure'
                desc = "Government Office"
            else:
                loc_type = 'landmark'
                desc = "Point of interest"
            
            # Build properties
            properties = {}
            if 'addr:city' in tags:
                properties['city'] = tags['addr:city']
            if 'addr:street' in tags:
                properties['street'] = tags['addr:street']
            if 'website' in tags:
                properties['website'] = tags['website']
            if 'opening_hours' in tags:
                properties['hours'] = tags['opening_hours']
            
            locations.append({
                'id': element.get('id', idx),
                'name': name,
                'type': loc_type,
                'lat': lat,
                'lng': lon,
                'description': desc,
                'properties': properties
            })
        
        return locations
        
    except Exception as e:
        print(f"Error fetching OSM data: {e}")
        return []

@app.route('/')
def index():
    """Render the main map interface"""
    return render_template('index.html')

@app.route('/api/locations/bounds')
def get_locations_by_bounds():
    """
    Get real locations from OpenStreetMap within map bounds
    """
    try:
        # Get bounds from query parameters
        south = float(request.args.get('south'))
        west = float(request.args.get('west'))
        north = float(request.args.get('north'))
        east = float(request.args.get('east'))
        location_type = request.args.get('type', None)
        
        # Fetch from OSM
        locations = fetch_osm_locations(south, west, north, east, location_type)
        
        # If no results, return sample data as fallback
        if not locations:
            if location_type:
                locations = [loc for loc in sample_locations if loc['type'] == location_type]
            else:
                locations = sample_locations
        
        # Limit to 500 results
        locations = locations[:500]
        
        return jsonify(locations)
        
    except (TypeError, ValueError) as e:
        print(f"Error parsing bounds: {e}")
        return jsonify({"error": "Invalid bounds parameters"}), 400
    except Exception as e:
        print(f"Error: {e}")
        return jsonify(sample_locations)

@app.route('/api/locations')
def get_locations():
    """Get sample locations (fallback)"""
    location_type = request.args.get('type', None)
    
    if location_type:
        filtered = [loc for loc in sample_locations if loc['type'] == location_type]
        return jsonify(filtered)
    
    return jsonify(sample_locations)

@app.route('/api/location/<int:location_id>')
def get_location(location_id):
    """Get a specific location by ID"""
    location = next((loc for loc in sample_locations if loc['id'] == location_id), None)
    
    if location:
        return jsonify(location)
    return jsonify({"error": "Location not found"}), 404

@app.route('/api/geocode')
def geocode():
    """
    Geocode a place name to coordinates using Nominatim
    """
    query = request.args.get('q', '')
    
    if not query:
        return jsonify({"error": "No query provided"}), 400
    
    try:
        # Use Nominatim geocoding API
        nominatim_url = "https://nominatim.openstreetmap.org/search"
        params = {
            'q': query,
            'format': 'json',
            'limit': 5,
            'addressdetails': 1
        }
        headers = {
            'User-Agent': 'GIS-Pro-App/1.0'  # Nominatim requires a user agent
        }
        
        response = requests.get(nominatim_url, params=params, headers=headers, timeout=10)
        
        if response.status_code != 200:
            return jsonify({"error": "Geocoding service unavailable"}), 503
        
        results = response.json()
        
        if not results:
            return jsonify([])
        
        # Format results for frontend
        formatted_results = []
        for result in results:
            formatted_results.append({
                'name': result.get('display_name', 'Unknown'),
                'lat': float(result.get('lat', 0)),
                'lng': float(result.get('lon', 0)),
                'type': result.get('type', 'place'),
                'importance': result.get('importance', 0),
                'address': result.get('address', {})
            })
        
        return jsonify(formatted_results)
        
    except Exception as e:
        print(f"Geocoding error: {e}")
        return jsonify({"error": "Geocoding failed"}), 500

@app.route('/api/search')
def search_locations():
    """Search current locations by name (deprecated - use /api/geocode for place search)"""
    query = request.args.get('q', '').lower()
    
    if not query:
        return jsonify([])
    
    results = [
        loc for loc in sample_locations 
        if query in loc['name'].lower() or query in loc['description'].lower()
    ]
    
    return jsonify(results)

@app.route('/api/nearby')
def get_nearby():
    """Get locations near a point"""
    try:
        lat = float(request.args.get('lat'))
        lng = float(request.args.get('lng'))
        radius = float(request.args.get('radius', 10))  # km
        
        # Simple distance calculation
        def distance(lat1, lon1, lat2, lon2):
            lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])
            dlon = lon2 - lon1
            dlat = lat2 - lat1
            a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
            c = 2 * asin(sqrt(a))
            km = 6371 * c
            return km
        
        nearby = [
            {**loc, 'distance': round(distance(lat, lng, loc['lat'], loc['lng']), 2)}
            for loc in sample_locations
        ]
        
        nearby = [loc for loc in nearby if loc['distance'] <= radius]
        nearby.sort(key=lambda x: x['distance'])
        
        return jsonify(nearby)
    except (TypeError, ValueError) as e:
        return jsonify({"error": "Invalid parameters"}), 400

@app.route('/api/stats')
def get_stats():
    """Get statistics about the data"""
    stats = {
        "total_locations": len(sample_locations),
        "by_type": {},
        "last_updated": datetime.now().isoformat()
    }
    
    for loc in sample_locations:
        loc_type = loc['type']
        stats['by_type'][loc_type] = stats['by_type'].get(loc_type, 0) + 1
    
    return jsonify(stats)

if __name__ == '__main__':
    app.run(debug=True, port=5000)
