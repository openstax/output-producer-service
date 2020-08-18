console.error('elmopipe0')
const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const pipelineDir = path.resolve(__dirname, './pipelines')
const envDir = path.resolve(__dirname, '../env')
const commandUsage = 'pipeline <pipelinetype> <env> [options]...'

module.exports.command = commandUsage
module.exports.aliases = ['p']
module.exports.describe = 'builds a pipeline runnable with fly command'
module.exports.builder = yargs => {
  yargs.usage(`Usage: ${process.env.CALLER || 'build.js'} ${commandUsage}`)
  yargs.positional('pipelinetype', {
    describe: 'type of pipeline',
    choices: fs.readdirSync(pipelineDir).map(file => path.basename(file, '.js')),
    type: 'string'
  }).positional('env', {
    describe: 'name of environment',
    choices: fs.readdirSync(envDir).map(file => path.basename(file, '.json')),
    type: 'string'
  }).option('output', {
    alias: ['o'],
    describe: 'path to output file',
    defaultDescription: 'stdout',
    normalize: true,
    requiresArg: true,
    type: 'string'
  }).option('tag', {
    alias: ['t'],
    describe: 'pin pipeline image resources to a tag in the config',
    type: 'string'
  })
}
module.exports.handler = argv => {
  console.error('elmopipe1')
  const env = (() => {
    const envFilePath = path.resolve(envDir, `${argv.env}.json`)
    try {
      return require(envFilePath)
    } catch {
      throw new Error(`Could not find environment file: ${envFilePath}`)
    }
  }).call()
  const s3Keys = (() => {
    // Grab AWS credentials from environment when running locally. If not
    // available, throw an explicit error for the user
    if (env.ENV_NAME === 'local') {
      const localAKI = process.env.AWS_ACCESS_KEY_ID
      const localSAK = process.env.AWS_SECRET_ACCESS_KEY
      if (localAKI === undefined) {
        throw new Error('Please set AWS_ACCESS_KEY_ID in your environment')
      }
      if (localSAK === undefined) {
        throw new Error('Please set AWS_SECRET_ACCESS_KEY in your environment')
      }
      return {
        S3_ACCESS_KEY_ID: localAKI,
        S3_SECRET_ACCESS_KEY: localSAK
      }
    }
    return {
      S3_ACCESS_KEY_ID: env.DIST_BUCKET_AKI_SECRET_NAME,
      S3_SECRET_ACCESS_KEY: env.DIST_BUCKET_SAK_SECRET_NAME
    }
  }).call()
  const pipeline = (() => {
    const pipelineFilePath = path.resolve(pipelineDir, `${argv.pipelinetype}.js`)
    try {
      return require(pipelineFilePath)
    } catch {
      throw new Error(`Could not find pipeline file: ${pipelineFilePath}`)
    }
  }).call()
  console.error('elmopipe2')
  const outputFile = argv.output == null
    ? undefined
    : path.resolve(argv.output)

  const pipelineArgs = { ...env, ...s3Keys, ...(argv.tag == null ? {} : { IMAGE_TAG: argv.tag }) }
  const pipelineConfig = pipeline(pipelineArgs).config

  console.error('elmopipe3')
  const forward = fs.readFileSync(path.resolve(__dirname, 'forward.yml'), { encoding: 'utf8' })
  const output = forward + yaml.safeDump(pipelineConfig)

  console.error('elmopipe4')
  if (outputFile) {
    fs.writeFileSync(outputFile, output)
  } else {
    console.log(output)
  }
}