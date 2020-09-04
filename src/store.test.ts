import { BallotType } from '@votingworks/ballot-encoder'
import { promises as fs } from 'fs'
import * as tmp from 'tmp'
import election from '../test/fixtures/state-of-hamilton/election'
import Store from './store'
import { BallotMetadata } from './types'
import { fromElection } from './util/electionDefinition'

test('get/set election', async () => {
  const store = await Store.memoryStore()

  expect(await store.getElectionDefinition()).toBeUndefined()

  await store.setElection(fromElection(election))
  expect(await store.getElectionDefinition()).toEqual(
    expect.objectContaining({ election })
  )

  await store.setElection(undefined)
  expect(await store.getElectionDefinition()).toBeUndefined()
})

test('get/set test mode', async () => {
  const store = await Store.memoryStore()

  expect(await store.getTestMode()).toBe(false)

  await store.setTestMode(true)
  expect(await store.getTestMode()).toBe(true)

  await store.setTestMode(false)
  expect(await store.getTestMode()).toBe(false)
})

test('HMPB template handling', async () => {
  const store = await Store.memoryStore()
  const metadata: BallotMetadata = {
    electionHash: '',
    locales: { primary: 'en-US' },
    ballotStyleId: '12',
    precinctId: '23',
    isTestMode: false,
    ballotType: BallotType.Standard,
  }

  expect(await store.getHmpbTemplates()).toEqual([])

  await store.addHmpbTemplate(Buffer.of(1, 2, 3), metadata, [
    {
      ballotImage: {
        metadata: {
          ...metadata,
          pageNumber: 1,
        },
      },
      contests: [],
    },
    {
      ballotImage: {
        metadata: {
          ...metadata,
          pageNumber: 2,
        },
      },
      contests: [],
    },
  ])

  expect(await store.getHmpbTemplates()).toEqual([
    [
      Buffer.of(1, 2, 3),
      [
        {
          ballotImage: {
            metadata: {
              electionHash: '',
              ballotType: BallotType.Standard,
              locales: { primary: 'en-US' },
              ballotStyleId: '12',
              precinctId: '23',
              isTestMode: false,
              pageNumber: 1,
            },
          },
          contests: [],
        },
        {
          ballotImage: {
            metadata: {
              electionHash: '',
              ballotType: BallotType.Standard,
              locales: { primary: 'en-US' },
              ballotStyleId: '12',
              precinctId: '23',
              isTestMode: false,
              pageNumber: 2,
            },
          },
          contests: [],
        },
      ],
    ],
  ])
})

test('destroy database', async () => {
  const dbFile = tmp.fileSync()
  const store = await Store.fileStore(dbFile.name)

  await store.reset()
  await fs.access(dbFile.name)

  await store.dbDestroy()
  await expect(fs.access(dbFile.name)).rejects.toThrowError('ENOENT')
})

test('batch cleanup works correctly', async () => {
  const dbFile = tmp.fileSync()
  const store = await Store.fileStore(dbFile.name)

  await store.reset()

  const firstBatchId = await store.addBatch()
  await store.addBatch()
  await store.finishBatch({ batchId: firstBatchId })
  await store.cleanupIncompleteBatches()

  const batches = await store.batchStatus()
  expect(batches).toHaveLength(1)
  expect(batches[0].id).toEqual(firstBatchId)
})
