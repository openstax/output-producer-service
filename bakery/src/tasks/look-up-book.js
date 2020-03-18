const dedent = require('dedent')

const task = () => {
  return {
    task: 'look up book',
    config: {
      platform: 'linux',
      image_resource: {
        type: 'docker-image',
        source: {
          repository: 'openstax/nebuchadnezzar'
        }
      },
      inputs: [{ name: 'output-producer' }],
      outputs: [{ name: 'book' }],
      run: {
        path: '/bin/bash',
        args: [
          '-cxe',
          /* eslint-disable no-template-curly-in-string */
          dedent`
          exec 2> >(tee book/stderr >&2)
          tail output-producer/*
          cp output-producer/id book/job_id
          cp output-producer/collection_id book/collection_id
          cp output-producer/version book/version
          cp output-producer/collection_style book/style
          cp output-producer/content_server book/server
          wget -q -O jq 'https://github.com/stedolan/jq/releases/download/jq-1.6/jq-linux64' && chmod +x jq
          server_name="$(cat output-producer/job.json | ./jq -r '.content_server.name')"
          echo "$server_name" >book/server_name
        `
        /* eslint-enable */
        ]
      }
    }
  }
}

module.exports = task
