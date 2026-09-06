# Prime Drive

Runner de carreras de 3 carriles para Decentraland SDK7, con **servidor autoritativo**.

El jugador va montado en una moto, esquiva obstáculos y junta monedas a lo largo de
**10 000 m**. Cada **100 m** el cliente reporta un checkpoint al servidor, que valida el
tiempo y decide cuántas monedas se acreditan. La partida es single player, pero se corre
comparándose contra el **ghost del récord** de la pista y contra la barra de progreso de
los demás corredores que estén en la escena en ese momento.

## Cómo correrlo

```bash
npm install
npm run start
```

El preview levanta también el servidor autoritativo (`authoritativeMultiplayer: true` en
`scene.json` lo dispara solo). Los logs del server salen con el prefijo `[Server]`.

### Por qué `npm start` pasa por `scripts/start.js`

sdk-commands elige el motor `bevy` por defecto, y esa implementación es un `.exe` nativo
**sin firmar**. En Windows con Smart App Control o WDAC activo, Code Integrity lo bloquea:
el preview levanta, el servidor muere con `spawn UNKNOWN` y la escena queda sin servidor
sin decir por qué.

`scripts/start.js` fuerza `DCL_SERVER_ENGINE=hammurabi`, que es JS puro y corre bajo
`node.exe` — firmado y confiable para la política. Arranca sin tocar nada del sistema.

- `npm start` → hammurabi (el default de este proyecto).
- `npm run start:bevy` → el comportamiento original de sdk-commands.
- `DCL_SERVER_ENGINE=bevy npm start` → también fuerza bevy; la variable ya seteada gana.

**Si preview desde el Creator Hub**, el Hub no pasa por `npm start`, así que hay que dejar
la variable a nivel usuario una vez:

```
setx DCL_SERVER_ENGINE hammurabi
```

y reiniciar el Hub.

> **Antes de deployar hay que tocar dos campos de `scene.json`:**
> - `worldConfiguration.name` — hoy dice `prime-drive.dcl.eth`; poné tu DCL NAME o ENS.
> - `logsPermissions` — hoy tiene una address en cero; poné tu wallet o no vas a ver los
>   `console.log` del servidor.

## Cómo se juega

- **A / D** (o los botones de pantalla, que también sirven en mobile) cambian de carril.
- Las monedas se juntan pasando por encima; los obstáculos nunca bloquean los 3 carriles
  a la vez, siempre hay salida.
- **3 choques** terminan la carrera. Un choque baja la velocidad y da 1,6 s de
  invulnerabilidad.
- La velocidad sube de 26 m/s a 62 m/s de forma lineal con la distancia recorrida.

## Arquitectura

```
src/
├── index.ts                 isServer() decide qué mitad arranca
├── shared/
│   ├── config.ts            pista, curva de velocidad, economía, skins
│   ├── messages.ts          protocolo cliente ↔ servidor (registerMessages)
│   └── schemas.ts           TrackRecord sincronizado + protectServerEntity
├── server/
│   ├── server.ts            handlers, standings, récord, tienda
│   ├── validation.ts        anti-cheat de checkpoints y de cierre de carrera
│   └── profiles.ts          persistencia (Storage por jugador y de escena)
└── client/
    ├── setup.ts             arranque del cliente
    ├── race.ts              bucle de carrera, fases, input, checkpoints
    ├── net.ts               envíos y handlers de mensajes
    ├── state.ts             estado que lee la UI
    ├── game/
    │   ├── track.ts         calzada, rieles, edificios y postes con scroll
    │   ├── spawner.ts       pools de monedas, obstáculos y arcos
    │   ├── bike.ts          moto del jugador, carriles y skins
    │   ├── camera.ts        VirtualCamera persecutora
    │   └── ghost.ts         moto fantasma del récord
    └── ui/                  HUD, menú/garage/ranking y resultados
```

### El jugador no se mueve

El avatar de Decentraland está **oculto** (`AvatarModifierArea` con `AMT_HIDE_AVATARS`) y
**congelado** (`InputModifier`), anclado cerca de `z = 21`. Lo que se ve y se maneja es una
entidad-moto que solo se desplaza en X entre los tres carriles. Todo lo demás —edificios,
monedas, obstáculos— nace en `z = 300` y viaja hacia `z = 0`. `state.distanceM` es la única
noción de avance.

La cámara es una `VirtualCamera` detrás de la moto: la cámara normal sigue al avatar, que
acá está quieto.

### Nada se crea durante la carrera

Todo sale de pools armados al arrancar la escena. El decorado (líneas, postes, edificios)
son anillos de tamaño fijo que al pasar la cámara vuelven al fondo. Monedas, obstáculos y
arcos se aparcan en `y = -200` cuando no están en uso. En ningún momento se cambia
`GltfContainer.src` en caliente: eso recargaría el GLB y pegaría un tirón.

Las 4 skins de moto se instancian todas al inicio y se alternan con `VisibilityComponent`.

### Detección de colisiones por cruce, no por proximidad

A 62 m/s y 30 fps un objeto avanza 2 m por frame. Una ventana de distancia se lo saltaría,
así que el test es de **cruce del plano del jugador**: `zAnterior > playerZ && zNuevo <= playerZ`.
Exacto a cualquier velocidad.

## El servidor es opcional para jugar

Si el room autoritativo no sincroniza en 6 s, la escena pasa a **offline**: se corre igual,
pero no se acreditan monedas, no se guardan récords y el garage queda deshabilitado. El
menú lo dice explícitamente y el handshake sigue reintentando de fondo, así que si el
servidor aparece más tarde la escena pasa a online sola, sin recargar.

Esto no es solo por comodidad de desarrollo: un jugador al que se le cae la conexión no
puede quedarse con un botón muerto.

### Panel de debug

Abajo al centro hay un panel con el estado de la conexión, que se apaga desde el menú.
El dato que importa es **`server tick`**: el servidor lo incrementa una vez por segundo y
viaja como componente sincronizado (`ServerHeartbeat` en `shared/schemas.ts`).

| lo que muestra | qué significa |
|---|---|
| tick avanzando | servidor vivo y CRDT llegando |
| `--` | nunca llegó un latido: no hay servidor |
| congelado en un número | el servidor arrancó y después se cortó |

`stateSynced` es el `isStateSyncronized()` crudo, y `msgs` cuenta los mensajes recibidos:
juntos separan un problema de CRDT de uno del bus de mensajes.

## Servidor autoritativo

El cliente simula la carrera; el servidor decide qué vale. Nada de lo que reporta el
cliente se acepta sin pasar por `server/validation.ts`.

**Qué valida un checkpoint:**

1. Índice consecutivo (saltarse uno invalida la carrera).
2. `elapsedMs` monótono creciente.
3. `elapsedMs >= idealTimeMs(distancia) * 0.97`. `idealTimeMs` es la integral cerrada de la
   curva de velocidad: con `v(d) = a + k·d`, `t = ln((a + k·d)/a) / k`. Es el piso físico
   absoluto, ninguna carrera real puede bajarlo.
4. El reloj del cliente no puede separarse más de 8 s del reloj del servidor.
5. Monedas y choques no retroceden, y las monedas no superan lo que el spawner puede
   generar en esa distancia (`maxCoinsAt`).

El primer checkpoint rechazado marca la carrera como inválida: a partir de ahí no paga
nada, aunque el jugador llegue a la meta.

> El servidor **no puede ver la posición real del jugador** en esta escena, porque el avatar
> está quieto y es el mundo el que se mueve. La autoridad se apoya en lo que sí controla:
> su propio reloj, la curva de velocidad determinista de `shared/config.ts` y el techo de
> monedas por tramo. Si en el futuro se quiere una verificación posicional, hay que mover
> al avatar de verdad y leerlo con `PlayerIdentityData` + `Transform`.

**Persistencia** (`@dcl/sdk/server` `Storage`):

| clave | scope | contenido |
|---|---|---|
| `profile` | jugador | monedas, skins compradas, skin equipada, mejor tiempo, carreras |
| `ghost:<trackId>` | escena | splits del récord vigente, que se reproduce como ghost |
| `leaderboard:<trackId>` | escena | top 10 de tiempos |

Cambiar `TRACK_ID` en `shared/config.ts` invalida récords y ghosts guardados — útil al
rebalancear la pista.

**Variables de entorno** (`.env` en local, `npm run deploy-env` en producción):

| variable | default | efecto |
|---|---|---|
| `COIN_MULTIPLIER` | `1` | multiplica las monedas acreditadas al terminar |

## Economía

Las monedas se acreditan **solo al cerrar la carrera** y solo si el servidor la aceptó:
lo recolectado (con tope), más 250 por completar los 10 km, más 500 si es récord nuevo.
Se gastan en el garage, en las 4 skins de moto (0 / 1500 / 4000 / 9000).

## Assets

- Del proyecto `coin-runner`: `coin.glb`, `building_01..03.glb`, `street_lines.glb` y los
  sonidos.
- Del catálogo OpenDCL: las 4 motos (`bike_01..04.glb`), los conos (`obstacle_cone`), el
  arco de checkpoint (`obstacle_gate`) y los postes (`track_edge`).

> **Cuidado con los GLB del catálogo que traen transformación en sus nodos.** La valla que
> se usaba antes (`obstacle_barrier.glb`) tenía los nodos desplazados +14 m en Y y −17 m en
> Z y escalados 8× y 15×, así que la malla aparecía lejísimos de la posición de la entidad.
> Como la colisión se calcula contra la entidad, el jugador chocaba contra nada. Ahora la
> valla es una primitiva: lo que se ve y lo que colisiona miden lo mismo por construcción.
> Antes de usar un modelo nuevo como obstáculo, verificá que su bbox esté centrado en el
> origen y que sus nodos no tengan `translation`/`scale` propios.

La calzada, las banquinas y los rieles de neón son primitivas con material PBR: cero
texturas y 5 entidades para los 320 m de pista.

`assets/sounds/music.mp3` es la música de fondo: suena en loop desde que carga la escena,
a volumen bajo en el menú y más alta en carrera, con un toggle en el menú. Pesa 4 MB —
es de lejos el archivo más grande del proyecto, así que si el deploy queda pesado, ese es
el primero que conviene recomprimir.

## Ajustes rápidos

| qué | dónde |
|---|---|
| Largo de carrera, checkpoints, velocidades, vidas | `shared/config.ts` → `RACE` |
| Carriles, Z del jugador, Z de spawn | `shared/config.ts` → `TRACK` |
| Densidad de monedas, obstáculos y edificios | `shared/config.ts` → `SPAWN` |
| Precios y modelos de las skins | `shared/config.ts` → `SKINS` |
| Bonus y tope de monedas | `shared/config.ts` → `ECONOMY` |
| Orientación de la moto y del ghost | `client/game/bike.ts` → `BIKE_YAW_DEG` |
| Distancia y altura de cámara | `client/game/camera.ts` |
| Volumen de la música en menú y en carrera | `client/game/music.ts` |
