// www goes to the apex, keeping the path, and nothing else is redirected.

import { describe, expect, it } from 'vitest'

import { wwwRedirect } from '../shared/utils/canonical-host'

const APP = 'https://dearmantel.com'

describe('wwwRedirect', () => {
  it('sends www to the same page on the apex', () => {
    expect(wwwRedirect('www.dearmantel.com', APP, '/')).toBe('https://dearmantel.com/')
    expect(wwwRedirect('WWW.dearmantel.com', APP, '/invite/abc?x=1')).toBe(
      'https://dearmantel.com/invite/abc?x=1',
    )
  })

  it('leaves every other host alone', () => {
    expect(wwwRedirect('dearmantel.com', APP, '/')).toBeNull()
    expect(wwwRedirect('www.example.com', APP, '/')).toBeNull()
    expect(wwwRedirect('localhost:3000', 'http://localhost:3000', '/')).toBeNull()
    expect(wwwRedirect('www.dearmantel.com', 'not a url', '/')).toBeNull()
  })

  it('never builds a link to another site from the path', () => {
    expect(wwwRedirect('www.dearmantel.com', APP, '//evil.example/x')).toBe(
      'https://dearmantel.com/',
    )
  })
})
