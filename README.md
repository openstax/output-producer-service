# output-producer-service

AKA: COPS, "cops service", "cops backend", etc. The "C" stands for Content.

## Requirements

Follow the instructions to install [Docker](https://docs.docker.com/install/).

Follow the instructions to install [Docker Compose](https://docs.docker.com/compose/install/).

**A note for Mac and PC users**

After installing Docker, navigate to the Docker Desktop GUI preferences and increase the `Memory` value to at least `8GiB`.
 
[Here's where you can find the Docker Desktop GUI settings](https://docs.docker.com/docker-for-windows/#resources)

## Architecture

The output-producer-service contains of two parts:

1. Backend
2. Frontend

The backend is written using Python and the FastAPI ASGI Framework.

The frontend is written using nuxt.js.

## Backend local development

Start the stack with Docker Compose:

    docker-compose up -d

View the API Docs here:

http://localhost:5001/docs

To check the logs run:

    docker-compose logs

## View the Docs

For our documentation we use [Sphinx-docs](https://www.sphinx-doc.org/en/master/)
and lives in the [./docs](./docs) directory.

If you are currently running the entire stack you should be able to see the
documentation by visiting [http://localhost:8000](http://localhost:8000).

The documentation is configured to watch for changes and re-build the documentation.
This allows developers the ability to preview their documentation changes as they 
make them.

If you would like to run the documentation without the entire stack running you 
can do so by running:

    docker-compose up docs

## Editing The Docs

Edits are done in restructured text (rst). 

Validate and update edits by running:
```
$ cd docs
$ make html
```

If edits have been made to the Navigation and are not reflected, re-build the docker image:
```
$ cd output-producer-service
$ docker-compose down
$ docker-compose up
```

Note: Can be done in container or outside the container, with installed requirements.

## Run integration tests 

The integration tests were written to ensure the backend continued 
to work while renaming the `/api/events` endpoint to `/api/jobs`

To run the tests execute:

    ./scripts/tests.local.sh

## Clear the database

Start the stack as described above

Run the reset-db command that is contained in the `manage.py` file.

    docker-compose exec backend python manage.py reset-db

## Live Development with Jupyter Notebooks

Enter the backend Docker container:

    docker-compose exec backend bash

Run the environment variable `$JUPYTER` which is configured to be accessible via a public port http://localhost:8888

    $JUPYTER

A message like this should pop up:

```bash
    Copy/paste this URL into your browser when you connect for the first time,
    to login with a token:
        http://(73e0ec1f1ae6 or 127.0.0.1):8888/?token=f20939a41524d021fbfc62b31be8ea4dd9232913476f4397
```

You will have full Jupyter access inside your container that can be used to access your database.

### Migrations

Automatic migration files can be generated for the database. After a change is made you'll want to create a new revision.

Enter the backend Docker container:

    docker-compose exec backend bash

Create a revision:

    docker-compose exec backend alembic revision --autogenerate -m "added new column X"

A new revision will be added in the [migration](./backend/app/migrations/versions) folder.

Open the file and ensure the changes are what you expect.

Do the migration:

    docker-compose exec alembic upgrade head

## What's up with all the docker-compose files?

This takes a little getting used to initially but does make the management of the files much easier
when needing to reuse the same values in other environments. Eventually, it becomes quick to make edits
to the appropriate parts of the stack without muddling in other details.

This becomes more apparent in the [build and push](./scripts/build-push.sh) and the [deploy.sh](./scripts/deploy.sh) script.

Within these files we're able to pass in several docker-compose files and compile them into one file that is used for various things.

The only thing needed to alter some key values is the passing in of the appropriate environment variables.

## Pushing images to docker hub

Run the script [./scripts/build-push.sh](./scripts/build-push.sh) with the appropriate environment variables:

    TAG=latest FRONTEND_ENV=production ./scripts/build-push.sh

## Deployment

### Updating the Stack

Refer to the [Updating the stack](http://127.0.0.0:8000/operations/updating_the_stack.html) section of the docs.

### Deploying Web Hosting Pipeline

The web-hosting pipeline infrastructure is hosted in AWS. Instructions on [How to Deploy Web Hosting Pipeline](https://openstax.atlassian.net/wiki/spaces/CE/pages/573538307/Deploying+the+web-hosting+pipeline). Deploying the Web Hosting Pipeline
is a joint effort between DevOps, CE, and Unified.

## Load testing for the backend

Load testing with Locust.io is in the directory `./backend/app/tests/performance/`

Please look at the [README](./backend/app/tests/performance/README.md) in this directory on how to run load tests locally and for production systems.

## Attribution

A lot of the structure and ideas for this service come from Tiangolo's [full-stack-fastapi-postgres](https://github.com/tiangolo/full-stack-fastapi-postgresql) project. Thanks Tiangolo!
