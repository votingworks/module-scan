import * as cp from 'child_process'
import { promisify } from 'util'
import makeDebug from 'debug'
import { join } from 'path'
import { promises as fs, constants } from 'fs'

const debug = makeDebug('module-scan:zbarimg')
const execFile = promisify(cp.execFile)

async function locateZbarimg(): Promise<string> {
  const vendorZbarimg = join(__dirname, '../../vendor/zbar/zbarimg/zbarimg')

  try {
    await fs.access(vendorZbarimg, constants.X_OK)
    return vendorZbarimg
  } catch {
    debug('vendored zbarimg not available')
  }

  const { stdout } = await execFile('which', ['zbarimg'])
  return stdout
}

export default async function zbarimg(
  path: string
): Promise<Buffer | undefined> {
  let stdout = ''
  let stderr = ''
  const zbarimgBinary = await locateZbarimg()
  try {
    ;({ stdout, stderr } = await execFile(zbarimgBinary, [
      '--quiet',
      '--raw',
      path,
    ]))
    return Buffer.from(stdout.trim(), 'hex')
  } catch (error) {
    debug(
      'zbarimg (%s) failed: path=%s, error=%s, stderr=%s',
      zbarimgBinary,
      path,
      error,
      stderr
    )
  }
}
