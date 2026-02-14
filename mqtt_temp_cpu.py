#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import os
import time
import paho.mqtt.client as mqtt

BROKER = "192.168.10.21"           # Dirección del broker MQTT
TOPIC = "reles/relay13023/system"  # Topic MQTT
CLIENT_ID = "rpi_system_monitor"

# Obtener temperatura de la CPU sin psutil
def get_temp():
    try:
        output = os.popen("vcgencmd measure_temp").read().strip()
        # Ejemplo: temp=41.2'C
        temp = output.replace("temp=", "").replace("'C", "")
        return float(temp)
    except:
        return None

# Obtener uso de CPU sin psutil
def get_cpu_usage():
    idle1, total1 = read_cpu_times()
    time.sleep(0.7)
    idle2, total2 = read_cpu_times()

    idle_delta = idle2 - idle1
    total_delta = total2 - total1

    if total_delta == 0:
        return 0.0

    cpu_usage = 100.0 * (1.0 - (idle_delta / total_delta))
    return cpu_usage

def read_cpu_times():
    with open("/proc/stat", "r") as f:
        fields = f.readline().strip().split()[1:]
        fields = [float(x) for x in fields]
        idle = fields[3]
        total = sum(fields)
        return idle, total

# MQTT
client = mqtt.Client(
    client_id=CLIENT_ID,
    protocol=mqtt.MQTTv311,
    callback_api_version=mqtt.CallbackAPIVersion.VERSION1
)

try:
    client.connect(BROKER)
    client.loop_start()
    print(f"✅ Conectado al broker MQTT {BROKER}")
except Exception as e:
    print(f"❌ Error conectando a MQTT: {e}")
    exit(1)

# Bucle principal
while True:
    temp = get_temp()
    cpu = get_cpu_usage()

    if temp is not None:
        payload = f"{cpu:.1f},{temp:.1f}"
        print(f"📤 Publicando: {payload}")
        client.publish(TOPIC, payload)
    else:
        print("⚠️ No se pudo leer la temperatura de CPU")

    time.sleep(60)
