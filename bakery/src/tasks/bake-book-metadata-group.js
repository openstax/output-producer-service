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

  const fetchedInput = 'fetched-book-git'
  const bakedInput = 'baked-book-git'
  const assembledMetaInput = 'assembled-book-metadata-git'
  const bakedMetaOutput = 'baked-book-metadata-git'
  const shellScript = fs.readFileSync(path.resolve(__dirname, '../scripts/bake_book_metadata_group.sh'), { encoding: 'utf-8' })

  return {
    task: 'bake book metadata group',
    config: {
      platform: 'linux',
      image_resource: {
        type: 'docker-image',
        source: imageSource
      },
      inputs: [
        { name: fetchedInput },
        { name: bakedInput },
        { name: assembledMetaInput }
      ],
      outputs: [{ name: bakedMetaOutput }],
      params: {
        BAKED_META_OUTPUT: bakedMetaOutput,
        BAKED_INPUT: bakedInput,
        FETCHED_INPUT: fetchedInput,
        ASSEMBLED_META_INPUT: assembledMetaInput
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
