
import express, {Application, Request, Response} from "express"
import {doScan, doExport, getStatus, doZero} from "./scanner"
import {getDB, reset, addBallot} from "./store"

// for now, we reset on every start
reset()

console.log(addBallot)

const app : Application = express()
const port = 3002

app.get("/", (_request : Request, response : Response) => {
  response.send("Hello!")
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
