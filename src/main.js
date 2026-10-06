import * as THREE from "three";
import { App } from "locar";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const btn = document.getElementById("start");
const statusEl = document.getElementById("status");
const coordsEl = document.getElementById("coords");
const accuracyEl = document.getElementById("accuracy");
const distanceEl = document.getElementById("distance");
const canvas = document.getElementById("ar-canvas");

const TARGET = {
  lat: -2.291122,
  lon: -78.1141843,
  name: "LABORATORIO DE REDES"
};

function setStatus(msg) {
  statusEl.textContent = msg;
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const p1 = toRad(lat1), p2 = toRad(lat2);
  const dp = toRad(lat2 - lat1);
  const dl = toRad(lon2 - lon1);
  const a = Math.sin(dp/2)**2 +
            Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function makeBox(color, size = 10) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size),
    new THREE.MeshBasicMaterial({ color })
  );
}

btn.addEventListener("click", async () => {
  btn.disabled = true;
  btn.textContent = "INICIANDO...";
  setStatus("Solicitando cámara y sensores...");

  try {
    const app = new App({
      canvas,
      cameraOptions: {
        hFov: 80,
        near: 0.001,
        far: 2000
      },
      videoConstraints: {
        video: { facingMode: "environment" }
      }
    });

    // App.start() inicia cámara/orientación y entrega el objeto LocAR.
    const locar = await app.start();

    // Configurar GPS ANTES de arrancarlo.
    locar.setGpsOptions({
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 30000
    });

    let objectsAdded = false;

    locar.on("gpserror", (err) => {
      const code = err?.code ?? "";
      const msg = err?.message ?? "Error desconocido";
      setStatus(`Error GPS ${code}: ${msg}`);
      btn.disabled = false;
      btn.textContent = "REINTENTAR";
    });

    locar.on("gpsupdate", async (ev) => {
      const c = ev.position.coords;

      coordsEl.textContent =
        `GPS: ${c.latitude.toFixed(7)}, ${c.longitude.toFixed(7)}`;
      accuracyEl.textContent =
        `Precisión: ${Math.round(c.accuracy)} m`;

      const dist = haversineMeters(
        c.latitude, c.longitude, TARGET.lat, TARGET.lon
      );
      distanceEl.textContent =
        `Distancia al Laboratorio: ${Math.round(dist)} m`;

      // IMPORTANTE:
      // LocAR no puede convertir lat/lon a coordenadas 3D antes de tener
      // una posición GPS inicial. Por eso los objetos se agregan recién
      // dentro del primer gpsupdate.
      if (!objectsAdded) {
        const loader = new GLTFLoader();

const gltf = await loader.loadAsync(
  "/models/router.glb"
);

const router = gltf.scene;

router.scale.set(
  5,
  5,
  5
);

router.rotation.set(
  0,
  0,
  0
);

locar.add(
  router,
  TARGET.lon,
  TARGET.lat,
  5
);

        const refs = [
          { dLat:  0.0005, dLon:  0,      color: 0xff0000 }, // norte
          { dLat: -0.0005, dLon:  0,      color: 0xffff00 }, // sur
          { dLat:  0,      dLon: -0.0005, color: 0x00ffff }, // oeste
          { dLat:  0,      dLon:  0.0005, color: 0x00ff00 }  // este
        ];

        for (const r of refs) {
          const box = makeBox(r.color, 10);
          locar.add(
            box,
            c.longitude + r.dLon,
            c.latitude + r.dLat,
            5
          );
        }

        objectsAdded = true;
        setStatus("GPS inicial recibido. Gira lentamente 360° y busca los cubos.");
        btn.style.display = "none";
      }
    });

    setStatus("Cámara iniciada. Solicitando ubicación GPS...");
    await locar.startGps();

  } catch (e) {
    console.error(e);
    const msg = e?.message || String(e);
    setStatus(`No se pudo iniciar AR: ${msg}`);
    btn.disabled = false;
    btn.textContent = "REINTENTAR";
  }
});
