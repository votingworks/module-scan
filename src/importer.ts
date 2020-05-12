import * as chokidar from 'chokidar'
import * as path from 'path'
import * as fs from 'fs'
import * as streams from 'memory-streams'
import * as fsExtra from 'fs-extra'
import { Election } from '@votingworks/ballot-encoder'

import { CastVoteRecord, BatchInfo } from './types'
import Store from './store'
import DefaultInterpreter, {
  Interpreter,
  interpretBallotData,
} from './interpreter'
import { Scanner } from './scanner'

export interface Options {
  store: Store
  scanner: Scanner
  ballotImagesPath: string
  importedBallotImagesPath: string
  interpreter?: Interpreter
}

export interface Importer {
  addManualBallot(encodedBallot: Uint8Array): Promise<void>
  configure(newElection: Election): void
  doExport(): Promise<string>
  doImport(): Promise<void>
  doZero(): Promise<void>
  getStatus(): Promise<{ batches: BatchInfo[]; electionHash?: string }>
  unconfigure(): Promise<void>
}

/**
 * Imports ballot images from a `Scanner` and stores them in a `Store`.
 */
export default class SystemImporter implements Importer {
  private election?: Election
  private watcher?: chokidar.FSWatcher
  private store: Store
  private scanner: Scanner
  private interpreter: Interpreter
  private manualBatchId?: number
  private onCVRAddedCallbacks: ((cvr: CastVoteRecord) => void)[] = []

  private seenBallotImagePaths = new Set<string>()

  public readonly ballotImagesPath: string
  public readonly importedBallotImagesPath: string

  /**
   * @param param0 options for this importer
   * @param param0.store a data store to track scanned ballot images
   * @param param0.scanner a source of ballot images
   * @param param0.ballotImagesPath a directory to scan ballot images into
   * @param param0.scannedBallotImagesPath a directory to keep imported ballot images
   */
  public constructor({
    store,
    scanner,
    ballotImagesPath,
    importedBallotImagesPath,
    interpreter = new DefaultInterpreter(),
  }: Options) {
    this.store = store
    this.scanner = scanner
    this.interpreter = interpreter
    this.ballotImagesPath = ballotImagesPath
    this.importedBallotImagesPath = importedBallotImagesPath

    // make sure those directories exist
    for (const imagesPat of [ballotImagesPath, importedBallotImagesPath]) {
      if (!fs.existsSync(imagesPat)) {
        fs.mkdirSync(imagesPat)
      }
    }
  }

  /**
   * Adds a ballot using the data that would have been read from a scan, i.e.
   * the data encoded by the QR code.
   */
  public async addManualBallot(encodedBallot: Uint8Array): Promise<void> {
    if (!this.election) {
      return
    }

    if (!this.manualBatchId) {
      this.manualBatchId = await this.store.addBatch()
    }

    const cvr = interpretBallotData({
      election: this.election,
      encodedBallot,
    })

    if (cvr) {
      this.addCVR(this.manualBatchId!, `manual-${cvr._ballotId}`, cvr)
    }
  }

  /**
   * Sets the election information used to encode and decode ballots and begins
   * watching for scanned images to import.
   */
  public async configure(newElection: Election): Promise<void> {
    this.election = newElection

    // start watching the ballots
    this.watcher = chokidar.watch(this.ballotImagesPath, {
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 200,
      },
    })
    this.watcher.on('add', async (addedPath) => {
      try {
        await this.fileAdded(addedPath)
      } catch (error) {
        process.stderr.write(
          `unable to process file (${addedPath}): ${error.stack}\n`
        )
      }
    })
  }

  /**
   * Callback for chokidar to inform us that a new file was seen.
   */
  private async fileAdded(ballotImagePath: string): Promise<void> {
    if (!this.election) {
      return
    }

    // de-dupe because chokidar can't do it apparently
    if (this.seenBallotImagePaths.has(ballotImagePath)) {
      return
    }
    this.seenBallotImagePaths.add(ballotImagePath)

    // get the batch ID from the path
    const filename = path.basename(ballotImagePath)
    const batchIdMatch = filename.match(/batch-([^-]*)/)

    if (!batchIdMatch) {
      return
    }

    const batchId = parseInt(batchIdMatch[1], 10)

    const cvr = await this.interpreter.interpretFile({
      election: this.election,
      ballotImagePath,
    })

    if (cvr) {
      this.onCVRExtractedFromBallot(batchId, ballotImagePath, cvr)
    } // eventually do something with files that don't have a CVR in them?
  }

  private onCVRExtractedFromBallot(
    batchId: number,
    ballotImagePath: string,
    cvr: CastVoteRecord
  ): void {
    this.addCVR(batchId, ballotImagePath, cvr)

    // move the file only if there was a CVR
    if (fs.existsSync(ballotImagePath)) {
      fs.renameSync(
        ballotImagePath,
        path.join(this.importedBallotImagesPath, path.basename(ballotImagePath))
      )
    }
  }

  /**
   * Register a callback to be called when a CVR entry is added.
   */
  public addAddCVRCallback(callback: (cvr: CastVoteRecord) => void): void {
    this.onCVRAddedCallbacks.push(callback)
  }

  /**
   * Add a CVR entry to the internal store.
   */
  private addCVR(
    batchId: number,
    ballotImagePath: string,
    cvr: CastVoteRecord
  ): void {
    this.store.addCVR(batchId, ballotImagePath, cvr)
    for (const callback of this.onCVRAddedCallbacks) {
      try {
        callback(cvr)
      } catch {
        // ignore failed callbacks
      }
    }
  }

  /**
   * Create a new batch and scan as many images as we can into it.
   */
  public async doImport(): Promise<void> {
    if (!this.election) {
      throw new Error('no election configuration')
    }

    const batchId = await this.store.addBatch()

    try {
      // trigger a scan
      await this.scanner.scanInto(this.ballotImagesPath, `batch-${batchId}-`)
    } catch (err) {
      // node couldn't execute the command
      throw new Error(`problem scanning: ${err.message}`)
    }

    // mark the batch done in a few seconds
    setTimeout(() => {
      this.store.finishBatch(batchId)
    }, 5000)
  }

  /**
   * Export the current CVRs to a string.
   */
  public async doExport(): Promise<string> {
    if (!this.election) {
      return ''
    }

    const outputStream = new streams.WritableStream()
    await this.store.exportCVRs(outputStream)
    return outputStream.toString()
  }

  /**
   * Reset all the data, both in the store and the ballot images.
   */
  public async doZero(): Promise<void> {
    await this.store.init(true)
    fsExtra.emptyDirSync(this.ballotImagesPath)
    fsExtra.emptyDirSync(this.importedBallotImagesPath)
    this.manualBatchId = undefined
  }

  /**
   * Get the imported batches and current election info, if any.
   */
  public async getStatus(): Promise<{
    electionHash?: string
    batches: BatchInfo[]
  }> {
    const batches = await this.store.batchStatus()
    if (this.election) {
      return { electionHash: 'hashgoeshere', batches }
    }
    return { batches }
  }

  /**
   * Resets all data like `doZero`, removes election info, and stops importing.
   */
  public async unconfigure(): Promise<void> {
    await this.doZero()
    this.election = undefined
    if (this.watcher) {
      this.watcher.close()
    }
  }
}
