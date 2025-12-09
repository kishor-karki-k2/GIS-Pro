# GIS Pro 🌍

**A beautiful, interactive mapping application that makes exploring the world a joy.**

Ever wanted to explore places around you with a gorgeous, intuitive interface? That's exactly what GIS Pro does. It's a modern web-based mapping platform with a sleek dark theme and glassmorphism design that looks great on both desktop and mobile.

## What Can You Do With It?

### Explore the Map
- Pan around the world and zoom into any location
- Switch between dark street maps, light maps, and satellite imagery
- Click on markers to learn about interesting locations
- Your map, your way – works beautifully on phones and desktops

### Find Places
- **Search anywhere** – Type any city, landmark, or address in the search box
- **Filter by type** – Parks, landmarks, infrastructure – pick what you're interested in
- **See what's nearby** – Locations cluster together when zoomed out, expand when you zoom in

### Get There
- Click any location to see its details
- Hit "Directions" to open Google Maps with turn-by-turn navigation
- Share cool places with friends using the share button

### Draw & Analyze
- Draw circles, polygons, and markers on the map
- Measure distances and areas
- Perform radius analysis to find what's within a certain distance

## Getting Started

### The Quick Way (Static Version)
Just open `index.html` in your browser. That's it! This version talks directly to OpenStreetMap APIs.

### The Full Way (With Flask Backend)

1. **Make sure you have Python 3.8+**

2. **Install what you need:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Fire it up:**
   ```bash
   python3 app.py
   ```

4. **Open your browser to:** `http://127.0.0.1:5000`

## How It Works

The app is pretty straightforward:

```
📁 GIS Project/
├── 🐍 app.py              → Flask backend (optional)
├── 📄 index.html          → Main page (works standalone!)
├── 📁 static/
│   ├── 📁 css/
│   │   ├── style.css      → Main styles
│   │   ├── mobile-pro.css → Mobile-specific styles
│   │   └── advanced-features.css
│   └── 📁 js/
│       ├── app.js         → Core application logic
│       └── advanced-features.js → Drawing tools, exports, etc.
├── 📁 templates/
│   └── index.html         → Flask version
└── 📁 data/
    └── sample_data.json   → Sample locations
```

## For Mobile Users 📱

The mobile version is designed to feel like a native app:
- **Full-screen map** – The map takes up the whole screen
- **Floating menu button** – Tap the purple button (bottom-left) to open the sidebar
- **No page zoom** – The page stays fixed, but you can still zoom the map
- **Touch-friendly** – Big buttons, easy to tap

## Cool Features

### 🔍 Smart Search
Start typing and watch suggestions appear. The search talks to OpenStreetMap's Nominatim service, so you can find anywhere in the world.

### 🎨 Multiple Map Styles
- **Dark** – Easy on the eyes, perfect for night-time exploration
- **Light** – Classic, clean look
- **Satellite** – See real imagery from above

### 📍 Zoom Prompt
When you first open the app, you'll see a prompt asking you to search for a location. This is intentional – we don't want to load the entire world's data at once!

### 📤 Export Your Map
Click the download button to save your current map view as a PNG image. Great for presentations or sharing on social media.

### 🌐 Click Logo to Refresh
Want to start over? Just click the GIS Pro logo or the globe icon to refresh the page.

## Tech Under the Hood

- **Leaflet.js** – The amazing open-source mapping library
- **OpenStreetMap** – Overpass API for location data, Nominatim for search
- **Flask** – Python backend (optional – the static version works without it)
- **CSS** – Custom dark theme with glassmorphism effects
- **No frameworks** – Pure vanilla JavaScript, no React/Vue/Angular needed

## Deploy to GitHub Pages

Want to share your map with the world? See `DEPLOY.md` for instructions on how to deploy to GitHub Pages in minutes.

## Things I'd Love to Add

- [ ] Save your favorite locations
- [ ] User accounts
- [ ] Offline mode
- [ ] More map styles
- [ ] Route planning
- [ ] Weather overlay
- [ ] Traffic layer

## Need Help?

### Map won't load?
- Check your internet connection – map tiles come from external servers
- Try refreshing the page
- Check the browser console (F12) for errors

### Search not working?
- Make sure you're connected to the internet
- The Nominatim API might be busy – try again in a moment

### Mobile view looks weird?
- Try force-refreshing (pull down or Ctrl+Shift+R)
- Make sure you're in portrait mode for best experience

## Credits

This project wouldn't exist without these amazing open-source projects:
- [Leaflet.js](https://leafletjs.com/) – The best mapping library out there
- [OpenStreetMap](https://www.openstreetmap.org/) – The map data that powers the world
- [CartoDB](https://carto.com/) – Beautiful basemap tiles
- [Font Awesome](https://fontawesome.com/) – Icons that make everything look better

---

**Built with ❤️ for map lovers everywhere.**

*Found a bug? Have an idea? Feel free to contribute!*
