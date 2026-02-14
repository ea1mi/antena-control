#!/usr/bin/env python3
import time
import paho.mqtt.client as mqtt
from pytapo import Tapo

# ---------------------------
# CONFIGURACIÓN
# ---------------------------
TAPO_IP = "192.168.1.50"
TAPO_USER = "usuario_camara"  # usuario de la "camera account" en la app Tapo
TAPO_PASS = "contraseña_camara"

MQTT_BROKER = "192.168.1.10"
MQTT_PORT = 1883
MQTT_TOPIC_PREFIX = "camaras/tapo1"

INTERVALO = 5  # segundos
# ---------------------------

def main():
    # Conectar a la cámara Tapo
    tapo = Tapo(TAPO_IP, TAPO_USER, TAPO_PASS)

    # Conectar a MQTT
    client = mqtt.Client()
    client.connect(MQTT_BROKER, MQTT_PORT, 60)

    print("Conectado a Tapo y MQTT. Iniciando publicación...")

    while True:
        try:
            # Obtener info básica
            basic = tapo.getBasicInfo()
            # Obtener detección de movimiento
            motion = tapo.isMotionDetected()

            # Publicar estados en MQTT
            client.publish(f"{MQTT_TOPIC_PREFIX}/online", basic["device_on"], retain=True)
            client.publish(f"{MQTT_TOPIC_PREFIX}/motion", str(motion), retain=True)
            client.publish(f"{MQTT_TOPIC_PREFIX}/firmware", basic["fw_version"], retain=True)
            client.publish(f"{MQTT_TOPIC_PREFIX}/ip", basic.get("ip", ""), retain=True)

            print(f"[MQTT] online={basic['device_on']} motion={motion}")

        except Exception as e:
            print("Error:", e)
            client.publish(f"{MQTT_TOPIC_PREFIX}/error", str(e), retain=True)

        time.sleep(INTERVALO)


if __name__ == "__main__":
    main()
