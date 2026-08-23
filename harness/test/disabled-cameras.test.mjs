// A disabled camera must stay out of the shipped fixture. Runs on the checked-in data, no sidecar.
//
// This exists because the ways a camera comes back are all quiet ones: `--source auto` reads
// state.json, which still holds a row for 182; `--source fixture` copies whatever bands.json
// already has; `--only` passes the unnamed cameras straight through. The exporter filters all
// three, and this test is what notices if that filtering is ever lost.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { dataFile, MOBILE_DATA } from '../src/paths.mjs'

const disabled = JSON.parse(fs.readFileSync(dataFile('disabled-cameras.json'), 'utf8'))
const shipped = JSON.parse(fs.readFileSync(path.join(MOBILE_DATA, 'bands.json'), 'utf8'))

test('no disabled camera is in the shipped fixture', () => {
  const leaked = Object.keys(disabled.cameras).filter((id) => shipped.cameras[id])
  assert.deepEqual(leaked, [], `disabled camera(s) ${leaked.join(', ')} are being shipped to the phone`)
})

test('every disabled camera states why it was disabled, and when', () => {
  for (const [id, row] of Object.entries(disabled.cameras)) {
    assert.ok(row.why?.length > 10, `camera ${id} has no usable reason`)
    assert.ok(row.evidence?.length > 10, `camera ${id} has no evidence`)
    assert.match(row.disabledAt ?? '', /^\d{4}-\d{2}-\d{2}$/, `camera ${id} has no disabledAt date`)
  }
})

test('the cameras caught panning are disabled', () => {
  // 162 (E -> W) and 182 (SW -> NW) both changed preset after their bands were learned, which makes
  // image-space geometry meaningless. Re-enable only with an overlay proving the view is held.
  for (const id of ['162', '182']) {
    assert.ok(disabled.cameras[id], `camera ${id} pans and must stay disabled`)
  }
})
