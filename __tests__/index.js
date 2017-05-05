/* eslint-env jest */
const AWS = require('aws-sdk')
const request = require('supertest')
const sinon = require('sinon')

let server
let consoleStub
let latestStub

function expectWrap (done, callback) {
  return (err) => {
    expect(err).toBeFalsy()
    if (callback) { callback() }
    done()
  }
}

describe('Routes', () => {
  beforeEach(() => {
    server = require('../index')
    consoleStub = sinon.stub(console, 'error')
    latestStub = {
      Body: {
        build: 'VivIDE-v3.4.0-b503-stable-20170420T1417230700-89e188a04-darwin-x64.zip',
        notes: 'This release may contain improvements and bug fixes.',
        pub_date: '2017-04-20T14:17:23-0700',
        version: '3.4.0-b503'
      }
    }
  })

  afterEach(() => {
    server.close()
    consoleStub.restore()
  })

  describe('/build/:buildId', () => {
    let getObjectReturnStub

    beforeEach(() => {
      getObjectReturnStub = {
        on: sinon.stub(),
        send: sinon.stub()
      }
      sinon.stub(AWS, 'S3').returns({
        getObject: sinon.stub().returns(getObjectReturnStub)
      })
    })

    afterEach(() => {
      AWS.S3.restore()
    })

    it('Pipes the build to output when found', (done) => {
      const headers = {
        'x-amz-id-2': 'Tx2NIQfaFafz6V2hksOawOIMuFePz2KzxEjDN2RaDXtnK3w=',
        'x-amz-request-id': '1272A37E4A1971BC',
        'date': 'Wed, 03 May 2017 00:06:34 GMT',
        'last-modified': 'Thu, 20 Apr 2017 21:17:41 GMT',
        'etag': '"d1fd375c457bb15ea2211421e0846e35-6"',
        'accept-ranges': 'bytes',
        'content-type': 'application/zip',
        'content-length': '45167830',
        'server': 'AmazonS3'
      }
      let _res
      const context = {
        response: {
          httpResponse: {
            createUnbufferedStream: sinon.stub().returns({
              pipe: (res) => {
                expect(res._headers).toMatchObject(headers)
                expect(res.statusCode).toBe(200)
                _res = res
              }
            })
          }
        }
      }

      getObjectReturnStub.send = () => {
        _res.send()
      }
      getObjectReturnStub.on.withArgs('httpHeaders')
        .callsArgOnWith(1, context, 200, headers)
        .returns(getObjectReturnStub)

      request(server).get('/build/valid.zip').end(expectWrap(done))
    })

    it('Pipes the 404 from S3 to the output', (done) => {
      const headers = {
        'x-amz-request-id': 'C05B6C68C1983A8D',
        'x-amz-id-2': 'EJhyrLqejTeJfw7ot8B5vmOq7XXK9lpr0JG7iM5KO5g5I+0Bflf/A=',
        'content-type': 'application/xml',
        'transfer-encoding': 'chunked',
        'date': 'Wed, 03 May 2017 00:00:55 GMT',
        'server': 'AmazonS3',
        'Body': 'should be stripped',
        'Metadata': 'should be stripped'
      }
      let _res
      const context = {
        response: {
          httpResponse: {
            createUnbufferedStream: sinon.stub().returns({
              pipe: (res) => {
                Object.assign(headers, { Body: undefined, Metadata: undefined })
                expect(res._headers).toMatchObject(headers)
                expect(res.statusCode).toBe(404)
                _res = res
              }
            })
          }
        }
      }

      getObjectReturnStub.send = () => {
        _res.send()
      }
      getObjectReturnStub.on.withArgs('httpHeaders')
        .callsArgOnWith(1, context, 404, headers)
        .returns(getObjectReturnStub)

      request(server).get('/build/valid.zip').end(expectWrap(done))
    })
  })

  describe('/status/:channel/:version', () => {
    let getObjectStub
    beforeEach(() => {
      getObjectStub = sinon.stub()
      sinon.stub(AWS, 'S3').returns({
        getObject: getObjectStub
      })
    })

    afterEach(() => {
      AWS.S3.restore()
    })

    it('returns 400 for invalid version', (done) => {
      request(server)
        .get('/status/stable-darwin-x64-c4f5c975/0.notValidVersion')
        .expect(400, 'invalid version')
        .end(expectWrap(done))
    })

    it('returns 500 if S3 returns an error', (done) => {
      getObjectStub.callsArgWith(1, new Error('key does not exist'), null)
      request(server)
        .get('/status/stable-darwin-x64-c4f5c975/0.0.0')
        .expect(500, 'key does not exist')
        .end(expectWrap(done, () => {
          expect(consoleStub.callCount).toBe(1)
        }))
    })

    it('returns 500 if channel has bad version', (done) => {
      latestStub.Body.version = 'notAVersion'
      latestStub.Body = Buffer.from(JSON.stringify(latestStub.Body))
      getObjectStub.callsArgWith(1, null, latestStub)
      request(server)
        .get('/status/stable-darwin-x64-c4f5c975/0.0.0')
        .expect(500, 'bad version data in channel stable-darwin-x64-c4f5c975: notAVersion')
        .end(expectWrap(done, () => {
          expect(consoleStub.callCount).toBe(1)
        }))
    })

    it('returns 500 if latest has no build', (done) => {
      latestStub.Body.build = null
      latestStub.Body = Buffer.from(JSON.stringify(latestStub.Body))
      getObjectStub.callsArgWith(1, null, latestStub)
      request(server)
        .get('/status/stable-darwin-x64-c4f5c975/0.0.0')
        .expect(500, 'bad build data for stable-darwin-x64-c4f5c975')
        .end(expectWrap(done, () => {
          expect(consoleStub.callCount).toBe(1)
        }))
    })

    it('returns 204 if there is no update', (done) => {
      latestStub.Body = Buffer.from(JSON.stringify(latestStub.Body))
      getObjectStub.callsArgWith(1, null, latestStub)
      request(server)
        .get('/status/stable-darwin-x64-c4f5c975/3.4.0-b503')
        .expect(204)
        .end(expectWrap(done))
    })

    it('returns 200 if there is an update', (done) => {
      latestStub.Body = Buffer.from(JSON.stringify(latestStub.Body))
      getObjectStub.callsArgWith(1, null, latestStub)
      request(server)
        .get('/status/stable-darwin-x64-c4f5c975/0.0.0')
        .expect((res) => {
          expect(res.statusCode).toBe(200)
          expect(res.body).toEqual({
            name: '3.4.0-b503',
            notes: 'This release may contain improvements and bug fixes.',
            pub_date: '2017-04-20T14:17:23-0700',
            url: `${res.request.protocol}//${res.request.host}/build/VivIDE-v3.4.0-b503-stable-20170420T1417230700-89e188a04-darwin-x64.zip`
          })
        })
        .end(expectWrap(done))
    })
  })

  describe('/latest/:channel', () => {
    let getObjectStub
    beforeEach(() => {
      getObjectStub = sinon.stub()
      sinon.stub(AWS, 'S3').returns({
        getObject: getObjectStub
      })
    })

    afterEach(() => {
      AWS.S3.restore()
    })

    it('returns 404 if channel is not found', (done) => {
      const err = { statusCode: 404, message: 'The specified key does not exist.' }
      getObjectStub.callsArgWith(1, err, null)
      request(server)
        .get('/latest/stable-darwin-x64-c4f5c975')
        .expect(404, 'The specified key does not exist.')
        .end(expectWrap(done))
    })

    it('redirects to the latest build', (done) => {
      latestStub.Body = Buffer.from(JSON.stringify(latestStub.Body))
      getObjectStub.callsArgWith(1, null, latestStub)
      request(server)
        .get('/latest/stable-darwin-x64-c4f5c975')
        .expect((res) => {
          expect(res.statusCode).toBe(301)
          expect(res.headers.location)
            .toBe(`${res.request.protocol}//${res.request.host}/build/VivIDE-v3.4.0-b503-stable-20170420T1417230700-89e188a04-darwin-x64.zip`)
        })
        .end(expectWrap(done))
    })
  })
})
