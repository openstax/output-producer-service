const path = require('path')
const fs = require('fs')
const { execFileSync, spawn: fsSpawn } = require('child_process')
const waitPort = require('wait-port')

const tmp = require('tmp')
// tmp.setGracefulCleanup()

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const spawn = (program, args, options) => {
  console.log(`spawining ${program} ${args.join(' ')}`)
  return fsSpawn(program, args, options)
}

const completion = subprocess => {
  const error = new Error()
  return new Promise((resolve, reject) => {
    subprocess.on('exit', code => {
      if (code === 0) {
        resolve(undefined)
      } else {
        error.message = `Subprocess failed with code ${code}`
        reject(error)
      }
    })
  })
}

const stripLocalPrefix = imageArg => {
  return imageArg.replace(/^(localhost.localdomain:5000)\//, '')
}

const extractImageDetails = imageArg => {
  if (imageArg == null) {
    return null
  }
  const imageArgStripped = stripLocalPrefix(imageArg)
  const tagNameSeparatorIndex = imageArgStripped.lastIndexOf(':')
  let imageName, imageTag
  if (tagNameSeparatorIndex === -1) {
    imageName = imageArgStripped
    imageTag = 'latest'
  } else {
    imageName = imageArgStripped.slice(0, tagNameSeparatorIndex + 1)
    imageTag = imageArgStripped.slice(tagNameSeparatorIndex)
  }
  return {
    imageRegistry: 'registry:5000',
    imageName,
    imageTag
  }
}

const input = (dataDir, name) => `--input=${name}=${dataDir}/${name}`
const output = (dataDir, name) => `--output=${name}=${dataDir}/${name}`

const composeYml = `
---
version: "3"

services:
  concourse-db:
    image: postgres
    environment:
      - POSTGRES_DB=concourse
      - POSTGRES_PASSWORD=concourse_pass
      - POSTGRES_USER=concourse_user
      - PGDATA=/database

  concourse:
    image: concourse/concourse:6.0
    command: quickstart
    privileged: true
    depends_on: [concourse-db]
    ports: ["8080:8080"]
    environment:
      - CONCOURSE_POSTGRES_HOST=concourse-db
      - CONCOURSE_POSTGRES_USER=concourse_user
      - CONCOURSE_POSTGRES_PASSWORD=concourse_pass
      - CONCOURSE_POSTGRES_DATABASE=concourse
      - CONCOURSE_EXTERNAL_URL
      - CONCOURSE_ADD_LOCAL_USER=admin:admin
      - CONCOURSE_MAIN_TEAM_LOCAL_USER=admin

  registry:
    image: registry:2
    ports: ["5000:5000"]
    restart: always
`

const flyExecute = async (cmdArgs, { image, persist }) => {
  const tmpComposeYml = tmp.fileSync()
  fs.writeFileSync(tmpComposeYml.name, composeYml)

  const children = []

  process.on('exit', code => {
    if (code !== 0) {
      children.forEach(child => {
        if (child.exitCode == null) {
          child.kill('SIGINT')
        }
      })
    }
  })

  const startup = spawn('docker-compose', [
    '-f', tmpComposeYml.name,
    'up',
    '-d'
  ], {
    stdio: 'inherit'
  })
  children.push(startup)
  await completion(startup)

  let error
  try {
    if (image != null) {
      console.log('waiting for registry to wake up')
      await waitPort({
        protocol: 'http',
        host: 'localhost',
        port: 5000,
        path: '/v2/_catalog',
        timeout: 30000,
        output: 'silent'
      })
      const imageStripped = stripLocalPrefix(image)
      if (imageStripped === image) {
        throw new Error(`Specified image ${image} does not have prefix 'localhost.localdomain:5000'. Not safe to automatically push!`)
      }
      console.log(`uploading image: ${image}`)
      const pushImage = spawn('docker', [
        'push',
        image
      ], { stdio: 'inherit' })
      await completion(pushImage)
    }

    console.log('waiting for concourse to wake up')
    await waitPort({
      protocol: 'http',
      host: 'localhost',
      port: 8080,
      path: '/api/v1/info',
      timeout: 90000,
      output: 'silent'
    })

    console.log('logging in')
    const login = spawn('fly', [
      'login',
      '-k',
      '-t', 'bakery-cli',
      '-c', 'http://127.0.0.1:8080',
      '-u', 'admin',
      '-p', 'admin'
    ], { stdio: 'inherit' })
    children.push(login)
    await completion(login)

    console.log('syncing')
    const sync = spawn('fly', [
      'sync',
      '-t', 'bakery-cli'
    ], { stdio: 'inherit' })
    children.push(sync)
    await completion(sync)

    console.log('waiting for concourse to settle')
    await sleep(5000)

    const flyArgs = [
      'execute',
      '-t', 'bakery-cli',
      '--include-ignored',
      ...cmdArgs
    ]
    console.log(`executing fly with args: ${flyArgs}`)
    const execute = spawn('fly', flyArgs, {
      stdio: 'inherit',
      env: {
        ...process.env,
        COLUMNS: process.stdout.columns
      }
    })
    children.push(execute)
    await completion(execute)
  } catch (err) {
    if (err.stdout != null) {
      console.log(err.stdout.toString())
    } else {
      console.log(err)
    }
    error = err
  } finally {
    if (!persist) {
      console.log('cleaning up')
      const cleanUp = spawn('docker-compose', [
        '-f', tmpComposeYml.name,
        'stop'
      ], { stdio: 'inherit' })
      children.push(cleanUp)
      await completion(cleanUp)
    } else {
      console.log('persisting containers')
    }
  }
  if (error != null) {
    throw error
  }
}

const yargs = require('yargs')
  .command((() => {
    const commandUsage = 'fetch <server> <collid> <version>'
    const handler = async argv => {
      const buildExec = path.resolve(argv.cops, 'bakery/build')

      const taskContent = execFileSync(buildExec, ['task', 'fetch-book'])
      const tmpTaskFile = tmp.fileSync()
      fs.writeFileSync(tmpTaskFile.name, taskContent)

      const tmpBookDir = tmp.dirSync()
      fs.writeFileSync(path.resolve(tmpBookDir.name, 'server'), argv.server)
      fs.writeFileSync(path.resolve(tmpBookDir.name, 'collection_id'), argv.collid)
      fs.writeFileSync(path.resolve(tmpBookDir.name, 'version'), argv.version)

      const dataDir = path.resolve(argv.data, argv.collid)

      await flyExecute([
        '-c', tmpTaskFile.name,
        `--input=book=${tmpBookDir.name}`,
        output(dataDir, 'fetched-book')
      ], { image: argv.image, persist: argv.persist })
    }
    return {
      command: commandUsage,
      aliases: 'f',
      describe: 'fetch a book',
      builder: yargs => {
        yargs.usage(`Usage: ${process.env.CALLER || 'execute.js'} ${commandUsage}`)
        yargs.positional('server', {
          describe: 'content server to fetch from',
          type: 'string'
        }).positional('collid', {
          describe: 'collection id of collection to fetch',
          type: 'string'
        }).positional('version', {
          describe: 'version of collection to fetch',
          type: 'string'
        })
      },
      handler: argv => {
        handler(argv).catch((err) => { console.error(err) })
      }
    }
  }).call())
  .command((() => {
    const commandUsage = 'assemble <collid>'
    const handler = async argv => {
      const buildExec = path.resolve(argv.cops, 'bakery/build')

      const taskContent = execFileSync(buildExec, ['task', 'assemble-book'])
      const tmpTaskFile = tmp.fileSync()
      fs.writeFileSync(tmpTaskFile.name, taskContent)

      const tmpBookDir = tmp.dirSync()
      fs.writeFileSync(path.resolve(tmpBookDir.name, 'collection_id'), argv.collid)

      const dataDir = path.resolve(argv.data, argv.collid)

      await flyExecute([
        '-c', tmpTaskFile.name,
        `--input=book=${tmpBookDir.name}`,
        input(dataDir, 'fetched-book'),
        output(dataDir, 'assembled-book')
      ], { image: argv.image, persist: argv.persist })
    }
    return {
      command: commandUsage,
      aliases: 'a',
      describe: 'assemble a book',
      builder: yargs => {
        yargs.usage(`Usage: ${process.env.CALLER || 'execute.js'} ${commandUsage}`)
        yargs.positional('collid', {
          describe: 'collection id of collection to work on',
          type: 'string'
        })
      },
      handler: argv => {
        handler(argv).catch((err) => { console.error(err) })
      }
    }
  }).call())
  .command((() => {
    const commandUsage = 'bake <collid> <recipefile> <stylefile>'
    const handler = async argv => {
      const buildExec = path.resolve(argv.cops, 'bakery/build')

      const taskContent = execFileSync(buildExec, ['task', 'bake-book'])
      const tmpTaskFile = tmp.fileSync()
      fs.writeFileSync(tmpTaskFile.name, taskContent)

      const styleName = 'stylesheet'
      const tmpBookDir = tmp.dirSync()
      fs.writeFileSync(path.resolve(tmpBookDir.name, 'collection_id'), argv.collid)
      fs.writeFileSync(path.resolve(tmpBookDir.name, 'style'), styleName)

      const tmpRecipesDir = tmp.dirSync()
      fs.mkdirSync(path.resolve(tmpRecipesDir.name, 'recipes/output/'), { recursive: true })
      fs.mkdirSync(path.resolve(tmpRecipesDir.name, 'styles/output/'), { recursive: true })
      fs.copyFileSync(path.resolve(argv.recipefile), path.resolve(tmpRecipesDir.name, `recipes/output/${styleName}.css`))
      fs.copyFileSync(path.resolve(argv.stylefile), path.resolve(tmpRecipesDir.name, `styles/output/${styleName}-pdf.css`))

      const dataDir = path.resolve(argv.data, argv.collid)

      await flyExecute([
        '-c', tmpTaskFile.name,
        `--input=book=${tmpBookDir.name}`,
        input(dataDir, 'assembled-book'),
        `--input=cnx-recipes=${tmpRecipesDir.name}`,
        output(dataDir, 'baked-book')
      ], { image: argv.image, persist: argv.persist })
    }
    return {
      command: commandUsage,
      aliases: 'b',
      describe: 'bake a book',
      builder: yargs => {
        yargs.usage(`Usage: ${process.env.CALLER || 'execute.js'} ${commandUsage}`)
        yargs.positional('collid', {
          describe: 'collection id of collection to work on',
          type: 'string'
        }).positional('recipefile', {
          describe: 'path to recipe file',
          type: 'string'
        }).positional('stylefile', {
          describe: 'path to style file',
          type: 'string'
        })
      },
      handler: argv => {
        handler(argv).catch((err) => { console.error(err) })
      }
    }
  }).call())
  .command((() => {
    const commandUsage = 'mathify <collid>'
    const handler = async argv => {
      const buildExec = path.resolve(argv.cops, 'bakery/build')

      const taskContent = execFileSync(buildExec, ['task', 'mathify-book'])
      const tmpTaskFile = tmp.fileSync()
      fs.writeFileSync(tmpTaskFile.name, taskContent)

      const tmpBookDir = tmp.dirSync()
      fs.writeFileSync(path.resolve(tmpBookDir.name, 'collection_id'), argv.collid)

      const dataDir = path.resolve(argv.data, argv.collid)

      await flyExecute([
        '-c', tmpTaskFile.name,
        `--input=book=${tmpBookDir.name}`,
        input(dataDir, 'baked-book'),
        output(dataDir, 'mathified-book')
      ], { image: argv.image, persist: argv.persist })
    }
    return {
      command: commandUsage,
      aliases: 'm',
      describe: 'mathify a book',
      builder: yargs => {
        yargs.usage(`Usage: ${process.env.CALLER || 'execute.js'} ${commandUsage}`)
        yargs.positional('collid', {
          describe: 'collection id of collection to work on',
          type: 'string'
        })
      },
      handler: argv => {
        handler(argv).catch((err) => { console.error(err) })
      }
    }
  }).call())
  .command((() => {
    const commandUsage = 'build-pdf <collid>'
    const handler = async argv => {
      const buildExec = path.resolve(argv.cops, 'bakery/build')

      const taskContent = execFileSync(buildExec, ['task', 'build-pdf', '-a', '{bucketName: none}'])
      const tmpTaskFile = tmp.fileSync()
      fs.writeFileSync(tmpTaskFile.name, taskContent)

      const tmpBookDir = tmp.dirSync()
      fs.writeFileSync(path.resolve(tmpBookDir.name, 'collection_id'), argv.collid)
      fs.writeFileSync(path.resolve(tmpBookDir.name, 'pdf_filename'), 'collection.pdf')

      const dataDir = path.resolve(argv.data, argv.collid)

      await flyExecute([
        '-c', tmpTaskFile.name,
        `--input=book=${tmpBookDir.name}`,
        input(dataDir, 'mathified-book'),
        output(dataDir, 'artifacts')
      ], { image: argv.image, persist: argv.persist })
    }
    return {
      command: commandUsage,
      aliases: 'p',
      describe: 'build a pdf from a book',
      builder: yargs => {
        yargs.usage(`Usage: ${process.env.CALLER || 'execute.js'} ${commandUsage}`)
        yargs.positional('collid', {
          describe: 'collection id of collection to work on',
          type: 'string'
        })
      },
      handler: argv => {
        handler(argv).catch((err) => { console.error(err) })
      }
    }
  }).call())
  .command((() => {
    const commandUsage = 'assemble-meta <collid>'
    const handler = async argv => {
      const buildExec = path.resolve(argv.cops, 'bakery/build')

      const imageDetails = extractImageDetails(argv.image)
      const taskArgs = imageDetails == null
        ? []
        : [`--taskargs=${JSON.stringify(imageDetails)}`]
      const taskContent = execFileSync(buildExec, ['task', 'assemble-book-metadata', ...taskArgs])
      const tmpTaskFile = tmp.fileSync()
      fs.writeFileSync(tmpTaskFile.name, taskContent)

      const tmpBookDir = tmp.dirSync()
      fs.writeFileSync(path.resolve(tmpBookDir.name, 'collection_id'), argv.collid)

      const dataDir = path.resolve(argv.data, argv.collid)

      await flyExecute([
        '-c', tmpTaskFile.name,
        `--input=book=${tmpBookDir.name}`,
        input(dataDir, 'assembled-book'),
        output(dataDir, 'assembled-book-metadata')
      ], { image: argv.image, persist: argv.persist })
    }
    return {
      command: commandUsage,
      aliases: 'am',
      describe: 'build metadata files from an assembled book',
      builder: yargs => {
        yargs.usage(`Usage: ${process.env.CALLER || 'execute.js'} ${commandUsage}`)
        yargs.positional('collid', {
          describe: 'collection id of collection to work on',
          type: 'string'
        })
      },
      handler: argv => {
        handler(argv).catch((err) => { console.error(err) })
      }
    }
  }).call())
  .command((() => {
    const commandUsage = 'bake-meta <collid>'
    const handler = async argv => {
      const buildExec = path.resolve(argv.cops, 'bakery/build')

      const imageDetails = extractImageDetails(argv.image)
      const taskArgs = imageDetails == null
        ? []
        : [`--taskargs=${JSON.stringify(imageDetails)}`]
      const taskContent = execFileSync(buildExec, ['task', 'bake-book-metadata', ...taskArgs])
      const tmpTaskFile = tmp.fileSync()
      fs.writeFileSync(tmpTaskFile.name, taskContent)

      const tmpBookDir = tmp.dirSync()
      fs.writeFileSync(path.resolve(tmpBookDir.name, 'collection_id'), argv.collid)

      const dataDir = path.resolve(argv.data, argv.collid)

      await flyExecute([
        '-c', tmpTaskFile.name,
        `--input=book=${tmpBookDir.name}`,
        input(dataDir, 'baked-book'),
        input(dataDir, 'assembled-book-metadata'),
        output(dataDir, 'baked-book-metadata')
      ], { image: argv.image, persist: argv.persist })
    }
    return {
      command: commandUsage,
      aliases: 'bm',
      describe: 'build metadata files from an baked book',
      builder: yargs => {
        yargs.usage(`Usage: ${process.env.CALLER || 'execute.js'} ${commandUsage}`)
        yargs.positional('collid', {
          describe: 'collection id of collection to work on',
          type: 'string'
        })
      },
      handler: argv => {
        handler(argv).catch((err) => { console.error(err) })
      }
    }
  }).call())
  .command((() => {
    const commandUsage = 'disassemble <collid>'
    const handler = async argv => {
      const buildExec = path.resolve(argv.cops, 'bakery/build')

      const imageDetails = extractImageDetails(argv.image)
      const taskArgs = imageDetails == null
        ? []
        : [`--taskargs=${JSON.stringify(imageDetails)}`]
      const taskContent = execFileSync(buildExec, ['task', 'disassemble-book', ...taskArgs])
      const tmpTaskFile = tmp.fileSync()
      fs.writeFileSync(tmpTaskFile.name, taskContent)

      const tmpBookDir = tmp.dirSync()
      fs.writeFileSync(path.resolve(tmpBookDir.name, 'collection_id'), argv.collid)

      const dataDir = path.resolve(argv.data, argv.collid)

      await flyExecute([
        '-c', tmpTaskFile.name,
        `--input=book=${tmpBookDir.name}`,
        input(dataDir, 'fetched-book'),
        input(dataDir, 'baked-book'),
        input(dataDir, 'baked-book-metadata'),
        output(dataDir, 'disassembled-book')
      ], { image: argv.image, persist: argv.persist })
    }
    return {
      command: commandUsage,
      aliases: 'd',
      describe: 'disassemble a baked book',
      builder: yargs => {
        yargs.usage(`Usage: ${process.env.CALLER || 'execute.js'} ${commandUsage}`)
        yargs.positional('collid', {
          describe: 'collection id of collection to work on',
          type: 'string'
        })
      },
      handler: argv => {
        handler(argv).catch((err) => { console.error(err) })
      }
    }
  }).call())
  .command((() => {
    const commandUsage = 'jsonify <collid>'
    const handler = async argv => {
      const buildExec = path.resolve(argv.cops, 'bakery/build')

      const imageDetails = extractImageDetails(argv.image)
      const taskArgs = imageDetails == null
        ? []
        : [`--taskargs=${JSON.stringify(imageDetails)}`]
      const taskContent = execFileSync(buildExec, ['task', 'jsonify-book', ...taskArgs])
      const tmpTaskFile = tmp.fileSync()
      fs.writeFileSync(tmpTaskFile.name, taskContent)

      const tmpBookDir = tmp.dirSync()
      fs.writeFileSync(path.resolve(tmpBookDir.name, 'collection_id'), argv.collid)

      const dataDir = path.resolve(argv.data, argv.collid)

      await flyExecute([
        '-c', tmpTaskFile.name,
        `--input=book=${tmpBookDir.name}`,
        input(dataDir, 'disassembled-book'),
        output(dataDir, 'jsonified-book')
      ], { image: argv.image, persist: argv.persist })
    }
    return {
      command: commandUsage,
      aliases: 'j',
      describe: 'build metadata from disassembled book',
      builder: yargs => {
        yargs.usage(`Usage: ${process.env.CALLER || 'execute.js'} ${commandUsage}`)
        yargs.positional('collid', {
          describe: 'collection id of collection to work on',
          type: 'string'
        })
      },
      handler: argv => {
        handler(argv).catch((err) => { console.error(err) })
      }
    }
  }).call())
  .option('c', {
    alias: 'cops',
    demandOption: true,
    describe: 'path to output-producer-service directory',
    normalize: true,
    type: 'string'
  })
  .option('d', {
    alias: 'data',
    demandOption: true,
    describe: 'path to data directory',
    normalize: true,
    type: 'string'
  })
  .option('i', {
    alias: 'image',
    describe: 'name of image to use instead of default',
    type: 'string'
  })
  .option('p', {
    alias: 'persist',
    describe: 'persist containers after running cli command',
    boolean: true,
    default: false
  })
  .demandCommand(1, 'command required')
  .help()
  .wrap(process.env.COLUMNS)
  .version(false)
  .strict()
  .fail((msg, err, yargs) => {
    if (err) throw err
    console.error(yargs.help())
    console.error(`\nError: ${msg}`)
    process.exit(1)
  })

yargs.argv // eslint-disable-line
