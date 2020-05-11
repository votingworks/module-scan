//
// The Interpreter watches a directory where scanned ballot images will appear
// and process/interpret them into a cast-vote record.
//

import {
  CandidateVote,
  CompletedBallot,
  decodeBallot,
  Election,
  getContests,
  Optional,
  OptionalYesNoVote,
} from '@votingworks/ballot-encoder'
import { readFile as readFileCallback } from 'fs'
import { decode as decodeJpeg } from 'jpeg-js'
import { detect as qrdetect } from '@votingworks/qrdetect'
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

async function readQRCodeFromImageFileData(
  fileData: Buffer
): Promise<Buffer | undefined> {
  const quircCodes = await quircDecode(fileData)

  if (quircCodes.length > 0) {
    return quircCodes[0].data
  }

  const { data, width, height } = decodeJpeg(fileData)
  const qrdetectCodes = qrdetect(data, width, height)

  if (qrdetectCodes.length > 0) {
    return qrdetectCodes[0].data
  }
}

export async function readQRCodeFromImageFile(
  filepath: string
): Promise<Buffer | undefined> {
  return readQRCodeFromImageFileData(await readFile(filepath))
}

export default class SummaryBallotInterpreter implements Interpreter {
  // eslint-disable-next-line class-methods-use-this
  public async interpretFile(
    interpretFileParams: InterpretFileParams
  ): Promise<CastVoteRecord | undefined> {
    const { election, ballotImagePath } = interpretFileParams

    try {
      const encodedBallot = await readQRCodeFromImageFile(ballotImagePath)

      if (!encodedBallot) {
        throw new Error(`no QR codes found in ballot image: ${ballotImagePath}`)
      }

      const cvr = interpretBallotData({ election, encodedBallot })
      return cvr
    } catch {
      return undefined
    }
  }
}
