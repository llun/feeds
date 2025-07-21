import test from 'ava'
import { parseLocation, processBlognoneContent, isBlognoneContent } from './utils'

test('#parseLocation returns category type', (t) => {
  t.deepEqual(parseLocation('/categories/Apple'), {
    type: 'category',
    category: 'Apple'
  })
  t.deepEqual(parseLocation('/categories/categoryKey'), {
    type: 'category',
    category: 'categoryKey'
  })
})

test('#parseLocation returns site type', (t) => {
  t.deepEqual(parseLocation('/sites/all'), {
    type: 'site',
    siteKey: 'all'
  })
  t.deepEqual(parseLocation('/sites/siteKey'), {
    type: 'site',
    siteKey: 'siteKey'
  })
})

test('#parseLocation returns enry type', (t) => {
  t.deepEqual(parseLocation('/sites/all/entries/entryKey'), {
    type: 'entry',
    entryKey: 'entryKey',
    parent: {
      type: 'site',
      key: 'all'
    }
  })
  t.deepEqual(parseLocation('/sites/siteKey/entries/entryKey'), {
    type: 'entry',
    entryKey: 'entryKey',
    parent: {
      type: 'site',
      key: 'siteKey'
    }
  })
  t.deepEqual(parseLocation('/categories/categoryKey/entries/entryKey'), {
    type: 'entry',
    entryKey: 'entryKey',
    parent: {
      type: 'category',
      key: 'categoryKey'
    }
  })
})

test('#parseLocation returns null as invalid path', (t) => {
  t.is(parseLocation('/sites/all/entries'), null)
  t.is(parseLocation('/sites/siteKey/entries/'), null)
  t.is(parseLocation('/sites/siteKey/somethingwrong/entryKey'), null)
  t.is(parseLocation('/somethingelse/siteKey/entries/entryKey'), null)
  t.is(parseLocation('/sites/'), null)
  t.is(parseLocation('/categories'), null)
  t.is(parseLocation('/somethingelse'), null)
})

test('#isBlognoneContent identifies blognone.com content', (t) => {
  // Test with siteKey containing blognone
  t.true(isBlognoneContent('blognone.com'))
  t.true(isBlognoneContent('site-blognone-com'))
  t.true(isBlognoneContent('BLOGNONE'))
  
  // Test with URL containing blognone.com
  t.true(isBlognoneContent('other-site', 'https://blognone.com/article'))
  t.true(isBlognoneContent('other-site', 'https://www.blognone.com/node/feed'))
  
  // Test negative cases
  t.false(isBlognoneContent('other-site'))
  t.false(isBlognoneContent('other-site', 'https://example.com'))
  t.false(isBlognoneContent(''))
})

test('#processBlognoneContent removes duplicate headers', (t) => {
  const title = 'Sample Article Title'
  
  // Test with h1 duplicate header
  const contentWithH1 = '<h1>Sample Article Title</h1><p>Article content here</p>'
  const expectedWithoutH1 = '<p>Article content here</p>'
  t.is(processBlognoneContent(contentWithH1, title), expectedWithoutH1)
  
  // Test with h2 duplicate header
  const contentWithH2 = '<h2>Sample Article Title</h2><p>Article content here</p>'
  const expectedWithoutH2 = '<p>Article content here</p>'
  t.is(processBlognoneContent(contentWithH2, title), expectedWithoutH2)
  
  // Test with case insensitive matching
  const contentWithMixedCase = '<h1>sample article title</h1><p>Article content here</p>'
  const expectedWithoutMixedCase = '<p>Article content here</p>'
  t.is(processBlognoneContent(contentWithMixedCase, title), expectedWithoutMixedCase)
  
  // Test with extra whitespace
  const contentWithWhitespace = '<h1>  Sample Article Title  </h1><p>Article content here</p>'
  const expectedWithoutWhitespace = '<p>Article content here</p>'
  t.is(processBlognoneContent(contentWithWhitespace, title), expectedWithoutWhitespace)
  
  // Test with non-matching header (should remain)
  const contentWithDifferentHeader = '<h1>Different Header</h1><p>Article content here</p>'
  t.is(processBlognoneContent(contentWithDifferentHeader, title), contentWithDifferentHeader)
  
  // Test with multiple headers, only duplicate removed
  const contentWithMultipleHeaders = '<h1>Sample Article Title</h1><h2>Subsection</h2><p>Article content here</p>'
  const expectedWithOnlySubsection = '<h2>Subsection</h2><p>Article content here</p>'
  t.is(processBlognoneContent(contentWithMultipleHeaders, title), expectedWithOnlySubsection)
  
  // Test with empty inputs
  t.is(processBlognoneContent('', title), '')
  t.is(processBlognoneContent(contentWithH1, ''), contentWithH1)
  
  // Test with complex HTML structure
  const complexContent = '<div><h1>Sample Article Title</h1><div class="content"><p>Article content here</p><h2>Another Section</h2></div></div>'
  const expectedComplex = '<div><div class="content"><p>Article content here</p><h2>Another Section</h2></div></div>'
  t.is(processBlognoneContent(complexContent, title), expectedComplex)
})
