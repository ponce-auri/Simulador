import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';

export class City {
    constructor(scene) {
        this.scene = scene;
        this.buildings = [];
        this.trees = [];
        this.lights = [];

        // Definiciones de la cuadrícula de carreteras
        // El centro de las calles estará en estos puntos
        this.roadGrid = {
            x: [-100, -50, 0, 50, 100],
            z: [-100, -50, 0, 50, 100]
        };
        this.roadWidth = 10;
        this.laneWidth = 5;

        this.generate();
    }

    generate() {
        // 1. Suelo Base (Asfalto global)
        const groundGeo = new THREE.PlaneGeometry(300, 300);
        const groundMat = new THREE.MeshStandardMaterial({
            color: 0x1e293b, // Gris azulado oscuro (pizarra)
            roughness: 0.9,
            metalness: 0.1
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // 2. Generar Bloques de la Ciudad (Aceras, Edificios, Árboles)
        // Entre cada calle de la cuadrícula hay un bloque (manzana)
        // Con 5 líneas en la cuadrícula, tenemos 4 manzanas de ancho/largo: [-75, -25, 25, 75]
        const blockCenters = [-75, -25, 25, 75];
        const blockSize = 40; // 50 (espaciado) - 10 (calle) = 40

        blockCenters.forEach(bx => {
            blockCenters.forEach(bz => {
                this.generateBlock(bx, bz, blockSize);
            });
        });

        // 3. Generar Líneas de Señalización de Carretera y Pasos Peatonales
        this.generateRoadMarkings();
        this.generateCrosswalks();

        // 4. Iluminación Urbana (Farolas)
        this.generateStreetLights();
    }

    generateBlock(x, z, size) {
        // A) Acera Base (Gris claro elevado)
        const sidewalkGeo = new THREE.BoxGeometry(size, 0.2, size);
        const sidewalkMat = new THREE.MeshStandardMaterial({
            color: 0x94a3b8, // Gris medio
            roughness: 0.7
        });
        const sidewalk = new THREE.Mesh(sidewalkGeo, sidewalkMat);
        sidewalk.position.set(x, 0.1, z);
        sidewalk.receiveShadow = true;
        sidewalk.castShadow = true;
        this.scene.add(sidewalk);

        // B) Decidir tipo de bloque: Zona Residencial / Comercial / Parque
        const rand = Math.random();
        
        if (rand < 0.15) {
            // Parque / Área Verde
            this.generatePark(x, z, size);
        } else {
            // Edificios (2x2 parcelas por bloque)
            const offsets = [-10, 10];
            offsets.forEach(ox => {
                offsets.forEach(oz => {
                    const px = x + ox;
                    const pz = z + oz;
                    this.generateBuilding(px, pz);
                });
            });
        }
    }

    generateBuilding(x, z) {
        const height = 15 + Math.random() * 25; // Altura aleatoria entre 15 y 40
        const width = 12 + Math.random() * 4; // Ancho entre 12 y 16
        const depth = 12 + Math.random() * 4;

        // Colores de edificios modernos
        const colors = [
            0x334155, // Slate
            0x475569, // Gris azulado
            0x1e293b, // Azul muy oscuro
            0x27272a, // Zinc
            0x0f172a, // Slate profundo
            0x3f3f46  // Zinc claro
        ];
        const color = colors[Math.floor(Math.random() * colors.length)];

        const buildingGeo = new THREE.BoxGeometry(width, height, depth);
        const buildingMat = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.5,
            metalness: 0.2
        });
        const building = new THREE.Mesh(buildingGeo, buildingMat);
        building.position.set(x, height / 2 + 0.2, z);
        building.castShadow = true;
        building.receiveShadow = true;
        this.scene.add(building);
        this.buildings.push(building);

        // Generar Ventanas (Detalle Visual)
        this.generateWindowsForBuilding(building, width, height, depth);
    }

    generateWindowsForBuilding(building, w, h, d) {
        // Agregaremos pequeños paneles amarillos/celestes emisivos para simular ventanas iluminadas
        const windowGroup = new THREE.Group();
        const windowSize = 0.5;
        const windowSpacingX = 2.0;
        const windowSpacingY = 2.5;

        // Colores de luces de ventana
        const windowColors = [0xfef08a, 0xe0f2fe, 0xfef08a, 0x38bdf8]; // amarillo cálido, azul cielo, apagado (no brilla tanto)
        const windowMatOn = new THREE.MeshBasicMaterial({ color: 0xfffaa0 });
        const windowMatOff = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });

        // Función auxiliar para colocar ventanas en una cara
        const addWindowsFace = (faceWidth, faceHeight, rotationY, offsetZ, offsetXDir, offsetZDir) => {
            const cols = Math.floor(faceWidth / windowSpacingX) - 1;
            const rows = Math.floor(faceHeight / windowSpacingY) - 1;

            if (cols <= 0 || rows <= 0) return;

            const startX = -((cols - 1) * windowSpacingX) / 2;
            const startY = -((rows - 1) * windowSpacingY) / 2 + (h / 2);

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    // 30% de probabilidad de que la ventana esté encendida
                    const isOn = Math.random() < 0.4;
                    const geo = new THREE.PlaneGeometry(windowSize, windowSize * 1.5);
                    const mesh = new THREE.Mesh(geo, isOn ? windowMatOn : windowMatOff);

                    // Posicionamiento local respecto al centro del edificio
                    const lx = startX + c * windowSpacingX;
                    const ly = startY + r * windowSpacingY;
                    
                    mesh.position.set(lx * offsetXDir, ly, lx * offsetZDir);
                    mesh.position.addScaledVector(new THREE.Vector3(0, 0, offsetZ), 1);
                    mesh.rotation.y = rotationY;

                    windowGroup.add(mesh);
                }
            }
        };

        // Ventanas en las 4 caras (Norte, Sur, Este, Oeste)
        // Cara frontal (Z+)
        addWindowsFace(w, h, 0, d/2 + 0.05, 1, 0);
        // Cara trasera (Z-)
        addWindowsFace(w, h, Math.PI, -(d/2 + 0.05), -1, 0);
        // Cara derecha (X+)
        addWindowsFace(d, h, Math.PI / 2, w/2 + 0.05, 0, -1);
        // Cara izquierda (X-)
        addWindowsFace(d, h, -Math.PI / 2, -(w/2 + 0.05), 0, 1);

        building.add(windowGroup);
    }

    generatePark(x, z, size) {
        // Césped
        const grassGeo = new THREE.BoxGeometry(size - 2, 0.1, size - 2);
        const grassMat = new THREE.MeshStandardMaterial({
            color: 0x15803d, // Verde césped
            roughness: 0.9
        });
        const grass = new THREE.Mesh(grassGeo, grassMat);
        grass.position.set(x, 0.25, z);
        grass.receiveShadow = true;
        this.scene.add(grass);

        // Añadir varios árboles aleatorios en el parque
        const treeCount = 4 + Math.floor(Math.random() * 5);
        for (let i = 0; i < treeCount; i++) {
            const tx = x + (Math.random() - 0.5) * (size - 8);
            const tz = z + (Math.random() - 0.5) * (size - 8);
            this.createTree(tx, tz);
        }
    }

    createTree(x, z) {
        const treeGroup = new THREE.Group();
        treeGroup.position.set(x, 0.2, z);

        // Tronco
        const trunkGeo = new THREE.CylinderGeometry(0.2, 0.35, 2.2, 8);
        const trunkMat = new THREE.MeshStandardMaterial({
            color: 0x78350f, // Marrón
            roughness: 0.9
        });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = 1.1;
        trunk.castShadow = true;
        trunk.receiveShadow = true;
        treeGroup.add(trunk);

        // Hojas (Copa - Cono o esferas apiladas)
        const leavesMat = new THREE.MeshStandardMaterial({
            color: Math.random() > 0.5 ? 0x166534 : 0x15803d, // Variaciones de verde
            roughness: 0.8
        });

        // Copa en forma de cono estilizado
        const leavesGeo = new THREE.ConeGeometry(1.4, 2.8, 8);
        const leaves = new THREE.Mesh(leavesGeo, leavesMat);
        leaves.position.y = 2.8;
        leaves.castShadow = true;
        treeGroup.add(leaves);

        this.scene.add(treeGroup);
        this.trees.push(treeGroup);
    }

    generateRoadMarkings() {
        // Generar líneas discontinuas amarillas en el centro de todas las carreteras
        // Y líneas continuas blancas en los límites de carril
        const lineMatYellow = new THREE.MeshBasicMaterial({ color: 0xf59e0b }); // Amarillo
        const lineMatWhite = new THREE.MeshBasicMaterial({ color: 0xf8fafc });  // Blanco

        // Generar marcas a lo largo del grid
        // Calles horizontales (a lo largo del eje X, Z fijo)
        this.roadGrid.z.forEach(z => {
            // Línea central de la calle
            const centerLineGeo = new THREE.BoxGeometry(280, 0.02, 0.15);
            const centerLine = new THREE.Mesh(centerLineGeo, lineMatYellow);
            centerLine.position.set(0, 0.02, z);
            this.scene.add(centerLine);

            // Líneas laterales de carril (bordes exteriores de la calle)
            const leftBorderGeo = new THREE.BoxGeometry(280, 0.02, 0.1);
            const leftBorder = new THREE.Mesh(leftBorderGeo, lineMatWhite);
            leftBorder.position.set(0, 0.02, z - 4.8);
            this.scene.add(leftBorder);

            const rightBorder = leftBorder.clone();
            rightBorder.position.set(0, 0.02, z + 4.8);
            this.scene.add(rightBorder);
        });

        // Calles verticales (a lo largo del eje Z, X fijo)
        this.roadGrid.x.forEach(x => {
            // Línea central de la calle
            const centerLineGeo = new THREE.BoxGeometry(0.15, 0.02, 280);
            const centerLine = new THREE.Mesh(centerLineGeo, lineMatYellow);
            centerLine.position.set(x, 0.02, 0);
            this.scene.add(centerLine);

            // Líneas laterales de carril
            const leftBorderGeo = new THREE.BoxGeometry(0.1, 0.02, 280);
            const leftBorder = new THREE.Mesh(leftBorderGeo, lineMatWhite);
            leftBorder.position.set(x - 4.8, 0.02, 0);
            this.scene.add(leftBorder);

            const rightBorder = leftBorder.clone();
            rightBorder.position.set(x + 4.8, 0.02, 0);
            this.scene.add(rightBorder);
        });
    }

    generateCrosswalks() {
        const whiteMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.5
        });

        const crosswalkLocations = [
            { x: 0,    z: -100, orient: 'z' },
            { x: 0,    z: -100, orient: 'x' },
            { x: 100,  z: 0,    orient: 'z' },
            { x: 0,    z: 0,    orient: 'x' },
            { x: 0,    z: 0,    orient: 'z' },
            { x: -100, z: 0,    orient: 'x' },
            { x: 0,    z: 100,  orient: 'z' }
        ];

        crosswalkLocations.forEach(cw => {
            const stripeCount = 6;
            const stripeWidth = 0.6;
            const stripeLength = 3.6;
            const gap = 0.9;
            const startOffset = -((stripeCount - 1) * gap) / 2;

            for (let i = 0; i < stripeCount; i++) {
                const offset = startOffset + i * gap;
                let geo, px, pz;
                if (cw.orient === 'z') {
                    geo = new THREE.BoxGeometry(stripeWidth, 0.03, stripeLength);
                    px = cw.x + offset;
                    pz = cw.z - 8;
                } else {
                    geo = new THREE.BoxGeometry(stripeLength, 0.03, stripeWidth);
                    px = cw.x - 8;
                    pz = cw.z + offset;
                }
                const stripe = new THREE.Mesh(geo, whiteMat);
                stripe.position.set(px, 0.03, pz);
                stripe.receiveShadow = true;
                this.scene.add(stripe);
            }
        });
    }

    generateStreetLights() {
        // Colocar farolas en las esquinas de los bloques
        // Esquinas de los bloques se encuentran cerca de las intersecciones
        // Puntos de intersección: X en roadGrid, Z en roadGrid
        this.roadGrid.x.forEach(x => {
            this.roadGrid.z.forEach(z => {
                // No poner farola exactamente en el centro del cruce, sino en las 4 esquinas del cruce
                const offsets = [-6, 6];
                
                // Ponemos farolas solo en intersecciones principales para no sobrecargar de luces reales
                // Usaremos luces PointLight solo en algunas esquinas estratégicas
                let lightIndex = 0;
                
                offsets.forEach(ox => {
                    offsets.forEach(oz => {
                        // Solo colocamos en esquinas externas al cruce
                        const lx = x + ox;
                        const lz = z + oz;

                        // Evitar salirnos del plano de la ciudad
                        if (Math.abs(lx) > 120 || Math.abs(lz) > 120) return;

                        // Modelo físico de la farola
                        const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 5, 8);
                        const poleMat = new THREE.MeshStandardMaterial({ color: 0x475569 });
                        const pole = new THREE.Mesh(poleGeo, poleMat);
                        pole.position.set(lx, 2.5, lz);
                        pole.castShadow = true;
                        this.scene.add(pole);

                        // Brazo de la farola
                        const armGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.2, 8);
                        const arm = new THREE.Mesh(armGeo, poleMat);
                        arm.rotation.z = Math.PI / 2;
                        // Apuntar el brazo hacia la carretera
                        if (ox < 0) {
                            arm.position.set(lx + 0.6, 5, lz);
                        } else {
                            arm.position.set(lx - 0.6, 5, lz);
                        }
                        this.scene.add(arm);

                        // Foco (Bombilla emisora blanca/cálida)
                        const bulbGeo = new THREE.SphereGeometry(0.2, 8, 8);
                        const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfef08a }); // Amarillo cálido
                        const bulb = new THREE.Mesh(bulbGeo, bulbMat);
                        bulb.position.copy(arm.position);
                        bulb.position.y -= 0.1;
                        this.scene.add(bulb);

                        // Agregar PointLight real solo en algunas esquinas para rendimiento
                        // Aproximadamente 1 de cada 8 farolas tendrá luz activa dinámica
                        if ((Math.abs(x) + Math.abs(z)) % 100 === 0 && lightIndex === 0) {
                            const light = new THREE.PointLight(0xfef08a, 0.8, 15);
                            light.position.copy(bulb.position);
                            light.position.y -= 0.5;
                            // Desactivamos sombras de farolas para asegurar 60FPS constantes
                            light.castShadow = false; 
                            this.scene.add(light);
                            this.lights.push(light);
                            lightIndex++;
                        }
                    });
                });
            });
        });
    }
}
