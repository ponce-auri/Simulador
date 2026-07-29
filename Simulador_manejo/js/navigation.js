import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';

// ─────────────────────────────────────────────────────────────────────────────
// MÓDULO DE NAVEGACIÓN AUTÓNOMA Y PATHFINDING A* POR CARRILES INDEPENDIENTES
// Administra el grafo urbano de la ciudad, selección de destinos,
// cálculo de rutas por carriles LaneForward, baliza 3D de destino y recálculo.
// ─────────────────────────────────────────────────────────────────────────────

export class NavigationSystem {
    constructor(scene, city) {
        this.scene = scene;
        this.city = city;

        // Lista de Destinos Emblemáticos de la Ciudad
        this.destinations = [
            { id: 'financial',  name: 'Distrito Financiero',  x:  100, z: -100, icon: '🏢' },
            { id: 'mall',       name: 'Centro Comercial',     x:  100, z:   50, icon: '🏬' },
            { id: 'plaza',      name: 'Plaza Central',        x:    0, z:    0, icon: '🏛️' },
            { id: 'park',       name: 'Parque Norte',         x:    0, z: -100, icon: '🌲' },
            { id: 'station',    name: 'Estación Sur',         x:    0, z:  100, icon: '🚉' },
            { id: 'industrial', name: 'Zona Industrial',      x: -100, z:  100, icon: '🏭' },
            { id: 'residential',name: 'Barrio Residencial',   x: -100, z:  -50, icon: '🏘️' },
        ];

        this.currentTargetIndex = 0;
        this.targetDestination  = this.destinations[0];

        // Grafo de Intersecciones (5x5 = 25 nodos)
        // roadGrid.x = [-100, -50, 0, 50, 100]
        // roadGrid.z = [-100, -50, 0, 50, 100]
        this.gridCoords = [-100, -50, 0, 50, 100];
        this.nodes = [];
        this._buildGraph();

        // Edges Bloqueados temporalmente (por obstáculos)
        this.blockedEdges = new Set();

        // Ruta calculada actual
        this.currentPathNodes = [];
        this.currentWaypoints = [];
        this.isRerouting      = false;
        this.rerouteReason    = '';
        this.isArrived        = false;

        // Marcador 3D del Destino (Baliza fluorescente y pin flotante)
        this.beaconMesh = null;
        this._createDestinationBeacon();
        this.updateDestinationBeacon();

        // Temporizador para detectar vía bloqueada
        this.blockedTimer = 0.0;
    }

    // ─── Construcción del Grafo Urbano ───────────────────────────────────────

    _buildGraph() {
        for (let ix = 0; ix < 5; ix++) {
            for (let iz = 0; iz < 5; iz++) {
                this.nodes.push({
                    id: `${ix}_${iz}`,
                    ix, iz,
                    x: this.gridCoords[ix],
                    z: this.gridCoords[iz]
                });
            }
        }
    }

    _getNode(ix, iz) {
        if (ix < 0 || ix >= 5 || iz < 0 || iz >= 5) return null;
        return this.nodes[ix * 5 + iz];
    }

    _getNearestNode(x, z) {
        let minDist = Infinity;
        let nearest = this.nodes[0];
        this.nodes.forEach(n => {
            const d = Math.hypot(n.x - x, n.z - z);
            if (d < minDist) {
                minDist = d;
                nearest = n;
            }
        });
        return nearest;
    }

    _getNeighbors(node) {
        const neighbors = [];
        const { ix, iz } = node;
        const dirs = [
            { ix: ix + 1, iz: iz, name: 'EAST' },
            { ix: ix - 1, iz: iz, name: 'WEST' },
            { ix: ix, iz: iz + 1, name: 'NORTH' },
            { ix: ix, iz: iz - 1, name: 'SOUTH' },
        ];

        dirs.forEach(d => {
            const neighbor = this._getNode(d.ix, d.iz);
            if (neighbor) {
                const edgeKey1 = `${node.id}->${neighbor.id}`;
                const edgeKey2 = `${neighbor.id}->${node.id}`;
                const isBlocked = this.blockedEdges.has(edgeKey1) || this.blockedEdges.has(edgeKey2);
                neighbors.push({
                    node: neighbor,
                    cost: isBlocked ? 999999 : Math.hypot(neighbor.x - node.x, neighbor.z - node.z)
                });
            }
        });

        return neighbors;
    }

    // ─── Algoritmo A* Pathfinding ─────────────────────────────────────────────

    findPath(startPos, targetPos) {
        const startNode  = this._getNearestNode(startPos.x, startPos.z);
        const targetNode = this._getNearestNode(targetPos.x, targetPos.z);

        if (startNode === targetNode) {
            return [startNode];
        }

        const openSet = [startNode];
        const cameFrom = new Map();

        const gScore = new Map();
        const fScore = new Map();

        this.nodes.forEach(n => {
            gScore.set(n.id, Infinity);
            fScore.set(n.id, Infinity);
        });

        gScore.set(startNode.id, 0);
        fScore.set(startNode.id, Math.hypot(targetNode.x - startNode.x, targetNode.z - startNode.z));

        while (openSet.length > 0) {
            openSet.sort((a, b) => fScore.get(a.id) - fScore.get(b.id));
            const current = openSet.shift();

            if (current.id === targetNode.id) {
                const path = [current];
                let currId = current.id;
                while (cameFrom.has(currId)) {
                    const prev = cameFrom.get(currId);
                    path.unshift(prev);
                    currId = prev.id;
                }
                return path;
            }

            const neighbors = this._getNeighbors(current);
            neighbors.forEach(({ node: neighbor, cost }) => {
                const tentativeG = gScore.get(current.id) + cost;
                if (tentativeG < gScore.get(neighbor.id)) {
                    cameFrom.set(neighbor.id, current);
                    gScore.set(neighbor.id, tentativeG);
                    const h = Math.hypot(targetNode.x - neighbor.x, targetNode.z - neighbor.z);
                    fScore.set(neighbor.id, tentativeG + h);

                    if (!openSet.includes(neighbor)) {
                        openSet.push(neighbor);
                    }
                }
            });
        }

        return [startNode, targetNode];
    }

    // ─── Generación de Waypoints por Carriles Independientes (LaneForward / LaneBackward) ────────

    /**
     * Calcula los waypoints físicos para un camino de nodos según el carril especificado:
     * - 'LaneForward': Carril derecho en el sentido de marcha (offset +2.5m).
     * - 'LaneBackward': Carril derecho en el sentido contrario (offset -2.5m).
     */
    calculateDualLaneWaypoints(nodePath, laneType = 'LaneForward') {
        if (!nodePath || nodePath.length < 2) return [];

        const waypoints = [];
        const laneOffset = (laneType === 'LaneForward' || laneType === 'FORWARD') ? 2.5 : -2.5;

        for (let i = 0; i < nodePath.length - 1; i++) {
            const curr = nodePath[i];
            const next = nodePath[i + 1];

            const dx = next.x - curr.x;
            const dz = next.z - curr.z;
            const len = Math.hypot(dx, dz);
            if (len === 0) continue;

            const dirX = dx / len;
            const dirZ = dz / len;

            const rightX = -dirZ;
            const rightZ =  dirX;

            const p1 = new THREE.Vector3(
                curr.x + rightX * laneOffset + dirX * 5,
                0.05,
                curr.z + rightZ * laneOffset + dirZ * 5
            );
            const p2 = new THREE.Vector3(
                next.x + rightX * laneOffset - dirX * 5,
                0.05,
                next.z + rightZ * laneOffset - dirZ * 5
            );

            waypoints.push(p1);
            waypoints.push(p2);
        }

        return waypoints;
    }

    calculateRouteWaypoints(carPos) {
        const nodePath = this.findPath(carPos, { x: this.targetDestination.x, z: this.targetDestination.z });
        this.currentPathNodes = nodePath;

        if (nodePath.length < 2) {
            return [new THREE.Vector3(this.targetDestination.x, 0.05, this.targetDestination.z)];
        }

        // El carro autónomo circula por LaneBackward (sentido horario / carril contrario al LaneForward)
        const waypoints = this.calculateDualLaneWaypoints(nodePath, 'LaneBackward');
        
        waypoints.push(new THREE.Vector3(this.targetDestination.x, 0.05, this.targetDestination.z));
        this.currentWaypoints = waypoints;
        this.isArrived = false;

        return waypoints;
    }

    // ─── Recálculo de Ruta por Vía Bloqueada ─────────────────────────────────

    markEdgeBlockedAndRecalculate(carPos) {
        const nearestNode = this._getNearestNode(carPos.x, carPos.z);
        if (this.currentPathNodes.length >= 2) {
            const currNodeIdx = this.currentPathNodes.findIndex(n => n.id === nearestNode.id);
            const nextNode = (currNodeIdx >= 0 && currNodeIdx < this.currentPathNodes.length - 1)
                ? this.currentPathNodes[currNodeIdx + 1]
                : this.currentPathNodes[1];

            if (nextNode) {
                const edgeKey1 = `${nearestNode.id}->${nextNode.id}`;
                const edgeKey2 = `${nextNode.id}->${nearestNode.id}`;
                this.blockedEdges.add(edgeKey1);
                this.blockedEdges.add(edgeKey2);
            }
        }

        this.isRerouting   = true;
        this.rerouteReason = 'Vía Bloqueada Detectada';
        setTimeout(() => { this.isRerouting = false; }, 3500);

        return this.calculateRouteWaypoints(carPos);
    }

    // ─── Baliza 3D del Destino ───────────────────────────────────────────────

    _createDestinationBeacon() {
        this.beaconMesh = new THREE.Group();

        const cylinderGeo = new THREE.CylinderGeometry(2.5, 2.5, 12, 16, 1, true);
        const cylinderMat = new THREE.MeshBasicMaterial({
            color: 0x06b6d4,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide
        });
        const cylinder = new THREE.Mesh(cylinderGeo, cylinderMat);
        cylinder.position.y = 6;
        this.beaconMesh.add(cylinder);

        const ringGeo = new THREE.RingGeometry(0.5, 3.5, 32);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x10b981,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.1;
        this.beaconMesh.add(ring);

        const pinGeo = new THREE.OctahedronGeometry(1.2);
        const pinMat = new THREE.MeshStandardMaterial({
            color: 0x38bdf8,
            emissive: 0x06b6d4,
            emissiveIntensity: 0.8,
            roughness: 0.1
        });
        const pin = new THREE.Mesh(pinGeo, pinMat);
        pin.position.y = 12.5;
        this.beaconMesh.add(pin);

        this.scene.add(this.beaconMesh);
        this.beaconPin = pin;
    }

    updateDestinationBeacon() {
        if (!this.beaconMesh) return;
        this.beaconMesh.position.set(this.targetDestination.x, 0, this.targetDestination.z);
    }

    animateBeacon(delta) {
        if (!this.beaconPin) return;
        this.beaconPin.rotation.y += delta * 1.5;
        this.beaconPin.position.y = 12.5 + Math.sin(Date.now() * 0.003) * 0.4;
    }

    // ─── Selección de Destinos ──────────────────────────────────────────────

    setDestination(indexOrId) {
        if (typeof indexOrId === 'number') {
            this.currentTargetIndex = indexOrId % this.destinations.length;
        } else {
            const foundIdx = this.destinations.findIndex(d => d.id === indexOrId);
            if (foundIdx >= 0) this.currentTargetIndex = foundIdx;
        }
        this.targetDestination = this.destinations[this.currentTargetIndex];
        this.updateDestinationBeacon();
        this.isArrived = false;
    }

    selectNextDestination() {
        this.currentTargetIndex = (this.currentTargetIndex + 1) % this.destinations.length;
        this.targetDestination  = this.destinations[this.currentTargetIndex];
        this.updateDestinationBeacon();
        this.isArrived = false;
        return this.targetDestination;
    }
}
