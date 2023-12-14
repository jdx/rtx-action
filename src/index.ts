import * as cache from '@actions/cache'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as glob from '@actions/glob'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { rtxDir } from './utils'

async function run(): Promise<void> {
  try {
    await setToolVersions()
    await setRtxToml()

    if (core.getBooleanInput('cache')) {
      await core.group('Restore rtx cache', async () => restoreRTXCache())
      core.saveState('CACHE', false)
    } else {
      core.saveState('CACHE', true)
      core.setOutput('cache-hit', false)
    }

    const version = core.getInput('version')
    const setupMessage = version ? `Setup rtx@${version}` : 'Setup rtx'
    await core.group(setupMessage, async () => setupRTX(version))
    await setEnvVars()
    await core.group('Running rtx --version', async () => testRTX())
    if (core.getBooleanInput('install')) {
      await core.group('Running rtx install', async () => rtxInstall())
    }
    await setPaths()
  } catch (err) {
    if (err instanceof Error) core.setFailed(err.message)
    else throw err
  }
}

async function setEnvVars(): Promise<void> {
  core.startGroup('Setting env vars')
  if (!process.env['RTX_TRUSTED_CONFIG_PATHS']) {
    core.exportVariable(
      'RTX_TRUSTED_CONFIG_PATHS',
      path.join(process.cwd(), '.rtx.toml')
    )
  }
  if (!process.env['RTX_YES']) {
    core.exportVariable('RTX_YES', '1')
  }
}

async function restoreRTXCache(): Promise<void> {
  const cachePath = rtxDir()
  const fileHash = await glob.hashFiles(`**/.tool-versions\n**/.rtx.toml`)
  const primaryKey = `rtx-tools-${getOS()}-${os.arch()}-${fileHash}`

  core.saveState('PRIMARY_KEY', primaryKey)

  const cacheKey = await cache.restoreCache([cachePath], primaryKey)
  core.setOutput('cache-hit', Boolean(cacheKey))

  if (!cacheKey) {
    core.info(`rtx cache not found for ${getOS()}-${os.arch()} tool versions`)
    return
  }

  core.saveState('CACHE_KEY', cacheKey)
  core.info(`rtx cache restored from key: ${cacheKey}`)
}

async function setupRTX(version: string | undefined): Promise<void> {
  const rtxBinDir = path.join(rtxDir(), 'bin')
  const url = version
    ? `https://rtx.jdx.dev/v${version}/rtx-v${version}-${getOS()}-${os.arch()}`
    : `https://rtx.jdx.dev/rtx-latest-${getOS()}-${os.arch()}`
  await fs.promises.mkdir(rtxBinDir, { recursive: true })
  await exec.exec('curl', [
    '-fsSL',
    url,
    '--output',
    path.join(rtxBinDir, 'rtx')
  ])
  await exec.exec('chmod', ['+x', path.join(rtxBinDir, 'rtx')])
  core.addPath(rtxBinDir)
}

async function setToolVersions(): Promise<void> {
  const toolVersions = core.getInput('tool_versions')
  if (toolVersions) {
    await writeFile('.tool-versions', toolVersions)
  }
}

async function setRtxToml(): Promise<void> {
  const toml = core.getInput('rtx_toml')
  if (toml) {
    await writeFile('.rtx.toml', toml)
  }
}

function getOS(): string {
  switch (process.platform) {
    case 'darwin':
      return 'macos'
    default:
      return process.platform
  }
}

async function setPaths(): Promise<void> {
  for (const binPath of await getBinPaths()) {
    core.addPath(binPath)
  }
}

async function getBinPaths(): Promise<string[]> {
  const output = await exec.getExecOutput('rtx', ['bin-paths'])
  return output.stdout.split('\n')
}

const testRTX = async (): Promise<number> => exec.exec('rtx', ['--version'])
const rtxInstall = async (): Promise<number> => exec.exec('rtx', ['install'])
const writeFile = async (p: fs.PathLike, body: string): Promise<void> =>
  core.group(`Writing ${p}`, async () =>
    fs.promises.writeFile(p, body, { encoding: 'utf8' })
  )

run()
