
import express, {Application, Request, Response} from "express"
import {doScan, doExport, getStatus, doZero} from "./scanner"
import {getDB, reset, addBallot} from "./store"
import * as interpreter from "./interpreter"
import * as fs from 'fs'

import {Election} from "./types"

// for now, we reset on every start
reset()

export const app : Application = express()
const port = 3002

const electionPath = "./election.json"

app.get("/", (_request : Request, response : Response) => {
  response.send("Hello!")
})

app.post("/scan/configure", (_request: Request, _response: Response) => {
  // store the election file
  const election = JSON.parse(fs.readFileSync(electionPath,"utf8")) as Election

  // start watching the ballots
  interpreter.init(election, "./ballots", addBallot)
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

export function startApp() {
  app.listen(port, () => {
        console.log(`Listening at http://localhost:${port}/`);
  });
}
