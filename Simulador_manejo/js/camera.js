import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';

export class CameraController {
    constructor(camera) {
        this.camera = camera;
        this.modes = {
            THIRD_PERSON: 'thirdPerson',
            FIRST_PERSON: 'firstPerson'
        };
        this.currentMode = this.modes.THIRD_PERSON;
        
        // Parámetros de la cámara en tercera persona
        this.thirdPersonOffset = new THREE.Vector3(0, 4.5, -10.5); // Altura y distancia detrás
        this.thirdPersonLookOffset = new THREE.Vector3(0, 1.2, 2.5); // Punto al que mira adelante del coche
        this.lerpSpeed = 0.08; // Suavizado de seguimiento (menor es más lento/suave)

        // Parámetros de la cámara en primera persona (cabina)
        this.firstPersonOffset = new THREE.Vector3(0, 1.2, 0.4); // Ubicación en el capó/cabina
        this.firstPersonLookOffset = new THREE.Vector3(0, 1.1, 8.0); // Punto lejano al frente
    }

    /**
     * Alterna entre vistas de cámara.
     */
    toggleCamera() {
        if (this.currentMode === this.modes.THIRD_PERSON) {
            this.currentMode = this.modes.FIRST_PERSON;
        } else {
            this.currentMode = this.modes.THIRD_PERSON;
        }
        return this.currentMode;
    }

    /**
     * Devuelve el nombre legible del modo de cámara actual.
     */
    getModeName() {
        return this.currentMode === this.modes.THIRD_PERSON ? '3ª PERSONA' : '1ª PERSONA';
    }

    /**
     * Actualiza la posición y orientación de la cámara según la posición del coche.
     * @param {THREE.Object3D} carMesh - Malla del vehículo
     * @param {number} delta - Delta de tiempo
     */
    update(carMesh, delta) {
        if (!carMesh) return;

        // Obtener la matriz de transformación del coche
        const carMatrix = carMesh.matrixWorld;

        if (this.currentMode === this.modes.THIRD_PERSON) {
            // Tercera persona: posición detrás del coche con interpolación (lerp)
            const targetPos = this.thirdPersonOffset.clone().applyMatrix4(carMatrix);
            this.camera.position.lerp(targetPos, this.lerpSpeed);

            // Apuntar la cámara al coche (ligeramente al frente de su centro)
            const targetLook = this.thirdPersonLookOffset.clone().applyMatrix4(carMatrix);
            this.camera.lookAt(targetLook);
        } else {
            // Primera persona: acoplado rígidamente al coche para evitar retraso visual y mareo
            const targetPos = this.firstPersonOffset.clone().applyMatrix4(carMatrix);
            this.camera.position.copy(targetPos);

            // Apuntar en la dirección frontal del coche
            const targetLook = this.firstPersonLookOffset.clone().applyMatrix4(carMatrix);
            this.camera.lookAt(targetLook);
        }
    }
}
