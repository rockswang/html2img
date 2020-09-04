const bunyan = require('bunyan')
const express = require('express')
const bodyParser = require('body-parser')
const puppeteer = require('puppeteer')
const css = require('css')
const cheerio = require('cheerio')

const log = bunyan.createLogger({ name: 'html2img', streams: [{ level: 'debug', stream: process.stdout }] })
// 是否不检测HTML内容
const NO_CHECK = process.argv.includes('--no-check')
// 服务端口
const PORT = 50002
// 请求体大小上限
const BODY_LIMIT = '4mb'
// 图片src允许的地址前缀。图片总体是安全的，但是外链图片的下载速度将显著影响渲染速度
const SAFE_PREFIX = [ // 允许base64及下列前缀的外部图片
  'data:image/',
  'https://cdn\\.jsdelivr\\.net/gh/' // jsdelivr有国内CDN，速度很快，因此可以把图片提交到github作为图床，通过jsdelivr获取
]
const safePrefix = new RegExp('^(' + SAFE_PREFIX.join('|') + ')')

const app = express()

app.use(bodyParser.text({ type: 'text/*', limit: BODY_LIMIT }))
app.post('/', async (req, res) => {
  const { type = 'png', encoding = 'binary' } = req.query
  const text = req.body
  log.debug({ text }, '请求')
  const err = !NO_CHECK && checkHtml(text)
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

app.listen(PORT, function () {
  log.info(`HTML2IMG服务开始监听${PORT}端口`)
})

function checkHtml (html) {
  try {
    const $ = cheerio.load(html)
    if ($('script').length) throw new Error('不能包含任何脚本元素')
    if ($('link').length) throw new Error('不能包含任何外链资源')
    if ($('iframe').length || $('frame').length) throw new Error('不能包含frame/iframe')
    for (const src of Array.from($('img')).map(n => $(n).attr('src'))) {
      if (!safePrefix.test(src)) throw new Error('不允许的外部图片链接')
    }
    let style = Array.from($('style')).map(s => $(s).html()).join('\n')
    if (!style.trim()) return
    style = css.parse(style).stylesheet.rules
    for (const r of style) {
      if (!r.declarations) continue
      for (const d of r.declarations) {
        if (!d.value || !/url\([^)]+\)/.test(d.value)) continue
        const mch = /url\(([^)]+)\)/.exec(d.value)
        const url = ['"', "'"].includes(mch[1].charAt(0)) ? mch[1].slice(1, -1) : mch[1]
        if (!safePrefix.test(url)) throw new Error('style元素中包含不允许的外部资源')
      }
    }
  } catch (e) {
    return e.message
  }
}

let browser
const pages = []

async function newHtml (html, type, encoding) {
  let idx = pages.findIndex(p => p.idle)
  if (idx < 0) {
    idx = pages.length
    const pg = await browser.newPage()
    pg.__id__ = '' + Date.now() + (100 + ~~(Math.random() * 900))
    pages.push(pg)
  }
  const page = pages[idx]
  page.idle = false
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
  log.info({ html, type, encoding, error }, `在页面#${page.__id__}执行，耗时${Date.now() - tm}ms`)
  page.idle = Date.now()
  return res
}

;(async () => {
  const tm = Date.now()
  browser = await puppeteer.launch({
    // headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 4000, height: 6000 }
  })
  setInterval(() => { // 检查空闲过久的页面并关闭，以节省内存
    for (var i = pages.length; --i >= 0;) {
      const p = pages[i]
      if (!p.idle) return
      const life = Date.now() - p.idle
      if (life > 300000) {
        log.info(`页面#${p.__id__}已经超过${life}ms没有任务了，关闭该页面`)
        p.close()
        pages.splice(i, 1)
      }
    }
  }, 60000)
  log.info(`启动无头浏览器，耗时${Date.now() - tm}ms`)
  process.on('exit', () => {
    log.info('关闭浏览器')
    browser.close()
  })
})()
