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
  const taskPatchDisassembledLinks = require('../tasks/patch-disassembled-links')
  const taskJsonifyBook = require('../tasks/jsonify-book')
  const taskUploadBook = require('../tasks/upload-book')
  const taskValidateXhtml = require('../tasks/validate-xhtml')
  const taskReportStateComplete = require('../tasks/report-state-complete')

  const awsAccessKeyId = env.S3_ACCESS_KEY_ID
  const awsSecretAccessKey = env.S3_SECRET_ACCESS_KEY
  const codeVersionFromTag = env.IMAGE_TAG || 'version-unknown'
  const queueFilename = `${codeVersionFromTag}.${env.DIST_ARCHIVE_QUEUE_FILENAME}`
  const queueStatePrefix = 'archive-dist'

  const lockedTag = env.IMAGE_TAG || 'trunk'

  const imageOverrides = {
    tag: lockedTag,
    ...env.dockerCredentials
  }

  const resources = [
    {
      name: 'cnx-recipes-output',
      type: 'docker-image',
      source: {
        repository: 'openstax/cnx-recipes-output',
        ...imageOverrides
      }
    },
    {
      name: 's3-queue',
      type: 's3',
      source: {
        bucket: env.DIST_QUEUE_STATE_S3_BUCKET,
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
        feedFileUrl: env.DIST_ARCHIVE_FEED_FILE_URL,
        queueStateBucket: env.DIST_QUEUE_STATE_S3_BUCKET,
        queueFilename: queueFilename,
        codeVersion: codeVersionFromTag,
        maxBooksPerRun: env.MAX_BOOKS_PER_TICK,
        statePrefix: queueStatePrefix,
        image: imageOverrides
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
        image: imageOverrides
      }),
      taskFetchBook({ image: imageOverrides }),
      taskAssembleBook({ image: imageOverrides }),
      taskLinkExtras({
        image: imageOverrides,
        server: 'archive.cnx.org'
      }),
      taskAssembleBookMeta({ image: imageOverrides }),
      taskBakeBook({ image: imageOverrides }),
      taskBakeBookMeta({ image: imageOverrides }),
      taskChecksumBook({ image: imageOverrides }),
      taskDisassembleBook({ image: imageOverrides }),
      taskPatchDisassembledLinks({ image: imageOverrides }),
      taskJsonifyBook({ image: imageOverrides }),
      taskValidateXhtml({
        image: imageOverrides,
        inputSource: 'jsonified-book',
        inputPath: 'jsonified/*@*.xhtml',
        validationNames: ['duplicate-id', 'broken-link']
      }),
      taskUploadBook({
        image: imageOverrides,
        distBucket: env.DIST_S3_BUCKET,
        distBucketPath: 'apps/archive/',
        awsAccessKeyId: awsAccessKeyId,
        awsSecretAccessKey: awsSecretAccessKey,
        codeVersion: codeVersionFromTag
      }),
      taskReportStateComplete({
        image: imageOverrides,
        awsAccessKeyId: awsAccessKeyId,
        awsSecretAccessKey: awsSecretAccessKey,
        queueStateBucket: env.DIST_QUEUE_STATE_S3_BUCKET,
        codeVersion: codeVersionFromTag,
        statePrefix: queueStatePrefix
      })
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
