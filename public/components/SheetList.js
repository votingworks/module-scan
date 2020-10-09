import { BINARY_COLORS, map } from '../utils/colors.js'
import SheetPageCell from './SheetPageCell.js'

const { useCallback, useState, useEffect } = React

/**
 * @typedef {object} Sheet
 * @property {string} id
 * @property {string} batchId
 * @property {PageInterpretation} frontInterpretation
 * @property {PageInterpretation} backInterpretation
 */

/**
 * @typedef {import('../../src/interpreter').PageInterpretation} PageInterpretation
 */

const lookupBatchColor = /** @type {(value: string) => string} */ (map(
  BINARY_COLORS
))

const SheetList = () => {
  const [isLoading, setIsLoading] = useState(false)
  const [sheets, setSheets] = useState(/** @type {Sheet[]} */ ([]))

  useEffect(() => {
    ;(async () => {
      setIsLoading(true)
      try {
        const response = await fetch('/scan/sheets')
        const sheets = await response.json()
        setSheets(sheets)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [])

  const onPageClicked = useCallback(
    /**
     * @param {'front' | 'back'} side
     * @param {string} sheetId
     */
    async (side, sheetId) => {
      console.log({ sheets, sheetId })
      const sheet = sheets.find((s) => s.id === sheetId)
      const page =
        side === 'front' ? sheet.frontInterpretation : sheet.backInterpretation
      console.log({ side, sheetId, sheet, page })
      const imageURLBase = `/scan/hmpb/ballot/${sheetId}/${side}/image`
      const imageURL = `${imageURLBase}/normalized`
      const templateImageURL = `${imageURLBase}/template`

      if (page.type !== 'InterpretedHmpbPage') {
        window.open(imageURL)
        return
      }

      const w = window.open('about:blank')
      w?.document.write(
        `
        <style>
        body {
          font-family: Arial, Helvetica, sans-serif;
        }
        </style>

        <div style="position: fixed; top: 0; left: ${
          page.markInfo.ballotSize.width
        }px; width: calc(100% - ${
          page.markInfo.ballotSize.width
        }px); height: 100%; padding-left: 10px; padding-top: 40px;">
          <label>
            Template ↔ Scanned<br>
            <input type="range" oninput="document.getElementById('normalized-image').style.opacity = this.value / 100" min="0" max="100" value="90">
          </label>
        </div>
        <div style="position: absolute; top: 0; left: 0; width: ${
          page.markInfo.ballotSize.width
        }px; height: ${page.markInfo.ballotSize.height}px;">
          <img src="${templateImageURL}" style="position: absolute; top: 0; left: 0;">
          <img src="${imageURL}" style="position: absolute; top: 0; left: 0; opacity: 0.5;" id="normalized-image">
          ${page.contests.map(
            (contest) => `
            <div style="position: absolute; left: ${contest.bounds.x}px; top: ${contest.bounds.y}px; width: ${contest.bounds.width}px; height: ${contest.bounds.height}px; background: #00000033;"></div>
          `
          )}
          ${page.markInfo.marks
            .filter((mark) => mark.type !== 'stray')
            .map(
              /** @param {import('@votingworks/hmpb-interpreter').BallotTargetMark} mark */ (
                mark
              ) => `
                  <div style="position: absolute; top: ${
                    mark.bounds.y
                  }px; left: ${mark.bounds.x}px; width: ${
                mark.bounds.width
              }px; height: ${
                mark.bounds.height
              }px; background: #ff000099;"></div>

                  <div style="position: absolute; top: ${
                    mark.bounds.y + (mark.scoredOffset?.y ?? 0)
                  }px; left: ${
                mark.bounds.x + (mark.scoredOffset?.x ?? 0)
              }px; width: ${mark.bounds.width}px; height: ${
                mark.bounds.height
              }px; background: #00ff0099;"></div>
                  <div style="position: absolute; top: ${
                    mark.target.inner.y + (mark.scoredOffset?.y ?? 0)
                  }px; left: ${
                mark.target.inner.x + (mark.scoredOffset?.x ?? 0)
              }px; width: ${mark.target.inner.width}px; height: ${
                mark.target.inner.height
              }px; background: #0000ff99;">
                      <div style="font-family: Arial, Helvetica, sans-serif; font-size: 0.7em; position: absolute; top: ${
                        mark.target.bounds.height + 5
                      }px">${Math.round(mark.score * 10000) / 100}%</div>
                    </div>
                `
            )
            .join('')}
            </div>
        `
      )
    },
    [sheets]
  )

  return isLoading
    ? h('p', {}, 'Loading…')
    : h('table', { className: 'sheet-list' }, [
        h(
          'thead',
          { key: 'thead' },
          h('tr', {}, [
            h('th', { key: 'header-id' }, 'ID'),
            h('th', { key: 'header-front' }, 'Front'),
            h('th', { key: 'header-back' }, 'Back'),
          ])
        ),
        h(
          'tbody',
          { key: 'tbody' },
          sheets.map((sheet) =>
            h(
              'tr',
              {
                key: sheet.id,
                style: {
                  borderLeftColor: lookupBatchColor(sheet.batchId),
                  borderLeftStyle: 'solid',
                },
              },
              [
                h('td', { key: 'id' }, sheet.id),
                h(SheetPageCell, {
                  key: 'front',
                  interpretation: sheet.frontInterpretation,
                  onClick() {
                    onPageClicked('front', sheet.id)
                  },
                }),
                h(SheetPageCell, {
                  key: 'back',
                  interpretation: sheet.backInterpretation,
                  onClick() {
                    onPageClicked('back', sheet.id)
                  },
                }),
              ]
            )
          )
        ),
      ])
}

export default SheetList
