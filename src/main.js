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
  const toRad = (d) => d * Math.PI / 180;

  const p1 = toRad(lat1);
  const p2 = toRad(lat2);
  const dp = toRad(lat2 - lat1);
  const dl = toRad(lon2 - lon1);

  const a =
    Math.sin(dp / 2) ** 2 +
    Math.cos(p1) *
      Math.cos(p2) *
      Math.sin(dl / 2) ** 2;

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

  try {
    // ----------------------------------------------------
    // 1. COMPROBAR CÁMARA DIRECTAMENTE EN EL TELÉFONO
    // ----------------------------------------------------
    setStatus("Solicitando acceso a la cámara...");

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error(
        "Este navegador no permite acceder a la cámara."
      );
    }

    let cameraStream = null;

    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: {
            ideal: "environment"
          },
          width: {
            ideal: 1280
          },
          height: {
            ideal: 720
          }
        },
        audio: false
      });

      console.log("Cámara activada correctamente.");

      const videoTrack = cameraStream.getVideoTracks()[0];

      if (videoTrack) {
        console.log(
          "Cámara:",
          videoTrack.label
        );
      }

      setStatus("Cámara activada. Iniciando AR...");
    } catch (cameraError) {
      console.error("ERROR DE CÁMARA:", cameraError);

      throw new Error(
        "No se pudo activar la cámara. Revisa los permisos de Chrome."
      );
    }

    // ----------------------------------------------------
    // 2. INICIAR LOCAR
    // ----------------------------------------------------

    const app = new App({
      canvas,

      cameraOptions: {
        hFov: 80,
        near: 0.001,
        far: 2000
      },

      videoConstraints: {
        video: {
          facingMode: {
            ideal: "environment"
          },
          width: {
            ideal: 1280
          },
          height: {
            ideal: 720
          }
        }
      }
    });

    const locar = await app.start();

    // La cámara de prueba ya confirmó que Android permite acceso.
    // Detenemos esa cámara para evitar que dos streams compitan.
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => {
        track.stop();
      });
    }

    // ----------------------------------------------------
    // 3. CONFIGURACIÓN GPS
    // ----------------------------------------------------

    locar.setGpsOptions({
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 30000
    });

    let objectsAdded = false;

    // ----------------------------------------------------
    // 4. ERROR GPS
    // ----------------------------------------------------

    locar.on("gpserror", (err) => {
      console.error("ERROR GPS:", err);

      const code = err?.code ?? "";
      const msg = err?.message ?? "Error desconocido";

      setStatus(
        `Error GPS ${code}: ${msg}`
      );

      btn.disabled = false;
      btn.textContent = "REINTENTAR";
    });

    // ----------------------------------------------------
    // 5. ACTUALIZACIÓN GPS
    // ----------------------------------------------------

    locar.on("gpsupdate", async (ev) => {
      const c = ev.position.coords;

      console.log("GPS:", c.latitude, c.longitude);
      console.log("Precisión:", c.accuracy);

      coordsEl.textContent =
        `GPS: ${c.latitude.toFixed(7)}, ${c.longitude.toFixed(7)}`;

      accuracyEl.textContent =
        `Precisión: ${Math.round(c.accuracy)} m`;

      const dist = haversineMeters(
        c.latitude,
        c.longitude,
        TARGET.lat,
        TARGET.lon
      );

      distanceEl.textContent =
        `Distancia al Laboratorio: ${Math.round(dist)} m`;

      // --------------------------------------------------
      // 6. CREAR CUBOS DE CALIBRACIÓN
      // --------------------------------------------------

      if (!objectsAdded) {

        const refs = [
          {
            dLat: 0.0005,
            dLon: 0,
            color: 0xff0000
          },
          {
            dLat: -0.0005,
            dLon: 0,
            color: 0xffff00
          },
          {
            dLat: 0,
            dLon: -0.0005,
            color: 0x00ffff
          },
          {
            dLat: 0,
            dLon: 0.0005,
            color: 0x00ff00
          }
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

        // ------------------------------------------------
        // 7. CUBO MAGENTA DEL LABORATORIO
        // ------------------------------------------------

        const targetBox = makeBox(
          0xff00ff,
          12
        );

        locar.add(
          targetBox,
          TARGET.lon,
          TARGET.lat,
          6
        );

        objectsAdded = true;

        btn.style.display = "none";

        setStatus(
          "GPS inicial recibido. Gira lentamente 360° y busca los cubos."
        );

        // ------------------------------------------------
        // 8. CARGAR ROUTER 3D
        // ------------------------------------------------

        try {
          setStatus(
            "GPS funcionando. Cargando router 3D..."
          );

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

          setStatus(
            "Router 3D cargado. Gira lentamente 360°."
          );

          console.log(
            "Router 3D cargado correctamente."
          );

        } catch (error) {
          console.error(
            "ERROR AL CARGAR ROUTER:",
            error
          );

          setStatus(
            "GPS funcionando, pero no se pudo cargar el router 3D."
          );
        }
      }
    });

    // ----------------------------------------------------
    // 9. INICIAR GPS
    // ----------------------------------------------------

    setStatus(
      "Cámara iniciada. Solicitando ubicación GPS..."
    );

    await locar.startGps();

  } catch (e) {
    console.error(
      "ERROR GENERAL:",
      e
    );

    const msg =
      e?.message ||
      String(e);

    setStatus(
      `No se pudo iniciar AR: ${msg}`
    );

    btn.disabled = false;
    btn.textContent = "REINTENTAR";
  }
});
    btn.disabled = false;
    btn.textContent = "REINTENTAR";
  }
});
