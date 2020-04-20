import { join } from 'path'

import { Election } from '@votingworks/ballot-encoder'
import HMPBInterpreter from './hmpbInterpreter'
import electionJSON from '../tests/fixtures/election.json'

const election = electionJSON as Election

const templatePage1Path = join(
  __dirname,
  '../tests/fixtures/template-2020-04-15-0001.jpg'
)
const templatePage2Path = join(
  __dirname,
  '../tests/fixtures/template-2020-04-15-0002.jpg'
)

const ballotPage1Path = join(
  __dirname,
  '../tests/fixtures/template-2020-04-15-0001-full-votes.jpg'
)

test('it works when loading templates and then ballots', async () => {
  const interpreter = new HMPBInterpreter()

  // load the template2
  await interpreter.interpretFile({
    election,
    ballotImagePath: templatePage1Path,
    cvrCallback: () => {},
  })
  await interpreter.interpretFile({
    election,
    ballotImagePath: templatePage2Path,
    cvrCallback: () => {},
  })

  // load the ballot
  await interpreter.interpretFile({
    election,
    ballotImagePath: ballotPage1Path,
    cvrCallback: cvr => {
      // check just one for now
      expect(cvr.cvr!['5']).toMatchObject(['51'])
    },
  })
})
