console.error('elmo')
require('yargs')
  .command(require('./src/pipeline'))
  .command(require('./src/task'))
  .demandCommand(1, 'command required')
  .usage(`Usage: ${process.env.CALLER || 'build.js'} <command>`)
  .help()
  .version(false)
  .strict()
  .fail((msg, err, yargs) => {
    console.log('elmofail')
    if (err) throw err
    console.error(yargs.help())
    console.error(`\nError: ${msg}`)
    process.exit(2)
  })
  .argv

console.error('elmo2')