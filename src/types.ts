export interface Dictionary<T> {
  [key: string]: T | undefined
}

export interface BallotStyle {
  readonly id: string
  readonly partyId?: string
  readonly precincts: string[]
  readonly districts: string[]
}

export interface Candidate {
  readonly id: string
  readonly name: string
  readonly partyId?: string
  isWriteIn?: boolean
}
export type OptionalCandidate = Candidate | undefined

export type ContestTypes = 'candidate' | 'yesno'


export interface Contest {
  readonly id: string
  readonly districtId: string
  readonly partyId?: string
  readonly section: string
  readonly title: string
  readonly type: ContestTypes
}
export interface CandidateContest extends Contest {
  readonly type: 'candidate'
  readonly seats: number
  readonly candidates: Candidate[]
  readonly allowWriteIns: boolean
}
export interface YesNoContest extends Contest {
  readonly type: 'yesno'
  readonly description: string
  readonly shortTitle: string
}
export type Contests = Array<CandidateContest | YesNoContest>

export type Ballot = Dictionary<string>

