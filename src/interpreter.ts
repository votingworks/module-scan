
//
// The Interpreter watches a directory where scanned ballot images will appear
// and process/interpret them into a cast-vote record.
//

import * as chokidar from 'chokidar'
import * as ImageJS from 'image-js'
import jsQR from "jsqr"

import {BallotCallbackFunction, Ballot, BallotStyle, CandidateContest, Contest, Contests, Election} from './types'

let watcher:chokidar.FSWatcher, election:Election

export function init(e:Election, directoryToWatch:string, callback:BallotCallbackFunction) {
  election = e
  watcher = chokidar.watch(directoryToWatch, {persistent: true})
  watcher.on('add', (path:string) => interpretFile(path, callback))
}

// @ts-ignore image type not defined
const scan = (im:Image) => {
  // the QR code is roughly in the top-right 1/4 * 2/5 corner
  // or equivalent bottom-left corner. Looking at smaller portions
  // of the image increases the chance of recognizing the QR code
  // at lower resolutions
  
  const [width, height] = im.sizes

  const firstImage = im.crop({x: width*3/5, width: width/5, y:0, height: height/4})
  const firstScan = jsQR(firstImage.data, firstImage.width, firstImage.height)

  if (firstScan) {
    return firstScan
  }
  
  const secondImage = im.crop({x: width/5, width: width/5, y:height*3/4, height: height/4})
  const secondScan = jsQR(secondImage.data, secondImage.width, secondImage.height)
  return secondScan
}

export function interpretFile(path:string, callback:BallotCallbackFunction) {
  ImageJS.Image.load(path).then(function(im:typeof Image) {
    const scanResult = scan(im)
    if (!scanResult) {
      return
    }
    
    const qrData : string = scanResult.data as string
    const [ballotStyleId, precinctId, allChoices] = qrData.split(".")
    
    // figure out the contests
    const ballotStyle = election.ballotStyles.find((b : BallotStyle)=> b.id === ballotStyleId)
    
    if (!ballotStyle) {
      return
    }
    
    const contests : Contests = election.contests.filter((c : Contest) =>
      (ballotStyle.districts.includes(c.districtId) &&
       ballotStyle.partyId === c.partyId))
    
    // prepare the CVR
    let votes : Ballot = {}
    
    const allChoicesList = allChoices.split("/")
    contests.forEach((c : Contest, contest_num : number) => {
      // no answer for a particular contest is recorded in our final dictionary as an empty string
      // not the same thing as undefined.
      
      if (c.type === "yesno") {
	if (allChoicesList[contest_num] === "1") {
	  votes[c.id] = "yes"
	}
	
	if (allChoicesList[contest_num] === "0") {
	  votes[c.id] = "no"
	}
	
	// neither 0 nor 1, so no answer, we still record it.
	votes[c.id] = ""
      }
      
      if (c.type === "candidate") {
	// choices for this question
	const choices = allChoicesList[contest_num].split(",")
	if (choices.length > 1 || choices[0] !== '') {
	  votes[c.id] = choices.map(choice => (c as CandidateContest).candidates[parseInt(choice)].id)
	} else {
	  votes[c.id] = ""
	}
      }
    })
    
    votes["_precinctId"] = precinctId
    
    callback(path, votes)
  })
  
}

export function stop() {
  watcher.close()
}
