clientID = "web"
mqttHOST = "192.168.10.21"
base_topic = "reles/relay13023"
clientID += new Date().getUTCMilliseconds()
client = new Paho.MQTT.Client(mqttHOST, Number(9001), clientID);

client.onConnectionLost = onConnectionLost;
client.onMessageArrived = onMessageArrived;
client.onFailure = onConnectionLost;

client.connect({
    onSuccess:onConnect,
    onFailure:onConnectionLost
});

relays = {"r1": false, "r2": false, "r3": false, "r4": false, "r5": false, "r6": false, "r7": false, "r8": false}

// Estado del enchufe Tasmota
let tasmota_state = false;
const tasmota_topic_cmd = "cmnd/Smartplug_577019/POWER";
const tasmota_topic_stat = "stat/Smartplug_577019/POWER";
const tasmota_topic_result = "stat/Smartplug_577019/RESULT";

function onConnect() {
  console.log("Connectado a MQTT.");
  $('#contenor').removeClass("FinFout")
  client.subscribe(base_topic + "/out/r1");
  client.subscribe(base_topic + "/out/r2");
  client.subscribe(base_topic + "/out/r3");
  client.subscribe(base_topic + "/out/r4");
  client.subscribe(base_topic + "/out/r5");
  client.subscribe(base_topic + "/out/r6");
  client.subscribe(base_topic + "/out/r7");
  client.subscribe(base_topic + "/out/r8");
  client.subscribe(base_topic + "/system"); //Topics cpu y temperatura raspi
  client.subscribe(tasmota_topic_stat); //Topics estado fuente
  client.subscribe(tasmota_topic_result); //Topics estado fuente
  const status_request = new Paho.MQTT.Message("");
  status_request.destinationName = tasmota_topic_cmd; // "cmnd/Smartplug_577019/POWER"
  client.send(status_request);
  console.log("Solicitando estado inicial del SmartPlug...");
  console.log("Suscrito a topics MQTT.");
}

function onConnectionLost(responseObject) {
  if (responseObject.errorCode !== 0) {
    console.log("ConexiÃ³n perdida a MQTT:"+responseObject.errorMessage);
  }
  $('#contenor').addClass("FinFout")
}

function set_ry(){
    for (const [key, value] of Object.entries(relays)) {
        topic = base_topic + "/in/" + key;
        if (value) payload = "ON" 
        else payload = "OFF"
        message = new Paho.MQTT.Message(String(payload));
        message.destinationName = topic;
        client.send(message);
    }
}

function send_command(dato) {
    relays[dato] = !relays[dato];

    // Solo r1–r4 son enclavables
    const enclavables = ["r1", "r2", "r3", "r4"];

    if (enclavables.includes(dato)) {
        // Modo enclavado para r1–r4
        for (const key of enclavables) {
            if (key !== dato) relays[key] = false;
        }
        set_ry();
    } else {
        // r5–r8 siempre funcionan sin enclavarse
        const topic = base_topic + "/in/" + dato;
        const payload = relays[dato] ? "ON" : "OFF";
        const message = new Paho.MQTT.Message(String(payload));
        message.destinationName = topic;
        client.send(message);
    }
}

function onMessageArrived(message) {
    let now = new Date();
    let ry = message.destinationName.split("/")[3]
    // $('#'+ry).text(ry.toUpperCase() + ": " + message.payloadString)
    if (message.payloadString == "ON") {
        $('#'+ry).removeClass("spanoff").addClass("spanon")
        relays[ry] = true
    } else {
        $('#'+ry).removeClass("spanon").addClass("spanoff")
        relays[ry] = false
    }
    $('#ts').text(now.toLocaleString())

    if (message.destinationName.endsWith("/system")) {
        const [cpu, temp] = message.payloadString.split(",");
        $("#sysdata").html(`CPU: ${cpu}% | Temp: ${temp}&deg;C`);
    }

	// --- Procesa mensajes del enchufe Tasmota ---
   if (message.destinationName === tasmota_topic_stat) {
   	const payload = message.payloadString.trim().toUpperCase();
    	tasmota_state = (payload === "ON");
    	if (tasmota_state) {
        	$("#tasmota").removeClass("spanoff").addClass("spanon");
    	} else {
        	$("#tasmota").removeClass("spanon").addClass("spanoff");
    	}
    	return;
	}

	// A veces el estado viene dentro del RESULT (JSON)
   if (message.destinationName === tasmota_topic_result) {
    	try {
            const data = JSON.parse(message.payloadString);
            if ("POWER" in data) {
            	const payload = data.POWER.toUpperCase();
            	tasmota_state = (payload === "ON");
            	if (tasmota_state) {
                	$("#tasmota").removeClass("spanoff").addClass("spanon");
            	} else {
                	$("#tasmota").removeClass("spanon").addClass("spanoff");
            	}
            }
    	} catch (e) {
        	console.warn("Mensaje RESULT no JSON válido:", message.payloadString);
    	}
    	return;
   }

}

//Funcion para enviar comando a la fuente alimentacion
function toggle_tasmota() {
    tasmota_state = !tasmota_state;
    const payload = tasmota_state ? "ON" : "OFF";
    const message = new Paho.MQTT.Message(payload);
    message.destinationName = tasmota_topic_cmd;
    client.send(message);
    console.log("Tasmota -> " + payload);
}

