const dedent = require('dedent')

const { constructImageSource } = require('../task-util/task-util')

const task = (taskArgs) => {
  const { versionedFile } = taskArgs
  const imageDefault = {
    name: 'openstax/cops-bakery-scripts',
    tag: 'master'
  }
  const imageOverrides = taskArgs != null && taskArgs.image != null ? taskArgs.image : {}
  const imageSource = constructImageSource({ ...imageDefault, ...imageOverrides })

  return {
    task: 'look up feed',
    config: {
      platform: 'linux',
      image_resource: {
        type: 'docker-image',
        source: imageSource
      },
      inputs: [{ name: 's3-feed' }],
      outputs: [{ name: 'book' }],
      run: {
        path: '/bin/bash',
        args: [
          '-cxe',
          dedent`
          exec 2> >(tee book/stderr >&2)
          feed="s3-feed/${versionedFile}"
          echo -n "$(cat $feed | jq -r '.collection_id')" >book/collection_id
          echo -n "$(cat $feed | jq -r '.server')" >book/server
          echo -n "$(cat $feed | jq -r '.style')" >book/style
          echo -n "$(cat $feed | jq -r '.version')" >book/version
        `
        ]
      }
    }
  }
}

module.exports = task
