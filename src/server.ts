
import express, {Application, Request, Response} from "express"
import {doScan, doExport, getStatus, doZero} from "./scanner"
import {getDB, reset, addBallot} from "./store"
import * as interpreter from "./interpreter"
import * as fs from 'fs'

import {Ballot, Election} from "./types"

// for now, we reset on every start
reset()

console.log(addBallot)

const app : Application = express()
const port = 3002

const electionPath = "./election.json"

app.get("/", (_request : Request, response : Response) => {
  response.send("Hello!")
})

app.post("/scan/configure", (_request: Request, _response: Response) => {
  // store the election file
  const election = JSON.parse(fs.readFileSync(electionPath,"utf8")) as Election

  // start watching the ballots
  interpreter.init(election, "./ballots", (_ballotToAdd:Ballot) => {
  })
})

app.post("/scan/scan", (_request: Request, _response: Response) => {
  doScan(getDB())
})

app.post("/scan/export", (_request: Request, _response: Response) => {
  doExport(getDB())
})

app.get("/scan/status", (_request: Request, _response: Response) => {
  getStatus(getDB())
})

app.post("/scan/zero", (_request: Request, _response: Response) => {
  doZero(getDB())
})

app.listen(port, () => {
    console.log(`Listening at http://localhost:${port}/`);
});
