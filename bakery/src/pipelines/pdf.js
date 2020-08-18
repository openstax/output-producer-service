const pipeline = (env) => {
  const taskLookUpBook = require('../tasks/look-up-book')
  const taskFetchBook = require('../tasks/fetch-book')
  const taskAssembleBook = require('../tasks/assemble-book')
  const taskLinkExtras = require('../tasks/link-extras')
  const taskBakeBook = require('../tasks/bake-book')
  const taskMathifyBook = require('../tasks/mathify-book')
  const taskBuildPdf = require('../tasks/build-pdf')
  const taskValidateXhtml = require('../tasks/validate-xhtml')

  const lockedTag = env.IMAGE_TAG || 'trunk'

  // FIXME: This mapping should be in the COPS resource
  const Status = Object.freeze({
    QUEUED: 1,
    ASSIGNED: 2,
    PROCESSING: 3,
    FAILED: 4,
    SUCCEEDED: 5
  })

  const reportToOutputProducer = (status, extras) => {
    return {
      put: 'output-producer',
      params: {
        id: 'output-producer/id',
        status_id: status,
        ...extras
      }
    }
  }

  const resourceTypes = [
    {
      name: 'output-producer',
      type: 'docker-image',
      source: {
        repository: 'openstax/output-producer-resource',
        tag: lockedTag
      }
    }
  ]

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
      name: 'output-producer',
      type: 'output-producer',
      source: {
        api_root: env.COPS_TARGET,
        status_id: 1
      }
    },
    {
      name: 's3',
      type: 's3',
      source: {
        bucket: env.S3_PDF_BUCKET,
        access_key_id: env.S3_ACCESS_KEY_ID,
        secret_access_key: env.S3_SECRET_ACCESS_KEY,
        skip_download: true
      }
    }
  ]

  const bakeryJob = {
    name: 'bakery',
    plan: [
      { get: 'output-producer', trigger: true, version: 'every' },
      reportToOutputProducer(Status.ASSIGNED),
      { get: 'cnx-recipes-output' },
      taskLookUpBook({ image: { tag: lockedTag } }),
      reportToOutputProducer(Status.PROCESSING),
      taskFetchBook({ image: { tag: lockedTag } }),
      taskAssembleBook({ image: { tag: lockedTag } }),
      taskLinkExtras({
        image: { tag: lockedTag },
        server: 'archive.cnx.org'
      }),
      taskBakeBook({ image: { tag: lockedTag } }),
      taskMathifyBook({ image: { tag: lockedTag } }),
      taskValidateXhtml({
        image: { tag: lockedTag },
        inputSource: 'mathified-book',
        inputPath: 'collection.mathified.xhtml',
        validationName: 'link-to-duplicate-id'
      }),
      taskBuildPdf({ bucketName: env.S3_PDF_BUCKET, image: { tag: lockedTag } }),
      {
        put: 's3',
        params: {
          file: 'artifacts/*.pdf',
          acl: 'public-read',
          content_type: 'application/pdf'
        }
      }
    ],
    on_success: reportToOutputProducer(Status.SUCCEEDED, {
      pdf_url: 'artifacts/pdf_url'
    }),
    on_failure: reportToOutputProducer(Status.FAILED),
    on_error: reportToOutputProducer(Status.FAILED),
    on_abort: reportToOutputProducer(Status.FAILED)
  }

  return {
    config: {
      resource_types: resourceTypes,
      resources: resources,
      jobs: [bakeryJob]
    }
  }
}

module.exports = pipeline
