/************************************************************
 * CONFIGURACIÓN MQTT Y VARIABLES GLOBALES
 ************************************************************/
const mqttHOST = "192.168.10.21";
const mqttPORT = 9001;
const base_topic = "reles/relay13023";

// Estado global de relés
let relays = { r1: false, r2: false, r3: false, r4: false, r5: false, r6: false, r7: false, r8: false };

// Estado del enchufe Tasmota (fuente de alimentación)
let tasmota_state = false;
const tasmota_topic_cmd = "cmnd/Smartplug_577019/POWER";
const tasmota_topic_stat = "stat/Smartplug_577019/POWER";
const tasmota_topic_result = "stat/Smartplug_577019/RESULT";

// Variables de control de conexión
let lastTasmotaUpdate = Date.now();
let tasmotaOfflineTimeout = null;

/************************************************************
 * CONEXIÓN MQTT
 ************************************************************/
const clientID = "web_" + new Date().getUTCMilliseconds();
const client = new Paho.MQTT.Client(mqttHOST, mqttPORT, clientID);

client.onConnectionLost = onConnectionLost;
client.onMessageArrived = onMessageArrived;
client.onFailure = onConnectionLost;

client.connect({
    onSuccess: onConnect,
    onFailure: onConnectionLost
});

/************************************************************
 * EVENTOS DE CONEXIÓN
 ************************************************************/
function onConnect() {
    console.log("? Conectado a MQTT.");
    $("#contenor").removeClass("FinFout");

    // Suscribirse a todos los topics de salida
    for (let i = 1; i <= 8; i++) {
        client.subscribe(`${base_topic}/out/r${i}`);
    }

    // Otros topics
    client.subscribe(`${base_topic}/system`);
    client.subscribe(tasmota_topic_stat);
    client.subscribe(tasmota_topic_result);
    client.subscribe("proxmox/vm/status/#");

    // Solicitar estado inicial del Tasmota
    const status_request = new Paho.MQTT.Message("");
    status_request.destinationName = tasmota_topic_cmd;
    client.send(status_request);
    console.log("?? Suscrito a topics MQTT y solicitando estado inicial del SmartPlug.");
}

function onConnectionLost(responseObject) {
    if (responseObject.errorCode !== 0) {
        console.warn("? Conexión perdida a MQTT:", responseObject.errorMessage);
    }
    $("#contenor").addClass("FinFout");

    // Visualmente marcar relés como sin estado
    for (const key in relays) {
        $(`#${key}`)
            .removeClass("spanon spanoff")
            .css({
                border: "1px solid gray",
                backgroundColor: "rgba(255,255,255,0.1)",
                color: "gray"
            });
    }
}

/************************************************************
 * RECEPCIÓN DE MENSAJES
 ************************************************************/
function onMessageArrived(message) {
    const now = new Date();
    const topic = message.destinationName;
    const payload = message.payloadString.trim();

    $("#ts").text(now.toLocaleString());

    // ---- Estado de relés ----
    if (topic.startsWith(base_topic + "/out/")) {
        const ry = topic.split("/")[3];
        updateRelayState(ry, payload === "ON");
    }

    // ---- Datos del sistema (CPU / Temp) ----
    if (topic.endsWith("/system")) {
        const [cpu, temp] = payload.split(",");
        $("#sysdata").html(`CPU: ${cpu}% | Temp: ${temp}&deg;C`);
    }

    // ---- Mensajes del Tasmota (fuente) ----
    if (topic === tasmota_topic_stat || topic === tasmota_topic_result) {
        handleTasmotaMessage(topic, payload);
    }

    // ---- Mensajes de la VM ----
    if (message.destinationName.startsWith("proxmox/vm/status/")) {
        const vmid = message.destinationName.split("/").pop();
        const payload = message.payloadString.trim();
        update_vm_status(vmid, payload);
    }
}

/************************************************************
 * FUNCIONES AUXILIARES
 ************************************************************/
function updateRelayState(relay, isOn) {
    const el = $("#" + relay);
    if (isOn) {
        el.removeClass("spanoff").addClass("spanon");
    } else {
        el.removeClass("spanon").addClass("spanoff");
    }
    relays[relay] = isOn;
}

function send_command(relay) {
    relays[relay] = !relays[relay];

    const enclavables = ["r1", "r2", "r3", "r4"];
    if (enclavables.includes(relay)) {
        enclavables.forEach(key => relays[key] = key === relay ? relays[key] : false);
        set_ry();
    } else {
        publishRelay(relay, relays[relay]);
    }
}

function publishRelay(relay, state) {
    const topic = `${base_topic}/in/${relay}`;
    const msg = new Paho.MQTT.Message(state ? "ON" : "OFF");
    msg.destinationName = topic;
    client.send(msg);
}

function set_ry() {
    for (const [key, value] of Object.entries(relays)) {
        publishRelay(key, value);
    }
}

function toggle_tasmota() {
    tasmota_state = !tasmota_state;
    const msg = new Paho.MQTT.Message(tasmota_state ? "ON" : "OFF");
    msg.destinationName = tasmota_topic_cmd;
    client.send(msg);
    console.log("?? F.Alim ->", tasmota_state ? "ON" : "OFF");
}

/************************************************************
 * GESTIÓN DEL ESTADO DEL TASMOTA Y AUTO REFRESH
 ************************************************************/
function handleTasmotaMessage(topic, payload) {
    lastTasmotaUpdate = Date.now(); // Marca la hora de último mensaje recibido

    try {
        let state = payload.toUpperCase();

        // Si es un mensaje JSON tipo {"POWER":"ON"}
        if (topic === tasmota_topic_result && payload.startsWith("{")) {
            const data = JSON.parse(payload);
            if ("POWER" in data) {
                state = data.POWER.toUpperCase();
            }
        }

        // Determinar si está ON u OFF
        tasmota_state = (state === "ON");

        // Actualizar color del botón F.Alim
        if (tasmota_state) {
            $("#tasmota").removeClass("spanoff").addClass("spanon");
        } else {
            $("#tasmota").removeClass("spanon").addClass("spanoff");
        }

        console.log("?? Estado Tasmota:", tasmota_state ? "ON" : "OFF");
    } catch (e) {
        console.warn("?? Error al procesar mensaje Tasmota:", payload);
    }
}


/************************************************************
 * PCRadio (VM 100) - Control con estado intermedio (ðŸŸ )
 ************************************************************/
let vm_state = "unknown";
const vmid_pcradio = "100";

function toggle_vm(vmid) {
    const el = $("#vm" + vmid);
    if (vm_state === "stopped" || vm_state === "unknown") {
        // Mostrar estado transitorio (encendiendo)
        el.removeClass("spanoff").addClass("spanwait");
        vm_state = "starting";

        const msg = new Paho.MQTT.Message(vmid.toString());
        msg.destinationName = "proxmox/vm/start";
        client.send(msg);
        console.log("ðŸŸ¡ Solicitando arranque de VM " + vmid);
    } else if (vm_state === "started") {
        if (confirm("Â¿Seguro que deseas apagar PCRadio (VM " + vmid + ")?")) {
            // Mostrar estado transitorio (apagando)
            el.removeClass("spanon").addClass("spanwait");
            vm_state = "stopping";

            const msg = new Paho.MQTT.Message(vmid.toString());
            msg.destinationName = "proxmox/vm/stop";
            client.send(msg);
            console.log("ðŸŸ  Solicitando apagado de VM " + vmid);
        }
    }
}

// Actualiza el color del botÃ³n segÃºn estado recibido
function update_vm_status(vmid, status) {
    vm_state = status;
    const el = $("#vm" + vmid);
    el.removeClass("spanon spanoff spanwait");

    switch (status) {
        case "started":
            el.addClass("spanon");
            break;
        case "stopped":
            el.addClass("spanoff");
            break;
        case "starting":
        case "stopping":
            el.addClass("spanwait");
            break;
        default:
            el.addClass("spanoff");
    }
    console.log(`ðŸ’¬ Estado PCRadio (VM ${vmid}): ${status}`);
}


// Al conectar al broker MQTT
function onConnect() {
    console.log("âœ… Conectado a MQTT.");
    $("#contenor").removeClass("FinFout");

    // Suscripciones existentes
    for (let i = 1; i <= 8; i++) {
        client.subscribe(`${base_topic}/out/r${i}`);
    }
    client.subscribe(`${base_topic}/system`);
    client.subscribe(tasmota_topic_stat);
    client.subscribe(tasmota_topic_result);
    client.subscribe("proxmox/vm/status/#");

    // Solicitar estado inicial del Tasmota
    const status_request = new Paho.MQTT.Message("");
    status_request.destinationName = tasmota_topic_cmd;
    client.send(status_request);

    // ðŸ”¹ Solicitar estado actual de la VM al iniciar
    const msg = new Paho.MQTT.Message(vmid_pcradio);
    msg.destinationName = "proxmox/vm/query";
    client.send(msg);
    console.log("ðŸ“¡ Solicitando estado inicial de PCRadio...");
}

// Procesar mensajes de estado de VM
function onMessageArrived(message) {
    const now = new Date();
    const topic = message.destinationName;
    const payload = message.payloadString.trim();
    $("#ts").text(now.toLocaleString());

    // ---- Estado relÃ©s ----
    if (topic.startsWith(base_topic + "/out/")) {
        const ry = topic.split("/")[3];
        updateRelayState(ry, payload === "ON");
    }

    // ---- Datos sistema ----
    if (topic.endsWith("/system")) {
        const [cpu, temp] = payload.split(",");
        $("#sysdata").html(`CPU: ${cpu}% | Temp: ${temp}&deg;C`);
    }

    // ---- Fuente alimentaciÃ³n (Tasmota) ----
    if (topic === tasmota_topic_stat || topic === tasmota_topic_result) {
        handleTasmotaMessage(topic, payload);
    }

    // ---- Estado VM ----
    if (topic.startsWith("proxmox/vm/status/")) {
        const vmid = topic.split("/").pop();
        update_vm_status(vmid, payload);
    }
}
