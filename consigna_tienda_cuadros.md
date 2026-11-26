# Taller: ¿Qué hace que un prompt sea bueno?

## El desafío
Una tienda ficticia llamada **Galería Nube** quiere un asistente para responder consultas de clientes sobre sus cuadros, recomendar opciones y acompañar a quien quiera comprar.

**Tu misión:** escribir el prompt que gobierne el comportamiento del asistente. El catálogo y los datos de negocio son compartidos para todos; **no pueden modificarlos**. Podés decidir el tono, la estructura de las respuestas, cómo recomendar, qué hacer cuando falta información y cómo manejar casos difíciles.

## Catálogo oficial

| Cuadro | Estilo / colores | Tamaño | Precio | Stock |
| --- | --- | --- | --- | --- |
| Bruma de otoño | Abstracto, tierra y beige | 40 × 50 cm | $65.000 | 3 |
| Ventana a Kioto | Paisaje, verdes y rosados | 50 × 70 cm | $95.000 | 0 |
| Geometría solar | Geométrico, mostaza y negro | 50 × 50 cm | $75.000 | 2 |
| Jardín nocturno | Botánico, violeta y azul | 60 × 90 cm | $110.000 | 2 |
| Línea de horizonte | Minimalista, blanco y gris | 30 × 40 cm | $48.000 | 5 |

_______

## Dinámica de la clase

1. Escribí el prompt completo en `prompts/actual.txt` y guardalo desde tu editor. Incluí las instrucciones y todos los datos que quieras que conozca el bot, incluido el catálogo si corresponde. El laboratorio no agrega contexto automáticamente.
2. Probá los casos de a uno y hacé preguntas propias en el chat libre, incluyendo repreguntas y pedidos difíciles.
3. Revisá qué criterios cumple cada respuesta. Una respuesta convincente también puede contener datos falsos.
4. Identificá al menos dos fallas o riesgos observados y explicá qué parte del prompt cambiarías.
5. Revisá las respuestas y comentá qué falla y qué cambiarías del prompt. Cada caso empieza sin historial; el chat libre permite repreguntar. Al cambiar el archivo, la siguiente consulta usa el nuevo prompt sin el historial anterior.

El prompt no debe cambiar el catálogo. Sí puede definir el rol, objetivo, tono, formato, criterios para recomendar y cómo actuar ante datos faltantes, falta de stock o pedidos contradictorios.

## Entrega

El catálogo de esta consigna es una referencia para diseñar el prompt. El modelo solo lo conoce si lo incluís en el archivo. Si faltan datos, observá si reconoce esa limitación o inventa una respuesta. Los criterios de los casos no se envían al modelo.