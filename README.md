# Simple S3 Proxy for Squirrel Updates

This nodejs package implements a
[squirrel update service](https://github.com/Squirrel/Squirrel.Mac#update-requests)
using Amazon S3 as a backend. Your builds and build metadata live in
S3.  As update requests arrive, the server checks a well-known S3 bucket and key
for a `latest.json` file, and uses this data to decide whether to send 204
if the client is already up to date, or JSON based on `latest.json` if
the client should update.

## Installation

Clone this repo or download a release, set environment variables
according to "Configuration" below, then `yarn dev`.

To make the server useful, you'll need to upload a `latest.json` to
your channel bucket as specified by `FILBERT_CHANNEL_BUCKET` and
`FILBERT_CHANNEL_BUCKET`. Here's a sample:

```json
{
  "build": "fubar.dmg",
  "name": "Fubar Pro",
  "notes": "Warning: processed in a facility that also processes nuts.",
  "pub_date": "2016-09-14T12:34:56-00:00",
  "version": "0.1.2"
}
```

Filbert uses [semver](http://semver.org/) to compare the client's
version string with the server's version string.

Sample requests and responses:

* `curl -i 'http://localhost:3000/status/test/0.0.1'`: 200, because
  0.0.1 has an update available.
* `curl -i 'http://localhost:3000/status/test/0.1.2'`: 204, no update
  available.
* `curl -i 'http://localhost:3000/status/test/0'`: 400, because `0` is
  not a semver.

When an update is available, the response includes a url built from
the `FILBERT_BUILD_BUCKET`, `FILBERT_BUILD_PREFIX`, and the `build`
from that channel's `latest.json`.

## Configuration

```shell
cp .env.sample .env
```

Filbert uses environment variables for its configuration.

* `FILBERT_PORT`: The listener port, default 3000.
* `FILBERT_BUILD_BUCKET`: The S3 bucket where builds live.
* `FILBERT_BUILD_PREFIX`: The prefix under `FILBERT_BUILD_BUCKET`
  where builds live. This can be empty.
* `FILBERT_CHANNEL_BUCKET`: The S3 bucket where channel information
  lives.
* `FILBERT_CHANNEL_PREFIX`: The prefix under `FILBERT_CHANNEL_BUCKET`
  where each channel's `latest.json` lives. This can be empty.

For AWS credentials configure a `$HOME/.aws/credentials`, AWS
environment credentials, or IAM profile with GetObject access to the
appropriate S3 content.

# The End
