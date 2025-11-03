# Antena-Control
Proyecto selector de antenas HF.

A través de un proyecto de selector de antenas con relés diseñado por mi amigo EB1TR Fabian. He ido mejorando y adaptando esto para mi uso.

Consta de una caja de 8 relés, los cuales se conectan a la red y publican mensajes en MQTT. Dichos relés se conectan a un selector de 4 antenas comandando los relés del mismo.
De esta forma, creamos un HTML para pintar el estado del selector de antenas.

En la v.2.0 incorporamos un enchufe tasmota, el cual publica tambien en MQTT de cara a poder encender y apagar la fuente de alimentacion de los equipos.
