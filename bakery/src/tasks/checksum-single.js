const { constructImageSource } = require('../task-util/task-util')

const fs = require('fs')
const path = require('path')

const task = (taskArgs) => {
  const imageDefault = {
    name: 'openstax/cops-bakery-scripts',
    tag: 'trunk'
  }
  const imageOverrides = taskArgs != null && taskArgs.image != null ? taskArgs.image : {}
  const imageSource = constructImageSource({ ...imageDefault, ...imageOverrides })

  const bookInput = 'book'
  const fetchedInput = 'fetched-book-group'
  const symlinkInput = 'module-symlinks'
  const linkedInput = 'linked-single'
  const resourcesOutput = 'checksum-resources'
  const resourceLinkedSingleOutput = 'resource-linked-single'
  const shellScript = fs.readFileSync(path.resolve(__dirname, '../scripts/checksum_single.sh'), { encoding: 'utf-8' })

  return {
    task: 'checksum book',
    config: {
      platform: 'linux',
      image_resource: {
        type: 'docker-image',
        source: imageSource
      },
      inputs: [
        { name: bookInput },
        { name: fetchedInput },
        { name: symlinkInput },
        { name: linkedInput }
      ],
      outputs: [
        { name: resourcesOutput },
        { name: resourceLinkedSingleOutput }
      ],
      params: {
        SYMLINK_INPUT: symlinkInput,
        LINKED_INPUT: linkedInput,
        RESOURCES_OUTPUT: resourcesOutput,
        BOOK_INPUT: bookInput,
        RESOURCES_LINKED_SINGLE_OUTPUT: resourceLinkedSingleOutput
      },
      run: {
        path: '/bin/bash',
        args: [
          '-cxe',
          shellScript
        ]
      }
    }
  }
}

module.exports = task
