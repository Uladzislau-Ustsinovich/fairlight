import 'jest-fetch-mock'

import {Api} from '../'
import {ApiCacheMissError, ApiError} from '../errors'
import {IApiRequestParams} from '../typings'

const BASE_URL = 'http://test.com'
let api: Api

beforeEach(() => {
  api = new Api({baseUrl: 'http://test.com'})
  fetchMock.mockClear()
})

it('does not require a base URL', async () => {
  fetchMock.mockResponseOnce(JSON.stringify({num: 12345}), {
    headers: {'content-type': 'application/json'}
  })
  await new Api().request({method: 'GET', url: 'http://some_site.com/endpoint'})
  const request = fetchMock.mock.calls[0][0] as Request
  expect(request.url).toEqual('http://some_site.com/endpoint')
})

it('applies the base URL to requests', async () => {
  fetchMock.mockResponseOnce(JSON.stringify({num: 12345}), {
    headers: {'content-type': 'application/json'}
  })
  await api.request({method: 'GET', url: '/endpoint'})
  const request = fetchMock.mock.calls[0][0] as Request
  expect(request.url).toEqual('http://test.com/endpoint')
})

it('applies default headers', async () => {
  fetchMock.mockResponseOnce(JSON.stringify({num: 12345}), {
    headers: {'content-type': 'application/json'}
  })
  api.setDefaultHeader('X-Authorization', 'x-token')
  await api.request({method: 'GET', url: '/endpoint'})
  const request = fetchMock.mock.calls[0][0] as Request
  expect(request.headers.get('x-authorization')).toEqual('x-token')
})

it('throws an ApiError and calls onError', async () => {
  const errorJson = {test: 'error'}
  fetchMock.mockResponseOnce(JSON.stringify(errorJson), {
    headers: {'content-type': 'application/json'},
    status: 400
  })

  const onError = jest.fn()
  const unsubscribe = api.onError(onError)

  await expect(api.request({method: 'GET', url: '/endpoint'})).rejects.toEqual(
    new ApiError(400, errorJson)
  )

  expect(onError).toBeCalledWith(new ApiError(400, errorJson, 'json'))

  // try unsubscribing from error handler
  onError.mockClear()
  unsubscribe()
  await expect(api.request({method: 'GET', url: '/endpoint'})).rejects
  expect(onError).not.toBeCalled()
})

describe('response parsing', () => {
  it('parses text', async () => {
    fetchMock.mockResponseOnce('hello', {
      headers: {'content-type': 'text/plain'}
    })
    const data = await api.request({method: 'GET', url: '/endpoint'})
    expect(data).toEqual('hello')
  })

  it('parses blobs', async () => {
    fetchMock.mockResponseOnce('hello', {
      headers: {'content-type': 'application/octet-stream'}
    })
    const data = await api.request({method: 'GET', url: '/endpoint'})
    expect((data as Blob).type).toEqual('application/octet-stream')
    expect(await new Response(data as Blob).text()).toEqual('hello')
  })

  describe('json', () => {
    it('parses json', async () => {
      fetchMock.mockResponseOnce(JSON.stringify({num: 12345}), {
        headers: {'content-type': 'application/json'}
      })
      const data = await api.request({method: 'GET', url: '/endpoint'})
      expect(data).toEqual({num: 12345})
    })

    it('applies custom json serialization', async () => {
      const apiWithCustomJson = new Api({
        baseUrl: BASE_URL,
        parseResponseJson: (data) => ({
          ...data,
          resId: 'test-id'
        }),
        serializeRequestJson: ({reqId, ...rest}: any) => ({
          ...rest
        })
      })

      fetchMock.mockResponseOnce(JSON.stringify({num: 12345}), {
        headers: {'content-type': 'application/json'}
      })
      const num = await apiWithCustomJson.request({
        method: 'POST',
        url: '/endpoint',
        body: {reqId: 'test-id', num: 23456}
      })
      const request = fetchMock.mock.calls[0][0] as Request
      expect(await request.json()).toEqual({num: 23456})
      expect(num).toEqual({resId: 'test-id', num: 12345})
    })
  })
})

describe('fetch policies', () => {
  test('policy behaviour', async () => {
    const responseBody = {test: 'data'}
    fetchMock.mockResponse(JSON.stringify(responseBody), {
      headers: {'content-type': 'application/json'}
    })

    const params: IApiRequestParams<'GET', {}> = {
      method: 'GET',
      url: '/endpoint'
    }

    await api.request(params, {fetchPolicy: 'no-cache'}) // doesn't save to cache

    await expect(
      api.request(params, {fetchPolicy: 'cache-only'})
    ).rejects.toBeInstanceOf(ApiCacheMissError)

    expect(await api.request(params, {fetchPolicy: 'fetch-first'})).toEqual(
      responseBody
    ) // saves to cache

    expect(await api.request(params, {fetchPolicy: 'cache-only'})).toEqual(
      responseBody
    ) // successfully reads from cache

    const cacheAndFetchResponseBody = {test: 'data-2'}
    fetchMock.mockResponse(JSON.stringify(cacheAndFetchResponseBody), {
      headers: {'content-type': 'application/json'}
    })

    expect(await api.request(params, {fetchPolicy: 'cache-and-fetch'})).toEqual(
      responseBody // reads original response body first
    )

    await new Promise((resolve) => setTimeout(resolve))

    expect(await api.request(params, {fetchPolicy: 'cache-first'})).toEqual(
      cacheAndFetchResponseBody // the cache eventually updated using background fetch
    )

    const fetchFirstResponseBody = {test: 'data-3'}
    fetchMock.mockResponse(JSON.stringify(fetchFirstResponseBody), {
      headers: {'content-type': 'application/json'}
    })

    expect(await api.request(params, {fetchPolicy: 'fetch-first'})).toEqual(
      fetchFirstResponseBody // returns the most recent-fetched response body first
    )

    expect(await api.request(params, {fetchPolicy: 'cache-only'})).toEqual(
      fetchFirstResponseBody // updates cache
    )

    const cacheFirstResponseBody = {test: 'data-4'}
    fetchMock.mockResponse(JSON.stringify(cacheFirstResponseBody), {
      headers: {'content-type': 'application/json'}
    })

    expect(await api.request(params, {fetchPolicy: 'cache-first'})).toEqual(
      fetchFirstResponseBody // reads original response body first
    )
  })

  test('cache-and-fetch error emits an error for handling', async () => {
    const errorResponseBody = {error: true}

    fetchMock.mockResponse(JSON.stringify(errorResponseBody), {
      status: 400,
      headers: {'content-type': 'application/json'}
    })

    const params: IApiRequestParams<'GET', {}> = {
      method: 'GET',
      url: '/endpoint'
    }

    // before a cached response exists, it should reject
    await expect(
      api.request(params, {fetchPolicy: 'cache-and-fetch'})
    ).rejects.toBeInstanceOf(ApiError)

    const cachedResponse = {valid: true}

    api.writeCachedResponse(params, cachedResponse)

    const errorHandler = jest.fn()

    api.onError(errorHandler)

    expect(await api.request(params, {fetchPolicy: 'cache-and-fetch'})).toEqual(
      cachedResponse
    )

    await new Promise((resolve) => setTimeout(resolve))

    expect(errorHandler).toBeCalledWith(
      new ApiError(400, errorResponseBody, 'json')
    )
  })
})

describe('GET promise cache', () => {
  it('Api#requestInProgress returns true when there are outstanding requests', async () => {
    const responseBody = {test: 'data'}
    fetchMock.mockResponse(JSON.stringify(responseBody), {
      headers: {'content-type': 'application/json'}
    })

    const params: IApiRequestParams<'GET', {}> = {
      method: 'GET',
      url: '/endpoint'
    }

    const requestPromise = api.request(params)
    expect(api.requestInProgress(params)).toBe(true)

    await requestPromise

    expect(api.requestInProgress(params)).toBe(false)
  })

  test('new request called with matching params do not start new requests', async () => {
    const responseBody = {test: 'data'}
    fetchMock.mockResponse(JSON.stringify(responseBody), {
      headers: {'content-type': 'application/json'}
    })

    const params: IApiRequestParams<'GET', {}> = {
      method: 'GET',
      url: '/endpoint'
    }

    api.request(params)
    const requestPromiseCopy = api.request(params)

    await requestPromiseCopy

    expect(api.requestInProgress(params)).toBe(false)

    expect(fetchMock).toBeCalledTimes(1)
  })

  test('new request called with matching params and forceNewFetch=true starts new request', async () => {
    const responseBody = {test: 'data'}
    fetchMock.mockResponse(JSON.stringify(responseBody), {
      headers: {'content-type': 'application/json'}
    })

    const params: IApiRequestParams<'GET', {}> = {
      method: 'GET',
      url: '/endpoint'
    }

    api.request(params)
    const requestPromiseCopy = api.request(params, {forceNewFetch: true})

    await requestPromiseCopy

    expect(fetchMock).toBeCalledTimes(2)
  })

  test('returns the same promise for requests currently in flight', async () => {
    const responseBody = {test: 'data'}
    fetchMock.mockResponse(JSON.stringify(responseBody), {
      headers: {'content-type': 'application/json'}
    })

    const params: IApiRequestParams<'GET', {}> = {
      method: 'GET',
      url: '/endpoint'
    }

    const requestOriginal = api.request(params)
    const requestPromiseCopy = api.request(params)

    expect(requestOriginal).toBe(requestPromiseCopy)

    await requestPromiseCopy
  })
})

test('manual cache read/write and listener', async () => {
  const params: IApiRequestParams<'GET', {}> = {
    method: 'GET',
    url: '/endpoint'
  }

  const response = {a: 1}

  const onCacheUpdate = jest.fn()
  const unsubscribe = api.onCacheUpdate(params, onCacheUpdate)

  api.writeCachedResponse(params, response)
  expect(api.readCachedResponse(params)).toEqual(response)
  expect(onCacheUpdate).toBeCalledWith(response)

  // unsubscribe and assert it isn't called for future updates
  onCacheUpdate.mockClear()
  unsubscribe()
  api.writeCachedResponse(params, {b: 2})
  expect(onCacheUpdate).not.toBeCalled()
})

test('buildUrl', () => {
  expect(api.buildUrl('/endpoint')).toEqual('http://test.com/endpoint')
})
