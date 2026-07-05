# Analisis de Reprocesos SUM

Frontend estatico para consumir el backend Apps Script `CAUSA RAIZ` mediante JSONP.

## Estado

- Demo solo lectura.
- No usa `google.script.run`.
- No escribe en las hojas origen.
- Los KPIs actuales son sugeridos por sistema.
- La validacion oficial sera manual; en esta demo se guarda solo en `localStorage`.

## Backend Apps Script

La URL actual del Web App esta configurada en `app.js`:

```js
const API_URL = "https://script.google.com/macros/s/AKfycbzD-c-_PqbJ9Rj1BaIIkES5apiVLKqaZ6r_Et1CQd5044ULuMx-dZ0SqT4BoIrDXeOV/exec";
```

Endpoints usados:

- `action=status`
- `action=dashboard`
- `action=rechazos`
- `action=detalle`
- `action=foto_cc`

Todos aceptan `callback` o `prefix` para JSONP.

## Desplegar Apps Script

1. Abrir el proyecto `CAUSA RAIZ` en Apps Script.
2. Ir a `Implementar` > `Administrar implementaciones`.
3. Editar la Web App actual.
4. Seleccionar `Nueva version`.
5. Mantener `Ejecutar como: Yo`.
6. Mantener acceso para `Cualquiera`.
7. Implementar.
8. Copiar la URL que termina en `/exec` y pegarla en `app.js` si cambia.

## Subir a GitHub

Este repo es estatico. Solo necesita:

- `index.html`
- `styles.css`
- `app.js`
- `vercel.json`
- `README.md`

## Importar en Vercel

1. Entrar a Vercel.
2. Importar este repositorio desde GitHub.
3. Framework preset: `Other`.
4. Build command: dejar vacio.
5. Output directory: dejar vacio.
6. Deploy.

## Prueba rapida

Abrir:

```text
https://script.google.com/macros/s/AKfycbzD-c-_PqbJ9Rj1BaIIkES5apiVLKqaZ6r_Et1CQd5044ULuMx-dZ0SqT4BoIrDXeOV/exec?action=status&callback=test
```

Debe responder con `test({...})` y `modo: "SOLO_LECTURA"`.
