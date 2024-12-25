class MapViewer {
    constructor() {
        this.map = null;
        this.startMarker = null;
        this.endMarker = null;
        this.routeLayer = null;
        this.backend_url = 'http://localhost:8000';

        // Initialize the map
        this.initializeMap();
        this.setupEventListeners();
    }

    initializeMap() {
        // Create map centered on Chennai with higher max zoom
        this.map = L.map('map', {
            zoomControl: true,
            maxZoom: 20,
            zoomSnap: 0.5,
            wheelDebounceTime: 100
        }).setView([13.0827, 80.2707], 15);

        // Add TomTom base layer with full details (roads, buildings, labels)
        L.tileLayer('https://api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?key=NIdq1YzsoPiR0rMdq3LY8PkpVWEww2Yy&tileSize=512&style=main&view=IN&language=en-GB', {
            attribution: '© TomTom',
            maxZoom: 20,
            tileSize: 512,
            zoomOffset: -1,
            retina: '@2x',
            detectRetina: true
        }).addTo(this.map);

        // Add TomTom Traffic Flow layer as overlay with reduced thickness
        L.tileLayer('https://api.tomtom.com/traffic/map/4/tile/flow/relative/{z}/{x}/{y}.png?key=NIdq1YzsoPiR0rMdq3LY8PkpVWEww2Yy&thickness=5', {
            maxZoom: 20,
            tileSize: 512,
            zoomOffset: -1,
            opacity: 0.6,  // Slightly reduced opacity
            retina: '@2x',
            detectRetina: true
        }).addTo(this.map);

        // Show default location (Chennai)
        this.showMapForCoordinates(13.0827, 80.2707, "Chennai");
    }

    setupEventListeners() {
        const searchInput = document.getElementById('searchInput');
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.searchLocation(e.target.value);
            }
        });
    }

    async searchLocation(query) {
        try {
            const response = await fetch(`${this.backend_url}/api/search?query=${encodeURIComponent(query)}`);
            if (response.ok) {
                const data = await response.json();
                this.showMapForCoordinates(
                    data.coordinates.lat,
                    data.coordinates.lon,
                    data.address
                );
            } else {
                this.setStatus("Location not found");
            }
        } catch (error) {
            this.setStatus(`Search error: ${error.message}`);
        }
    }

    generateRandomNearbyPoint(lat, lon, kmRadius = 2) {
        // 1 degree is approximately 111 kilometers
        const radiusInDegrees = kmRadius / 111.0;
        
        // Generate random offsets
        const dx = (Math.random() - 0.5) * 2 * radiusInDegrees;
        const dy = (Math.random() - 0.5) * 2 * radiusInDegrees;
        
        return [lat + dx, lon + dy];
    }

    async getTrafficAdjustedTime(coordinates) {
        try {
            const start = coordinates[0];
            const end = coordinates[coordinates.length - 1];
            const routePoints = `${start[1]},${start[0]}:${end[1]},${end[0]}`;
            
            console.log("Requesting route for:", routePoints);
            
            // Remove the alternatives parameter
            const response = await fetch(
                `https://api.tomtom.com/routing/1/calculateRoute/${routePoints}/json?key=NIdq1YzsoPiR0rMdq3LY8PkpVWEww2Yy&traffic=true&travelMode=car&routeType=fastest`
            );
            
            if (response.ok) {
                const data = await response.json();
                console.log("Route data:", data);
                
                // Return array with single route for consistency
                return [{
                    time: data.routes[0].summary.travelTimeInSeconds,
                    trafficDelay: data.routes[0].summary.trafficDelayInSeconds,
                    length: data.routes[0].summary.lengthInMeters,
                    coordinates: data.routes[0].legs[0].points.map(point => [point.latitude, point.longitude])
                }];
            }
            console.log("Response not OK:", await response.text());
            return null;
        } catch (error) {
            console.error("Error getting traffic data:", error);
            return null;
        }
    }

    async updateRoute() {
        if (!this.startMarker || !this.endMarker) return;

        const start = this.startMarker.getLatLng();
        const end = this.endMarker.getLatLng();

        try {
            // Remove existing routes
            if (this.routeLayer) {
                this.map.removeLayer(this.routeLayer);
            }

            console.log("Start:", start, "End:", end);

            // Get traffic-aware routes
            const routes = await this.getTrafficAdjustedTime([
                [start.lng, start.lat],
                [end.lng, end.lat]
            ]);

            if (routes && routes.length > 0) {
                // Create a feature collection for all routes
                const features = routes.map((routeInfo, index) => ({
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: routeInfo.coordinates.map(coord => [coord[1], coord[0]])
                    },
                    properties: {
                        routeIndex: index + 1,
                        trafficTime: Math.round(routeInfo.time / 60),
                        delay: Math.round(routeInfo.trafficDelay / 60),
                        distance: Math.round(routeInfo.length / 1000 * 10) / 10
                    }
                }));

                // Define colors for different routes
                const routeColors = ['#0000FF', '#FF0000', '#00FF00'];

                // Add routes to map with popups
                this.routeLayer = L.geoJSON({
                    type: 'FeatureCollection',
                    features: features
                }, {
                    style: (feature) => ({
                        color: routeColors[feature.properties.routeIndex - 1] || '#0000FF',
                        weight: 6,
                        opacity: 0.8
                    }),
                    onEachFeature: (feature, layer) => {
                        const props = feature.properties;
                        layer.bindPopup(
                            `<b>Route ${props.routeIndex}</b><br>` +
                            `Distance: ${props.distance} km<br>` +
                            `Travel time: ${props.trafficTime} min<br>` +
                            `Traffic delay: ${props.delay} min`
                        );
                    }
                }).addTo(this.map);

                console.log("Routes added to map");
            } else {
                console.log("No route info returned");
            }
        } catch (error) {
            console.error("Error updating routes:", error);
        }
    }

    showMapForCoordinates(lat, lon, locationName) {
        try {
            // Center map on location
            this.map.setView([lat, lon], 15);

            // Remove existing markers
            if (this.startMarker) this.map.removeLayer(this.startMarker);
            if (this.endMarker) this.map.removeLayer(this.endMarker);
            if (this.routeLayer) this.map.removeLayer(this.routeLayer);

            // Generate random points for markers
            const startPoint = this.generateRandomNearbyPoint(lat, lon);
            const endPoint = this.generateRandomNearbyPoint(lat, lon);

            // Create markers
            this.startMarker = L.marker(startPoint, {
                draggable: true,
                icon: L.icon({
                    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
                    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41],
                    popupAnchor: [1, -34],
                    shadowSize: [41, 41]
                })
            }).addTo(this.map);

            this.endMarker = L.marker(endPoint, {
                draggable: true,
                icon: L.icon({
                    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41],
                    popupAnchor: [1, -34],
                    shadowSize: [41, 41]
                })
            }).addTo(this.map);

            // Add drag event listeners
            this.startMarker.on('dragend', () => this.updateRoute());
            this.endMarker.on('dragend', () => this.updateRoute());

            // Draw initial route
            this.updateRoute();

            this.setStatus(`Viewing: ${locationName}`);
        } catch (error) {
            this.setStatus(`Error: ${error.message}`);
            console.error("Error:", error);
        }
    }

    setStatus(message) {
        document.getElementById('statusLabel').textContent = message;
    }
}

// Initialize the application when the page loads
window.addEventListener('load', () => {
    new MapViewer();
}); 