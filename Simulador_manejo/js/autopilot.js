import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';

export class Autopilot {
    constructor(scene, car, city, trafficSystem = null, entitySystem = null, navigationSystem = null) {
        this.scene = scene;
        this.car = car;
        this.city = city;
        this.trafficSystem = trafficSystem;
        this.entitySystem  = entitySystem;
        this.navigationSystem = navigationSystem;
        this.isActive = false;

        // Lógica de Semáforos y Señales de Tránsito
        this.currentSpeedLimit = 50;
        this.stopTimer = 0.0;
        this.isStoppedAtStop = false;
        this.activeStopSign = null;
        this.detectedSignInfo = { type: 'NONE', value: null, lightState: null, desc: 'Límite estándar de la vía' };

        // ── Estado del sistema de detección de entidades y navegación ─────────
        this.safeFollowDistance = 14.0;
        this.sensorData = { center: 30, centerLeft: 30, centerRight: 30, left: 30, right: 30, rearLeft: 30, rearRight: 30 };
        this.nearestEntityType = 'NONE';
        this.laneChangeActive   = false;
        this.laneChangeCooldown = 0.0;
        this.blockedTimeCounter = 0.0;
        this._pedStopHeld = false; // Histéresis peatonal: mantiene parada hasta que el paso esté libre
        
        // Configuración de Sensores LIDAR (frente centro/izq/der, izq, der, retro-izq, retro-der)
        this.raycasters = {
            center:      new THREE.Raycaster(),
            centerLeft:  new THREE.Raycaster(),
            centerRight: new THREE.Raycaster(),
            left:        new THREE.Raycaster(),
            right:       new THREE.Raycaster(),
            rearLeft:    new THREE.Raycaster(),
            rearRight:   new THREE.Raycaster()
        };
        this.sensorRange = 30.0;

        // Elementos visuales de los rayos sensores (láseres cian/rojos)
        this.sensorHelpers = {
            center: null,
            left: null,
            right: null,
            rearLeft: null,
            rearRight: null
        };
        this.createSensorHelpers();

        // Configuración del Piloto Automático por Ruta (Waypoints)
        if (this.navigationSystem) {
            this.waypoints = this.navigationSystem.calculateRouteWaypoints(this.car.mesh.position);
        } else {
            this.waypoints = this.generateWaypoints();
        }
        this.currentWaypointIndex = 0;
        this.waypointThreshold = 8.0;
        // Controles de salida hacia el coche
        this.controls = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            handbrake: false
        };
    }

    createSensorHelpers() {
        const materialGreen = new THREE.LineBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.8 });
        
        const createLine = () => {
            const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1)];
            const geo = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geo, materialGreen);
            line.visible = false; // Solo visibles si el piloto está activo o para debug visual
            this.scene.add(line);
            return line;
        };

        this.sensorHelpers.center = createLine();
        this.sensorHelpers.left = createLine();
        this.sensorHelpers.right = createLine();
        this.sensorHelpers.rearLeft = createLine();
        this.sensorHelpers.rearRight = createLine();
    }

    generateWaypoints() {
        // Red de nodos en coordenadas Y = 0
        // Calles en X, Z = [-100, -50, 0, 50, 100]
        return [
            // Eje Z = -100, Conduciendo hacia el Este (+X), carril a Z = -102.5
            new THREE.Vector3(-95.0, 0.05, -102.5),
            new THREE.Vector3(-50.0, 0.05, -102.5),
            new THREE.Vector3(0.0, 0.05, -102.5),
            new THREE.Vector3(50.0, 0.05, -102.5),
            new THREE.Vector3(97.5, 0.05, -102.5),
            
            // Eje X = 100, Conduciendo hacia el Norte (+Z), carril a X = 102.5
            new THREE.Vector3(102.5, 0.05, -97.5),
            new THREE.Vector3(102.5, 0.05, -50.0),
            new THREE.Vector3(102.5, 0.05, -2.5),
            
            // Eje Z = 0, Conduciendo hacia el Oeste (-X), carril a Z = 2.5
            new THREE.Vector3(97.5, 0.05, 2.5),
            new THREE.Vector3(50.0, 0.05, 2.5),
            new THREE.Vector3(2.5, 0.05, 2.5),
            
            // Eje X = 0, Conduciendo hacia el Norte (+Z), carril a X = 2.5
            new THREE.Vector3(2.5, 0.05, 7.5),
            new THREE.Vector3(2.5, 0.05, 50.0),
            new THREE.Vector3(2.5, 0.05, 97.5),
            
            // Eje Z = 100, Conduciendo hacia el Oeste (-X), carril a Z = 102.5
            new THREE.Vector3(-2.5, 0.05, 102.5),
            new THREE.Vector3(-50.0, 0.05, 102.5),
            new THREE.Vector3(-97.5, 0.05, 102.5),
            
            // Eje X = -100, Conduciendo hacia el Sur (-Z), carril a X = -102.5
            new THREE.Vector3(-102.5, 0.05, 97.5),
            new THREE.Vector3(-102.5, 0.05, 50.0),
            new THREE.Vector3(-102.5, 0.05, 0.0),
            new THREE.Vector3(-102.5, 0.05, -50.0),
            new THREE.Vector3(-102.5, 0.05, -97.5),
        ];
    }

    toggle() {
        this.isActive = !this.isActive;
        
        // Mostrar u ocultar láseres de sensores según modo
        const showSensors = this.isActive;
        if (this.sensorHelpers.center) this.sensorHelpers.center.visible = showSensors;
        if (this.sensorHelpers.left) this.sensorHelpers.left.visible = showSensors;
        if (this.sensorHelpers.right) this.sensorHelpers.right.visible = showSensors;
        if (this.sensorHelpers.rearLeft) this.sensorHelpers.rearLeft.visible = showSensors;
        if (this.sensorHelpers.rearRight) this.sensorHelpers.rearRight.visible = showSensors;

        if (!this.isActive) {
            this.resetControls();
        }

        return this.isActive;
    }

    activate() {
        if (!this.isActive) {
            this.toggle();
        }
        return true;
    }

    deactivate() {
        if (this.isActive) {
            this.toggle();
        }
        return false;
    }

    resetControls() {
        this.controls.forward = false;
        this.controls.backward = false;
        this.controls.left = false;
        this.controls.right = false;
        this.controls.handbrake = false;
    }

    /**
     * Actualiza sensores y calcula controles de conducción autónoma
     */
    update(delta) {
        // 1. Ejecutar Raycasting (Lectura de sensores LIDAR)
        this.updateSensors();

        // Actualizar la interfaz HUD con los valores de los sensores y señales
        this.updateHUD();

        // 2. Si el piloto automático está inactivo, no hacemos steering autónomo
        if (!this.isActive) return;

        const carPos = this.car.mesh.position;

        // 2b. Lógica de Navegación GPS (Baliza, Llegada a Destino y Recálculo por Vía Bloqueada)
        if (this.navigationSystem) {
            this.navigationSystem.animateBeacon(delta);

            const dest = this.navigationSystem.targetDestination;
            const distToDest = carPos.distanceTo(new THREE.Vector3(dest.x, 0, dest.z));

            // Llegada al Destino
            if (distToDest < 8.0 && this.currentWaypointIndex >= this.waypoints.length - 1) {
                this.navigationSystem.isArrived = true;
                this.controls.forward   = false;
                this.controls.backward  = false;
                this.controls.handbrake = true;
                return;
            }

            // Detección de Vía Bloqueada u Obstáculo Permanente
            if (this.sensorData.center < 5.0 && this.car.speed < 0.2 && !this.isStoppedAtStop) {
                this.blockedTimeCounter += delta;
                if (this.blockedTimeCounter > 3.0) {
                    this.waypoints = this.navigationSystem.markEdgeBlockedAndRecalculate(carPos);
                    this.currentWaypointIndex = 0;
                    this.blockedTimeCounter = 0.0;
                }
            } else {
                this.blockedTimeCounter = Math.max(0, this.blockedTimeCounter - delta);
            }
        }

        // 3. Algoritmo de Seguimiento de Ruta (Waypoints)
        let targetWP = this.waypoints[this.currentWaypointIndex];

        // Verificar si hemos alcanzado el waypoint actual
        const distToWP = carPos.distanceTo(targetWP);
        if (distToWP < this.waypointThreshold) {
            if (this.currentWaypointIndex < this.waypoints.length - 1) {
                this.currentWaypointIndex++;
            } else if (!this.navigationSystem) {
                this.currentWaypointIndex = 0; // Circuito cerrado si no hay sistema de navegación A*
            }
            targetWP = this.waypoints[this.currentWaypointIndex];
        }

        // Vector dirección al objetivo
        const toTarget = new THREE.Vector3().subVectors(targetWP, carPos);
        
        // Calcular ángulo objetivo en el plano X-Z
        const targetAngle = Math.atan2(toTarget.x, toTarget.z);
        
        // Diferencia entre el ángulo del coche y el ángulo objetivo
        let angleDiff = targetAngle - this.car.angle;
        
        // Normalizar diferencia angular a [-PI, PI]
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

        // 4. Lógica de Dirección Autónoma (Giro proporcional)
        this.controls.left = false;
        this.controls.right = false;

        const steerDeadzone = 0.04; // Pequeña zona muerta para evitar oscilación rápida
        if (angleDiff > steerDeadzone) {
            this.controls.left = true;
        } else if (angleDiff < -steerDeadzone) {
            this.controls.right = true;
        }

        // 5. Detección previa de peatones en calzada o pasos de cebra por delante del vehículo
        let pedestrianStop = false;
        if (this.entitySystem && this.entitySystem._pedestrians) {
            const forwardDir = new THREE.Vector3(0, 0, 1).applyQuaternion(this.car.mesh.quaternion).normalize();
            for (const ped of this.entitySystem._pedestrians) {
                const pedPos = ped.group.position;
                const toPed = new THREE.Vector3().subVectors(pedPos, carPos);
                const forwardDist = toPed.dot(forwardDir);
                const perpDist = Math.abs(-toPed.x * forwardDir.z + toPed.z * forwardDir.x);

                // Distinguir peatones en paso de cebra vs acera
                const isCrosswalkPed = ped.route && ped.route.axis && ped.route.axis.startsWith('crosswalk');

                // Zona de detección más amplia en pasos de cebra (prioridad absoluta)
                const maxCheckDist = isCrosswalkPed ? 22.0 : 10.0;
                const maxPerpDist  = isCrosswalkPed ?  6.0 :  2.2;

                if (forwardDist > 0.5 && forwardDist < maxCheckDist && perpDist < maxPerpDist) {
                    pedestrianStop = true;
                    this.nearestEntityType = 'PEDESTRIAN';
                    break;
                }
            }
        }

        // Histéresis: mantener la parada hasta que el peatón haya despejado la zona completamente
        if (!pedestrianStop && this._pedStopHeld) {
            // Verificar que realmente no hay ningún peatón en zona ampliada antes de liberar
            let stillBlocked = false;
            if (this.entitySystem && this.entitySystem._pedestrians) {
                const forwardDir = new THREE.Vector3(0, 0, 1).applyQuaternion(this.car.mesh.quaternion).normalize();
                for (const ped of this.entitySystem._pedestrians) {
                    const pedPos = ped.group.position;
                    const toPed = new THREE.Vector3().subVectors(pedPos, carPos);
                    const forwardDist = toPed.dot(forwardDir);
                    const perpDist = Math.abs(-toPed.x * forwardDir.z + toPed.z * forwardDir.x);
                    const isCrosswalkPed = ped.route && ped.route.axis && ped.route.axis.startsWith('crosswalk');
                    // Zona de liberación más estrecha para asegurar que cruzó completamente
                    const clearDist = isCrosswalkPed ? 8.0  : 4.0;
                    const clearPerp = isCrosswalkPed ? 3.5  : 2.0;
                    if (forwardDist > 0.5 && forwardDist < clearDist && perpDist < clearPerp) {
                        stillBlocked = true;
                        break;
                    }
                }
            }
            if (stillBlocked) pedestrianStop = true;
        }
        this._pedStopHeld = pedestrianStop;

        // 5b. Gestión de Señales de Tránsito, Semáforos y Peatones
        let baseSpeed = this.currentSpeedLimit / 3.6; // Convertir km/h a m/s
        let trafficSpeed = baseSpeed;

        this.detectedSignInfo = { type: 'NONE', value: null, lightState: null, desc: 'Límite estándar de la vía' };

        if (pedestrianStop) {
            trafficSpeed = 0;
            this.detectedSignInfo = { type: 'PEDESTRIAN', desc: 'Peatón cruzando - Alto total en paso peatonal' };
        } else {
            const detection = this.detectTrafficElement();
            if (detection) {
                const { element, distance } = detection;
                this.detectedSignInfo.type = element.type;

                if (element.type === 'LIMIT') {
                    this.detectedSignInfo.value = element.value;
                    this.detectedSignInfo.desc = `Límite de velocidad: ${element.value} km/h`;
                    
                    if (distance < 5.0) {
                        this.currentSpeedLimit = element.value;
                        baseSpeed = element.value / 3.6;
                        trafficSpeed = baseSpeed;
                    }
                } else if (element.type === 'CEDA') {
                    this.detectedSignInfo.desc = 'Ceda el Paso - Desacelerando';
                    trafficSpeed = Math.min(trafficSpeed, 12.0 / 3.6);
                } else if (element.type === 'STOP') {
                    this.detectedSignInfo.desc = 'Alto de STOP Detectado';
                    
                    if (!element.processed) {
                        trafficSpeed = 0;
                        if (this.car.speed < 0.25) {
                            this.isStoppedAtStop = true;
                            this.activeStopSign = element;
                        }
                    }
                } else if (element.type === 'LIGHT') {
                    this.detectedSignInfo.lightState = element.state;
                    this.detectedSignInfo.desc = `Semáforo en aproximación: ${element.state === 'RED' ? 'ALTO' : element.state === 'YELLOW' ? 'PRECAUCIÓN' : 'SIGA'}`;

                    if (element.state === 'RED') {
                        trafficSpeed = 0;
                    } else if (element.state === 'YELLOW') {
                        if (distance > 8.0) {
                            trafficSpeed = 0;
                        } else {
                            trafficSpeed = baseSpeed;
                        }
                    } else if (element.state === 'GREEN') {
                        trafficSpeed = baseSpeed;
                    }
                }
            }
        }

        // Si estamos ejecutando la detención obligatoria del STOP
        if (this.isStoppedAtStop) {
            trafficSpeed = 0;
            this.stopTimer += delta;
            this.detectedSignInfo.desc = `Esperando en STOP... (${(1.5 - this.stopTimer).toFixed(1)}s)`;
            
            if (this.stopTimer >= 1.5) {
                if (this.activeStopSign) {
                    this.activeStopSign.processed = true;
                    this.activeStopSign.cooldown = 5.0;
                }
                this.isStoppedAtStop = false;
                this.stopTimer = 0;
                this.activeStopSign = null;
            }
        }

        // 6. Ajustar velocidad en curvas
        let finalTargetSpeed = trafficSpeed;
        const absAngleDiff = Math.abs(angleDiff);
        if (absAngleDiff > 0.4) {
            finalTargetSpeed = Math.min(finalTargetSpeed, 8.0);
        } else if (absAngleDiff > 0.15) {
            finalTargetSpeed = Math.min(finalTargetSpeed, 12.0);
        }

        // 7. Manejo Avanzado de Obstáculos Dinámicos y Distancia de Seguridad
        this.laneChangeCooldown = Math.max(0, this.laneChangeCooldown - delta);

        const frontDistance = Math.min(
            this.sensorData.center,
            this.sensorData.centerLeft || this.sensorData.center,
            this.sensorData.centerRight || this.sensorData.center
        );

        const minStopDistance = 5.5;    // metros desde sensor → parada completa tras el vehículo u obstáculo
        const safeFollowDistance = 14.0; // metros → inicio de desaceleración progresiva
        const laneChangeReady = 18.0;

        if (pedestrianStop || frontDistance < safeFollowDistance) {
            let targetDistSpeed = finalTargetSpeed;

            if (pedestrianStop || frontDistance <= minStopDistance) {
                targetDistSpeed = 0; // Alto total sin colisionar
            } else {
                const factor = (frontDistance - minStopDistance) / (safeFollowDistance - minStopDistance);
                targetDistSpeed = Math.max(0, finalTargetSpeed * factor);
            }

            // Aplicar controles físicos del coche
            if (targetDistSpeed === 0) {
                if (this.car.speed > 0.15) {
                    this.controls.forward = false;
                    this.controls.backward = true;
                    this.controls.handbrake = false;
                } else {
                    this.controls.forward = false;
                    this.controls.backward = false;
                    this.controls.handbrake = true; // Bloqueo seguro parado
                }
            } else {
                this.controls.handbrake = false;
                if (this.car.speed < targetDistSpeed - 0.2) {
                    this.controls.forward = true;
                    this.controls.backward = false;
                } else if (this.car.speed > targetDistSpeed + 0.2) {
                    this.controls.forward = false;
                    this.controls.backward = true;
                } else {
                    this.controls.forward = false;
                    this.controls.backward = false;
                }
            }

            // Cambio de carril opcional si el obstáculo es un vehículo y la maniobra es totalmente segura
            if (!pedestrianStop && this.nearestEntityType === 'VEHICLE' && this.laneChangeCooldown <= 0) {
                const leftFree  = this.sensorData.left      > laneChangeReady;
                const rightFree = this.sensorData.right     > laneChangeReady;
                const rearLeftFree  = this.sensorData.rearLeft  > 10.0;
                const rearRightFree = this.sensorData.rearRight > 10.0;

                if (leftFree && rearLeftFree) {
                    this.controls.left  = true;
                    this.controls.right = false;
                    this.laneChangeActive   = true;
                    this.laneChangeCooldown = 4.0;
                } else if (rightFree && rearRightFree) {
                    this.controls.right = true;
                    this.controls.left  = false;
                    this.laneChangeActive   = true;
                    this.laneChangeCooldown = 4.0;
                }
            }
        } else {
            // Camino libre: aplicar control de crucero estándar
            this.laneChangeActive = false;
            this.controls.handbrake = false;

            if (finalTargetSpeed === 0) {
                if (this.car.speed > 0.15) {
                    this.controls.forward = false;
                    this.controls.backward = true;
                } else {
                    this.controls.forward = false;
                    this.controls.backward = false;
                    this.controls.handbrake = true;
                }
            } else {
                if (this.car.speed < finalTargetSpeed) {
                    this.controls.forward = true;
                    this.controls.backward = false;
                } else if (this.car.speed > finalTargetSpeed + 0.6) {
                    this.controls.forward = false;
                    this.controls.backward = true;
                } else {
                    this.controls.forward = false;
                    this.controls.backward = false;
                }
            }

            // Esquivar lateralmente obstáculos menores rozando el lateral
            if (this.sensorData.left < 14.0 && this.sensorData.left < this.sensorData.right) {
                this.controls.left  = false;
                this.controls.right = true;
                this.controls.forward = false;
            } else if (this.sensorData.right < 14.0 && this.sensorData.right < this.sensorData.left) {
                this.controls.right = false;
                this.controls.left  = true;
                this.controls.forward = false;
            }
        }
    }

    /**
     * Detecta si hay alguna señal de tránsito o semáforo relevante por delante del coche
     */
    detectTrafficElement() {
        if (!this.trafficSystem || !this.trafficSystem.elements) return null;

        const carPos = this.car.mesh.position;
        const forwardDir = new THREE.Vector3(0, 0, 1).applyQuaternion(this.car.mesh.quaternion).normalize();
        
        let closestElement = null;
        let minDistance = Infinity;

        this.trafficSystem.elements.forEach(el => {
            // Omitir señales de STOP que estén en enfriamiento por haber sido procesadas
            if (el.type === 'STOP' && el.processed) return;

            const toEl = new THREE.Vector3().subVectors(el.position, carPos);
            const dist = toEl.length();

            // Rango de visibilidad: semáforos a 18m, señales a 12m
            const maxDetectDist = el.type === 'LIGHT' ? 18.0 : 12.0;

            if (dist < maxDetectDist) {
                const toElDir = toEl.clone().normalize();
                const dot = toElDir.dot(forwardDir);

                // Ángulo de visión hacia adelante (cono de ~53 grados)
                if (dot > 0.6) {
                    if (dist < minDistance) {
                        minDistance = dist;
                        closestElement = el;
                    }
                }
            }
        });

        if (closestElement) {
            return { element: closestElement, distance: minDistance };
        }
        return null;
    }

    /**
     * Lanza los rayos sensores desde la posición frontal del coche
     */
    updateSensors() {
        const carMesh = this.car.mesh;
        if (!carMesh) return;

        // Reiniciar tipo de entidad detectada (se recalcula en cada frame)
        this.nearestEntityType = 'NONE';

        // Dirección frontal del coche
        const forwardDir = new THREE.Vector3(0, 0, 1).applyQuaternion(carMesh.quaternion).normalize();
        
        // Origen del sensor: Capó delantero del coche (elevado 0.5 unidades)
        const sensorOrigin = carMesh.position.clone()
            .addScaledVector(forwardDir, 2.1) // Mover al frente
            .add(new THREE.Vector3(0, 0.5, 0)); // Subir un poco

        // Definir los rayos del sensor
        const dirCenter      = forwardDir.clone();
        const dirCenterLeft  = forwardDir.clone().applyAxisAngle(new THREE.Vector3(0,1,0),  Math.PI / 180 * 8).normalize();
        const dirCenterRight = forwardDir.clone().applyAxisAngle(new THREE.Vector3(0,1,0), -Math.PI / 180 * 8).normalize();
        const dirLeft        = forwardDir.clone().applyAxisAngle(new THREE.Vector3(0,1,0),  Math.PI / 180 * 25).normalize();
        const dirRight       = forwardDir.clone().applyAxisAngle(new THREE.Vector3(0,1,0), -Math.PI / 180 * 25).normalize();
        // Retrovisores: 135° hacia atrás-lateral (para detectar si es seguro cambiar de carril)
        const dirRearLeft    = forwardDir.clone().applyAxisAngle(new THREE.Vector3(0,1,0),  Math.PI * 0.75).normalize();
        const dirRearRight   = forwardDir.clone().applyAxisAngle(new THREE.Vector3(0,1,0), -Math.PI * 0.75).normalize();

        // Objetos a colisionar: Edificios, Árboles + Entidades dinámicas (peatones y vehículos NPC)
        const collisionTargets = [];
        this.city.buildings.forEach(b => collisionTargets.push(b));
        this.city.trees.forEach(t => {
            t.children.forEach(child => collisionTargets.push(child));
        });
        // Agregar mallas de peatones y vehículos NPC al pool de detección
        if (this.entitySystem) {
            this.entitySystem.getAllMeshes().forEach(m => collisionTargets.push(m));
        }

        const checkSensor = (raycaster, direction, helperKey = null) => {
            raycaster.set(sensorOrigin, direction);
            const intersections = raycaster.intersectObjects(collisionTargets);
            
            let distance = this.sensorRange;
            let hitPoint = sensorOrigin.clone().addScaledVector(direction, this.sensorRange);
            
            if (intersections.length > 0) {
                // Encontrar la primera intersección válida (ignorando vehículos en carril contrario / opuesto)
                for (let i = 0; i < intersections.length; i++) {
                    const hit = intersections[i];
                    if (hit.distance >= this.sensorRange) break;

                    // Si el objeto impactado es un vehículo NPC, verificar si está en el carril opuesto (LaneBackward)
                    if (this.entitySystem && this.entitySystem.vehicleMeshes.includes(hit.object)) {
                        const npc = this.entitySystem._vehicles.find(v => v.group.children.includes(hit.object));
                        if (npc) {
                            const toNpc = new THREE.Vector3().subVectors(npc.group.position, carMesh.position);
                            const lateralDist = Math.abs(-toNpc.x * forwardDir.z + toNpc.z * forwardDir.x);
                            
                            // Determinar sentido de marcha
                            const carAngle = Math.atan2(forwardDir.x, forwardDir.z);
                            let angleDiff = Math.abs(carAngle - npc.angle);
                            while (angleDiff > Math.PI) angleDiff = Math.abs(angleDiff - Math.PI * 2);
                            const sameDirection = angleDiff < Math.PI / 2;

                            // Si va en sentido contrario o está en el carril contiguo (distancia lateral >= 2.0m), omitir impacto de rayo frontal
                            if (!sameDirection || lateralDist >= 2.0) {
                                continue; // Ignorar vehículo en carril contrario / paralelo
                            }
                        }
                    }

                    distance = hit.distance;
                    hitPoint = hit.point;
                    break;
                }
            }

            // Actualizar representación visual del rayo sensor (Láser) si tiene helper
            if (helperKey) {
                const helper = this.sensorHelpers[helperKey];
                if (helper && helper.visible) {
                    // Actualizar puntos de la línea
                    const points = [sensorOrigin.clone(), hitPoint];
                    helper.geometry.setFromPoints(points);
                    
                    // Cambiar color del láser según peligro
                    if (distance < 8.0) {
                        helper.material.color.setHex(0xef4444); // Rojo peligro
                    } else if (distance < 16.0) {
                        helper.material.color.setHex(0xeab308); // Amarillo precaución
                    } else {
                        helper.material.color.setHex(0x10b981); // Verde libre
                    }
                }
            }

            return distance;
        };

        this.sensorData.center      = checkSensor(this.raycasters.center,      dirCenter,      'center');
        this.sensorData.centerLeft  = checkSensor(this.raycasters.centerLeft,  dirCenterLeft);
        this.sensorData.centerRight = checkSensor(this.raycasters.centerRight, dirCenterRight);
        this.sensorData.left        = checkSensor(this.raycasters.left,        dirLeft,        'left');
        this.sensorData.right       = checkSensor(this.raycasters.right,       dirRight,       'right');
        this.sensorData.rearLeft    = checkSensor(this.raycasters.rearLeft,    dirRearLeft,    'rearLeft');
        this.sensorData.rearRight   = checkSensor(this.raycasters.rearRight,   dirRearRight,   'rearRight');

        // Detección directa por bounding box/corredor del carril para evitar traspaso o fallos de raycasting
        if (this.entitySystem) {
            const carPos = carMesh.position;

            // 1. Vehículos NPC por delante en el carril
            if (this.entitySystem._vehicles) {
                this.entitySystem._vehicles.forEach(npc => {
                    const npcPos = npc.group.position;
                    const toNpc = new THREE.Vector3().subVectors(npcPos, carPos);
                    const forwardDist = toNpc.dot(forwardDir);
                    const lateralDist = Math.abs(-toNpc.x * forwardDir.z + toNpc.z * forwardDir.x);

                    // Filtrar vehículos en sentido contrario (>90° de diferencia angular)
                    // Los NPCs van en sentido opuesto al jugador → ignorarlos para no frenar de frente
                    const carAngle = Math.atan2(forwardDir.x, forwardDir.z);
                    const npcAngle = npc.angle;
                    let angleDiff = Math.abs(carAngle - npcAngle);
                    while (angleDiff > Math.PI) angleDiff = Math.abs(angleDiff - Math.PI * 2);
                    const goingSameWay = angleDiff < Math.PI / 2;

                    if (goingSameWay && forwardDist > 0.3 && forwardDist < 30.0 && lateralDist < 3.5) {
                        const netDist = Math.max(0.1, forwardDist - 2.5);
                        if (netDist < this.sensorData.center) {
                            this.sensorData.center = netDist;
                            this.nearestEntityType = 'VEHICLE';
                        }
                    }
                });
            }

            // 2. Peatones por delante en el carril o pasos de cebra
            if (this.entitySystem._pedestrians) {
                this.entitySystem._pedestrians.forEach(ped => {
                    const pedPos = ped.group.position;
                    const toPed = new THREE.Vector3().subVectors(pedPos, carPos);
                    const forwardDist = toPed.dot(forwardDir);
                    const lateralDist = Math.abs(-toPed.x * forwardDir.z + toPed.z * forwardDir.x);

                    const isCrosswalk = ped.route && ped.route.axis && ped.route.axis.startsWith('crosswalk');
                    const maxLateral = isCrosswalk ? 4.5 : 2.5;

                    if (forwardDist > 0.2 && forwardDist < 20.0 && lateralDist < maxLateral) {
                        const netDist = Math.max(0.1, forwardDist - 1.2);
                        if (netDist < this.sensorData.center) {
                            this.sensorData.center = netDist;
                            this.nearestEntityType = 'PEDESTRIAN';
                        }
                    }
                });
            }
        }

        // Determinar tipo de entidad detectada frontalmente mediante raycasting si no fue asignada por corredor
        if (this.nearestEntityType === 'NONE' && this.entitySystem && this.sensorData.center < this.sensorRange) {
            const allEntityMeshes = this.entitySystem.getAllMeshes();
            const testRay = new THREE.Raycaster();
            testRay.set(sensorOrigin, dirCenter);
            const hits = testRay.intersectObjects(allEntityMeshes);
            if (hits.length > 0 && hits[0].distance < this.sensorData.center + 0.5) {
                const isPed = this.entitySystem.pedestrianMeshes.includes(hits[0].object);
                this.nearestEntityType = isPed ? 'PEDESTRIAN' : 'VEHICLE';
            }
        }
    }

    /**
     * Mapea la telemetría de sensores y alertas a la interfaz web (DOM)
     */
    updateHUD() {
        const updateBar = (idVal, idBar, distance) => {
            const bar = document.getElementById(idBar);
            const val = document.getElementById(idVal);
            if (!bar || !val) return;

            // Convertir distancia a porcentaje (0% peligro, 100% libre)
            const percent = Math.round((distance / this.sensorRange) * 100);
            bar.style.width = `${percent}%`;

            // Actualizar texto
            if (distance >= this.sensorRange) {
                val.textContent = "Max";
                val.style.color = "var(--text-muted)";
            } else {
                val.textContent = `${distance.toFixed(1)}m`;
                if (distance < 8.0) {
                    val.style.color = "var(--accent-red)";
                } else if (distance < 16.0) {
                    val.style.color = "#eab308";
                } else {
                    val.style.color = "var(--accent-green)";
                }
            }

            // Clases de color para la barra
            bar.className = 'bar'; // Reset
            if (distance < 8.0) {
                bar.classList.add('danger');
            } else if (distance < 16.0) {
                bar.classList.add('warning');
            }
        };

        updateBar('sensor-left-val', 'sensor-left', this.sensorData.left);
        updateBar('sensor-center-val', 'sensor-center', this.sensorData.center);
        updateBar('sensor-right-val', 'sensor-right', this.sensorData.right);

        // Mostrar alerta global de colisión si la distancia frontal es demasiado corta
        const alertEl = document.getElementById('collision-alert');
        if (alertEl) {
            if (this.sensorData.center < 8.0 || this.sensorData.left < 5.0 || this.sensorData.right < 5.0) {
                alertEl.classList.remove('hidden');
            } else {
                alertEl.classList.add('hidden');
            }
        }

        // Actualizar widgets de Señales y Semáforos en el HUD
        const speedIcon = document.getElementById('speed-limit-icon');
        const lightStatus = document.getElementById('traffic-light-status');
        const actionIcon = document.getElementById('action-sign-icon');
        const signNameEl = document.getElementById('sign-detected-name');
        const signDescEl = document.getElementById('sign-detected-desc');

        if (speedIcon) {
            speedIcon.textContent = this.currentSpeedLimit;
        }

        if (this.detectedSignInfo) {
            const info = this.detectedSignInfo;

            // Nombre de la señal
            if (signNameEl) {
                if (info.type === 'NONE') {
                    signNameEl.textContent = 'Sin Señales';
                } else if (info.type === 'LIMIT') {
                    signNameEl.textContent = `Límite ${info.value}`;
                } else if (info.type === 'CEDA') {
                    signNameEl.textContent = 'Ceda el Paso';
                } else if (info.type === 'STOP') {
                    signNameEl.textContent = 'Alto de STOP';
                } else if (info.type === 'LIGHT') {
                    signNameEl.textContent = 'Semáforo';
                }
            }

            // Descripción de la señal
            if (signDescEl) {
                signDescEl.textContent = info.desc;
            }

            // Indicador de semáforo (punto de color)
            if (lightStatus) {
                lightStatus.className = 'traffic-light-status'; // reset
                if (info.type === 'LIGHT' && info.lightState) {
                    lightStatus.classList.add(info.lightState.toLowerCase());
                } else {
                    lightStatus.classList.add('none');
                }
            }

            // Icono de acción (STOP o CEDA)
            if (actionIcon) {
                actionIcon.className = 'action-sign'; // reset
                if (info.type === 'STOP') {
                    actionIcon.classList.add('stop');
                    actionIcon.textContent = 'STOP';
                } else if (info.type === 'CEDA') {
                    actionIcon.classList.add('ceda');
                    actionIcon.textContent = 'CEDA';
                } else {
                    actionIcon.classList.add('none');
                }
            }
        }

        // Actualizar widget de Entidades / Obstáculos en el HUD
        const entityIconEl = document.getElementById('entity-icon');
        const entityNameEl = document.getElementById('entity-detected-name');
        const entityDescEl = document.getElementById('entity-detected-desc');

        if (entityNameEl && entityDescEl) {
            if (this.sensorData.center < 6.0) {
                if (entityIconEl) entityIconEl.textContent = '🚨';
                entityNameEl.textContent = '¡Riesgo Colisión!';
                entityDescEl.textContent = 'Frenado de emergencia activo';
            } else if (this.nearestEntityType === 'PEDESTRIAN') {
                if (entityIconEl) entityIconEl.textContent = '🚶';
                entityNameEl.textContent = 'Peatón Detectado';
                entityDescEl.textContent = `Manteniendo distancia (${this.sensorData.center.toFixed(1)}m)`;
            } else if (this.nearestEntityType === 'VEHICLE') {
                if (entityIconEl) entityIconEl.textContent = '🚘';
                if (this.laneChangeActive) {
                    entityNameEl.textContent = 'Cambio de Carril';
                    entityDescEl.textContent = 'Maniobra segura en curso';
                } else {
                    entityNameEl.textContent = 'Vehículo Detectado';
                    entityDescEl.textContent = `Distancia de seguridad (${this.sensorData.center.toFixed(1)}m)`;
                }
            } else if (this.sensorData.center < 12.0) {
                if (entityIconEl) entityIconEl.textContent = '🧱';
                entityNameEl.textContent = 'Obstáculo Cercano';
                entityDescEl.textContent = `Reduciendo velocidad (${this.sensorData.center.toFixed(1)}m)`;
            } else {
                if (entityIconEl) entityIconEl.textContent = '🟢';
                entityNameEl.textContent = 'Camino Libre';
                entityDescEl.textContent = 'Distancia de seguridad OK';
            }
        }

        // Actualizar widget de Navegación GPS en el HUD
        const navDestEl   = document.getElementById('nav-target-name');
        const navDistEl   = document.getElementById('nav-distance');
        const navStatusEl = document.getElementById('nav-status');

        if (this.navigationSystem && navDestEl) {
            const dest = this.navigationSystem.targetDestination;
            navDestEl.textContent = `${dest.icon} ${dest.name}`;
            
            const dist = this.car.mesh.position.distanceTo(new THREE.Vector3(dest.x, 0, dest.z));
            if (navDistEl) navDistEl.textContent = `${dist.toFixed(0)} m`;

            if (navStatusEl) {
                if (this.navigationSystem.isArrived) {
                    navStatusEl.textContent = '¡DESTINO ALCANZADO!';
                    navStatusEl.style.color = 'var(--accent-green)';
                } else if (this.navigationSystem.isRerouting) {
                    navStatusEl.textContent = 'RECALCULANDO RUTA (Vía Bloqueada)';
                    navStatusEl.style.color = '#eab308';
                } else {
                    navStatusEl.textContent = 'En Ruta Autónomamente';
                    navStatusEl.style.color = 'var(--accent-cyan)';
                }
            }
        }
    }
}
