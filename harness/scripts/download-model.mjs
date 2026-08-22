// Downloads yolo26s.onnx (Ultralytics YOLO26s, AGPL-3.0) from Hugging Face into models/.
import fs from 'node:fs'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { MODELS } from '../src/paths.mjs'

const URL = 'https://huggingface.co/zwh20081/yolo26-onnx/resolve/main/yolo26s.onnx'
const OUT = path.join(MODELS, 'yolo26s.onnx')
if (fs.existsSync(OUT) && fs.statSync(OUT).size > 30e6) { console.log(`${OUT} already present`); process.exit(0) }
fs.mkdirSync(MODELS, { recursive: true })
console.log('downloading', URL)
const res = await fetch(URL)
if (!res.ok) { console.error('download failed', res.status); process.exit(1) }
await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(OUT + '.part'))
fs.renameSync(OUT + '.part', OUT)
console.log('saved', OUT, (fs.statSync(OUT).size / 1e6).toFixed(1), 'MB')
