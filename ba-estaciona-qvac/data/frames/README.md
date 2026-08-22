# Local evaluation frames

Place extracted phone-video frames here using the filenames in `../cameras.json`:

- `day-free.jpg`
- `day-occupied.jpg`
- `dark.jpg`
- `occluded.jpg`
- `rain-blurry.jpg`

These files are intentionally not supplied. The mock evaluation verifies orchestration and safety gates only; it does **not** count as vision evidence. The QVAC evaluation refuses when a referenced real frame is absent.

Do not commit faces or readable license plates. Crop to the parking sector before evaluation.
