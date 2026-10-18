<script setup>
import { computed } from 'vue'

const props = defineProps({
  // VNDB 语言代码，如 ja / zh-Hans / en / pt-br
  lang: {
    type: String,
    default: ''
  }
})

// VNDB 语言代码 → circle-flags 旗帜代码
const LANG_TO_FLAG = {
  ja: 'jp',
  en: 'gb',
  zh: 'cn',
  'zh-Hans': 'cn',
  'zh-Hant': 'tw',
  ko: 'kr',
  ru: 'ru',
  fr: 'fr',
  de: 'de',
  it: 'it',
  es: 'es',
  pt: 'pt',
  'pt-br': 'br',
  'pt-pt': 'pt',
  vi: 'vn',
  ar: 'sa',
  hi: 'in',
  th: 'th',
  pl: 'pl',
  cs: 'cz',
  hu: 'hu',
  da: 'dk',
  fi: 'fi',
  sv: 'se',
  no: 'no',
  el: 'gr',
  tr: 'tr',
  uk: 'ua',
  bg: 'bg',
  ca: 'es-ct',
  id: 'id',
  ms: 'my',
  tl: 'ph',
  ro: 'ro',
  nl: 'nl',
  la: 'va',
  eo: 'un',
  he: 'il',
  hr: 'hr',
  sr: 'rs',
  sk: 'sk',
  sl: 'si',
  lt: 'lt',
  lv: 'lv',
  et: 'ee',
  be: 'by',
  bs: 'ba',
  mk: 'mk',
  sq: 'al',
  ka: 'ge',
  hy: 'am',
  az: 'az',
  uz: 'uz',
  mn: 'mn',
  kk: 'kz',
  fa: 'ir',
  ur: 'pk',
  ne: 'np',
  ta: 'in',
  gd: 'gb-sct',
  eu: 'es-pv',
  gl: 'es-ga',
  is: 'is',
  ga: 'ie',
  cy: 'gb'
}

// 打包时把旗帜 SVG 内联（单文件约 0.5KB，全部走 data URI，不产生额外请求）
const flagModules = import.meta.glob('../assets/flags/*.svg', {
  eager: true,
  query: '?url',
  import: 'default'
})

const flagUrlByCode = {}
for (const [path, url] of Object.entries(flagModules)) {
  const code = path.split('/').pop().replace(/\.svg$/, '')
  flagUrlByCode[code] = url
}

const flagCode = computed(() => {
  const raw = (props.lang || '').trim()
  if (!raw) return ''
  return LANG_TO_FLAG[raw] || (flagUrlByCode[raw.toLowerCase()] ? raw.toLowerCase() : '')
})

const flagUrl = computed(() => flagUrlByCode[flagCode.value] || '')
</script>

<template>
  <img
    v-if="flagUrl"
    :src="flagUrl"
    :alt="lang"
    class="inline-block shrink-0 rounded-full object-cover ring-1 ring-black/10 dark:ring-white/15"
    loading="lazy"
  />
</template>
