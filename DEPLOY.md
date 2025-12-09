# Deploying to GitHub Pages

This project has been refactored to run as a fully static application, meaning it can be hosted directly on GitHub Pages without a backend server (like Flask).

## Steps to Deploy

1.  **Initialize Git Repository** (if not already done):
    ```bash
    git init
    git add .
    git commit -m "Initial commit of static GIS app"
    ```

2.  **Create a Repository on GitHub**:
    - Go to [GitHub.com](https://github.com) and create a new repository.
    - Do NOT initialize with README, .gitignore, or License (since you have them locally).

3.  **Push to GitHub**:
    ```bash
    git checkbox remote add origin <your-github-repo-url>
    git branch -M main
    git push -u origin main
    ```

4.  **Enable GitHub Pages**:
    - Go to your repository **Settings**.
    - Click **Pages** in the left sidebar.
    - Under **Source**, select **Deploy from a branch**.
    - Select **main** branch and **/** (root) folder.
    - Click **Save**.

5.  **View Your Site**:
    - GitHub will give you a URL (e.g., `https://yourusername.github.io/your-repo/`).
    - Wait a minute or two for the deployment to finish.

## What Changed?

- **Frontend-First**: The application logic (searching, fetching locations) was moved from Python (`app.py`) to JavaScript (`app.js`).
- **Direct API Calls**: The app now talks directly to OpenStreetMap APIs (Overpass & Nominatim) instead of going through a local proxy.
- **Static Files**: `index.html` is now in the root directory and uses relative paths for CSS/JS.

## Local Testing

To test the static build locally, you can run:
```bash
python3 -m http.server 8000
```
Then open `http://localhost:8000` in your browser.
