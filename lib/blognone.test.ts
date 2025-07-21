import test from 'ava'
import fs from 'fs'
import path from 'path'
import sinon from 'sinon'
import { parseRss, parseXML } from '../action/feeds/parsers'
import { processBlognoneContent, isBlognoneContent } from './utils'

test('#blognone feed parsing removes duplicate headers correctly', async (t) => {
  // Load the mock blognone RSS feed
  const data = fs
    .readFileSync(path.join(__dirname, '..', 'action', 'feeds', 'stubs', 'blognone.rss.xml'))
    .toString('utf8')
  
  const xml = await parseXML(data)
  const site = parseRss('Blognone', xml)
  
  // Verify the RSS parsing worked correctly
  t.is(site?.entries.length, 3)
  t.is(site?.title, 'Blognone')
  t.is(site?.link, 'https://www.blognone.com')
  
  // Test the first entry which has duplicate header
  const firstEntry = site?.entries[0]
  t.is(firstEntry?.title, 'การใช้ AI ในการพัฒนา Software')
  
  // Verify that the original content contains duplicate header
  const originalContent = firstEntry?.content || ''
  t.true(originalContent.includes('<h1>การใช้ AI ในการพัฒนา Software</h1>'))
  
  // Test blognone detection
  t.true(isBlognoneContent('blognone-com'))
  t.true(isBlognoneContent('other-site', 'https://www.blognone.com/node/123456'))
  
  // Process the content to remove duplicate headers
  const processedContent = processBlognoneContent(originalContent, firstEntry?.title || '')
  
  // Verify duplicate header is removed
  t.false(processedContent.includes('<h1>การใช้ AI ในการพัฒนา Software</h1>'))
  
  // Verify other content remains intact
  t.true(processedContent.includes('<p>ในยุคปัจจุบัน การใช้ประโยชน์จาก AI'))
  t.true(processedContent.includes('<h2>ข้อดีของการใช้ AI</h2>'))
  t.true(processedContent.includes('<ul>'))
  t.true(processedContent.includes('<li>ประหยัดเวลาในการเขียนโค้ด</li>'))
  
  // Test second entry (also has duplicate header)
  const secondEntry = site?.entries[1]
  t.is(secondEntry?.title, 'เทคโนโลยี Blockchain ล่าสุด')
  
  const secondOriginalContent = secondEntry?.content || ''
  const secondProcessedContent = processBlognoneContent(secondOriginalContent, secondEntry?.title || '')
  
  // Verify duplicate header is removed from second entry
  t.false(secondProcessedContent.includes('<h1>เทคโนโลยี Blockchain ล่าสุด</h1>'))
  t.true(secondProcessedContent.includes('<p>Blockchain เป็นเทคโนโลยีที่มีการพัฒนาอย่างต่อเนื่อง</p>'))
  t.true(secondProcessedContent.includes('<h2>การประยุกต์ใช้</h2>'))
  
  // Test third entry (no duplicate header)
  const thirdEntry = site?.entries[2]
  t.is(thirdEntry?.title, 'วิธีการเรียนรู้ Programming')
  
  const thirdOriginalContent = thirdEntry?.content || ''
  const thirdProcessedContent = processBlognoneContent(thirdOriginalContent, thirdEntry?.title || '')
  
  // Verify content without duplicate header remains unchanged
  t.is(thirdProcessedContent, thirdOriginalContent)
  t.true(thirdProcessedContent.includes('<p>การเรียนรู้ Programming เป็นทักษะที่สำคัญ'))
  t.true(thirdProcessedContent.includes('<h2>เริ่มต้นอย่างไร</h2>'))
})

test('#blognone content processing with real world scenarios', (t) => {
  // Test with HTML attributes in header tags
  const contentWithAttributes = '<h1 class="title" id="main-title">Test Article Title</h1><p>Content</p>'
  const processed = processBlognoneContent(contentWithAttributes, 'Test Article Title')
  t.is(processed, '<p>Content</p>')
  
  // Test with nested HTML in headers
  const contentWithNestedHTML = '<h1><span>Test</span> <strong>Article</strong> Title</h1><p>Content</p>'
  const processedNested = processBlognoneContent(contentWithNestedHTML, 'Test Article Title')
  t.is(processedNested, '<p>Content</p>')
  
  // Test with multiple duplicate headers
  const contentWithMultipleDuplicates = `
    <h1>Article Title</h1>
    <p>Some content</p>
    <h2>Article Title</h2>
    <p>More content</p>
    <h3>Different Header</h3>
  `
  const processedMultiple = processBlognoneContent(contentWithMultipleDuplicates, 'Article Title')
  t.false(processedMultiple.includes('<h1>Article Title</h1>'))
  t.false(processedMultiple.includes('<h2>Article Title</h2>'))
  t.true(processedMultiple.includes('<h3>Different Header</h3>'))
  t.true(processedMultiple.includes('<p>Some content</p>'))
  t.true(processedMultiple.includes('<p>More content</p>'))
})