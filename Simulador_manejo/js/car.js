import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';

export class Car {
    constructor(scene, startX = 0, startZ = -100) {
        this.scene = scene;
        
        // Atributos de Física del Vehículo
        this.position = new THREE.Vector3(startX, 0, startZ);
        this.angle = 0; // Dirección/orientación del coche en radianes
        this.speed = 0; // Velocidad lineal actual
        
        this.maxSpeed = 24.0; // aprox 86 km/h
        this.maxReverseSpeed = -8.0;
        this.accelerationForce = 8.5; // Fuerza de aceleración m/s^2
        this.brakingForce = 22.0; // Fuerza de frenado m/s^2
        this.friction = 1.8; // Fricción natural con el suelo
        this.dragCoefficient = 0.05; // Resistencia aerodinámica
        
        this.steeringAngle = 0; // Ángulo de giro de las ruedas delanteras
        this.maxSteeringAngle = 0.55; // aprox 32 grados
        this.steeringSpeed = 3.5; // Velocidad de giro del volante (rad/seg)
        this.steeringReturnSpeed = 5.0; // Velocidad de autocentrado del volante

        this.wheelBase = 2.6; // Distancia entre ejes para modelo de física de bicicleta
        this.wheelRadius = 0.45;
        this.wheelRotation = 0; // Rotación acumulada de las ruedas

        this.transmissionState = 'P'; // P: Park, D: Drive, R: Reverse

        this.mesh = null;
        this.wheels = {
            frontLeft: null,
            frontRight: null,
            backLeft: null,
            backRight: null
        };
        this.brakeLights = [];
        this.headlights = [];

        this.createModel();
    }

    createModel() {
        this.mesh = new THREE.Group();
        this.mesh.position.copy(this.position);
        
        // 1. Chasis Inferior (Cuerpo principal)
        const bodyGeo = new THREE.BoxGeometry(1.9, 0.5, 4.2);
        const bodyMat = new THREE.MeshStandardMaterial({
            color: 0x06b6d4, // Cian Neón
            roughness: 0.3,
            metalness: 0.8
        });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.45;
        body.castShadow = true;
        body.receiveShadow = true;
        this.mesh.add(body);

        // Spoiler delantero estilizado
        const spoilerGeo = new THREE.BoxGeometry(1.9, 0.25, 0.4);
        const spoilerMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
        const spoiler = new THREE.Mesh(spoilerGeo, spoilerMat);
        spoiler.position.set(0, 0.3, 2.1);
        spoiler.castShadow = true;
        this.mesh.add(spoiler);

        // 2. Cabina (Techo acristalado deportivo)
        const cabinGeo = new THREE.BoxGeometry(1.5, 0.6, 2.0);
        const cabinMat = new THREE.MeshStandardMaterial({
            color: 0x0f172a, // Vidrio oscurecido
            roughness: 0.1,
            metalness: 0.9,
            transparent: true,
            opacity: 0.85
        });
        const cabin = new THREE.Mesh(cabinGeo, cabinMat);
        cabin.position.set(0, 0.95, -0.2);
        cabin.castShadow = true;
        this.mesh.add(cabin);

        // 3. Ruedas
        // Ruedas como cilindros (rotados para alinearse lateralmente)
        const wheelGeo = new THREE.CylinderGeometry(this.wheelRadius, this.wheelRadius, 0.35, 16);
        // Rotar geometría para que el cilindro mire hacia los lados (eje X local)
        wheelGeo.rotateZ(Math.PI / 2);
        
        const wheelMat = new THREE.MeshStandardMaterial({
            color: 0x18181b, // Neumático negro
            roughness: 0.85
        });

        // Detalle de llantas plateadas en el interior
        const rimGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.37, 8);
        rimGeo.rotateZ(Math.PI / 2);
        const rimMat = new THREE.MeshStandardMaterial({
            color: 0xe2e8f0, // Aluminio
            roughness: 0.2,
            metalness: 0.9
        });
        const rimMesh = new THREE.Mesh(rimGeo, rimMat);

        // Crear las 4 ruedas
        const createWheelAssembly = () => {
            const wheelGroup = new THREE.Group();
            const tire = new THREE.Mesh(wheelGeo, wheelMat);
            tire.castShadow = true;
            wheelGroup.add(tire);
            
            const rims = rimMesh.clone();
            wheelGroup.add(rims);
            return wheelGroup;
        };

        // Posiciones relativas
        // Rueda delantera: Z = 1.3, Rueda trasera: Z = -1.3, Ancho vía: X = ±1.0
        this.wheels.frontLeft = createWheelAssembly();
        this.wheels.frontLeft.position.set(-1.0, this.wheelRadius, 1.3);
        this.mesh.add(this.wheels.frontLeft);

        this.wheels.frontRight = createWheelAssembly();
        this.wheels.frontRight.position.set(1.0, this.wheelRadius, 1.3);
        this.mesh.add(this.wheels.frontRight);

        this.wheels.backLeft = createWheelAssembly();
        this.wheels.backLeft.position.set(-1.0, this.wheelRadius, -1.3);
        this.mesh.add(this.wheels.backLeft);

        this.wheels.backRight = createWheelAssembly();
        this.wheels.backRight.position.set(1.0, this.wheelRadius, -1.3);
        this.mesh.add(this.wheels.backRight);

        // 4. Luces traseras de Freno (Emisivos Rojos)
        const brakeLightGeo = new THREE.BoxGeometry(0.3, 0.1, 0.05);
        this.brakeLightMat = new THREE.MeshStandardMaterial({
            color: 0x3f0000, // Rojo apagado inicial
            emissive: 0x3f0000,
            roughness: 0.5
        });
        
        const bLightLeft = new THREE.Mesh(brakeLightGeo, this.brakeLightMat);
        bLightLeft.position.set(-0.7, 0.55, -2.11);
        this.mesh.add(bLightLeft);
        this.brakeLights.push(bLightLeft);

        const bLightRight = bLightLeft.clone();
        bLightRight.position.set(0.7, 0.55, -2.11);
        this.mesh.add(bLightRight);
        this.brakeLights.push(bLightRight);

        // 5. Faros Delanteros y Focos Proyectores (SpotLights)
        const headLightGeo = new THREE.BoxGeometry(0.3, 0.1, 0.05);
        const headLightMat = new THREE.MeshBasicMaterial({ color: 0xfffbeb }); // Amarillo/blanco brillante
        
        const hLightLeft = new THREE.Mesh(headLightGeo, headLightMat);
        hLightLeft.position.set(-0.7, 0.5, 2.11);
        this.mesh.add(hLightLeft);

        const hLightRight = hLightLeft.clone();
        hLightRight.position.set(0.7, 0.5, 2.11);
        this.mesh.add(hLightRight);

        // Luces físicas SpotLight (Faros de noche)
        const createSpotLight = (offsetDir) => {
            const spotLight = new THREE.SpotLight(0xfffbeb, 2.5, 30, Math.PI / 6, 0.5, 1);
            spotLight.position.set(0.7 * offsetDir, 0.5, 2.15);
            // El objetivo de la luz estará unos metros por delante del faro
            const target = new THREE.Object3D();
            target.position.set(0.7 * offsetDir, 0.2, 10.0);
            
            spotLight.add(target);
            spotLight.target = target;
            
            this.mesh.add(spotLight);
            this.headlights.push(spotLight);
        };
        createSpotLight(-1); // Faro Izquierdo
        createSpotLight(1);  // Faro Derecho

        // Añadir el coche completo a la escena
        this.scene.add(this.mesh);
    }

    /**
     * Aplica la física de movimiento al coche basada en las teclas presionadas
     */
    update(inputs, autopilotControls, isAutopilot, delta) {
        if (delta <= 0) return;

        // 1. Resolver fuente de controles (Manual vs Piloto Automático)
        const activeInputs = isAutopilot ? autopilotControls : inputs;

        // 2. Control de la caja de cambios / Transmisión
        if (this.speed > 0.05) {
            this.transmissionState = 'D'; // Drive
        } else if (this.speed < -0.05) {
            this.transmissionState = 'R'; // Reverse
        } else {
            this.transmissionState = isAutopilot ? 'D' : 'P'; // En piloto automático D, en manual P por defecto
        }

        // 3. Aceleración y Frenado
        let currentBraking = false;

        if (activeInputs.forward) {
            // Acelerar adelante
            if (this.speed >= 0) {
                this.speed += this.accelerationForce * delta;
            } else {
                // Si va marcha atrás, el acelerador funciona como freno primero
                this.speed += this.brakingForce * delta;
                currentBraking = true;
            }
        } else if (activeInputs.backward) {
            // Retroceder / Frenar
            if (this.speed > 0.05) {
                // Si va adelante, la tecla de retroceso es el freno
                this.speed -= this.brakingForce * delta;
                currentBraking = true;
            } else {
                // Acelerar marcha atrás
                this.speed -= this.accelerationForce * delta;
            }
        } else {
            // Fricción / Desaceleración pasiva si no se pulsa nada
            const frictionEffect = this.friction * delta;
            const dragEffect = this.dragCoefficient * this.speed * Math.abs(this.speed) * delta;
            
            if (this.speed > 0) {
                this.speed = Math.max(0, this.speed - frictionEffect - dragEffect);
            } else if (this.speed < 0) {
                this.speed = Math.min(0, this.speed + frictionEffect + dragEffect);
            }
        }

        // Freno de mano (Espacio)
        if (activeInputs.handbrake) {
            if (this.speed > 0) {
                this.speed = Math.max(0, this.speed - this.brakingForce * 1.5 * delta);
            } else {
                this.speed = Math.min(0, this.speed + this.brakingForce * 1.5 * delta);
            }
            currentBraking = true;
        }

        // Limitar la velocidad a los rangos máximos
        this.speed = Math.max(this.maxReverseSpeed, Math.min(this.maxSpeed, this.speed));

        // 4. Control de la Dirección (Giro de las ruedas delanteras)
        if (activeInputs.left) {
            // Girar a la izquierda
            this.steeringAngle = Math.min(this.maxSteeringAngle, this.steeringAngle + this.steeringSpeed * delta);
        } else if (activeInputs.right) {
            // Girar a la derecha
            this.steeringAngle = Math.max(-this.maxSteeringAngle, this.steeringAngle - this.steeringSpeed * delta);
        } else {
            // Autocentrado del volante
            if (this.steeringAngle > 0) {
                this.steeringAngle = Math.max(0, this.steeringAngle - this.steeringReturnSpeed * delta);
            } else if (this.steeringAngle < 0) {
                this.steeringAngle = Math.min(0, this.steeringAngle + this.steeringReturnSpeed * delta);
            }
        }

        // Visualizar estado de frenos cambiando la intensidad emisiva de las luces rojas traseras
        if (currentBraking) {
            this.brakeLightMat.color.setHex(0xff0000);
            this.brakeLightMat.emissive.setHex(0xff0000);
        } else {
            this.brakeLightMat.color.setHex(0x5f0000);
            this.brakeLightMat.emissive.setHex(0x5f0000);
        }

        // 5. Modelo Cinemático de Bicicleta (Actualizar posición y ángulo)
        // El coche gira en función del ángulo del volante y la velocidad lineal
        if (Math.abs(this.speed) > 0.01) {
            // Cambio de orientación angular (dAngle = velocidad * sin(steering) / wheelbase * delta)
            const turningRadiusChange = (this.speed / this.wheelBase) * Math.sin(this.steeringAngle) * delta;
            this.angle += turningRadiusChange;
        }

        // Vector de velocidad en función de la orientación actual
        const vx = this.speed * Math.sin(this.angle);
        const vz = this.speed * Math.cos(this.angle);

        this.position.x += vx * delta;
        this.position.z += vz * delta;

        // Actualizar posición y rotación en la malla del coche 3D
        this.mesh.position.copy(this.position);
        this.mesh.rotation.y = this.angle;

        // 6. Animación y Rotación Visual de las Ruedas
        // Las ruedas rotan en base al espacio recorrido: dTheta = distancia / radio_rueda
        const distanceTraveled = this.speed * delta;
        this.wheelRotation += distanceTraveled / this.wheelRadius;

        // Ruedas Delanteras: aplican rotación por velocidad (X) y rotación por dirección (Y)
        if (this.wheels.frontLeft && this.wheels.frontRight) {
            // Rueda Delantera Izquierda
            this.wheels.frontLeft.rotation.y = this.steeringAngle;
            this.wheels.frontLeft.children[0].rotation.x = this.wheelRotation; // rotar el neumático sobre X
            this.wheels.frontLeft.children[1].rotation.x = this.wheelRotation; // rotar la llanta
            
            // Rueda Delantera Derecha
            this.wheels.frontRight.rotation.y = this.steeringAngle;
            this.wheels.frontRight.children[0].rotation.x = this.wheelRotation;
            this.wheels.frontRight.children[1].rotation.x = this.wheelRotation;
        }

        // Ruedas Traseras: solo aplican rotación por velocidad (X), no giran al virar
        if (this.wheels.backLeft && this.wheels.backRight) {
            this.wheels.backLeft.children[0].rotation.x = this.wheelRotation;
            this.wheels.backLeft.children[1].rotation.x = this.wheelRotation;

            this.wheels.backRight.children[0].rotation.x = this.wheelRotation;
            this.wheels.backRight.children[1].rotation.x = this.wheelRotation;
        }
    }

    /**
     * Retorna la velocidad del coche convertida a Km/h para visualización en el HUD
     */
    getSpeedKmH() {
        // Multiplicar velocidad virtual por factor para escala realista
        return Math.round(Math.abs(this.speed) * 3.6);
    }
}
