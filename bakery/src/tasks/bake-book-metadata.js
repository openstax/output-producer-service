const dedent = require('dedent')

const { constructImageSource } = require('../task-util/task-util')

const task = (taskArgs) => {
  const imageDefault = {
    name: 'openstax/cops-bakery-scripts',
    tag: 'master'
  }
  const imageOverrides = taskArgs != null && taskArgs.image != null ? taskArgs.image : {}
  const imageSource = constructImageSource({ ...imageDefault, ...imageOverrides })

  return {
    task: 'bake book metadata',
    config: {
      platform: 'linux',
      image_resource: {
        type: 'docker-image',
        source: imageSource
      },
      inputs: [
        { name: 'book' },
        { name: 'fetched-book' },
        { name: 'baked-book' },
        { name: 'assembled-book-metadata' }
      ],
      outputs: [{ name: 'baked-book-metadata' }],
      run: {
        path: '/bin/bash',
        args: [
          '-cxe',
          dedent`
          exec 2> >(tee baked-book-metadata/stderr >&2)
          collection_id="$(cat book/collection_id)"
          book_metadata="fetched-book/$collection_id/raw/metadata.json"
          book_uuid="$(cat $book_metadata | jq -r '.id')"
          book_version="$(cat $book_metadata | jq -r '.version')"
          book_legacy_id="$(cat $book_metadata | jq -r '.legacy_id')"
          book_legacy_version="$(cat $book_metadata | jq -r '.legacy_version')"
          book_ident_hash="$book_uuid@$book_version"
          book_license="$(cat $book_metadata | jq '.license')"
          book_dir="baked-book/$collection_id"
          target_dir="baked-book-metadata/$collection_id"
          mkdir "$target_dir"
          cp "$book_dir/collection.baked.xhtml" "$target_dir/collection.baked.xhtml"
          cat "assembled-book-metadata/$collection_id/collection.assembled-metadata.json" | \
              jq --arg ident_hash "$book_ident_hash" --arg uuid "$book_uuid" --arg version "$book_version" --argjson license "$book_license" \
              --arg legacy_id "$book_legacy_id" --arg legacy_version "$book_legacy_version" \
              '. + {($ident_hash): {id: $uuid, version: $version, license: $license, legacy_id: $legacy_id, legacy_version: $legacy_version}}' > "/tmp/collection.baked-input-metadata.json"
          cd "$target_dir"
          python /code/scripts/bake-book-metadata.py /tmp/collection.baked-input-metadata.json collection.baked.xhtml collection.baked-metadata.json
          `
        ]
      }
    }
  }
}

module.exports = task
