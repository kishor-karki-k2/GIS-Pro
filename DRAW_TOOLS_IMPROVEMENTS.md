# Draw Tools Icon Visibility Improvements

## Changes Made

### 1. Draw Tool Icons (Polyline, Polygon, Rectangle, Circle, Marker)
**File:** `static/css/advanced-features.css`

**Improvements:**
- Applied `filter: brightness(0) invert(1)` to convert dark icons to white
- Added proper contrast for visibility on dark glassmorphic backgrounds
- Enhanced hover states that revert the filter for visual feedback
- Added scale transform on hover for better interactivity

**CSS Changes:**
```css
.leaflet-draw-toolbar a {
    filter: brightness(0) invert(1);
}

.leaflet-draw-toolbar a:hover {
    filter: brightness(1) invert(0);
    transform: scale(1.05);
}
```

### 2. Edit & Delete Buttons
**File:** `static/css/advanced-features.css`

**Improvements:**
- Enhanced background with `rgba(255, 255, 255, 0.15)` for better visibility
- Thicker borders (2px) with increased opacity
- Increased icon contrast with `contrast(1.5)`
- Added subtle glow effects:
  - Blue glow for Edit button
  - Red glow for Delete button
- Enhanced hover states:
  - Larger scale (1.1x)
  - Brighter glow effects
  - Color-coded: Blue for Edit, Red for Delete

**CSS Changes:**
```css
.leaflet-draw-edit-edit a,
.leaflet-draw-edit-remove a {
    background-color: rgba(255, 255, 255, 0.15) !important;
    border: 2px solid rgba(255, 255, 255, 0.3) !important;
    filter: brightness(0) invert(1) contrast(1.5);
}

.leaflet-draw-edit-edit a {
    box-shadow: 0 0 10px rgba(66, 133, 244, 0.3);
}

.leaflet-draw-edit-remove a {
    box-shadow: 0 0 10px rgba(244, 67, 54, 0.3);
}
```

## Testing

To verify the improvements:
1. Refresh the page (Cmd+Shift+R for hard refresh)
2. Click the "Draw Tools" button
3. Verify that all draw tool icons are clearly visible
4. Click the Edit or Delete buttons to verify they are visible
5. Hover over icons to see the enhanced hover effects

## Result

All draw tool icons are now highly visible with:
- ✅ Clear white icons on dark backgrounds
- ✅ Strong contrast and borders
- ✅ Visual feedback on hover
- ✅ Color-coded glow effects for Edit (blue) and Delete (red)
- ✅ Smooth transitions and animations
