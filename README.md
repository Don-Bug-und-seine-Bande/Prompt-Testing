# Laboratorio de prompts · Galería Nube

Taller práctico para responder una pregunta: **¿qué hace que un prompt sea bueno?**

Escribís las instrucciones de un asistente para una tienda de cuadros ficticia, las probás contra consultas de clientes y analizás qué responde el modelo. La [consigna](consigna_tienda_cuadros.md) incluye el catálogo y la entrega esperada.

## Instalación

Necesitás Node.js 22 o posterior y una clave de la API de OpenAI.

```bash
git clone https://github.com/Don-Bug-und-seine-Bande/Prompt-Testing.git
cd Prompt-Testing
npm install
cp .env.example .env
```

Pegá tu clave en `OPENAI_API_KEY`, dentro de `.env`, y ejecutá:

```bash
npm start
```

Abrí http://localhost:3000. Las consultas consumen saldo de tu cuenta de API.

## Cómo se usa

1. Escribí tu prompt en `prompts/actual.txt` y guardalo.
2. En la web, abrí **2 · Chat y pruebas**.
3. Probá un caso con **Probar este caso** o conversá en el chat libre.
4. Analizá las respuestas, ajustá el prompt y volvé a probar.

Tené en cuenta:

- **El modelo solo recibe el contenido de `prompts/actual.txt`**, además de los mensajes del chat. Si querés que conozca el catálogo, copialo en ese archivo.
- No hace falta reiniciar el servidor al editar el prompt. Sí al cambiar `.env`.
- Cada caso empieza sin historial. El chat libre lo conserva hasta que cambie el prompt.
- Las respuestas se guardan solo en tu navegador. **Limpiar respuestas** borra las de todos los casos; **Nuevo chat** borra la conversación.

## Estructura

| Ruta | Contenido |
| --- | --- |
| `prompts/actual.txt` | Prompt que usa el asistente |
| `prompts/v0.txt` a `v2.txt` | Versiones de ejemplo del prompt |
| `consigna_tienda_cuadros.md` | Consigna y catálogo |
| `data/lab.json` | Diez casos de prueba |
| `server.js`, `lib/` | Servidor y conexión con OpenAI |
| `tienda_galeria_nube.html`, `public/` | Interfaz web |
| `tests/` | Pruebas automáticas |

## Pruebas

```bash
npm test
```

Usan un proveedor simulado, así que no consumen saldo. La prueba de navegador necesita Edge o Chrome; si no los tenés, ejecutá `npx playwright install chromium`.

## Problemas frecuentes

| Problema | Solución |
| --- | --- |
| Prompt vacío o ausente | Escribí en `prompts/actual.txt` (máximo 20.000 caracteres) |
| Clave rechazada (401) | Revisá `OPENAI_API_KEY` y reiniciá el servidor |
| Límite o saldo agotado | Revisá tu cuenta de API |
| Modelo sin acceso | Cambiá `OPENAI_MODEL` en `.env` |
| Puerto ocupado | Cerrá la otra instancia o cambiá `PORT` en `.env` |
