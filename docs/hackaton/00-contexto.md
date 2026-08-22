# BA Estaciona — contexto de producto

## Idea

BA Estaciona responde una pregunta concreta:

> **¿Puedo estacionar acá, ahora?**

No responde solamente si una imagen parece tener un hueco. Combina evidencia
visual, ubicación, horario y reglas locales. Si una parte de la evidencia falta,
es ambigua o tiene baja confianza, devuelve `REFUSE`/`NO_DETERMINABLE`.

## Por qué QVAC Track 2

El valor de la demo no es prometer una solución pública lista para producción.
Es demostrar que un modelo local pequeño puede encadenar herramientas y que el
sistema detecta sus fallos:

```text
read_frame → lookup_sector → lookup_rules → decide
```

La inferencia de visión, la selección de herramientas y la explicación deben
ejecutarse localmente mediante QVAC. La decisión de seguridad queda además
limitada por código determinístico.

## Qué queda fuera

- No usamos cámaras del GCBA durante el hackathon.
- No hacemos reconocimiento facial ni lectura de patentes.
- No emitimos multas ni damos asesoramiento legal.
- No tratamos las reglas sintéticas del fixture como normativa real.
- No incorporamos un fallback cloud que oculte el rendimiento de QVAC.

## Demo mínima

La demo procesa frames grabados y sanitizados de una misma zona: libre,
ocupada, oscura, obstruida y borrosa. Luego prueba horarios y reglas
contradictorias con una matriz repetible. La salida muestra la decisión, la
cadena de herramientas, la evidencia y los rechazos.

## Tesis

Un agente confiable no es el que siempre contesta. Es el que puede explicar de
dónde salió cada dato y se abstiene cuando no puede sostener la conclusión.
