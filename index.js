// index.js
require('dotenv').config()
const sanity = require('sanity')
const AWS = require('aws-sdk')
const bodyParser = require('body-parser')
const express = require('express')
const path = require('path')
const semver = require('semver')

const app = express()
app.use(bodyParser.json({limit: '1kb'}))

const envDefaults = {
  FILBERT_PORT: '3000',
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

sanity.check([
  'FILBERT_BUILD_BUCKET',
  'FILBERT_BUILD_PREFIX',
  'FILBERT_CHANNEL_BUCKET',
  'FILBERT_CHANNEL_PREFIX',
  'FILBERT_PORT',
  { key: 'FILBERT_SCHEME', matcher: () => { return !!FILBERT_SCHEME.match(/^https?$/) } }
], {
  source: envMerged
})

/**
 * @param {string} build
 * @param {string} host=localhost
 * @returns {string}
 */
function buildUrl (build, host) {
  return `${FILBERT_SCHEME}://${path.join(host, 'build', build)}`
}

function getLatest (channel, callback) {
  // Expect .aws/credentials, environment credentials, or IAM profile.
  const s3 = new AWS.S3()
  const bucket = FILBERT_CHANNEL_BUCKET
  const key = path.join(FILBERT_CHANNEL_PREFIX, channel, 'latest.json').replace(/^\//, '')

  s3.getObject(
    {
      Bucket: bucket,
      Key: key
    },
    function (err, data) {
      if (err) {
        return callback(err)
      }

      const latest = JSON.parse(data.Body.toString())
      if (!latest.build) {
        return callback(new Error(`bad build data for ${channel}`))
      }
      return callback(null, latest)
    }
  )
}

app.use('/build/:buildId', function (req, res, next) {
  const { buildId } = req.params

  // Expect .aws/credentials, environment credentials, or IAM profile.
  const s3 = new AWS.S3()
  const bucket = FILBERT_BUILD_BUCKET
  const key = path.join(FILBERT_BUILD_PREFIX, buildId).replace(/^\//, '')

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
    return res.status(400).send('invalid version')
  }

  getLatest(channel, (err, latest) => {
    if (err) {
      return next(err)
    }

    if (!semver.valid(latest.version)) {
      return next(new Error(`bad version data in channel ${channel}: ${latest.version}`))
    }

    if (semver.gte(version, latest.version)) {
      // Already up to date.
      return res.sendStatus(204)
    }

    const { build, notes, pub_date } = latest
    const url = buildUrl(build, req.get('host'))
    return res.send({
      name: latest.version,
      notes,
      pub_date,
      url
    })
  })
})

app.use('/latest/:channel', function (req, res, next) {
  getLatest(req.params.channel, (err, latest) => {
    if (err) {
      return next(err)
    }

    const url = buildUrl(latest.build, req.get('host'))
    res.redirect(301, url)
  })
})

app.use((err, req, res, next) => {
  console.error(err, err.stack)
  res.status(err.statusCode || 500).send(err.message)
})

module.exports = app.listen(FILBERT_PORT, function () {
  console.log('filbert is listening on port', FILBERT_PORT)
})

// end
