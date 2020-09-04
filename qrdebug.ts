import jsqr from 'jsqr'
import { decode as quirc } from 'node-quirc'
import zbarimg from './src/util/zbarimg'
import { detect as qrdetect } from '@votingworks/qrdetect'
import sharp from 'sharp'
import { promises as fs } from 'fs'
import { table } from 'table'
import chalk from 'chalk'
import {
  Election,
  parseElection,
} from '@votingworks/ballot-encoder/src/election'
import { v1 } from '@votingworks/ballot-encoder'
import { inspect } from 'util'

async function main() {
  const imagePaths: string[] = []
  let election: Election | undefined

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i]

    if (arg === '-e') {
      i++
      election = parseElection(
        JSON.parse(await fs.readFile(process.argv[i], 'utf8'))
      )
    } else if (arg === '-h' || arg === '--help') {
      process.stdout.write('qrdebug [-e election.json] IMAGE [IMAGE …]')
    } else {
      imagePaths.push(arg)
    }
  }

  for (const imagePath of imagePaths) {
    const imagePath = process.argv[2]
    const fileData = await fs.readFile(imagePath)
    const imageData = await sharp(imagePath)
      .raw()
      .toBuffer({ resolveWithObject: true })

    const results = [
      [
        'jsqr',
        jsqr(
          Uint8ClampedArray.from(imageData.data),
          imageData.info.width,
          imageData.info.height
        )?.binaryData,
      ],
      ['quirc', quirc(fileData)[0]?.data],
      ['zbarimg CLI', await zbarimg(imagePath)],
      [
        'zbarimg node ext',
        qrdetect(imageData.data, imageData.info.width, imageData.info.height)[0]
          ?.data,
      ],
    ].map(([label, data]) => [label, data && Buffer.from(data)])

    process.stdout.write(
      table(
        results.map(([label, data]) => [
          label,
          data
            ? data.toString('hex').replace(/(..)/g, '$1 ')
            : chalk.gray('none'),
        ])
      )
    )

    if (election) {
      process.stdout.write(
        table(
          results.map(([label, data]) => [
            label,
            data ? inspectMetadata(election, data) : chalk.gray('none'),
          ])
        )
      )
    }
  }
}

function inspectMetadata(election: Election, data: Buffer): string {
  let checkData: v1.HMPBBallotPageMetadataCheckData

  try {
    checkData = v1.decodeHMPBBallotPageMetadataCheckData(data)
  } catch (error) {
    return chalk.red(`Reading check data failed: ${error.message}`)
  }

  try {
    const metadata = v1.decodeHMPBBallotPageMetadata(election, data)
    return inspect(metadata, false, Infinity, true)
  } catch (error) {
    return chalk.red(
      `Reading metadata failed: ${error.message} (check=${inspect(
        checkData,
        false,
        Infinity,
        true
      )})`
    )
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
