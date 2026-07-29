import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';

// Utilidad para crear texturas de señales viales usando HTML5 Canvas 2D
function createSignTexture(type, text) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    // Limpiar canvas
    ctx.clearRect(0, 0, 128, 128);
    
    if (type === 'STOP') {
        // Octágono Rojo
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        const r = 58;
        const cx = 64;
        const cy = 64;
        for (let i = 0; i < 8; i++) {
            const angle = (i * Math.PI) / 4 + Math.PI / 8;
            const x = cx + r * Math.cos(angle);
            const y = cy + r * Math.sin(angle);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        
        // Borde blanco fino
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.stroke();
        
        // Texto
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 26px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('STOP', 64, 64);
        
    } else if (type === 'CEDA') {
        // Triángulo invertido blanco con borde rojo
        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.moveTo(64, 114); // Punto inferior
        ctx.lineTo(14, 24);  // Superior izquierdo
        ctx.lineTo(114, 24); // Superior derecho
        ctx.closePath();
        ctx.fill();
        
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 8;
        ctx.stroke();
        
    } else if (type === 'LIMIT') {
        // Círculo blanco con borde rojo y límite de velocidad
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(64, 64, 52, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 8;
        ctx.stroke();
        
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 44px Share Tech Mono, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 64, 64);
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}

export class TrafficSystem {
    constructor(scene) {
        this.scene = scene;
        this.elements = []; // Almacena todas las señales y semáforos

        this.generateSignals();
    }

    generateSignals() {
        // Definición de señales a lo largo de la ruta del coche
        // Eje Z = -100, Conduciendo al Este (carril derecho Z = -102.5, acera derecha Z = -106.0)
        this.addSpeedLimit(-70, -106.0, 50, -Math.PI / 2);  // Límite 50
        this.addYield(-10, -106.0, -Math.PI / 2);            // Ceda el Paso antes del cruce X = 0
        this.addTrafficLight(94, -106.0, -Math.PI / 2, 'GREEN'); // Semáforo antes del giro X = 100

        // Eje X = 100, Conduciendo al Norte (carril derecho X = 102.5, acera derecha X = 106.0)
        this.addSpeedLimit(106.0, -80, 80, 0);              // Límite 80
        this.addStop(106.0, -8, 0);                         // STOP antes del cruce Z = 0

        // Eje Z = 0, Conduciendo al Oeste (carril derecho Z = 2.5, acera derecha Z = 6.0)
        this.addSpeedLimit(80, 6.0, 30, Math.PI / 2);       // Límite 30 (Zona residencial)
        this.addTrafficLight(8, 6.0, Math.PI / 2, 'RED');   // Semáforo antes del cruce X = 0

        // Eje X = 0, Conduciendo al Norte (carril derecho X = 2.5, acera derecha X = 6.0)
        this.addSpeedLimit(6.0, 20, 50, 0);                 // Límite 50
        this.addYield(6.0, 42, 0);                          // Ceda el Paso antes del cruce Z = 50
        this.addTrafficLight(6.0, 94, 0, 'GREEN');          // Semáforo antes del giro Z = 100

        // Eje Z = 100, Conduciendo al Oeste (carril derecho Z = 102.5, acera derecha Z = 106.0)
        this.addSpeedLimit(-20, 106.0, 80, Math.PI / 2);     // Límite 80
        this.addStop(-94, 106.0, Math.PI / 2);              // STOP antes del giro X = -100

        // Eje X = -100, Conduciendo al Sur (carril derecho X = -102.5, acera derecha X = -106.0)
        this.addSpeedLimit(-106.0, 80, 50, Math.PI);        // Límite 50
        this.addTrafficLight(-106.0, -94, Math.PI, 'RED');  // Semáforo antes del giro Z = -100
    }

    addStop(x, z, rotY) {
        const group = this.createPole();
        
        // Crear placa octogonal de STOP
        const plateGeo = new THREE.BoxGeometry(0.85, 0.85, 0.06);
        const frontMat = new THREE.MeshBasicMaterial({ map: createSignTexture('STOP') });
        const backMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8 });
        const materials = [backMat, backMat, backMat, backMat, frontMat, backMat];
        const plate = new THREE.Mesh(plateGeo, materials);
        plate.position.set(0, 2.9, 0);
        group.add(plate);

        group.position.set(x, 0.2, z);
        group.rotation.y = rotY;
        this.scene.add(group);

        this.elements.push({
            type: 'STOP',
            position: new THREE.Vector3(x, 0.2, z),
            rotationY: rotY,
            radius: 4.0, // Radio de detección
            processed: false,
            cooldown: 0
        });
    }

    addYield(x, z, rotY) {
        const group = this.createPole();

        // Crear placa de Ceda el Paso (Triángulo)
        const plateGeo = new THREE.BoxGeometry(0.85, 0.85, 0.06);
        const frontMat = new THREE.MeshBasicMaterial({ map: createSignTexture('CEDA') });
        const backMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8 });
        const materials = [backMat, backMat, backMat, backMat, frontMat, backMat];
        const plate = new THREE.Mesh(plateGeo, materials);
        plate.position.set(0, 2.9, 0);
        group.add(plate);

        group.position.set(x, 0.2, z);
        group.rotation.y = rotY;
        this.scene.add(group);

        this.elements.push({
            type: 'CEDA',
            position: new THREE.Vector3(x, 0.2, z),
            rotationY: rotY,
            radius: 5.0
        });
    }

    addSpeedLimit(x, z, limitValue, rotY) {
        const group = this.createPole();

        // Placa circular de límite
        const plateGeo = new THREE.BoxGeometry(0.8, 0.8, 0.06);
        const frontMat = new THREE.MeshBasicMaterial({ map: createSignTexture('LIMIT', limitValue.toString()) });
        const backMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8 });
        const materials = [backMat, backMat, backMat, backMat, frontMat, backMat];
        const plate = new THREE.Mesh(plateGeo, materials);
        plate.position.set(0, 2.9, 0);
        group.add(plate);

        group.position.set(x, 0.2, z);
        group.rotation.y = rotY;
        this.scene.add(group);

        this.elements.push({
            type: 'LIMIT',
            value: limitValue,
            position: new THREE.Vector3(x, 0.2, z),
            rotationY: rotY,
            radius: 6.0
        });
    }

    addTrafficLight(x, z, rotY, initialColor = 'GREEN') {
        const group = new THREE.Group();

        // Poste del semáforo
        const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 3.4, 8);
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x3f3f46, metalness: 0.7 });
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.y = 1.7;
        pole.castShadow = true;
        group.add(pole);

        // Caja de luces
        const boxGeo = new THREE.BoxGeometry(0.45, 1.2, 0.35);
        const boxMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.5 });
        const box = new THREE.Mesh(boxGeo, boxMat);
        box.position.set(0, 3.0, 0);
        box.castShadow = true;
        group.add(box);

        // Bombillas (Esferas)
        const bulbGeo = new THREE.SphereGeometry(0.12, 12, 12);
        
        // Materiales con color emisivo básico (brillo nocturno)
        const matRed = new THREE.MeshStandardMaterial({ color: 0x3f0505, emissive: 0x1f0000 });
        const matYellow = new THREE.MeshStandardMaterial({ color: 0x3f3f05, emissive: 0x1f1f00 });
        const matGreen = new THREE.MeshStandardMaterial({ color: 0x053f05, emissive: 0x001f00 });

        const bulbRed = new THREE.Mesh(bulbGeo, matRed);
        bulbRed.position.set(0, 3.35, 0.19);
        group.add(bulbRed);

        const bulbYellow = new THREE.Mesh(bulbGeo, matYellow);
        bulbYellow.position.set(0, 3.0, 0.19);
        group.add(bulbYellow);

        const bulbGreen = new THREE.Mesh(bulbGeo, matGreen);
        bulbGreen.position.set(0, 2.65, 0.19);
        group.add(bulbGreen);

        // Visores estilizados (Pequeñas viseras sobre los focos)
        const visorGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.16, 8, 1, true, 0, Math.PI);
        visorGeo.rotateX(Math.PI / 2);
        const visorMat = new THREE.MeshStandardMaterial({ color: 0x18181b, side: THREE.DoubleSide });
        
        const createVisor = (y) => {
            const visor = new THREE.Mesh(visorGeo, visorMat);
            visor.position.set(0, y + 0.1, 0.22);
            group.add(visor);
        };
        createVisor(3.35);
        createVisor(3.0);
        createVisor(2.65);

        // Posicionar grupo completo en escena
        group.position.set(x, 0.2, z);
        group.rotation.y = rotY;
        this.scene.add(group);

        // Lógica de Semáforo
        const durations = { GREEN: 6.0, YELLOW: 2.0, RED: 6.0 };
        
        const lightElement = {
            type: 'LIGHT',
            position: new THREE.Vector3(x, 0.2, z),
            rotationY: rotY,
            radius: 16.0, // Radio de detección
            state: initialColor,
            timer: durations[initialColor],
            durations: durations,
            meshes: { red: bulbRed, yellow: bulbYellow, green: bulbGreen },
            materials: { red: matRed, yellow: matYellow, green: matGreen }
        };

        this.elements.push(lightElement);
        this.updateBulbMaterials(lightElement);
    }

    createPole() {
        const group = new THREE.Group();

        // Poste metálico estándar
        const poleGeo = new THREE.CylinderGeometry(0.06, 0.08, 3.0, 8);
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.8, roughness: 0.2 });
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.y = 1.5;
        pole.castShadow = true;
        group.add(pole);

        return group;
    }

    updateBulbMaterials(light) {
        // Apagar todos primero
        light.materials.red.color.setHex(0x3f0505);
        light.materials.red.emissive.setHex(0x1f0000);
        light.materials.yellow.color.setHex(0x3f3f05);
        light.materials.yellow.emissive.setHex(0x1f1f00);
        light.materials.green.color.setHex(0x053f05);
        light.materials.green.emissive.setHex(0x001f00);

        // Encender la correspondiente
        if (light.state === 'RED') {
            light.materials.red.color.setHex(0xff3b30);
            light.materials.red.emissive.setHex(0xff3b30);
        } else if (light.state === 'YELLOW') {
            light.materials.yellow.color.setHex(0xffcc00);
            light.materials.yellow.emissive.setHex(0xffcc00);
        } else if (light.state === 'GREEN') {
            light.materials.green.color.setHex(0x34c759);
            light.materials.green.emissive.setHex(0x34c759);
        }
    }

    /**
     * Actualiza el ciclo de luces de todos los semáforos
     */
    update(delta) {
        this.elements.forEach(el => {
            // Manejar cooldowns de las señales (ej: para no re-procesar STOP en bucle inmediato)
            if (el.type === 'STOP' && el.processed) {
                el.cooldown -= delta;
                if (el.cooldown <= 0) {
                    el.processed = false;
                }
            }

            // Actualizar Semáforo
            if (el.type === 'LIGHT') {
                el.timer -= delta;
                if (el.timer <= 0) {
                    // Transición de Estados
                    if (el.state === 'GREEN') {
                        el.state = 'YELLOW';
                        el.timer = el.durations.YELLOW;
                    } else if (el.state === 'YELLOW') {
                        el.state = 'RED';
                        el.timer = el.durations.RED;
                    } else if (el.state === 'RED') {
                        el.state = 'GREEN';
                        el.timer = el.durations.GREEN;
                    }
                    this.updateBulbMaterials(el);
                }
            }
        });
    }
}
