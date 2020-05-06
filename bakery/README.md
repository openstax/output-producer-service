## Bakery Concourse Pipeline Generator and Bakery CLI

This directory contains the code necessary to both generate and run our content distribution and pdf pipelines, either in individual steps or as a whole. Effort has been put in to paramaterize code pieces so that:
- A downstream user (user of the Bakery CLI)
- A developer making pipeline changes or debugging
- A production or staging node
- A CI node running tests

will all be reusing the same code, give or take some configuration.

### Bakery CLI

#### Dependencies
To use the CLI, you must have all of the following already installed:
- docker
- docker-compose
- node >= 12.16.1
- npm
- concourse `fly` CLI
  - [install concourse locally](https://concoursetutorial.com/#getting-started)
  - download `fly` from http://localhost:8080 and add it to your path
  

getting the above software installed is outside the scope of this documentation.

#### Installation
A simple `npm install`

#### Usage
For now, the file `src/cli/execute.js` is the entry point for the CLI, and must be called as an argument to `node` e.g. `node ./src/cli/execute.js`. Calling it without arguments will yield a help message. Each task in the pipeline should have a corresponding subcommand in this CLI so that one may run it individually and locally.

For example, to fetch a book and have its contents appear in the directory `/tmp/data`, one could use the following command, with `bakery` as their working directory:

`node ./src/cli/execute.js fetch -c ./.. -d /tmp/data staging.cnx.org col30149 latest`

### Bakery Concourse Pipeline Generator

#### Dependencies
- node >= 12.16.1
- npm

#### Setup
A simple `npm install`

#### Usage
`build` is an executable that provides a small cli to build your concourse pipeline/task files. This is the help message returned by calling it with `./build --help`:
```
./build <command>

Commands:
  build.js pipeline <pipelinetype> [options] <env> [options]...  builds a bakery pipeline runnable with fly command
  [aliases: p]
  build.js task <taskname> [options]...  builds a bakery pipeline task runnable with fly execute                    [aliases: t]

Options:
  --help  Show help                                                                                  [boolean]
```

In general, for both the `pipeline` and `task` commands, the `--help` messages are fairly useful and complete. That is:

`./build pipeline --help`

and

`./build task --help`

will provide information about the command, defaults, and its positional and nonpositional arguments.

#### Generate a pipeline file for a particular environment
Run `./build pipeline <pipelinetype> [options] <env> [options]...`

The choices for `<pipelinetype>` are the basenames of the `.js` files in the `src/pipelines/` directory.

The choices for `<env>` are the basenames of the `.json` files in the `env/` directory.

Examples:
- `./build pipeline distribution prod` -> Build the distribution pipeline with prod environment variables and output on stdout.
- `./build pipeline pdf staging -o pdf-pipeline.staging.yml` -> Build the pdf pipeline with staging environment variables and output to file `pdf-pipeline.staging.yml`, overwriting the file if it exists.

#### Generate a standalone task file suitable for `fly execute`
Run `./build task <taskname> [options]...`

The choices for `<taskname>` are the basenames of the `.js` files in the `src/tasks/` directory.

Example:
- `./build task look-up-book -a "{bucketName: my-bucket}"` -> Build the look-up-book task, injecting the object `{bucketName: "my-bucket"}` as the argument to the task function, and output the result to stdout
- `./build task fetch-book -o fetch-book-task.yml` -> Build the fetch-book task, and output the result to the file `fetch-book-task.yml`

Note: The `--args` option (shorthand, `-a`) must be valid `yaml` (or `json`, since yaml is a superset).

#### I don't like generating intermediate files to run `set-pipeline` or `execute`!
Use process substitution!
Example: `fly -t dev sp -p bakery -c <(./build pipeline pdf staging)`

### Development

#### Conventions
The Bakery CLI allows the user to specify an `image_resource` for concourse to run the task in instead of the default. This is especially useful for either developing locally on the cops-bakery-scripts or perhaps being able to use the checked out code to create an image rather than using the image on Docker Hub when running tests. There is some specific convention for how to do this sort of thing.

For example, if one wanted to make changes to cops-bakery-scripts and have those changes reflect in the CLI running locally, one would have to follow these steps:
1. Have `src/scripts` as your working directory
2. Make the desired change in the `src/scripts/*.py` file
3. Build the image with `docker build .`
4. Tag the build image as `localhost.localdomain:5000/openstax/cops-bakery/scripts:latest` (the prefix of `localhost.localdomain:5000` is *required*, what you name and tag your image is up to you), for example, with `docker tag $(docker image ls | awk 'NR==2 {print $3}') localhost.localdomain:5000/openstax/cops-bakery/scripts:latest`
5. Run the desired pipeline step with the CLI with the `--image` flag, e.g. `node ./src/cli/execute.js assemble-meta --image localhost.localdomain:5000/openstax/cops-bakery-scripts:latest -c ./.. -d /tmp/data col30149`

Note: Using a local docker image as a task's `image_resource` is only supported for the `assemble-meta`, `bake-meta`, `disassemble`, and `jsonify` steps for now, to allow for local development.

#### Testing
`npm run lint` will lint the JS files in `bakery` and `npm run test` will run regression tests on `bakery` via the CLI.

There are basic tests for the Python scripts used in some of the bakery tasks in `bakery/src/tests` which can be run using `pytest bakery` after installing scripts dependencies
