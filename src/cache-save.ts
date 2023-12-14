import * as cache from '@actions/cache'
import * as core from '@actions/core'
import * as fs from 'fs'
import { rtxDir } from './utils'

export async function run(): Promise<void> {
  try {
    await cacheRTXTools()
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
    else throw error
  }
}

async function cacheRTXTools(): Promise<void> {
  if (!core.getState('CACHE')) {
    core.info('Skipping saving cache')
    return
  }

  const state = core.getState('CACHE_KEY')
  const primaryKey = core.getState('PRIMARY_KEY')
  const cachePath = rtxDir()

  if (!fs.existsSync(cachePath)) {
    throw new Error(`Cache folder path does not exist on disk: ${cachePath}`)
  }

  if (primaryKey === state) {
    core.info(`Cache hit occurred on key ${primaryKey}, not saving cache.`)
    return
  }

  const cacheId = await cache.saveCache([cachePath], primaryKey)
  if (cacheId === -1) return

  core.info(`Cache saved from ${cachePath} with key: ${primaryKey}`)
}

run()
