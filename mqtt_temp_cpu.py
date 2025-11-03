#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import os
import time
import psutil
import paho.mqtt.client as mqtt

BROKER = "192.168.10.21"           # Dirección del broker MQTT
TOPIC = "reles/relay13023/system"  # Topic MQTT
CLIENT_ID = "rpi_system_monitor"

def get_temp():
    try:
        temps = psutil.sensors_temperatures()
        for key in temps:
            if temps[key]:
                return temps[key][0].current
    except Exception:
        pass
    try:
        output = os.popen("vcgencmd measure_temp").readline()
        return float(output.replace("temp=", "").replace("'C\n", ""))
    except Exception:
        return None

client = mqtt.Client(CLIENT_ID)

try:
    client.connect(BROKER)
    print(f"? Conectado al broker MQTT {BROKER}")
except Exception as e:
    print(f"? Error al conectar con MQTT: {e}")
    exit(1)

while True:
    temp = get_temp()
    cpu = psutil.cpu_percent(interval=1)

    if temp is not None:
        payload = f"{cpu:.1f},{temp:.1f}"
        print(f"?? Publicando: {payload}")
        client.publish(TOPIC, payload)
    else:
        print("?? No se pudo leer la temperatura de CPU")

    time.sleep(10)
