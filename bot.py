# -*- coding: utf-8 -*-
import os
import json
import time
import paho.mqtt.client as mqtt
from telegram import Update
from telegram.ext import (
    ApplicationBuilder, CommandHandler,
    ContextTypes
)

BOT_TOKEN = os.getenv("BOT_TOKEN", "8177135522:AAEn3tKrK9BfdWpQBsYceQuLmqaGy51ssv4")
MQTT_HOST = os.getenv("MQTT_HOST", "192.168.10.21")
MQTT_PORT = int(os.getenv("MQTT_PORT", 1883))
BASE_TOPIC = os.getenv("BASE_TOPIC", "reles/relay13023")
CHAT_ID = None

TASMOTA_CMD = "cmnd/Smartplug_577019/POWER"
TASMOTA_STAT = "stat/Smartplug_577019/POWER"
TASMOTA_RESULT = "stat/Smartplug_577019/RESULT"

RELAYS = ["r1","r2","r3","r4","r5","r6","r7","r8"]
ENCLAVABLES = ["r1","r2","r3","r4"]

relays_state = {r: None for r in RELAYS}
tasmota_state = None
last_sys = None
telegram_app = None


# MQTT CALLBACK
def on_mqtt_message(client, userdata, msg):
    global tasmota_state, last_sys

    topic = msg.topic
    payload = msg.payload.decode("utf-8", errors="replace")
    ts = time.strftime("%H:%M:%S")

    if topic.startswith(BASE_TOPIC + "/out/"):
        relay = topic.split("/")[-1]
        relays_state[relay] = (payload.upper() == "ON")
        print(f"{relay} -> {payload} ({ts})")
        send_notify(f"{relay} -> {payload} ({ts})")

    elif topic.endswith("/system"):
        last_sys = payload
        send_notify(f"Sistema: {payload} ({ts})")

    elif topic in (TASMOTA_STAT, TASMOTA_RESULT):
        try:
            if payload.startswith("{"):
                state = json.loads(payload).get("POWER", payload)
            else:
                state = payload
        except:
            state = payload

        tasmota_state = (state.upper() == "ON")
        send_notify(f"Tasmota -> {state} ({ts})")


def send_notify(text):
    if CHAT_ID and telegram_app is not None:
        try:
            telegram_app.bot.send_message(chat_id=int(CHAT_ID), text=text)
        except:
            pass


def mqtt_publish(topic, payload):
    print("MQTT:", topic, payload)
    mqtt_client.publish(topic, payload)


# -------------------- TELEGRAM COMMANDS --------------------

async def cmd_start(update: Update, ctx):
    await update.message.reply_text("Bot iniciado. Usa /help")

async def cmd_help(update: Update, ctx):
    await update.message.reply_text(
        "/status\n"
        "/on r1\n/off r1\n/toggle r1\n"
        "/sel r1 (enclavable)\n"
        "/tasmota on|off"
    )

async def cmd_status(update: Update, ctx):
    lines = []

    for r in RELAYS:
        st = relays_state[r]
        st = "?" if st is None else ("ON" if st else "OFF")
        lines.append(f"{r}: {st}")

    lines.append(f"Tasmota: {tasmota_state}")
    lines.append(f"Sistema: {last_sys}")

    await update.message.reply_text("\n".join(lines))

async def cmd_on(update: Update, ctx):
    r = ctx.args[0]
    mqtt_publish(f"{BASE_TOPIC}/in/{r}", "ON")
    await update.message.reply_text(r + " ON")

async def cmd_off(update: Update, ctx):
    r = ctx.args[0]
    mqtt_publish(f"{BASE_TOPIC}/in/{r}", "OFF")
    await update.message.reply_text(r + " OFF")

async def cmd_toggle(update: Update, ctx):
    r = ctx.args[0]
    current = relays_state.get(r, False)
    new = not current
    mqtt_publish(f"{BASE_TOPIC}/in/{r}", "ON" if new else "OFF")
    await update.message.reply_text(f"{r} -> {'ON' if new else 'OFF'}")

async def cmd_sel(update: Update, ctx):
    sel = ctx.args[0]
    if sel not in ENCLAVABLES:
        return await update.message.reply_text("Debe ser r1..r4")

    for r in ENCLAVABLES:
        mqtt_publish(f"{BASE_TOPIC}/in/{r}", "ON" if r == sel else "OFF")

    await update.message.reply_text("Seleccionado " + sel)

async def cmd_tasmota(update: Update, ctx):
    v = ctx.args[0].lower()
    mqtt_publish(TASMOTA_CMD, v.upper())
    await update.message.reply_text("Tasmota " + v.upper())


# -------------------- MAIN --------------------

def start_bot():
    global telegram_app, mqtt_client

    # MQTT
    mqtt_client = mqtt.Client()
    mqtt_client.on_message = on_mqtt_message
    mqtt_client.connect(MQTT_HOST, MQTT_PORT, 60)
    mqtt_client.subscribe(BASE_TOPIC + "/out/#")
    mqtt_client.subscribe(BASE_TOPIC + "/system")
    mqtt_client.subscribe(TASMOTA_STAT)
    mqtt_client.subscribe(TASMOTA_RESULT)
    mqtt_client.loop_start()

    # Telegram bot
    telegram_app = ApplicationBuilder().token(BOT_TOKEN).build()

    telegram_app.add_handler(CommandHandler("start", cmd_start))
    telegram_app.add_handler(CommandHandler("help", cmd_help))
    telegram_app.add_handler(CommandHandler("status", cmd_status))
    telegram_app.add_handler(CommandHandler("on", cmd_on))
    telegram_app.add_handler(CommandHandler("off", cmd_off))
    telegram_app.add_handler(CommandHandler("toggle", cmd_toggle))
    telegram_app.add_handler(CommandHandler("sel", cmd_sel))
    telegram_app.add_handler(CommandHandler("tasmota", cmd_tasmota))

    print("BOT INICIADO")
    telegram_app.run_polling()


if __name__ == "__main__":
    start_bot()
