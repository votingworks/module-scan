import * as fs from 'fs-extra'
import { join } from 'path'
import request from 'supertest'
import election from '../test/fixtures/state-of-hamilton/election'
import getScannerCVRCountWaiter from '../test/getScannerCVRCountWaiter'
import SystemImporter from './importer'
import makeTemporaryBallotImportImageDirectories, {
  TemporaryBallotImportImageDirectories,
} from './util/makeTemporaryBallotImportImageDirectories'
import { FujitsuScanner } from './scanner'
import { buildApp } from './server'
import Store from './store'
import { CastVoteRecord, BallotPackageManifest } from './types'

const electionFixturesRoot = join(
  __dirname,
  '..',
  'test/fixtures/state-of-hamilton'
)

jest.mock('./exec')

let importDirs: TemporaryBallotImportImageDirectories

beforeEach(() => {
  importDirs = makeTemporaryBallotImportImageDirectories()
})

afterEach(() => {
  importDirs.remove()
})

test('going through the whole process works', async () => {
  jest.setTimeout(20000)

  const store = await Store.memoryStore()
  const scanner = new FujitsuScanner()
  const importer = new SystemImporter({ store, scanner, ...importDirs.paths })
  const app = buildApp({ importer, store })
  const waiter = getScannerCVRCountWaiter(importer)

  await importer.restoreConfig()

  await request(app)
    .patch('/config')
    .send({ election })
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })

  const manifest: BallotPackageManifest = JSON.parse(
    await fs.readFile(join(electionFixturesRoot, 'manifest.json'), 'utf8')
  )

  const addTemplatesRequest = request(app).post('/scan/hmpb/addTemplates')

  for (const config of manifest.ballots) {
    addTemplatesRequest
      .attach('ballots', join(electionFixturesRoot, config.filename))
      .attach(
        'metadatas',
        Buffer.from(new TextEncoder().encode(JSON.stringify(config))),
        { filename: 'config.json', contentType: 'application/json' }
      )
  }

  await addTemplatesRequest.expect(200, { status: 'ok' })
  await request(app).post('/scan/scanBatch').expect(200, { status: 'ok' })

  const expectedSampleBallots = 3

  {
    // move some sample ballots into the ballots directory
    await fs.copyFile(
      join(electionFixturesRoot, 'filled-in-dual-language-p1.jpg'),
      join(importer.ballotImagesPath, 'batch-1-ballot-1.jpg')
    )
    await fs.copyFile(
      join(electionFixturesRoot, 'filled-in-dual-language-p2.jpg'),
      join(importer.ballotImagesPath, 'batch-1-ballot-2.jpg')
    )
    await fs.copyFile(
      join(
        electionFixturesRoot,
        'filled-in-dual-language-p5-yesno-overvotes.jpg'
      ),
      join(importer.ballotImagesPath, 'batch-1-ballot-3.jpg')
    )

    // wait for the processing
    await waiter.waitForCount(expectedSampleBallots)
  }

  {
    // check the latest batch has the expected ballots
    const status = await request(app)
      .get('/scan/status')
      .set('Accept', 'application/json')
      .expect(200)
    expect(JSON.parse(status.text).batches.length).toBe(1)
    expect(JSON.parse(status.text).batches[0].count).toBe(expectedSampleBallots)
  }

  {
    const exportResponse = await request(app)
      .post('/scan/export')
      .set('Accept', 'application/json')
      .expect(200)

    // response is a few lines, each JSON.
    // can't predict the order so can't compare
    // to expected outcome as a string directly.
    const CVRs: CastVoteRecord[] = exportResponse.text
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
    const p1CVR = CVRs.find(
      (cvr) => Array.isArray(cvr['president']) && cvr['president'].length > 0
    )!
    const p2CVR = CVRs.find((cvr) => cvr !== p1CVR)!
    const p3CVR = CVRs.find(
      (cvr) =>
        Array.isArray(cvr['proposition-1']) && cvr['proposition-1'].length > 0
    )!

    delete p1CVR._ballotId
    delete p2CVR._ballotId
    delete p3CVR._ballotId

    expect(p1CVR).toMatchInlineSnapshot(`
      Object {
        "_ballotStyleId": "12",
        "_locales": Object {
          "primary": "en-US",
          "secondary": "es-US",
        },
        "_pageNumber": 1,
        "_precinctId": "23",
        "_scannerId": "000",
        "_testBallot": false,
        "president": Array [
          "barchi-hallaren",
        ],
        "representative-district-6": Array [
          "schott",
        ],
        "senator": Array [
          "brown",
        ],
      }
    `)
    expect(p2CVR).toMatchInlineSnapshot(`
      Object {
        "_ballotStyleId": "12",
        "_locales": Object {
          "primary": "en-US",
          "secondary": "es-US",
        },
        "_pageNumber": 2,
        "_precinctId": "23",
        "_scannerId": "000",
        "_testBallot": false,
        "governor": Array [
          "windbeck",
        ],
        "lieutenant-governor": Array [
          "davis",
        ],
        "secretary-of-state": Array [
          "talarico",
        ],
        "state-assembly-district-54": Array [
          "keller",
        ],
        "state-senator-district-31": Array [],
      }
    `)
    expect(p3CVR).toMatchInlineSnapshot(`
      Object {
        "102": Array [],
        "_ballotStyleId": "12",
        "_locales": Object {
          "primary": "en-US",
          "secondary": "es-US",
        },
        "_pageNumber": 5,
        "_precinctId": "23",
        "_scannerId": "000",
        "_testBallot": false,
        "measure-101": Array [],
        "proposition-1": Array [
          "yes",
          "no",
        ],
      }
    `)
  }
})
