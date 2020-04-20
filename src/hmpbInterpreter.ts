// Ballot image interpretation for a HMBP
import { file } from 'tmp-promise'
import fs from 'fs'

import { Interpreter as LowLevelInterpreter } from '@votingworks/hmpb-interpreter'
import { readImageData } from '@votingworks/hmpb-interpreter/dist/src/utils/readImageData'

import { createCanvas } from 'canvas'
import util from 'util'
import { RealZBarImage } from './zbarimg'

import {
  ballotToCastVoteRecord,
  InterpretFileParams,
  Interpreter,
} from './interpreter'

const writeFile = util.promisify(fs.writeFile)
const PNG_DATA_URL_PREFIX = 'data:image/png;base64,'

const zbarimg = new RealZBarImage()

/**
 * Encodes an image as a PNG.
 */
function toPNGData(imageData: ImageData): Buffer {
  const canvas = createCanvas(imageData.width, imageData.height)
  const context = canvas.getContext('2d')

  context.putImageData(imageData, 0, 0)

  const dataURL = canvas.toDataURL('image/png')

  if (!dataURL.startsWith(PNG_DATA_URL_PREFIX)) {
    throw new Error(`PNG data URL has unexpected format: ${dataURL}`)
  }

  return Buffer.from(dataURL.slice(PNG_DATA_URL_PREFIX.length), 'base64')
}

export default class HMPBInterpreter implements Interpreter {
  private interpreter?: LowLevelInterpreter

  public constructor() {}

  public async interpretFile(interpretFileParams: InterpretFileParams) {
    const { election, ballotImagePath, cvrCallback } = interpretFileParams

    if (!this.interpreter) {
      this.interpreter = new LowLevelInterpreter({
        election,
        async decodeQRCode(imageData: ImageData): Promise<Buffer | undefined> {
          const { path, cleanup } = await file()
          await writeFile(path, toPNGData(imageData))
          const result = await zbarimg.readQRCodeFromImage({
            filepath: path,
          })
          cleanup()
          return result
        },
      })
    }

    const imageData = await readImageData(ballotImagePath)

    if (this.interpreter.hasMissingTemplates()) {
      await this.interpreter.addTemplate(imageData)
      return cvrCallback({ ballotImagePath })
    }

    const interpretedBallot = await this.interpreter.interpretBallot(imageData)
    const cvr = ballotToCastVoteRecord(interpretedBallot.ballot)
    cvrCallback({ ballotImagePath, cvr })
  }
}
