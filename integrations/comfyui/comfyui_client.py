"""
ComfyUI API Client
==================

Cliente Python para interactuar con la API de ComfyUI.

Autor: Mi LibreChat
Versión: 1.0.0
Licencia: MIT
"""

import asyncio
import json
import os
import base64
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum
import aiohttp
import websockets
from datetime import datetime


class ModelType(Enum):
    """Tipos de modelos."""
    CHECKPOINT = "checkpoint"
    VAE = "vae"
    LORA = "lora"
    CONTROLNET = "controlnet"
    UPSCALE = "upscale"


@dataclass
class Model:
    """Modelo de ComfyUI."""
    name: str
    path: str
    model_type: ModelType
    size: Optional[str] = None


@dataclass
class GenerationResult:
    """Resultado de generación."""
    prompt_id: str
    status: str
    images: List[Dict[str, str]]
    error: Optional[str] = None


class ComfyUIClient:
    """
    Cliente para ComfyUI API.
    
    Permite:
    - Encolar workflows
    - Monitorear progreso
    - Listar modelos
    - Descargar resultados
    
    Ejemplo:
        client = ComfyUIClient(
            api_url="http://localhost:8188",
            ws_url="ws://localhost:8188"
        )
        
        # Encolar generación
        result = await client.generate(
            prompt="a beautiful sunset",
            model="sd_xl_base_1.0"
        )
    """
    
    def __init__(
        self,
        api_url: str = "http://localhost:8188",
        ws_url: str = "ws://localhost:8188",
        api_key: Optional[str] = None
    ):
        self.api_url = api_url.rstrip("/")
        self.ws_url = ws_url
        self.api_key = api_key
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
    
    async def __aenter__(self):
        """Context manager entry."""
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        await self.close()
    
    async def close(self):
        """Cierra conexiones."""
        if self.ws:
            await self.ws.close()
    
    # ===============================
    # System APIs
    # ===============================
    
    async def get_system_stats(self) -> Dict[str, Any]:
        """Obtiene estadísticas del sistema."""
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{self.api_url}/system_stats"
            ) as response:
                return await response.json()
    
    async def get_models(self, model_type: Optional[ModelType] = None) -> List[Model]:
        """Lista modelos disponibles."""
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{self.api_url}/object_info"
            ) as response:
                data = await response.json()
                
                models = []
                for model_name, model_info in data.items():
                    if model_type and model_type.value not in model_name.lower():
                        continue
                    
                    models.append(Model(
                        name=model_name,
                        path=model_info.get("filename", ""),
                        model_type=ModelType.MODEL if model_type else ModelType.CHECKPOINT
                    ))
                
                return models
    
    # ===============================
    # Queue APIs
    # ===============================
    
    async def queue_prompt(self, prompt_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Encola un prompt para ejecución.
        
        Args:
            prompt_data: Workflow con nodos y parámetros
            
        Returns:
            Información del prompt encolado
        """
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.api_url}/prompt",
                json={"prompt": prompt_data}
            ) as response:
                return await response.json()
    
    async def get_queue(self) -> Dict[str, Any]:
        """Obtiene estado de la cola."""
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{self.api_url}/queue"
            ) as response:
                return await response.json()
    
    async def clear_queue(self) -> Dict[str, Any]:
        """Limpia la cola."""
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.api_url}/queue",
                json={"clear": True}
            ) as response:
                return await response.json()
    
    # ===============================
    # History APIs
    # ===============================
    
    async def get_history(self, prompt_id: str) -> Dict[str, Any]:
        """Obtiene historial de un prompt."""
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{self.api_url}/history/{prompt_id}"
            ) as response:
                return await response.json()
    
    async def get_all_history(
        self, 
        limit: int = 100
    ) -> Dict[str, Any]:
        """Obtiene todo el historial."""
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{self.api_url}/history",
                params={"limit": limit}
            ) as response:
                return await response.json()
    
    # ===============================
    # Utilities
    # ===============================
    
    async def view_image(
        self,
        filename: str,
        subfolder: str = "",
        folder_type: str = "output"
    ) -> bytes:
        """Descarga una imagen."""
        params = {
            "filename": filename,
            "subfolder": subfolder,
            "type": folder_type
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{self.api_url}/view",
                params=params
            ) as response:
                return await response.read()
    
    async def get_history_images(
        self, 
        prompt_id: str
    ) -> List[Dict[str, str]]:
        """
        Extrae imágenes del historial.
        
        Args:
            prompt_id: ID del prompt
            
        Returns:
            Lista de imágenes con metadata
        """
        history = await self.get_history(prompt_id)
        
        if prompt_id not in history:
            return []
        
        outputs = history[prompt_id].get("outputs", {})
        images = []
        
        for node_id, node_output in outputs.items():
            if "images" in node_output:
                for image in node_output["images"]:
                    images.append({
                        "filename": image["filename"],
                        "subfolder": image["subfolder"],
                        "type": image["type"],
                        "node": node_id
                    })
        
        return images
    
    # ===============================
    # High-level Generation
    # ===============================
    
    async def generate(
        self,
        prompt: str,
        negative_prompt: str = "",
        model: str = "sd_xl_base_1.0",
        steps: int = 20,
        cfg: float = 7.0,
        sampler: str = "euler_ancestral",
        scheduler: str = "normal",
        seed: int = -1,
        width: int = 1024,
        height: int = 1024
    ) -> GenerationResult:
        """
        Genera una imagen con workflow simple.
        
        Args:
            prompt: Prompt positivo
            negative_prompt: Prompt negativo
            model: Modelo a usar
            steps: Pasos de sampling
            cfg: CFG scale
            sampler: Sampler a usar
            scheduler: Scheduler
            seed: Seed (-1 para random)
            width: Ancho de imagen
            height: Alto de imagen
            
        Returns:
            GenerationResult con imágenes
        """
        # Construir workflow
        workflow = self._build_text2image_workflow(
            prompt=prompt,
            negative_prompt=negative_prompt,
            model=model,
            steps=steps,
            cfg=cfg,
            sampler=sampler,
            scheduler=scheduler,
            seed=seed,
            width=width,
            height=height
        )
        
        # Encolar
        queue_result = await self.queue_prompt(workflow)
        prompt_id = queue_result["prompt_id"]
        
        # Esperar resultado
        return await self._wait_for_result(prompt_id)
    
    async def _wait_for_result(
        self, 
        prompt_id: str,
        timeout: int = 300
    ) -> GenerationResult:
        """Espera el resultado de un prompt."""
        start_time = asyncio.get_event_loop().time()
        
        while True:
            # Verificar timeout
            elapsed = asyncio.get_event_loop().time() - start_time
            if elapsed > timeout:
                return GenerationResult(
                    prompt_id=prompt_id,
                    status="timeout",
                    images=[],
                    error="Generation timed out"
                )
            
            # Obtener historial
            history = await self.get_history(prompt_id)
            
            if prompt_id in history:
                status = history[prompt_id].get("status", {})
                
                if status.get("completed", False):
                    images = await self.get_history_images(prompt_id)
                    return GenerationResult(
                        prompt_id=prompt_id,
                        status="success",
                        images=images
                    )
                
                if status.get("errored", False):
                    return GenerationResult(
                        prompt_id=prompt_id,
                        status="error",
                        images=[],
                        error=status.get("error_str", "Unknown error")
                    )
            
            # Esperar antes de siguiente check
            await asyncio.sleep(2)
    
    def _build_text2image_workflow(
        self,
        prompt: str,
        negative_prompt: str,
        model: str,
        steps: int,
        cfg: float,
        sampler: str,
        scheduler: str,
        seed: int,
        width: int,
        height: int
    ) -> Dict[str, Any]:
        """Construye workflow de text-to-image."""
        return {
            #Checkpoint Loader
            "1": {
                "inputs": {
                    "ckpt_name": f"{model}.safetensors"
                },
                "class_type": "CheckpointLoaderSimple"
            },
            
            # Positive Prompt
            "2": {
                "inputs": {
                    "text": prompt,
                    "clip": ["1", 0]
                },
                "class_type": "CLIPTextEncode"
            },
            
            # Negative Prompt
            "3": {
                "inputs": {
                    "text": negative_prompt,
                    "clip": ["1", 1]
                },
                "class_type": "CLIPTextEncode"
            },
            
            # Sampler
            "4": {
                "inputs": {
                    "model": ["1", 0],
                    "positive": ["2", 0],
                    "negative": ["3", 0],
                    "seed": seed if seed != -1 else random.randint(0, 2**32 - 1),
                    "steps": steps,
                    "cfg": cfg,
                    "sampler_name": sampler,
                    "scheduler": scheduler,
                    "denoise": 1.0
                },
                "class_type": "KSampler"
            },
            
            # VAE Decode
            "5": {
                "inputs": {
                    "samples": ["4", 0],
                    "vae": ["1", 2]
                },
                "class_type": "VAEDecode"
            },
            
            # Save Image
            "6": {
                "inputs": {
                    "images": ["5", 0],
                    "filename_prefix": f"librechat_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
                },
                "class_type": "SaveImage"
            }
        }


# Helper para seed random
import random

# Ejemplo de uso
if __name__ == "__main__":
    async def main():
        async with ComfyUIClient(
            api_url="http://localhost:8188",
            ws_url="ws://localhost:8188"
        ) as client:
            # Ver sistema
            stats = await client.get_system_stats()
            print(f"Sistema: {stats}")
            
            # Generar imagen
            result = await client.generate(
                prompt="a beautiful sunset over mountains, realistic",
                negative_prompt="ugly, low quality, blurry",
                model="sd_xl_base_1.0",
                steps=25
            )
            
            print(f"Estado: {result.status}")
            print(f"Imágenes: {len(result.images)}")
            
            for img in result.images:
                print(f"  - {img['filename']}")
    
    asyncio.run(main())
