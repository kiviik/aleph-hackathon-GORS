// Filesystem anchors for the harness.
//
// These scripts were written in the calgary-free-parking repo and reached across the filesystem
// into this one. Now that they live here, every path is resolved from the harness directory, so
// a script behaves the same whether it is run from harness/, from the repo root, or by npm.
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const HARNESS = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
export const REPO = path.resolve(HARNESS, '..')

export const DATA = path.join(HARNESS, 'data')
export const MODELS = path.join(HARNESS, 'models')

/** The Expo app under test. The harness writes its fixtures and learned assets into it. */
export const MOBILE = path.join(REPO, 'mobile')
export const MOBILE_CORE = path.join(MOBILE, 'src', 'core')
export const MOBILE_DATA = path.join(MOBILE, 'src', 'data')
export const MOBILE_FIXTURES = path.join(MOBILE, 'test', 'fixtures')

/** A file under harness/data, or an explicit path the caller passed on the command line. */
export const dataFile = (nameOrPath) => path.resolve(DATA, nameOrPath)

/** Repo-relative display path, for log lines that should stay readable. */
export const rel = (p) => path.relative(REPO, p)
