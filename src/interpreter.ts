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
  OptionalYesNoVote,
} from '@votingworks/ballot-encoder'
import {
  Interpreter as HMPBInterpreter,
  metadataFromBytes,
} from '@votingworks/hmpb-interpreter'
import { detect as qrdetect } from '@votingworks/qrdetect'
import { readFile as readFileCallback } from 'fs'
import { decode as decodeJpeg } from 'jpeg-js'
import { decode as quircDecode } from 'node-quirc'
import { promisify } from 'util'
import { CastVoteRecord } from './types'

export interface InterpretFileParams {
  readonly election: Election
  readonly ballotImagePath: string
}

export interface Interpreter {
  interpretFile(
    interpretFileParams: InterpretFileParams
  ): Promise<CastVoteRecord | undefined>
}

const readFile = promisify(readFileCallback)

interface InterpretBallotStringParams {
  readonly election: Election
  readonly encodedBallot: Uint8Array
}

function ballotToCastVoteRecord(
  ballot: CompletedBallot
): CastVoteRecord | undefined {
  // TODO: Replace all this with a `CompletedBallot` -> `CastVoteRecord` mapper.
  const { election, ballotStyle, precinct, ballotId } = ballot

  // figure out the contests
  const contests = getContests({ ballotStyle, election })

  // prepare the CVR
  const cvr: CastVoteRecord = {
    _precinctId: precinct.id,
    _ballotId: ballotId,
    _ballotStyleId: ballotStyle.id,
  }

  for (const contest of contests) {
    // no answer for a particular contest is recorded in our final dictionary as an empty string
    // not the same thing as undefined.
    let cvrForContest: string | string[] = ''
    const vote = ballot.votes[contest.id]

    if (contest.type === 'yesno') {
      cvrForContest = (vote as OptionalYesNoVote) || ''
    } else if (contest.type === 'candidate') {
      // selections for this question
      const candidates = vote as Optional<CandidateVote>

      if (candidates && candidates.length > 0) {
        cvrForContest = candidates.map((candidate) =>
          candidate.isWriteIn ? 'writein' : candidate.id
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
}: InterpretBallotStringParams): CastVoteRecord | undefined {
  const { ballot } = decodeBallot(election, encodedBallot)
  return ballotToCastVoteRecord(ballot)
}

interface BallotImageData {
  file: Buffer
  image: ImageData
  qrcode: Buffer
}

export async function getBallotImageData(
  filepath: string
): Promise<BallotImageData> {
  const file = await readFile(filepath)
  const { data, width, height } = decodeJpeg(file)
  const image = { data: Uint8ClampedArray.from(data), width, height }
  const quircCodes = await quircDecode(file)

  if (quircCodes.length > 0) {
    return { file, image, qrcode: quircCodes[0].data }
  }

  const qrdetectCodes = qrdetect(data, width, height)

  if (qrdetectCodes.length > 0) {
    return { file, image, qrcode: qrdetectCodes[0].data }
  }

  throw new Error(`no QR code found in ${filepath}`)
}

export default class SummaryBallotInterpreter implements Interpreter {
  private hmpbInterpreter?: HMPBInterpreter

  // eslint-disable-next-line class-methods-use-this
  public async interpretFile({
    election,
    ballotImagePath,
  }: InterpretFileParams): Promise<CastVoteRecord | undefined> {
    let ballotImageData: BallotImageData

    try {
      ballotImageData = await getBallotImageData(ballotImagePath)
    } catch {
      return
    }

    return (
      (await this.interpretBMDFile(election, ballotImageData)) ??
      (await this.interpretHMPBFile(election, ballotImageData))
    )
  }

  private async interpretBMDFile(
    election: Election,
    { qrcode }: BallotImageData
  ): Promise<CastVoteRecord | undefined> {
    if (typeof detect(qrcode) !== 'undefined') {
      return interpretBallotData({ election, encodedBallot: qrcode })
    }
  }

  private async interpretHMPBFile(
    election: Election,
    { image, qrcode }: BallotImageData
  ): Promise<CastVoteRecord | undefined> {
    if (!this.hmpbInterpreter) {
      this.hmpbInterpreter = new HMPBInterpreter(election)
    }

    const metadata = metadataFromBytes(qrcode)

    if (!this.hmpbInterpreter.hasMissingTemplates()) {
      const { ballot } = await this.hmpbInterpreter.interpretBallot(
        image,
        metadata
      )
      return ballotToCastVoteRecord(ballot)
    }

    await this.hmpbInterpreter.addTemplate(image, metadata)
  }
}
