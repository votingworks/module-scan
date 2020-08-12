import { join } from 'path'
import { ChildProcess, execFile as originalExecFile } from 'child_process'
import execFile from './exec'
import makeDebug from 'debug'

const debug = makeDebug('module-scan:scanner')

type ScanFinishedCallback = () => void

export interface Scanner {
  scanInto(directory: string, prefix?: string): Promise<void>
  beginScan(
    directory: string,
    prefix?: string,
    callback?: ScanFinishedCallback
  ): void
  scanOne(): Promise<boolean>
  scanStop(): Promise<void>
}

function zeroPad(number: number, maxLength = 2): string {
  return number.toString().padStart(maxLength, '0')
}

function dateStamp(date: Date = new Date()): string {
  return `${zeroPad(date.getFullYear(), 4)}${zeroPad(
    date.getMonth() + 1
  )}${zeroPad(date.getDay())}_${zeroPad(date.getHours())}${zeroPad(
    date.getMinutes()
  )}${zeroPad(date.getSeconds())}`
}

export enum ScannerImageFormat {
  JPEG = 'jpeg',
  PNG = 'png',
  TIFF = 'tiff',
}

/**
 * Scans duplex images in batch mode from a Fujitsu scanner.
 */
export class FujitsuScanner implements Scanner {
  private scanProcess: ChildProcess | undefined
  private scanFinishedCallback: ScanFinishedCallback | undefined

  public constructor(private format = ScannerImageFormat.PNG) {}

  public async scanInto(directory: string, prefix = ''): Promise<void> {
    const args = [
      '-d',
      'fujitsu',
      '--resolution',
      '300',
      `--format=${this.format}`,
      '--source=ADF Duplex',
      '--swskip',
      '0.5',
      '--dropoutcolor',
      'Red',
      `--batch=${join(
        directory,
        `${prefix}${dateStamp()}-ballot-%04d.${this.format}`
      )}`,
    ]

    debug(
      'Calling scanimage to scan into %s with prefix=%s in format %s; %s',
      directory,
      prefix,
      this.format,
      `scanimage ${args.map((arg) => `'${arg}'`).join(' ')}`
    )

    try {
      const { stdout, stderr } = await execFile('scanimage', args)
      debug('scanimage finished with stdout=%o stderr=%o', stdout, stderr)
    } catch (error) {
      debug('scanimage failed with error: %s', error.message)
      throw error
    }
  }

  private scanProcessExited(): void {
    console.log('scan process exited')
    this.scanProcess = undefined
    if (this.scanFinishedCallback) {
      this.scanFinishedCallback()
      this.scanFinishedCallback = undefined
    }
  }

  public beginScan(
    directory: string,
    prefix = '',
    callback: ScanFinishedCallback
  ): void {
    const args = [
      '-d',
      'fujitsu',
      '--resolution',
      '300',
      `--format=${this.format}`,
      '--source=ADF Duplex',
      '--swskip',
      '0.5',
      '--dropoutcolor',
      'Red',
      `--batch=${join(
        directory,
        `${prefix}${dateStamp()}-ballot-%04d.${this.format}`
      )}`,
      '--batch-prompt',
    ]

    this.scanFinishedCallback = callback
    this.scanProcess = originalExecFile('scanimage', args, () =>
      this.scanProcessExited()
    )
  }

  public async scanOne(): Promise<boolean> {
    const stdin = this.scanProcess?.stdin
    if (!stdin) {
      return false
    }

    return new Promise((resolve, reject) => {
      stdin.write('\n\n', (error) => {
        if (error) {
          reject(error)
        } else {
          resolve(true)
        }
      })
    })
  }

  public async scanStop(): Promise<void> {
    const stdin = this.scanProcess?.stdin
    if (!stdin) {
      return
    }

    return new Promise((resolve) => {
      stdin.end(resolve)
    })
  }
}
