import * as cp from 'child_process'
import { promisify } from 'util'
import makeDebug from 'debug'

const debug = makeDebug('module-scan:zbarimg')
const execFile = promisify(cp.execFile)

export default async function zbarimg(
  path: string
): Promise<Buffer | undefined> {
  let stdout = ''
  let stderr = ''
  try {
    ;({ stdout, stderr } = await execFile('zbarimg', [
      '--quiet',
      '--raw',
      path,
    ]))
    return Buffer.from(stdout.trim(), 'hex')
  } catch (error) {
    debug('zbarimg failed: path=%s, error=%s, stderr=%s', path, error, stderr)
  }
}
