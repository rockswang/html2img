const bunyan = require('bunyan')
const express = require('express')
const bodyParser = require('body-parser')
const puppeteer = require('puppeteer')
const css = require('css')
const cheerio = require('cheerio')

const log = bunyan.createLogger({ name: 'html2img', streams: [{ level: 'debug', stream: process.stdout }] })

const noCheck = process.argv.includes('--no-check')

const app = express()

app.use(bodyParser.text({ type: 'text/*', limit: '4mb' }))
app.post('/', async (req, res) => {
  const { type = 'png', encoding = 'binary', __NO_CHECK__ = 0 } = req.query
  const text = req.body
  log.debug({ text }, '请求')
  const err = !noCheck && !__NO_CHECK__ && checkHtml(text)
  if (err) return res.status(400).send(err)
  const img = await newHtml(text, type, encoding).catch(e => e)
  if (img instanceof Error) {
    return res.status(500).send(img.message + '\n' + img.stack)
  }
  if (img instanceof Buffer) {
    return res.type(type).send(img)
  }
  res.type('text/plain').send(`data:image/${type};base64,` + img)
})

app.listen(50002, function () {
  log.info('HTML2IMG服务开始监听50002端口')
})

function checkHtml (html) {
  try {
    const $ = cheerio.load(html)
    if ($('script').length) throw new Error('不能包含任何脚本元素')
    if ($('link').length) throw new Error('不能包含任何外链资源')
    if ($('iframe').length || $('frame').length) throw new Error('不能包含frame/iframe')
    if (Array.from($('img')).map(n => $(n).attr('src')).find(src => !/^data:image/.test(src))) throw new Error('不能包含任何外部图片')
    let style = Array.from($('style')).map(s => $(s).html()).join('\n')
    if (!style.trim()) return
    style = css.parse(style).stylesheet.rules
    for (const r of style) {
      if (!r.declarations) continue
      for (const d of r.declarations) {
        if (d.value && /http(s)?:\/\//.test(d.value)) throw new Error('style元素中不能包含任何外链资源')
      }
    }
  } catch (e) {
    return e.message
  }
}

let browser
const pages = []

async function newHtml (html, type, encoding) {
  let id = pages.findIndex(p => !p.busy)
  if (id < 0) {
    id = pages.length
    pages.push(await browser.newPage())
  }
  const page = pages[id]
  page.busy = true
  const tm = Date.now()
  let error, res
  try {
    await page.setContent(`<html><body style="width:4000px;overflow:scroll"><div id="__html2img_container__" style="display:inline-block">${html}</div></body></html>`)
    const clip = await page.evaluate(() => {
      const element = document.querySelector('#__html2img_container__')
      const { x, y, width, height } = element.getBoundingClientRect()
      return { x, y, width, height }
    })
    const opt = { clip, type, encoding }
    if (type === 'jpeg') opt.quality = 80
    if (type === 'png') opt.omitBackground = true
    res = await page.screenshot(opt)
  } catch (e) {
    error = e
  }
  log.info({ html, type, encoding, error }, `在页面#${id}执行，耗时${Date.now() - tm}ms`)
  page.busy = false
  return res
}

;(async () => {
  const tm = Date.now()
  browser = await puppeteer.launch({
    // headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 4000, height: 6000 }
  })
  log.info(`启动无头浏览器，耗时${Date.now() - tm}ms`)
  process.on('exit', () => {
    log.info('关闭浏览器')
    browser.close()
  })
})()
