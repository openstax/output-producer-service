const { constructImageSource } = require('../task-util/task-util')
const fs = require('fs')
const path = require('path')

const task = (taskArgs) => {
  const imageDefault = {
    name: 'openstax/nebuchadnezzar',
    tag: 'trunk'
  }
  const imageOverrides = taskArgs != null && taskArgs.image != null ? taskArgs.image : {}
  const imageSource = constructImageSource({ ...imageDefault, ...imageOverrides })
  const inputName = 'fetched-book-group'
  const assembledOutput = 'assembled-book-group'
  const symlinkOutput = 'module-symlinks'
  const rawCollectionDir = `${inputName}/raw`
  const shellScript = fs.readFileSync(path.resolve(__dirname, '../scripts/assemble_book_group.sh'), { encoding: 'utf-8' })

  return {
    task: 'assemble book group',
    config: {
      platform: 'linux',
      image_resource: {
        type: 'docker-image',
        source: imageSource
      },
      inputs: [
        { name: inputName }
      ],
      outputs: [
        { name: assembledOutput },
        { name: symlinkOutput }
      ],
      params: {
        ASSEMBLED_OUTPUT: assembledOutput,
        SYMLINK_OUTPUT: symlinkOutput,
        RAW_COLLECTION_DIR: rawCollectionDir
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
