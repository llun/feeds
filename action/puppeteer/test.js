// @ts-check
const { loadContent, close } = require('./')

async function run() {
  const content = await loadContent(
    'https://cyclingtips.com/2021/01/continentals-new-gp5000-options-include-a-transparent-tan-sidewall/'
  )
  console.log(content)
  await close()
}
run()
