from fastapi import APIRouter, HTTPException, WebSocket
from typing import Dict, List
import httpx
from .config import settings
import asyncio
from datetime import datetime
import json

router = APIRouter()
traffic_cache = {}
last_update = {}
active_connections: List[WebSocket] = []

@router.websocket("/ws/traffic")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            try:
                # Simple ping-pong to keep connection alive
                message = await websocket.receive_text()
                if message == "ping":
                    await websocket.send_text("pong")
                    
            except Exception as e:
                print(f"WebSocket error: {e}")
                break
                
    except Exception as e:
        print(f"WebSocket connection error: {e}")
    finally:
        try:
            await websocket.close()
        except:
            pass

async def get_traffic_data(lat: float, lon: float) -> Dict:
    """Fetch traffic data from TomTom API"""
    try:
        cache_key = f"{lat},{lon}"
        current_time = datetime.now()
        
        # Check cache
        if (cache_key in traffic_cache and cache_key in last_update and 
            (current_time - last_update[cache_key]).seconds < settings.UPDATE_INTERVAL):
            return traffic_cache[cache_key]
        
        # Increase the radius to cover more roads (approximately 2-3km)
        radius = 0.03  # Increased from 0.01 to 0.03
        bbox = f"{lat-radius},{lon-radius},{lat+radius},{lon+radius}"
        url = "https://api.tomtom.com/traffic/services/4/flowSegmentData/relative/10/json"
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params={
                "key": settings.TOMTOM_API_KEY,
                "bbox": bbox,
                "unit": "MPH",
                "zoom": 15,  # Added zoom parameter
                "thickness": 8  # Added thickness parameter
            })
            
            if response.status_code != 200:
                print(f"TomTom API Error: {response.text}")
                return {"flowSegmentData": []}
            
            data = response.json()
            traffic_cache[cache_key] = data
            last_update[cache_key] = current_time
            return data
            
    except Exception as e:
        print(f"Error fetching traffic data: {str(e)}")
        return {"flowSegmentData": []}

async def send_traffic_updates(websocket: WebSocket):
    """Send traffic updates to connected clients"""
    for city, coords in settings.CITIES.items():
        try:
            traffic_data = await get_traffic_data(*coords)
            await websocket.send_json({
                "city": city,
                "traffic": traffic_data
            })
        except Exception as e:
            print(f"Error sending traffic update for {city}: {e}")

@router.get("/api/search")
async def search_location(query: str):
    """Search for a location using TomTom's Search API"""
    url = f"https://api.tomtom.com/search/2/search/{query}.json"
    
    async with httpx.AsyncClient() as client:
        response = await client.get(url, params={
            "key": settings.TOMTOM_API_KEY,
            "limit": 1
        })
        
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, 
                              detail="Search failed")
        
        data = response.json()
        if not data['results']:
            raise HTTPException(status_code=404, detail="Location not found")
        
        result = data['results'][0]
        return {
            "coordinates": {
                "lat": result['position']['lat'],
                "lon": result['position']['lon']
            },
            "address": result['address'].get('freeformAddress', query)
        }
