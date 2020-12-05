const dedent = require('dedent')

const { constructImageSource } = require('../task-util/task-util')

const task = (taskArgs) => {
  const { queueFilename } = taskArgs
  const imageDefault = {
    name: 'openstax/cops-bakery-scripts',
    tag: 'trunk'
  }
  const imageOverrides = taskArgs != null && taskArgs.image != null ? taskArgs.image : {}
  const imageSource = constructImageSource({ ...imageDefault, ...imageOverrides })

  return {
    task: 'dequeue book',
    config: {
      platform: 'linux',
      image_resource: {
        type: 'docker-image',
        source: imageSource
      },
      inputs: [{ name: 's3-queue' }],
      outputs: [{ name: 'book' }],
      run: {
        path: '/bin/bash',
        args: [
          '-cxe',
          dedent`
          exec 2> >(tee book/stderr >&2)
          book="s3-queue/${queueFilename}"
          if [[ ! -s "$book" ]]; then
            echo "Book is empty"
            exit 1
          fi

          from_archive="$(cat $book | jq -r '.server')"

          if [ "$from_archive" != null ]
          then
            echo -n "$(cat $book | jq -er '.collection_id')" >book/collection_id
            echo -n "$(cat $book | jq -er '.server')" >book/server
          else
            echo -n "$(cat $book | jq -r '.style')" >book/slug
            echo -n "$(cat $book | jq -r '.repo')" >book/repo
            echo "" >book/server
          fi

          echo -n "$(cat $book | jq -r '.style')" >book/style
          echo -n "$(cat $book | jq -r '.version')" >book/version
          echo -n "$(cat $book | jq -r '.uuid')" >book/uuid
        `
        ]
      }
    }
  }
}

module.exports = task
