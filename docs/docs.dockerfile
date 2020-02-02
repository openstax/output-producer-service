FROM python:3.7 AS builder
LABEL maintainer="OpenStax Content Engineering"

COPY requirements.txt .

# Update System Dependencies
RUN set -x \
  && apt-get update && apt-get upgrade -y \
  && apt-get autoremove -y \
  && rm -rf /var/cache/* \
  && rm -rf /var/lib/apt/lists/*

RUN pip install -r requirements.txt

COPY ./ /docs

WORKDIR /docs

RUN make html

FROM nginx:1.16-alpine
LABEL maintainer="OpenStax Content Engineering"

WORKDIR /usr/share/nginx/html

COPY --from=builder /docs/_build/html .

EXPOSE 80
