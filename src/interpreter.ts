//
// The Interpreter watches a directory where scanned ballot images will appear
// and process/interpret them into a cast-vote record.
//

import { decode } from 'node-quirc'
import { readFile as readFileCallback } from 'fs'
import { promisify } from 'util'

import {
  BallotStyle,
  CandidateContest,
  CastVoteRecord,
  Contest,
  Contests,
  CVRCallbackFunction,
  Dictionary,
  Election,
} from './types'

const readFile = promisify(readFileCallback)

const yesNoValues: Dictionary<string> = { '0': 'no', '1': 'yes' }

export interface InterpretBallotStringParams {
  readonly election: Election
  readonly ballotString: string
}

export function interpretBallotString(
  interpretBallotStringParams: InterpretBallotStringParams
): CastVoteRecord | undefined {
  const { election, ballotString } = interpretBallotStringParams

  const [
    ballotStyleId,
    precinctId,
    allSelections,
    serialNumber,
  ] = ballotString.split('.')

  // figure out the contests
  const ballotStyle = election.ballotStyles.find(
    (b: BallotStyle) => b.id === ballotStyleId
  )

  if (!ballotStyle) {
    return
  }

  const contests: Contests = election.contests.filter(
    (c: Contest) =>
      ballotStyle.districts.includes(c.districtId) &&
      ballotStyle.partyId === c.partyId
  )

  // prepare the CVR
  let cvr: CastVoteRecord = {}

  const allSelectionsList = allSelections.split('|')
  contests.forEach((contest: Contest, contestNum: number) => {
    // no answer for a particular contest is recorded in our final dictionary as an empty string
    // not the same thing as undefined.

    if (contest.type === 'yesno') {
      cvr[contest.id] = yesNoValues[allSelectionsList[contestNum]] || ''
    } else {
      if (contest.type === 'candidate') {
        // selections for this question
        const selections = allSelectionsList[contestNum].split(',')
        if (selections.length > 1 || selections[0] !== '') {
          cvr[contest.id] = selections.map(selection =>
            selection === 'W'
              ? 'writein'
              : (contest as CandidateContest).candidates[parseInt(selection)].id
          )
        } else {
          cvr[contest.id] = ''
        }
      }
    }
  })

  cvr['_precinctId'] = precinctId
  cvr['_serialNumber'] = serialNumber

  return cvr
}

export interface InterpretFileParams {
  readonly election: Election
  readonly ballotImagePath: string
  readonly cvrCallback: CVRCallbackFunction
}

export async function readQRCodesFromImageFile(
  path: string
): Promise<Buffer[]> {
  const jpegData = await readFile(path)
  const qrCodes = await decode(jpegData)

  return qrCodes.map(({ data }) => data)
}

export default async function interpretFile(
  interpretFileParams: InterpretFileParams
) {
  const { election, ballotImagePath, cvrCallback } = interpretFileParams
  let ballotString: string

  try {
    const qrCodes = await readQRCodesFromImageFile(ballotImagePath)

    if (qrCodes.length === 0) {
      throw new Error(`no QR codes found in ballot image: ${ballotImagePath}`)
    }

    ballotString = String.fromCharCode(...Array.from(qrCodes[0]))
  } catch {
    return cvrCallback({ ballotImagePath })
  }

  const cvr = interpretBallotString({ election, ballotString })
  cvrCallback({ ballotImagePath, cvr })
}
