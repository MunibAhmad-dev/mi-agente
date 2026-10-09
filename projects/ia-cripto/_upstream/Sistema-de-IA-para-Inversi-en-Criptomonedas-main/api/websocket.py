"""
🚀 WebSocket Manager
====================
Servidor WebSocket para datos en tiempo real
"""

import asyncio
import json
from datetime import datetime
from typing import Dict, Set
import websockets
from websockets.server import WebSocketServerProtocol
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class WebSocketManager:
    """Gestor de conexiones WebSocket"""
    
    def __init__(self, host: str = "0.0.0.0", port: int = 8765):
        self.host = host
        self.port = port
        self.clients: Set[WebSocketServerProtocol] = set()
        self.subscriptions: Dict[str, Set[str]] = {}  # client_id -> symbols
        self.running = False
    
    async def register_client(self, websocket: WebSocketServerProtocol):
        """Registrar nuevo cliente"""
        self.clients.add(websocket)
        client_id = id(websocket)
        self.subscriptions[client_id] = set()
        logger.info(f"Client connected: {client_id}. Total: {len(self.clients)}")
    
    def unsubscribe_client(self, websocket: WebSocketServerProtocol):
        """Desregistrar cliente"""
        self.clients.remove(websocket)
        client_id = id(websocket)
        if client_id in self.subscriptions:
            del self.subscriptions[client_id]
        logger.info(f"Client disconnected. Total: {len(self.clients)}")
    
    async def subscribe(self, websocket: WebSocketServerProtocol, symbols: list):
        """Suscribir a símbolos"""
        client_id = id(websocket)
        if client_id not in self.subscriptions:
            self.subscriptions[client_id] = set()
        self.subscriptions[client_id].update(symbols)
        await websocket.send(json.dumps({
            "type": "subscribed",
            "symbols": list(self.subscriptions[client_id])
        }))
    
    async def unsubscribe(self, websocket: WebSocketServerProtocol, symbols: list):
        """Desuscribir símbolos"""
        client_id = id(websocket)
        if client_id in self.subscriptions:
            self.subscriptions[client_id] -= set(symbols)
        await websocket.send(json.dumps({
            "type": "unsubscribed",
            "symbols": symbols
        }))
    
    async def broadcast_ticker(self, symbol: str, data: dict):
        """Broadcast ticker a clientes suscritos"""
        if not self.clients:
            return
        
        message = {
            "type": "ticker",
            "symbol": symbol,
            "data": data,
            "timestamp": datetime.now().isoformat()
        }
        
        # Enviar solo a clientes suscritos
        disconnected = set()
        for client in self.clients:
            client_id = id(client)
            subscribed = self.subscriptions.get(client_id, set())
            
            if not subscribed or symbol in subscribed:
                try:
                    await client.send(json.dumps(message))
                except Exception as e:
                    logger.error(f"Error sending to client: {e}")
                    disconnected.add(client)
        
        for client in disconnected:
            self.unsubscribe_client(client)
    
    async def broadcast_trade(self, trade: dict):
        """Broadcast trade ejecutado"""
        message = {
            "type": "trade",
            "data": trade,
            "timestamp": datetime.now().isoformat()
        }
        
        await self.broadcast(json.dumps(message))
    
    async def broadcast(self, message: str):
        """Broadcast a todos los clientes"""
        if not self.clients:
            return
        
        disconnected = set()
        for client in self.clients:
            try:
                await client.send(message)
            except Exception:
                disconnected.add(client)
        
        for client in disconnected:
            self.unsubscribe_client(client)
    
    async def handle_client(self, websocket: WebSocketServerProtocol):
        """Manejar mensajes del cliente"""
        await self.register_client(websocket)
        
        try:
            async for message in websocket:
                data = json.loads(message)
                
                msg_type = data.get("type")
                
                if msg_type == "subscribe":
                    await self.subscribe(websocket, data.get("symbols", []))
                
                elif msg_type == "unsubscribe":
                    await self.unsubscribe(websocket, data.get("symbols", []))
                
                elif msg_type == "ping":
                    await websocket.send(json.dumps({"type": "pong"}))
                
                else:
                    logger.warning(f"Unknown message type: {msg_type}")
        
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.unsubscribe_client(websocket)
    
    async def start(self):
        """Iniciar servidor WebSocket"""
        self.running = True
        logger.info(f"Starting WebSocket server on ws://{self.host}:{self.port}")
        
        async with websockets.serve(self.handle_client, self.host, self.port):
            await asyncio.Future()  # Run forever
    
    def stop(self):
        """Detener servidor"""
        self.running = False
        logger.info("WebSocket server stopped")


# Singleton instance
ws_manager = WebSocketManager()


# Funciones helper para integración con FastAPI
async def broadcast_market_data(symbol: str, data: dict):
    """Broadcast datos de mercado desde anywhere"""
    await ws_manager.broadcast_ticker(symbol, data)


async def broadcast_trade_executed(trade: dict):
    """Broadcast trade ejecutado"""
    await ws_manager.broadcast_trade(trade)


if __name__ == "__main__":
    # Run standalone
    asyncio.run(ws_manager.start())