# AGENTS.md

Juego tipo Asteroids en HTML5 Canvas. **Toda la lógica está en `game.js`** (≈423 líneas, ES6, `'use strict'`), cargado por `index.html`. No hay framework, build, tests, lint, CI ni `package.json` — es un sitio estático sin dependencias.

## Ejecutar
- Abrir `index.html` directamente en el navegador, o:
- `npx serve .` → http://localhost:3000

## Hechos que hay que saber
- **Canvas fijo 800×600**: `const W = 800; const H = 600;` en `game.js` (líneas 5–6) debe coincidir con los atributos `width`/`height` del `<canvas>` en `index.html` (línea 23). Si cambias uno, cambia el otro. `game.js` tiene hoy ≈690 líneas (ES6, `'use strict'`).
- `game.js` se organiza por cabeceras de sección `// ── Nombre ──`, en este orden: `Input` → `Utils` → `Fondo dinámico (espacio estrellado)` → `Bullet` → `Asteroid` → `Ship` → `Partículas (explosión)` → `Estado del juego` → `Update` → `Draw` → `Loop principal`.
- Las entidades (`Bullet`, `Asteroid`, `Ship`, partículas) son clases con `update(dt)` / `draw()`; las marcadas como `dead` se filtran de sus arreglos en cada frame (no hay destrucción explícita de objetos).
- Input: `keys[e.code]` para estado mantenido (ej. `keys['ArrowLeft']`) y `pressed(code)` para una sola pulsación (ej. disparo con `'Space'`); se usan `KeyboardEvent.code`, no `key`. Añadir controles nuevos siguiendo ese patrón.
- La física usa `dt` (clamp a 0.05 s en el loop `requestAnimationFrame`): `ROT = 3.5`, `THRUST = 260`, `DRAG = 0.987`. El mundo es toroidal (`wrap()` en `Utils`).
- Estados del juego: `'playing' | 'dead' | 'gameover'`; 3 vidas; al morir, 3 s de invencibilidad en el respawn; los asteroides se dividen al ser golpeados (tablas `RADII`/`SPEEDS`/`POINTS` en la sección `Asteroid`).
- El HUD y los overlays (texto) se dibujan dentro de `Draw` en el mismo canvas.

## Convenciones
- Comentarios y texto de UI en **español**; mantener ese estilo si se añade código.
- Mantenerlo en un solo archivo JS sin dependencias; no añadir frameworks ni `package.json`.

## ⚠️ Desconfiar del README
El `README.md` anuncia **"power-ups" y una "estrella fugaz"** como tipos de asteroide: **no existen en el código** (no hay nada que los implemente). `game.js` es la fuente de verdad; si el README y el código discrepan, gana el código (y se puede actualizar el README).
