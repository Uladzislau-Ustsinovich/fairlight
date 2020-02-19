import {applyHeaders, getParamsId} from '../lib'
import {IApiRequestParams} from '../typings'

describe('getParamsId', () => {
  it('returns null if nothing is passed in', () => {
    expect(getParamsId(null)).toEqual(null)
  })

  it('serializes basic requests', () => {
    const requestParams: IApiRequestParams = {
      method: 'GET',
      url: '/endpoint'
    }

    expect(getParamsId(requestParams)).not.toEqual(
      getParamsId({
        ...requestParams,
        method: 'POST'
      })
    )

    expect(getParamsId(requestParams)).not.toEqual(
      getParamsId({
        ...requestParams,
        url: '/endpoint-2'
      })
    )
  })

  it('serializes headers', () => {
    const requestParams: IApiRequestParams = {
      method: 'GET',
      url: '/endpoint'
    }

    // empty header checks
    expect(getParamsId(requestParams)).toEqual(
      getParamsId({
        ...requestParams,
        headers: null
      })
    )

    expect(getParamsId(requestParams)).toEqual(
      getParamsId({
        ...requestParams,
        headers: {}
      })
    )

    // ensure header modifies the paramsId
    expect(
      getParamsId({
        ...requestParams,
        headers: {
          'Content-Type': 'application/json'
        }
      })
    ).not.toEqual(getParamsId(requestParams))

    // test capitalization variance
    expect(
      getParamsId({
        ...requestParams,
        headers: {
          'CONTENT-TYPE': 'application/json'
        }
      })
    ).toEqual(
      getParamsId({
        ...requestParams,
        headers: {
          'content-type': 'application/json'
        }
      })
    )

    // test order variance
    expect(
      getParamsId({
        ...requestParams,
        headers: {
          'X-Authorization': 'x-token',
          'Content-Type': 'application/json'
        }
      })
    ).toEqual(
      getParamsId({
        ...requestParams,
        headers: {
          'Content-Type': 'application/json',
          'X-Authorization': 'x-token'
        }
      })
    )
  })

  it('serializes response type', () => {
    const requestParams: IApiRequestParams = {
      method: 'GET',
      url: '/endpoint',
      responseType: null
    }

    expect(getParamsId(requestParams)).toEqual(
      getParamsId({
        ...requestParams,
        responseType: null
      })
    )

    expect(
      getParamsId({
        ...requestParams,
        responseType: 'json'
      })
    ).toEqual(
      getParamsId({
        ...requestParams,
        responseType: 'json'
      })
    )

    expect(
      getParamsId({
        ...requestParams,
        responseType: 'blob'
      })
    ).not.toEqual(
      getParamsId({
        ...requestParams,
        responseType: 'json'
      })
    )
  })
})

test('applyHeaders', () => {
  const prevHeaders = new Headers({'Content-Type': 'application/json'})
  expect(applyHeaders(prevHeaders, null)).not.toBe(prevHeaders) // ensure it doesn't mutate original headers

  // no change
  expect(applyHeaders(prevHeaders, null)).toEqual(prevHeaders)

  // new header
  expect(applyHeaders(prevHeaders, {'x-authorization': 'x-token'})).toEqual(
    new Headers({
      'Content-Type': 'application/json',
      'X-Authorization': 'x-token'
    })
  )

  // override existing header
  expect(applyHeaders(prevHeaders, {'content-type': 'text/plain'})).toEqual(
    new Headers({'Content-Type': 'text/plain'})
  )
})
