FROM python:3.7

LABEL maintainer="OpenStax Content Engineering"

COPY requirements.txt .

# Update System Dependencies
RUN set -x \
  && apt-get update && apt-get upgrade -y \
  && apt-get autoremove -y \
  && rm -rf /var/cache/* \
  && rm -rf /var/lib/apt/lists/*

RUN pip install -r requirements.txt

COPY . /docs

WORKDIR /docs

EXPOSE 8000

CMD make livehtml
