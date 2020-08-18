const pipeline = (env) => {
  const taskCheckFeed = require('../tasks/check-feed')
  const taskDequeueBook = require('../tasks/dequeue-book')
  const taskFetchBook = require('../tasks/fetch-book')
  const taskAssembleBook = require('../tasks/assemble-book')
  const taskLinkExtras = require('../tasks/link-extras')
  const taskAssembleBookMeta = require('../tasks/assemble-book-metadata')
  const taskBakeBook = require('../tasks/bake-book')
  const taskBakeBookMeta = require('../tasks/bake-book-metadata')
  const taskChecksumBook = require('../tasks/checksum-book')
  const taskDisassembleBook = require('../tasks/disassemble-book')
  const taskValidateXhtml = require('../tasks/validate-xhtml')
  const taskGdocifyBook = require('../tasks/gdocify-book')
  const taskConvertDocx = require('../tasks/convert-docx')

  const awsAccessKeyId = env.S3_ACCESS_KEY_ID
  const awsSecretAccessKey = env.S3_SECRET_ACCESS_KEY
  const codeVersionFromTag = env.IMAGE_TAG || 'version-unknown'
  const queueFilename = `${codeVersionFromTag}.${env.QUEUE_FILENAME}`

  const lockedTag = env.IMAGE_TAG || 'trunk'

  const resources = [
    {
      name: 'cnx-recipes-output',
      type: 'docker-image',
      source: {
        repository: 'openstax/cnx-recipes-output',
        tag: lockedTag
      }
    },
    {
      name: 's3-queue',
      type: 's3',
      source: {
        bucket: env.S3_QUEUE_STATE_BUCKET,
        versioned_file: queueFilename,
        initial_version: 'initializing',
        access_key_id: awsAccessKeyId,
        secret_access_key: awsSecretAccessKey
      }
    },
    {
      name: 'ticker',
      type: 'time',
      source: {
        interval: env.PIPELINE_TICK_INTERVAL
      }
    }
  ]

  const feederJob = {
    name: 'feeder',
    plan: [
      { get: 'ticker', trigger: true },
      taskCheckFeed({
        awsAccessKeyId: awsAccessKeyId,
        awsSecretAccessKey: awsSecretAccessKey,
        feedFileUrl: env.FEED_FILE_URL,
        queueStateBucket: env.S3_QUEUE_STATE_BUCKET,
        queueFilename: queueFilename,
        codeVersion: codeVersionFromTag,
        maxBooksPerRun: env.MAX_BOOKS_PER_TICK,
        image: { tag: lockedTag }
      })
    ]
  }

  const bakeryJob = {
    name: 'bakery',
    max_in_flight: 5,
    plan: [
      { get: 's3-queue', trigger: true, version: 'every' },
      { get: 'cnx-recipes-output' },
      taskDequeueBook({
        queueFilename: queueFilename,
        image: { tag: lockedTag }
      }),
      taskFetchBook({ image: { tag: lockedTag } }),
      taskAssembleBook({ image: { tag: lockedTag } }),
      taskLinkExtras({
        image: { tag: lockedTag },
        server: 'archive.cnx.org'
      }),
      taskAssembleBookMeta({ image: { tag: lockedTag } }),
      taskBakeBook({ image: { tag: lockedTag } }),
      taskBakeBookMeta({ image: { tag: lockedTag } }),
      taskChecksumBook({ image: { tag: lockedTag } }),
      taskDisassembleBook({ image: { tag: lockedTag } }),
      taskValidateXhtml({
        image: { tag: lockedTag },
        inputSource: 'disassembled-book',
        inputPath: 'disassembled/*@*.xhtml',
        validationName: 'duplicate-id'
      }),
      taskGdocifyBook({ image: { tag: lockedTag } }),
      taskConvertDocx({ image: { tag: lockedTag } })
      // Add task: Upload to google storage
    ]
  }

  return {
    config: {
      resources: resources,
      jobs: [feederJob, bakeryJob]
    }
  }
}

module.exports = pipeline
