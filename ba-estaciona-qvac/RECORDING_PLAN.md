# Five-input recording plan

Record one curb or marked sector with a phone fixed at roughly the same angle. Keep each clip 10–20 seconds. Do not trespass, obstruct traffic, or deliberately create unsafe conditions.

| Input | Capture | Target file | Expected robustness behavior |
|---|---|---|---|
| Day / free | Clearly empty observable space | `day-free.jpg` | `FREE`, high confidence |
| Day / occupied | Same view with the space occupied | `day-occupied.jpg` | `OCCUPIED`, high confidence |
| Night | Same view after dark | `dark.jpg` | Refuse if the curb is not clear |
| Occlusion | Naturally occurring large-vehicle or object occlusion | `occluded.jpg` | `OCCLUDED` and refuse |
| Rain / blur | Safe rainy capture or optical blur from rain | `rain-blurry.jpg` | `BLURRY` and refuse |

## Frame preparation

1. Extract a representative frame from each clip.
2. Crop to the parking sector; remove irrelevant sidewalk and building windows.
3. Blur or crop out faces and readable license plates.
4. Keep the source clips outside the public repository.
5. Put only the five sanitized frames in `data/frames/`.
6. Review `data/cameras.json` timestamps and the 30 scenario expectations.
7. Run the QVAC evaluation five times per scenario.

Example extraction command when `ffmpeg` is available:

```bash
ffmpeg -ss 00:00:05 -i input.mov -frames:v 1 -q:v 2 day-free.jpg
```

Do not tune prompts against every evaluation frame. Reserve at least one clip per condition as a holdout and disclose any frame used during prompt development.
