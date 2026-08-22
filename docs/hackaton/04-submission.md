# Checklist de entrega

- [ ] Rama `hackaton` publicada; `main` no contiene el prototipo.
- [ ] Repo público y README reproducible desde un clone limpio.
- [ ] QVAC aparece en el código real de inferencia, no solamente en la
      documentación.
- [ ] README enlaza las líneas/permalinks de la integración.
- [ ] Modelo, cuantización, hardware, RAM, OS y latencia documentados.
- [ ] Demo grabada de punta a punta y ejecutada offline después del primer
      download.
- [ ] Un caso permitido, uno prohibido por regla y uno rechazado por mala
      evidencia.
- [ ] Se muestra la traza completa y al menos un retry o fallo real.
- [ ] Las métricas provienen de QVAC; el reporte mock está rotulado como mock.
- [ ] No hay frames con datos personales, credenciales, tokens o caches de
      modelos en el commit.
- [ ] `npm test`, `npm run evaluate:mock` y `qvac doctor` ejecutados.
