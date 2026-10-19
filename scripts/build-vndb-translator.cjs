// 生成 public/vndb-translator.js —— 内置浏览器用的 VNDB 中文化脚本
//
// 来源：
//   /tmp/lib2.js                        VNDBTranslatorLib_.js v5.0.0（311592 B，字典 + 规则）
//   VNDB优先原文和中文化.js             v5.0.1（840 行，业务逻辑）
//
// 处理：
//   - 去掉两边的 UserScript 元数据块（@require 已内联，不能再让 Tampermonkey 解析）
//   - 拼接进同一个 IIFE，让 lib 的 `let mainMap/titleMap/specialMap/otherPageRules`
//     与 userscript 的函数共享作用域，同时避免重复注入时 `let` 重复声明报错
//   - 加安装标记，同一个页面上下文只跑一次
//   - 补 GM_* 的空实现（userscript 里只在 开发者模式=true 时才用到，默认关闭）
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

function stripMeta(src) {
  const lines = src.split(/\r?\n/)
  let inMeta = false
  const out = []
  for (const line of lines) {
    if (/^\s*\/\/\s*==UserScript==/.test(line)) { inMeta = true; continue }
    if (/^\s*\/\/\s*==\/UserScript==/.test(line)) { inMeta = false; continue }
    if (inMeta) continue
    out.push(line)
  }
  return out.join('\n')
}

const lib = stripMeta(fs.readFileSync(path.join(ROOT, 'scripts', 'vendor', 'VNDBTranslatorLib.user.js'), 'utf8'))
const userscript = stripMeta(fs.readFileSync(path.join(ROOT, 'VNDB优先原文和中文化.js'), 'utf8'))

// 版本号直接从源脚本的 UserScript 头里读，避免 banner 写死后过期
function readVersion(file) {
  const head = fs.readFileSync(file, 'utf8').slice(0, 4000)
  const m = head.match(/@version\s+([^\s]+)/)
  return m ? m[1] : 'unknown'
}
const libVersion = readVersion(path.join(ROOT, 'scripts', 'vendor', 'VNDBTranslatorLib.user.js'))
const usVersion = readVersion(path.join(ROOT, 'VNDB优先原文和中文化.js'))

const shims = `
// GM_* 空实现（userscript 仅在 开发者模式=true 时调用，默认关闭）
if (typeof GM_getValue === 'undefined') {
  window.GM_getValue = function () { return null }
  window.GM_setValue = function () {}
  window.GM_deleteValue = function () {}
}
`

const banner = `/* VNDB 中文化（VNDB优先原文和中文化 v${usVersion} + VNDBTranslatorLib v${libVersion}）
 * 由 scripts/build-vndb-translator.cjs 生成，请勿手工编辑。
 */`

const output = `${banner}
if (!window.__vndbTranslatorInstalled) {
  window.__vndbTranslatorInstalled = true;
  try {
    (function () {
${shims}
${lib}
${userscript}
    })();
  } catch (e) {
    console.error('[vndb-translator] init failed', e);
    window.__vndbTranslatorInstalled = false;
  }
}
`

const dest = path.join(ROOT, 'public', 'vndb-translator.js')
fs.mkdirSync(path.dirname(dest), { recursive: true })
fs.writeFileSync(dest, output, 'utf8')
console.log(`wrote ${dest} (${Buffer.byteLength(output, 'utf8')} bytes)`)
