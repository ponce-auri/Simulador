import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';

// ─────────────────────────────────────────────────────────────────────────────
// MÓDULO DE ENTIDADES DINÁMICAS: Peatones y Vehículos NPC
// Genera, anima y expone referencias de todas las entidades móviles en escena
// para que el piloto automático pueda usarlas como objetivos de sensor LIDAR.
// ─────────────────────────────────────────────────────────────────────────────

export class EntitySystem {
    constructor(scene) {
        this.scene = scene;

        // Listas públicas accedidas por Autopilot.updateSensors()
        this.pedestrianMeshes = []; // Mallas individuales de peatones
        this.vehicleMeshes    = []; // Mallas individuales de vehículos NPC

        // Datos completos de cada entidad (posición, velocidad, ángulo, etc.)
        this._pedestrians = [];
        this._vehicles    = [];
        this.playerCar    = null;

        this._spawnAll();
    }

    setPlayerCar(car) {
        this.playerCar = car;
    }

    // ─── Creación inicial de entidades ───────────────────────────────────────

    _spawnAll() {
        // Peatones sobre las aceras de las manzanas y en pasos de cebra
        const sidewalkRoutes = [
            // Peatones longitudinales en aceras
            { x: -75, z: -108, axis: 'x', dir:  1, amp: 35 },
            { x:  75, z: -108, axis: 'x', dir: -1, amp: 35 },
            { x: -108, z: -75, axis: 'z', dir:  1, amp: 35 },
            { x:  108, z:  25, axis: 'z', dir: -1, amp: 35 },
            { x: -25, z:  108, axis: 'x', dir:  1, amp: 35 },
            { x:  25, z: -108, axis: 'x', dir: -1, amp: 35 },
            { x: -108, z:  75, axis: 'z', dir:  1, amp: 35 },
            { x:  108, z: -25, axis: 'z', dir: -1, amp: 35 },

            // Peatones en Pasos Peatonales (cruzan directamente la calzada de carril)
            { x:    0, z: -100, axis: 'crosswalk_z', dir:  1, amp: 7.5 }, // Cruza calzada Z=-100
            { x:  100, z:    0, axis: 'crosswalk_x', dir: -1, amp: 7.5 }, // Cruza calzada X=100
            { x:    0, z:    0, axis: 'crosswalk_x', dir:  1, amp: 7.5 }, // Cruza calzada X=0
            { x: -100, z:    0, axis: 'crosswalk_z', dir: -1, amp: 7.5 }, // Cruza calzada Z=0
        ];

        sidewalkRoutes.forEach((route, i) => {
            const count = route.axis.startsWith('crosswalk') ? 1 : (2 + (i % 2));
            for (let p = 0; p < count; p++) {
                const offsetFraction = p / count;
                this._spawnPedestrian(route, offsetFraction);
            }
        });

        // ── SISTEMA DE TRÁFICO POR CARRILES FÍSICOS INDEPENDIENTES ────────────────────────
        // Las carreteras urbanas de 10m de ancho tienen 2 carriles físicos paralelos de 5m:
        //   1. LaneForward: Carril en el sentido de marcha del vehículo autónomo (+2.5m a la derecha).
        //   2. LaneBackward: Carril en el sentido contrario de marcha (-2.5m a la derecha = +2.5m en sentido opuesto).
        // Ambas trayectorias están separadas físicamente por 5.0 metros de centro a centro.

        // Trayectoria FÍSICA de LaneForward (Antihoraria / Mismo sentido)
        const laneForwardWaypoints = [
            new THREE.Vector3(-95, 0.4, -102.5),
            new THREE.Vector3( -5, 0.4, -102.5),
            new THREE.Vector3( 95, 0.4, -102.5),
            new THREE.Vector3(102.5, 0.4, -95),
            new THREE.Vector3(102.5, 0.4,  -5),
            new THREE.Vector3(102.5, 0.4,  95),
            new THREE.Vector3( 95, 0.4, 102.5),
            new THREE.Vector3( -5, 0.4, 102.5),
            new THREE.Vector3(-95, 0.4, 102.5),
            new THREE.Vector3(-102.5, 0.4, 95),
            new THREE.Vector3(-102.5, 0.4, -5),
            new THREE.Vector3(-102.5, 0.4, -95),
        ];

        // Trayectoria FÍSICA de LaneBackward (Horaria / Sentido contrario)
        const laneBackwardWaypoints = [
            new THREE.Vector3( 95, 0.4, -97.5),
            new THREE.Vector3( -5, 0.4, -97.5),
            new THREE.Vector3(-95, 0.4, -97.5),
            new THREE.Vector3(-97.5, 0.4, -95),
            new THREE.Vector3(-97.5, 0.4,  -5),
            new THREE.Vector3(-97.5, 0.4,  95),
            new THREE.Vector3(-95, 0.4,  97.5),
            new THREE.Vector3( -5, 0.4,  97.5),
            new THREE.Vector3( 95, 0.4,  97.5),
            new THREE.Vector3( 97.5, 0.4,  95),
            new THREE.Vector3( 97.5, 0.4,  -5),
            new THREE.Vector3( 97.5, 0.4, -95),
        ];

        const npcRoutes = [
            // ── VEHÍCULOS DELANTEROS EN LaneForward (Mismo sentido que el autónomo) ──────
            // NPC 1: Delante del autónomo en el carril exterior (Z = -102.5)
            {
                laneType: 'LaneForward',
                waypoints: laneForwardWaypoints,
                speed: 8.5,
                color: 0x3b82f6, // Azul brillante
                startIndex: 0 // Inicia en (-95, -102.5) por delante del autónomo at (-90, -102.5)
            },
            // NPC 2: Delantero más avanzado en LaneForward
            {
                laneType: 'LaneForward',
                waypoints: laneForwardWaypoints,
                speed: 9.0,
                color: 0x10b981, // Verde esmeralda
                startIndex: 3 // En (102.5, -95)
            },
            // NPC 3: Tercer vehículo delantero en LaneForward
            {
                laneType: 'LaneForward',
                waypoints: laneForwardWaypoints,
                speed: 8.8,
                color: 0x8b5cf6, // Violeta
                startIndex: 6 // En (95, 102.5)
            },

            // ── VEHÍCULOS DE FRENTE EN LaneBackward (Sentido contrario al autónomo) ──────
            // NPC 4: Viene de frente en Z = -97.5 (separado 5.0m a la izquierda del autónomo)
            {
                laneType: 'LaneBackward',
                waypoints: laneBackwardWaypoints,
                speed: 9.5,
                color: 0xef4444, // Rojo
                startIndex: 0 // En (95, -97.5) avanzando hacia -X
            },
            // NPC 5: Segundo vehículo de frente en LaneBackward
            {
                laneType: 'LaneBackward',
                waypoints: laneBackwardWaypoints,
                speed: 9.2,
                color: 0xf59e0b, // Ámbar
                startIndex: 4 // En (-97.5, -5) avanzando hacia +Z
            },
            // NPC 6: Tercer vehículo de frente en LaneBackward
            {
                laneType: 'LaneBackward',
                waypoints: laneBackwardWaypoints,
                speed: 8.5,
                color: 0xec4899, // Rosa
                startIndex: 8 // En (95, 97.5) avanzando hacia +X
            },

            // ── VEHÍCULO DE FRENTE EN AVENIDA CENTRAL X=0 (LaneBackward) ─────────────────
            // NPC 7: Avenida X=0, circulando hacia -Z por carril opuesto X = -2.5
            {
                laneType: 'LaneBackward',
                waypoints: [
                    new THREE.Vector3(-2.5, 0.4,  95),
                    new THREE.Vector3(-2.5, 0.4,  45),
                    new THREE.Vector3(-2.5, 0.4,  -5),
                    new THREE.Vector3(-2.5, 0.4, -55),
                    new THREE.Vector3(-2.5, 0.4, -95),
                ],
                speed: 8.8,
                color: 0x06b6d4, // Cian
                startIndex: 0
            }
        ];

        npcRoutes.forEach(route => this._spawnVehicle(route));
    }

    // ─── Peatón ──────────────────────────────────────────────────────────────

    _spawnPedestrian(route, offsetFraction) {
        const group = new THREE.Group();

        // Cuerpo (cápsula aproximada con cilindro + esfera)
        const bodyColors = [0xf97316, 0x8b5cf6, 0x06b6d4, 0xec4899, 0xfbbf24];
        const bodyColor  = bodyColors[Math.floor(Math.random() * bodyColors.length)];

        const bodyGeo  = new THREE.CylinderGeometry(0.2, 0.2, 0.9, 8);
        const bodyMat  = new THREE.MeshStandardMaterial({ color: bodyColor });
        const body     = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.75;
        body.castShadow = true;
        group.add(body);

        const headGeo = new THREE.SphereGeometry(0.22, 8, 8);
        const headMat = new THREE.MeshStandardMaterial({ color: 0xfcd5b5 });
        const head    = new THREE.Mesh(headGeo, headMat);
        head.position.y = 1.4;
        head.castShadow = true;
        group.add(head);

        // Piernas (2 cilindros pequeños que oscilan)
        const legGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.55, 6);
        const legMat = new THREE.MeshStandardMaterial({ color: 0x1e293b });

        const legL = new THREE.Mesh(legGeo, legMat);
        legL.position.set(-0.12, 0.27, 0);
        group.add(legL);

        const legR = new THREE.Mesh(legGeo, legMat);
        legR.position.set( 0.12, 0.27, 0);
        group.add(legR);

        // Posición inicial
        const startOffset = route.amp * 2 * offsetFraction - route.amp;
        const startX = route.axis === 'x' ? route.x + startOffset : route.x;
        const startZ = route.axis === 'z' ? route.z + startOffset : route.z;
        group.position.set(startX, 0.02, startZ);

        this.scene.add(group);
        this.pedestrianMeshes.push(body, head, legL, legR); // Para raycasting

        const pedSpeed = 1.0 + Math.random() * 0.8;
        this._pedestrians.push({
            group,
            legL,
            legR,
            route,
            progress: offsetFraction * route.amp * 2 - route.amp,
            speed: pedSpeed * route.dir,
            legPhase: Math.random() * Math.PI * 2,
        });
    }

    // ─── Vehículo NPC ────────────────────────────────────────────────────────

    _spawnVehicle(routeData) {
        const group = new THREE.Group();

        // Chasis
        const chassisGeo = new THREE.BoxGeometry(2.0, 0.7, 4.0);
        const chassisMat = new THREE.MeshStandardMaterial({
            color: routeData.color,
            metalness: 0.6,
            roughness: 0.3
        });
        const chassis = new THREE.Mesh(chassisGeo, chassisMat);
        chassis.position.y = 0.55;
        chassis.castShadow = true;
        group.add(chassis);

        // Cabina
        const cabinGeo = new THREE.BoxGeometry(1.6, 0.55, 2.2);
        const cabinMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3 });
        const cabin    = new THREE.Mesh(cabinGeo, cabinMat);
        cabin.position.set(0, 1.1, -0.2);
        cabin.castShadow = true;
        group.add(cabin);

        // Ruedas (4)
        const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.25, 12);
        wheelGeo.rotateZ(Math.PI / 2);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.9 });
        const wheelPositions = [[-1.05, 0.3, 1.3], [1.05, 0.3, 1.3], [-1.05, 0.3, -1.3], [1.05, 0.3, -1.3]];
        wheelPositions.forEach(([wx, wy, wz]) => {
            const wheel = new THREE.Mesh(wheelGeo, wheelMat);
            wheel.position.set(wx, wy, wz);
            group.add(wheel);
        });

        // Faros traseros (luces rojas emisivas)
        const taillightGeo = new THREE.BoxGeometry(0.4, 0.15, 0.05);
        const taillightMat = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 0.8 });
        [-0.7, 0.7].forEach(lx => {
            const tl = new THREE.Mesh(taillightGeo, taillightMat);
            tl.position.set(lx, 0.6, -2.02);
            group.add(tl);
        });

        // Posición inicial en el primer waypoint del carril elegido (LaneForward o LaneBackward)
        const firstWP = routeData.waypoints[routeData.startIndex];
        group.position.copy(firstWP);

        this.scene.add(group);
        this.vehicleMeshes.push(chassis, cabin); // Para raycasting

        this._vehicles.push({
            group,
            laneType: routeData.laneType || 'LaneForward',
            waypoints: routeData.waypoints,
            currentWPIndex: routeData.startIndex,
            speed: routeData.speed,
            currentSpeed: routeData.speed,
            angle: 0,
        });
    }

    // ─── Actualización por frame ─────────────────────────────────────────────

    update(delta, playerCar = null) {
        if (playerCar) this.playerCar = playerCar;
        this._updatePedestrians(delta);
        this._updateVehicles(delta);
    }

    _updatePedestrians(delta) {
        this._pedestrians.forEach(ped => {
            // Avanzar progreso
            ped.progress += ped.speed * delta;

            // Rebotar en los extremos del segmento
            if (ped.progress >  ped.route.amp) { ped.progress =  ped.route.amp; ped.speed *= -1; }
            if (ped.progress < -ped.route.amp) { ped.progress = -ped.route.amp; ped.speed *= -1; }

            // Aplicar posición
            if (ped.route.axis === 'x' || ped.route.axis === 'crosswalk_x') {
                ped.group.position.x = ped.route.x + ped.progress;
                ped.group.position.z = ped.route.z;
            } else {
                ped.group.position.x = ped.route.x;
                ped.group.position.z = ped.route.z + ped.progress;
            }

            // Rotar hacia dirección de movimiento
            const dir = ped.speed > 0 ? 1 : -1;
            const isHorizontal = ped.route.axis === 'x' || ped.route.axis === 'crosswalk_x';
            ped.group.rotation.y = isHorizontal
                ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2)
                : (dir > 0 ? 0 : Math.PI);

            // Animación de caminar: oscilación de piernas
            ped.legPhase += delta * 4.5;
            ped.legL.rotation.x =  Math.sin(ped.legPhase) * 0.5;
            ped.legR.rotation.x = -Math.sin(ped.legPhase) * 0.5;
        });
    }

    _updateVehicles(delta) {
        this._vehicles.forEach(npc => {
            const targetWP = npc.waypoints[npc.currentWPIndex];
            const toTarget  = new THREE.Vector3().subVectors(targetWP, npc.group.position);
            const dist      = toTarget.length();

            // Avanzar al siguiente waypoint si llegamos
            if (dist < 3.0) {
                npc.currentWPIndex = (npc.currentWPIndex + 1) % npc.waypoints.length;
            }

            // Calcular ángulo hacia el waypoint
            const targetAngle = Math.atan2(toTarget.x, toTarget.z);

            // Suavizar rotación
            let angleDiff = targetAngle - npc.angle;
            while (angleDiff >  Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            npc.angle += angleDiff * Math.min(1.0, delta * 5.0);

            // Dirección frontal del NPC
            const npcPos = npc.group.position;
            const forwardDir = new THREE.Vector3(Math.sin(npc.angle), 0, Math.cos(npc.angle)).normalize();

            // ── Detección de obstáculos por carril independiente ────────────────
            // Solo se consideran obstáculos los vehículos en el MISMO carril (desviación lateral < 2.0m)
            // Los vehículos en carril contrario (LaneBackward vs LaneForward, distancia 5.0m) son ignorados
            let minObstacleDist = Infinity;

            const sameDirection = (otherAngle) => {
                let diff = Math.abs(npc.angle - otherAngle);
                while (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);
                return diff < Math.PI / 2;
            };

            // 1. Coche del jugador (solo si está en el MISMO carril físico)
            if (this.playerCar && this.playerCar.mesh) {
                const playerPos = this.playerCar.mesh.position;
                const toPlayer = new THREE.Vector3().subVectors(playerPos, npcPos);
                const fwdDist = toPlayer.dot(forwardDir);
                const latDist = Math.abs(-toPlayer.x * forwardDir.z + toPlayer.z * forwardDir.x);
                if (fwdDist > 0.3 && fwdDist < 25.0 && latDist < 2.0 && sameDirection(this.playerCar.angle || 0)) {
                    const netDist = Math.max(0.1, fwdDist - 2.5);
                    if (netDist < minObstacleDist) minObstacleDist = netDist;
                }
            }

            // 2. Otros vehículos NPC (solo si están en el MISMO carril físico)
            this._vehicles.forEach(otherNpc => {
                if (otherNpc === npc) return;
                const otherPos = otherNpc.group.position;
                const toOther = new THREE.Vector3().subVectors(otherPos, npcPos);
                const fwdDist = toOther.dot(forwardDir);
                const latDist = Math.abs(-toOther.x * forwardDir.z + toOther.z * forwardDir.x);

                if (fwdDist > 0.3 && fwdDist < 25.0 && latDist < 2.0 && sameDirection(otherNpc.angle)) {
                    const netDist = Math.max(0.1, fwdDist - 2.5);
                    if (netDist < minObstacleDist) minObstacleDist = netDist;
                }
            });

            // 3. Peatones — radio lateral más amplio en pasos de cebra
            this._pedestrians.forEach(ped => {
                const pedPos = ped.group.position;
                const toPed = new THREE.Vector3().subVectors(pedPos, npcPos);
                const fwdDist = toPed.dot(forwardDir);
                const latDist = Math.abs(-toPed.x * forwardDir.z + toPed.z * forwardDir.x);
                const isCrosswalk = ped.route && ped.route.axis && ped.route.axis.startsWith('crosswalk');
                const maxLat = isCrosswalk ? 5.0 : 2.5;
                if (fwdDist > 0.2 && fwdDist < 12.0 && latDist < maxLat) {
                    const netDist = Math.max(0.1, fwdDist - 1.0);
                    if (netDist < minObstacleDist) minObstacleDist = netDist;
                }
            });

            // ── Velocidad objetivo según distancia de seguridad ──────────────────
            let targetSpeed = npc.speed;
            if (minObstacleDist <= 5.5) {
                targetSpeed = 0; // Parada total — muy cerca del siguiente vehículo
            } else if (minObstacleDist < 16.0) {
                // Desaceleración proporcional y suave
                const ratio = (minObstacleDist - 5.5) / 10.5;
                targetSpeed = npc.speed * Math.max(0, ratio);
            }

            // Interpolación suave de aceleración / frenado
            if (typeof npc.currentSpeed === 'undefined') npc.currentSpeed = npc.speed;
            const accel = targetSpeed > npc.currentSpeed ? delta * 3.0 : delta * 7.0; // Frenado más brusco
            npc.currentSpeed += (targetSpeed - npc.currentSpeed) * Math.min(1.0, accel);

            // Mover en la dirección actual si la velocidad es positiva
            if (npc.currentSpeed > 0.05) {
                npc.group.position.x += Math.sin(npc.angle) * npc.currentSpeed * delta;
                npc.group.position.z += Math.cos(npc.angle) * npc.currentSpeed * delta;
            } else {
                npc.currentSpeed = 0; // Evitar valores negativos
            }
            npc.group.position.y = 0.02; // mantener en suelo

            // Aplicar rotación visual
            npc.group.rotation.y = npc.angle;
        });
    }

    // ─── Acceso a todas las mallas colisionables ─────────────────────────────

    /**
     * Devuelve una lista plana con TODAS las mallas de entidades dinámicas
     * para ser usada por Autopilot como targets de raycasting.
     */
    getAllMeshes() {
        return [...this.pedestrianMeshes, ...this.vehicleMeshes];
    }
}
