//
// The Interpreter watches a directory where scanned ballot images will appear
// and process/interpret them into a cast-vote record.
//

import {
  CandidateVote,
  CompletedBallot,
  decodeBallot,
  detect,
  Election,
  getContests,
  Optional,
} from '@votingworks/ballot-encoder'
import {
  Interpreter as HMPBInterpreter,
  BallotPageMetadata,
  BallotMark,
  Size,
  BallotPageLayout,
  metadataFromBytes,
} from '@votingworks/hmpb-interpreter'
import { detect as qrdetect } from '@votingworks/qrdetect'
import makeDebug from 'debug'
import { decode as decodeJpeg } from 'jpeg-js'
import sharp from 'sharp'
import { decode as quircDecode } from 'node-quirc'
import { CastVoteRecord } from './types'
import { getMachineId } from './util/machineId'

const debug = makeDebug('module-scan:interpreter')

export interface InterpretFileParams {
  readonly election: Election
  readonly ballotImagePath: string
  readonly ballotImageFile: Buffer
}

export interface MarkInfo {
  marks: BallotMark[]
  ballotSize: Size
}

export type InterpretedBallot =
  | InterpretedBmdBallot
  | InterpretedHmpbBallot
  | UninterpretedHmpbBallot
  | ManualBallot

export interface UninterpretedHmpbBallot {
  type: 'UninterpretedHmpbBallot'
  metadata: BallotPageMetadata
}

export interface ManualBallot {
  type: 'ManualBallot'
  cvr: CastVoteRecord
}

export interface InterpretedBmdBallot {
  type: 'InterpretedBmdBallot'
  normalizedImage: ImageData
  cvr: CastVoteRecord
}

export interface InterpretedHmpbBallot {
  type: 'InterpretedHmpbBallot'
  normalizedImage: ImageData
  metadata: BallotPageMetadata
  markInfo: MarkInfo
  cvr: CastVoteRecord
}

export interface Interpreter {
  addHmpbTemplate(
    election: Election,
    imageData: ImageData,
    metadata?: BallotPageMetadata
  ): Promise<BallotPageLayout>
  addHmpbTemplate(
    election: Election,
    layout: BallotPageLayout
  ): Promise<BallotPageLayout>
  interpretFile(
    interpretFileParams: InterpretFileParams
  ): Promise<InterpretedBallot | undefined>
  setTestMode(testMode: boolean): void
}

interface InterpretBallotStringParams {
  readonly election: Election
  readonly encodedBallot: Uint8Array
}

function ballotToCastVoteRecord(ballot: CompletedBallot): CastVoteRecord {
  const { election, ballotStyle, precinct, ballotId, isTestBallot } = ballot

  // figure out the contests
  const contests = getContests({ ballotStyle, election })

  // prepare the CVR
  const cvr: CastVoteRecord = {
    _precinctId: precinct.id,
    _ballotId: ballotId,
    _ballotStyleId: ballotStyle.id,
    _testBallot: isTestBallot,
    _scannerId: getMachineId(),
  }

  for (const contest of contests) {
    // no answer for a particular contest is recorded in our final dictionary as an empty string
    // not the same thing as undefined.
    let cvrForContest: string[] = []
    const vote = ballot.votes[contest.id]

    if (contest.type === 'yesno') {
      if (vote) {
        cvrForContest = vote as string[]
      }
    } else if (contest.type === 'candidate') {
      // selections for this question
      const candidates = vote as Optional<CandidateVote>

      if (candidates && candidates.length > 0) {
        cvrForContest = candidates.map((candidate) =>
          candidate.isWriteIn ? '__write-in' : candidate.id
        )
      }
    }

    cvr[contest.id] = cvrForContest
  }

  return cvr
}

export function interpretBallotData({
  election,
  encodedBallot,
}: InterpretBallotStringParams): CastVoteRecord {
  const { ballot } = decodeBallot(election, encodedBallot)
  return ballotToCastVoteRecord(ballot)
}

interface BallotImageData {
  file: Buffer
  image: ImageData
  qrcode: Buffer
}

async function getQRCode(
  encodedImageData: Buffer,
  decodedImageData: Buffer,
  width: number,
  height: number
): Promise<Buffer | undefined> {
  const [quircCode] = await quircDecode(encodedImageData)

  if (quircCode && 'data' in quircCode) {
    return quircCode.data
  }

  const qrdetectCodes = qrdetect(decodedImageData, width, height)

  if (qrdetectCodes.length > 0) {
    return qrdetectCodes[0].data
  }
}

export async function getBallotImageData(
  file: Buffer,
  filename: string
): Promise<BallotImageData> {
  const { data, width, height } = decodeJpeg(file)
  const image = { data: Uint8ClampedArray.from(data), width, height }

  const clipHeight = Math.floor(height / 4)
  const topCrop = sharp(file)
    .extract({ left: 0, top: 0, width, height: clipHeight })
    .raw()
    .ensureAlpha()

  const topData = await topCrop.toBuffer()
  const topPng = await topCrop.png().toBuffer()
  const topQrcode = await getQRCode(topPng, topData, width, clipHeight)

  if (topQrcode) {
    return { file, image, qrcode: topQrcode }
  }

  const bottomCrop = sharp(file)
    .extract({
      left: 0,
      top: height - clipHeight,
      width,
      height: clipHeight,
    })
    .raw()
    .ensureAlpha()
  const bottomData = await bottomCrop.toBuffer()
  const bottomPng = await bottomCrop.png().toBuffer()
  const bottomQrcode = await getQRCode(bottomPng, bottomData, width, clipHeight)

  if (bottomQrcode) {
    return { file, image, qrcode: bottomQrcode }
  }

  throw new Error(`no QR code found in ${filename}`)
}

export default class SummaryBallotInterpreter implements Interpreter {
  private hmpbInterpreter?: HMPBInterpreter
  private testMode?: boolean

  async addHmpbTemplate(
    election: Election,
    imageData: ImageData,
    metadata?: BallotPageMetadata
  ): Promise<BallotPageLayout>
  async addHmpbTemplate(
    election: Election,
    layout: BallotPageLayout
  ): Promise<BallotPageLayout>
  async addHmpbTemplate(
    election: Election,
    imageDataOrLayout: ImageData | BallotPageLayout,
    metadata?: BallotPageMetadata
  ): Promise<BallotPageLayout> {
    const interpreter = this.getHmbpInterpreter(election)
    let layout: BallotPageLayout

    if ('data' in imageDataOrLayout) {
      layout = await interpreter.interpretTemplate(imageDataOrLayout, metadata)
    } else {
      layout = imageDataOrLayout
    }

    ;({ metadata } = layout.ballotImage)

    if (metadata.isTestBallot === this.testMode) {
      await interpreter.addTemplate(layout)
    }

    debug(
      'Added HMPB template page %d/%d: ballotStyleId=%s precinctId=%s isTestBallot=%s',
      metadata.pageNumber,
      metadata.pageCount,
      metadata.ballotStyleId,
      metadata.precinctId,
      metadata.isTestBallot
    )

    return layout
  }

  public async interpretFile({
    election,
    ballotImagePath,
    ballotImageFile,
  }: InterpretFileParams): Promise<InterpretedBallot | undefined> {
    let ballotImageData: BallotImageData

    try {
      ballotImageData = await getBallotImageData(
        ballotImageFile,
        ballotImagePath
      )
    } catch (error) {
      debug('interpretFile failed with error: %s', error.message)
      return
    }

    const bmdResult = await this.interpretBMDFile(election, ballotImageData)

    if (bmdResult) {
      return bmdResult
    }

    try {
      const hmpbResult = await this.interpretHMPBFile(election, ballotImageData)

      if (hmpbResult) {
        return hmpbResult
      }
    } catch {
      // ignore for now
    }

    try {
      const metadata = metadataFromBytes(ballotImageData.qrcode)

      return {
        type: 'UninterpretedHmpbBallot',
        metadata,
      }
    } catch {
      // ignore for now
    }
  }

  public setTestMode(testMode: boolean): void {
    this.testMode = testMode
    this.hmpbInterpreter = undefined
  }

  private async interpretBMDFile(
    election: Election,
    { qrcode, image }: BallotImageData
  ): Promise<InterpretedBmdBallot | undefined> {
    if (typeof detect(qrcode) === 'undefined') {
      return
    }

    const cvr = interpretBallotData({ election, encodedBallot: qrcode })

    if (cvr) {
      return { type: 'InterpretedBmdBallot', cvr, normalizedImage: image }
    }
  }

  private async interpretHMPBFile(
    election: Election,
    { image }: BallotImageData
  ): Promise<InterpretedHmpbBallot | undefined> {
    const hmpbInterpreter = this.getHmbpInterpreter(election)
    const {
      ballot,
      marks,
      mappedBallot,
      metadata,
    } = await hmpbInterpreter.interpretBallot(image)
    const {
      _ballotId,
      _ballotStyleId,
      _precinctId,
      _testBallot,
      _scannerId,
      _pageNumber,
      _locales,
      ...allContestVotes
    } = ballotToCastVoteRecord(ballot)

    const cvr: CastVoteRecord = {
      _ballotId,
      _ballotStyleId,
      _precinctId,
      _testBallot,
      _scannerId,
      _pageNumber: _pageNumber ?? metadata.pageNumber,
      _locales: _locales ?? metadata.locales,
    }
    const contestIds = marks
      .filter((mark) => mark.type !== 'stray')
      .map((mark) => mark.contest?.id)

    for (const key in allContestVotes) {
      if (
        Object.prototype.hasOwnProperty.call(allContestVotes, key) &&
        typeof key === 'string'
      ) {
        const votes = allContestVotes[key]

        if (contestIds.includes(key)) {
          cvr[key] = votes
        } else if (!Array.isArray(votes) || votes.length > 0) {
          throw new Error(
            `Unexpectedly found a CVR entry for contest '${key}', but that contest should not be present on this ballot (${JSON.stringify(
              metadata
            )})`
          )
        }
      }
    }

    return {
      type: 'InterpretedHmpbBallot',
      cvr,
      normalizedImage: mappedBallot,
      markInfo: {
        marks,
        ballotSize: {
          width: mappedBallot.width,
          height: mappedBallot.height,
        },
      },
      metadata,
    }
  }

  private getHmbpInterpreter(election: Election): HMPBInterpreter {
    if (!this.hmpbInterpreter) {
      if (typeof this.testMode === 'undefined') {
        throw new Error(
          'testMode has not been configured; please set it to true or false before interpreting ballots'
        )
      }

      this.hmpbInterpreter = new HMPBInterpreter({
        election,
        testMode: this.testMode,
      })
    }
    return this.hmpbInterpreter
  }
}
