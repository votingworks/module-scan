import request from 'supertest'
import * as fs from 'fs'
import * as path from 'path'
import { app } from './server'
import election from '../election.json'
import { ballotsPath, scannedBallotsPath, sampleBallotsPath } from './scanner'

const expectedOutcomeRaw =
  '{"102":"","president":["barchi-hallaren"],"senator":["hewetson"],"representative-district-6":["reeder"],"governor":["steelloy"],"lieutenant-governor":["davis"],"secretary-of-state":["talarico"],"state-senator-district-31":["shiplett"],"state-assembly-district-54":["keller"],"county-commissioners":["savoy","bainbridge","witherspoonsmithson"],"county-registrar-of-wills":["ramachandrani"],"city-mayor":["seldon"],"city-council":["rupp"],"judicial-robert-demergue":"","judicial-elmer-hull":"","question-a":"","question-b":"","question-c":"","proposition-1":"","measure-101":"","_precinctId":"23"}\n{"102":"","president":["boone-lian"],"senator":["wentworthfarthington"],"representative-district-6":["reeder"],"governor":["harris"],"lieutenant-governor":"","secretary-of-state":"","state-senator-district-31":"","state-assembly-district-54":"","county-commissioners":"","county-registrar-of-wills":"","city-mayor":"","city-council":"","judicial-robert-demergue":"","judicial-elmer-hull":"","question-a":"","question-b":"","question-c":"","proposition-1":"","measure-101":"","_precinctId":"23"}'

// @ts-ignore
const expectedOutcome = expectedOutcomeRaw.split('\n').map(JSON.parse)

const emptyDir = function(dirPath: string) {
  const files = fs.readdirSync(dirPath)
  for (const file of files) {
    fs.unlinkSync(path.join(dirPath, file))
  }
}

test('going through the whole process works', done => {
  // clean up
  emptyDir(ballotsPath)
  emptyDir(scannedBallotsPath)

  request(app)
    .post('/scan/configure')
    .send(election)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })
    .then(() => {
      // move some sample ballots into the ballots directory
      const sampleBallots = fs.readdirSync(sampleBallotsPath)
      for (const ballot of sampleBallots) {
        const oldPath = path.join(sampleBallotsPath, ballot)
        const newPath = path.join(ballotsPath, ballot)
        fs.copyFileSync(oldPath, newPath)
      }

      // wait a little bit
      setTimeout(() => {
        request(app)
          .post('/scan/export')
          .set('Accept', 'application/json')
          .expect(200)
          .then(response => {
            // response is 3 lines, each JSON.
            // can't predict the order so can't compare
            // to expected outcome as a string directly.
            // @ts-ignore
            const CVRs = response.text.split('\n').map(JSON.parse)
            expect(CVRs.length).toBe(expectedOutcome.length)

            // clean up
            request(app)
              .post('/scan/unconfigure')
              .then(() => {
                done()
              })
          })
      }, 1000)
    })
})