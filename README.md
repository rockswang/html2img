# HTML2IMG
Use puppeteer driven Headless Chrome to generate images for arbitary HTML<br/>

使用puppeteer驱动Chrome无头浏览器将任意HTML内容渲染成图片

### 调用方法:
* 默认接口地址：`http://yourhost:50002`
* 必须使用POST方法
* 请求体中直接包含HTML文本
* Content-Type可以是text/plain或者text/html
* 接口URL后面可以添加下面的可选参数

### 可选参数:
|参数名|可选值|说明|
----|----|----|
|type|png/jpeg，默认png|图片格式:。<br/>* PNG支持透明半透明<br/>* JPEG体积更小
|encoding|binary/base64，默认binary|编码格式。注意：<br/>* base64方式前面有base64类型头，形如`data:image/png;base64,...`

### 构建说明:
* 因为puppeteer中包含一个完整的Chromium浏览器（100多M），请务必使用cnpm或淘宝镜像安装模块
* bunyan是本项目使用的日志模块，其构建需要node-gyp，如果构建不成功，可以去除依赖并自行替换log.xxx为console.log即可

### 调用方法举例:
```shell
curl "http://localhost:50002/" -H "Content-Type: text/html" --data-binary "<html><style>#b{font:bold 60px 微软雅黑;line-height:60px;display:inline-block;background-color:black;padding:.2em .3em .2em .2em}#b div{display:inline-block;padding:.1em}#t1{color:white}#t2{margin-left:0.2em;color:black;background-color:orange;border-radius:.1em}</style><body><div id='b'><div id='t1'>搞点</div><div id='t2'>黄色</div></div></body></html>" --output aaa.png
``` 

### 其它说明
* 安全考虑，HTML中不能包含任何script元素，不能包含任何外部链接，包括`<link>`，`<img>`以及`<style>`元素中的背景等
* 建议使用base64方式将图片编码在HTML正文中
* 因为直接使用真实浏览器渲染，可以使用SVG等高级特性
* 关于Linux平台上的中文字体，请参见我的以下两篇文章在Linux平台上安装puppeteer + Chromium + 中文字体支持
  * [CentOS7最简puppeteer安装备忘](https://segmentfault.com/a/1190000020920596)
  * [Ubuntu18最简puppeteer安装备忘](https://segmentfault.com/a/1190000022305046)
* 关于Emoji表情符支持，可以安装Google的[Noto Emoji字体](https://www.google.com/get/noto/)，查找emoji即可。有彩色和单色两种，请根据需求安装

### 关于性能
* 本项目预先启动一个无头浏览器在后台随时待命
* 每次来新请求，使用池机制在现成页面上渲染HTML内容
* 经测试，主要性能瓶颈在抓图步骤，这个跟运行平台有关，Windows尚可，Linux极佳；据说在MacOS上比较慢
* 在Windows10（小米Pro笔记本） > 5FPS
* Ubuntu18（腾讯云1核2G屌丝配置）> 15FPS