import { existsSync } from 'fs-extra'
import { join, dirname } from 'path'

const zbarimgPath = join(__dirname, '../vendor/zbar/zbarimg/zbarimg')

if (existsSync(zbarimgPath)) {
  const zbarimgDir = dirname(zbarimgPath)
  process.env.PATH = `${zbarimgDir}:${process.env.PATH}`
  console.log('process.env.PATH', process.env.PATH)
}
