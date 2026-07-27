import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';
import { City } from './city.js';
import { Car } from './car.js';
import { CameraController } from './camera.js';
import { Autopilot } from './autopilot.js';
import { TrafficSystem } from './traffic.js';
import { EntitySystem } from './entities.js';
import { NavigationSystem } from './navigation.js';

class SimulationManager {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.clock = new THREE.Clock();

        // Módulos
        this.city = null;
        this.car = null;
        this.cameraController = null;
        this.autopilot = null;

        // Entradas del Teclado
        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            handbrake: false
        };

        // Medidor de FPS
        this.fps = 0;
        this.frameCount = 0;
        this.lastFpsUpdate = 0;

        this.init();
    }

    init() {
        // 1. Crear Escena y Niebla Atmosférica
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0f172a); // Fondo azul marino oscuro
        // Niebla lineal para mejorar profundidad y rendimiento (oculta horizontes lejanos)
        this.scene.fog = new THREE.FogExp2(0x0f172a, 0.007);

        // 2. Crear Cámara Perspectiva
        this.camera = new THREE.PerspectiveCamera(
            60, 
            window.innerWidth / window.innerHeight, 
            0.1, 
            1000
        );

        // 3. Crear Renderizador WebGL
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limitar a 2x para FPS óptimos
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Sombras suavizadas de alta calidad
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping; // Mapeado de tonos cinematográfico
        this.renderer.toneMappingExposure = 1.0;
        this.container.appendChild(this.renderer.domElement);

        // 4. Luces Globales
        this.setupLighting();

        // 5. Instanciar Módulos de la Simulación
        // Inicializamos la Ciudad
        this.city = new City(this.scene);

        // Inicializamos el Coche en el carril inicial (cerca del primer waypoint, mirando al este)
        this.car = new Car(this.scene, -90.0, -102.5);
        this.car.angle = Math.PI / 2; // Mirando hacia +X (Este)

        // Inicializamos Controlador de Cámara
        this.cameraController = new CameraController(this.camera);

        // Inicializamos el Sistema de Señales y Semáforos
        this.trafficSystem = new TrafficSystem(this.scene);

        // Inicializamos el Sistema de Entidades Dinámicas (Peatones y Vehículos NPC)
        this.entitySystem = new EntitySystem(this.scene);
        this.entitySystem.setPlayerCar(this.car);

        // Inicializamos el Sistema de Navegación Autonoma A*
        this.navigationSystem = new NavigationSystem(this.scene, this.city);

        // Inicializamos el Piloto Automático (Pasando sistema de tráfico, entidades y navegación)
        this.autopilot = new Autopilot(this.scene, this.car, this.city, this.trafficSystem, this.entitySystem, this.navigationSystem);

        // Activar el piloto automático automáticamente al iniciar la simulación
        this.autopilot.activate();
        this.updateAutopilotUI(true);

        // 6. Configurar Oyentes de Eventos (Keyboard & UI)
        this.setupInputListeners();
        this.setupUIListeners();

        // 7. Evento Redimensionar Ventana
        window.addEventListener('resize', () => this.onWindowResize(), false);

        // 8. Iniciar Ciclo de Animación
        this.animate();
    }

    setupLighting() {
        // Luz Ambiental (Relleno suave azulado)
        const ambientLight = new THREE.AmbientLight(0x1e293b, 0.6);
        this.scene.add(ambientLight);

        // Luz de Sol (Direccional para sombras principales)
        const sunLight = new THREE.DirectionalLight(0xfffbeb, 1.2); // Luz cálida
        sunLight.position.set(50, 80, -30);
        sunLight.castShadow = true;
        
        // Configuración de resolución de sombras del sol
        sunLight.shadow.mapSize.width = 1024;
        sunLight.shadow.mapSize.height = 1024;
        sunLight.shadow.camera.near = 0.5;
        sunLight.shadow.camera.far = 250;
        
        // Área de cobertura de las sombras (suficiente para el área visible)
        const d = 120;
        sunLight.shadow.camera.left = -d;
        sunLight.shadow.camera.right = d;
        sunLight.shadow.camera.top = d;
        sunLight.shadow.camera.bottom = -d;
        sunLight.shadow.bias = -0.0005; // Mitigar artefactos de sombra
        
        this.scene.add(sunLight);
    }

    setupInputListeners() {
        const onKeyDown = (e) => {
            // Si el piloto automático está activo, las teclas WASD/Flechas lo desactivan por seguridad (intervención humana)
            if (this.autopilot.isActive && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
                this.deactivateAutopilotUI();
            }

            switch(e.code) {
                case 'KeyW':
                case 'ArrowUp':
                    this.keys.forward = true;
                    break;
                case 'KeyS':
                case 'ArrowDown':
                    this.keys.backward = true;
                    break;
                case 'KeyA':
                case 'ArrowLeft':
                    this.keys.left = true;
                    break;
                case 'KeyD':
                case 'ArrowRight':
                    this.keys.right = true;
                    break;
                case 'Space':
                    this.keys.handbrake = true;
                    break;
                case 'KeyC':
                    // Atajo de cámara
                    document.getElementById('cam-btn').click();
                    break;
                case 'KeyP':
                    // Atajo de piloto automático
                    document.getElementById('autopilot-btn').click();
                    break;
            }
        };

        const onKeyUp = (e) => {
            switch(e.code) {
                case 'KeyW':
                case 'ArrowUp':
                    this.keys.forward = false;
                    break;
                case 'KeyS':
                case 'ArrowDown':
                    this.keys.backward = false;
                    break;
                case 'KeyA':
                case 'ArrowLeft':
                    this.keys.left = false;
                    break;
                case 'KeyD':
                case 'ArrowRight':
                    this.keys.right = false;
                    break;
                case 'Space':
                    this.keys.handbrake = false;
                    break;
            }
        };

        window.addEventListener('keydown', onKeyDown, false);
        window.addEventListener('keyup', onKeyUp, false);
    }

    setupUIListeners() {
        const startBtn = document.getElementById('start-autopilot-btn');
        const stopBtn  = document.getElementById('stop-autopilot-btn');
        const camBtn   = document.getElementById('cam-btn');

        if (startBtn) {
            startBtn.addEventListener('click', () => {
                this.autopilot.activate();
                this.updateAutopilotUI(true);
            });
        }

        if (stopBtn) {
            stopBtn.addEventListener('click', () => {
                this.autopilot.deactivate();
                this.updateAutopilotUI(false);
            });
        }

        camBtn.addEventListener('click', () => {
            this.cameraController.toggleCamera();
            camBtn.textContent = this.cameraController.getModeName();
        });

        const nextDestBtn = document.getElementById('next-dest-btn');
        if (nextDestBtn) {
            nextDestBtn.addEventListener('click', () => {
                if (this.navigationSystem && this.autopilot) {
                    this.navigationSystem.selectNextDestination();
                    this.autopilot.waypoints = this.navigationSystem.calculateRouteWaypoints(this.car.mesh.position);
                    this.autopilot.currentWaypointIndex = 0;
                    this.autopilot.updateRouteVisual();
                }
            });
        }
    }

    updateAutopilotUI(active) {
        const startBtn = document.getElementById('start-autopilot-btn');
        const stopBtn  = document.getElementById('stop-autopilot-btn');
        if (startBtn && stopBtn) {
            if (active) {
                startBtn.classList.add('active');
                stopBtn.classList.remove('active');
            } else {
                startBtn.classList.remove('active');
                stopBtn.classList.add('active');
            }
        }
    }

    deactivateAutopilotUI() {
        if (this.autopilot.isActive) {
            this.autopilot.toggle(); // desactiva
            const btn = document.getElementById('autopilot-btn');
            btn.classList.remove('btn-autopilot');
            btn.classList.add('btn-manual');
            btn.textContent = 'PILOTO MANUAL';
        }
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    /**
     * Bucle principal de animación a 60 FPS
     */
    animate() {
        requestAnimationFrame(() => this.animate());

        // Medir delta de tiempo entre fotogramas (con límite superior para evitar saltos en tirones)
        let delta = this.clock.getDelta();
        if (delta > 0.1) delta = 0.1; 

        // 0. Actualizar Estado de Semáforos y Señales de Tránsito
        this.trafficSystem.update(delta);

        // 0b. Actualizar Entidades Dinámicas (Peatones y Vehículos NPC)
        this.entitySystem.update(delta, this.car);

        // 1. Actualizar Lógica de Piloto Autónomo (Sensores e inputs simulados)
        this.autopilot.update(delta);

        // 2. Actualizar Física del Coche (Usa inputs de teclado o de IA)
        this.car.update(this.keys, this.autopilot.controls, this.autopilot.isActive, delta);

        // 3. Actualizar Posición de Cámara (Suavizado de seguimiento)
        this.cameraController.update(this.car.mesh, delta);

        // 4. Renderizar Escena
        this.renderer.render(this.scene, this.camera);

        // 5. Actualizar Datos del HUD en tiempo real
        this.updateHUDValues();

        // 6. Monitoreo de FPS
        this.calculateFPS();
    }

    updateHUDValues() {
        // Velocidad en Km/h
        const speedVal = document.getElementById('speed-val');
        if (speedVal) {
            speedVal.textContent = this.car.getSpeedKmH();
        }

        // Marcha de transmisión
        const currentGear = this.car.transmissionState;
        ['P', 'D', 'R'].forEach(g => {
            const el = document.getElementById(`gear-${g}`);
            if (el) {
                if (g === currentGear) {
                    el.classList.add('active');
                } else {
                    el.classList.remove('active');
                }
            }
        });
    }

    calculateFPS() {
        this.frameCount++;
        const now = performance.now();
        if (now >= this.lastFpsUpdate + 1000) {
            this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
            
            const fpsDisplay = document.getElementById('fps-display');
            if (fpsDisplay) {
                fpsDisplay.textContent = `${this.fps} FPS`;
                
                // Alertar visualmente si cae por debajo de 35 FPS
                if (this.fps < 35) {
                    fpsDisplay.style.color = 'var(--accent-red)';
                } else if (this.fps < 50) {
                    fpsDisplay.style.color = '#eab308'; // amarillo
                } else {
                    fpsDisplay.style.color = 'var(--accent-green)';
                }
            }
            
            this.frameCount = 0;
            this.lastFpsUpdate = now;
        }
    }
}

// Iniciar aplicación cuando cargue la página
window.addEventListener('DOMContentLoaded', () => {
    new SimulationManager();
});
