// index.js

const AWS = require('aws-sdk')
const bodyParser = require('body-parser')
const express = require('express')
const http = require('http')
const path = require('path')
const semver = require('semver')

const app = express()
app.use(bodyParser.json({limit: '1kb'}))

const envDefaults = {
  FILBERT_PORT: 3000,
  FILBERT_SCHEME: 'http'
}

const envMerged = Object.assign({}, envDefaults, process.env)

const {
  FILBERT_BUILD_BUCKET,
  FILBERT_BUILD_PREFIX,
  FILBERT_CHANNEL_BUCKET,
  FILBERT_CHANNEL_PREFIX,
  FILBERT_PORT,
  FILBERT_SCHEME
} = envMerged

if (!FILBERT_BUILD_BUCKET) {
  console.error('Must set FILBERT_BUILD_BUCKET')
  process.exit(-1)
}

if (FILBERT_BUILD_PREFIX && FILBERT_BUILD_PREFIX.startsWith('/')) {
  console.error('If set, FILBERT_BUILD_PREFIX must not start with "/"')
  process.exit(-1)
}

if (!FILBERT_CHANNEL_BUCKET) {
  console.error('Must set FILBERT_CHANNEL_BUCKET')
  process.exit(-1)
}

if (FILBERT_CHANNEL_PREFIX && FILBERT_CHANNEL_PREFIX.startsWith('/')) {
  console.error('If set, FILBERT_CHANNEL_PREFIX must not start with "/"')
  process.exit(-1)
}

if (FILBERT_SCHEME !== 'http' && FILBERT_SCHEME !== 'https') {
  console.error('Bad value for FILBERT_SCHEME', FILBERT_SCHEME)
  process.exit(-1)
}

app.use('/build/:buildId', function (req, res, next) {
  const { buildId } = req.params

  // Expect .aws/credentials, environment credentials, or IAM profile.
  const s3 = new AWS.S3()
  const bucket = FILBERT_BUILD_BUCKET
  const key = FILBERT_BUILD_PREFIX + buildId

  s3.getObject(
    {
      Bucket: bucket,
      Key: key
    }
  ).on('httpHeaders', function (statusCode, headers) {
    if (statusCode !== 200) {
      console.error(bucket, key, statusCode)
    }

    res.status(statusCode)
    Object.keys(headers).forEach((name) => {
      if (name === 'Body' || name === 'Metadata') { return }
      res.append(name, headers[name])
    })
    this.response.httpResponse.createUnbufferedStream().pipe(res)
  }).send()
})

app.use('/status/:channel/:version', function (req, res, next) {
  const { channel, version } = req.params
  if (!semver.valid(version)) {
    console.error('bad version', version, 'on channel', channel)
    return res.status(400).send('invalid version')
  }

  // Expect .aws/credentials, environment credentials, or IAM profile.
  const s3 = new AWS.S3()
  const bucket = FILBERT_CHANNEL_BUCKET
  const key = path.join(FILBERT_CHANNEL_PREFIX, channel, 'latest.json')

  s3.getObject(
    {
      Bucket: bucket,
      Key: key
    },
    function (err, data) {
      if (err) {
        console.error(channel, version, bucket, key, err, err.stack)
        if (err.statusCode) {
          return res.status(err.statusCode).send(err.message)
        }
        return res.status(500).send(err)
      }

      const latest = JSON.parse(data.Body.toString())
      if (!latest || !latest.version) {
        console.error('channel', channel, 'has bad data', data)
        return res.status(500)
          .send('bad data in channel ' + channel + ': ' + data)
      }
      if (!semver.valid(latest.version)) {
        console.error('channel', channel, 'has bad version data', version)
        return res.status(500)
          .send('bad version data in channel ' + channel + ': ' + version)
      }

      if (semver.gte(version, latest.version)) {
        // Already up to date.
        return res.sendStatus(204)
      }

      const { build, notes, pub_date } = latest
      if (!build) {
        console.error('channel', channel, 'has bad data', latest)
        return res.status(500)
          .send('bad data in channel ' + channel + ': ' + data)
      }
      const url = FILBERT_SCHEME + '://' +
            path.join(
              (req.get('host') || ('localhost' + FILBERT_PORT)),
              'build',
              build)
      return res.send({
        name: latest.version,
        notes,
        pub_date,
        url
      })
    }
  )
})

http.createServer(app).listen(FILBERT_PORT)
console.log('filbert is listening on port', FILBERT_PORT)

// end
