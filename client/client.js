/**
 * dsh-approval-notifier / browser half — 「哨兵 / Sentinel」2.0.
 *
 * Standard DSH bundle browser half (plain JS, no build step):
 *
 *  1. Reminder cards: one compact card per pending confirmation of ANY
 *     session/workspace, popped in one by one at the bottom-right corner.
 *     Clicking 去处理 removes that card immediately, jumps to its session and
 *     shows "提示有效，正在处理" in the lower-left sidebar area (5s, then fade).
 *  2. Nothing leaves the Harness: no Notification/OS popups at all.
 *  3. Per-entry 30s escalation (own card grows, own sound gets louder/urgent).
 *  4. "Second reminder": after 去处理, if the user does nothing at all for 10s
 *     (no pointer/scroll/key activity since the click) the same reminder is
 *     re-shown marked 「二次提醒」. Any activity counts as reading, so it stays
 *     quiet. This is separate from the 30s escalation.
 *  5. Settings live on the Plugins page: the browser half registers a
 *     `plugins.bundle.config` page keyed by the bundle package name and reads /
 *     writes the official Host settings through `ctx.configForms`.
 *
 * The plugin ONLY reminds. It never answers an approval or a question.
 */
window.__ModuleLoader__.load({
  id: 'dsh-approval-notifier',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    let React
    try {
      React = require('react')
    } catch {
      React = undefined
    }

    const PENDING_ROUTE = 'dsh-approval-notifier/pending'
    const ACK_ROUTE = 'dsh-approval-notifier/ack'
    const ASSETS_ROUTE = 'dsh-approval-notifier/assets'
    const ASSET_ROUTE_PREFIX = 'dsh-approval-notifier/asset/'
    const SETTINGS_NAMESPACE = 'dsh-approval-notifier'
    const PACKAGE_NAME = 'dsh-approval-notifier'
    const GLOBAL_GUARD = '__DSH_SENTINEL_V3__'
    const STYLE_ID = 'dsh-approval-notifier-style-v3'
    const STACK_ID = 'dsh-approval-notifier-stack-v3'
    const TOAST_ID = 'dsh-approval-notifier-toast-v3'
    const TOAST_VISIBLE_MS = 5000
    const TOAST_FADE_MS = 300
    /** DOM ids used by older Sentinel versions; removed on boot so no stale UI stays on the page. */
    const LEGACY_IDS = [
      'dsh-approval-notifier-style',
      'dsh-approval-notifier-stack',
      'dsh-approval-notifier-toast',
      'dsh-approval-notifier-launcher',
      'dsh-approval-notifier-settings',
      'dsh-approval-notifier-modal',
      'dsh-approval-notifier-panel',
      'dsh-approval-notifier-badge',
    ]

    const DEFAULTS = {
      brand: '哨兵',
      animationPreset: 'toast-up',
      animationStaggerMs: 700,
      customImageKind: 'none',
      customImageUrl: '',
      customImageAssetId: '',
      soundPreset: 'chime',
      soundVolume: 0.6,
      customSoundKind: 'none',
      customSoundUrl: '',
      customSoundAssetId: '',
      escalationEnabled: true,
      escalationIntervalMs: 30000,
      escalationMaxStages: 5,
      escalationScaleStep: 0.06,
      escalationScaleMax: 0.3,
      escalationVolumeStep: 0.12,
      escalationSoundPreset: 'urgent-alarm',
      customEscalationSoundKind: 'none',
      customEscalationSoundUrl: '',
      customEscalationSoundAssetId: '',
      titleFlash: true,
      secondReminderEnabled: true,
      secondReminderIdleMs: 10000,
      testReminderIntervalMs: 3000,
    }

    const FIELDS = {
      brand: '提醒品牌名',
      animationPreset: '弹出动画',
      animationStaggerMs: '逐条间隔(ms)',
      customImageKind: '自定义动画图片类型',
      customImageUrl: '自定义动画图片网址',
      customImageAssetId: '自定义动画图片素材',
      soundPreset: '首次提示音',
      soundVolume: '提示音量',
      customSoundKind: '自定义提示音类型',
      customSoundUrl: '自定义提示音网址',
      customSoundAssetId: '自定义提示音素材',
      escalationEnabled: '分级升级开关',
      escalationIntervalMs: '升级间隔(ms)',
      escalationMaxStages: '最大级数',
      escalationScaleStep: '每级放大比例',
      escalationScaleMax: '最大放大比例',
      escalationVolumeStep: '每级音量增量',
      escalationSoundPreset: '升级提示音',
      customEscalationSoundKind: '自定义升级音类型',
      customEscalationSoundUrl: '自定义升级音网址',
      customEscalationSoundAssetId: '自定义升级音素材',
      titleFlash: '标题闪烁',
      secondReminderEnabled: '二次提醒开关',
      secondReminderIdleMs: '二次提醒空闲(ms)',
      testReminderIntervalMs: '测试提醒间隔(ms)',
    }

    const ANIMATION_LABELS = {
      'toast-up': '向上弹出',
      'slide-right': '右侧滑入',
      'fade-up': '淡入上浮',
      bounce: '弹跳',
      flip: '翻牌',
      zoom: '缩放',
      none: '无动画',
    }
    const SOUND_LABELS = {
      chime: '叮咚',
      classic: '经典',
      soft: '柔和',
      urgent: '短促',
      mechanical: '机械',
      none: '静音',
    }
    const ESCALATION_SOUND_LABELS = {
      'urgent-alarm': '急促警报',
      'rapid-beeps': '快速连响',
      'chime-double': '双响铃',
      none: '静音',
    }

    const PRESET_TONES = {
      chime: [
        { f: 880, d: 0.16, g: 0.5, type: 'sine' },
        { f: 660, d: 0.22, g: 0.45, type: 'sine', delay: 0.18 },
      ],
      classic: [
        { f: 1046, d: 0.18, g: 0.45, type: 'sine' },
        { f: 784, d: 0.24, g: 0.4, type: 'sine', delay: 0.2 },
      ],
      soft: [{ f: 523, d: 0.5, g: 0.25, type: 'sine' }],
      urgent: [
        { f: 988, d: 0.09, g: 0.55, type: 'square' },
        { f: 1319, d: 0.09, g: 0.5, type: 'square', delay: 0.13 },
        { f: 988, d: 0.09, g: 0.55, type: 'square', delay: 0.26 },
      ],
      mechanical: [
        { f: 440, d: 0.05, g: 0.4, type: 'square' },
        { f: 660, d: 0.05, g: 0.4, type: 'square', delay: 0.09 },
        { f: 440, d: 0.05, g: 0.4, type: 'square', delay: 0.18 },
      ],
      'urgent-alarm': [
        { f: 1175, d: 0.12, g: 0.7, type: 'sawtooth' },
        { f: 880, d: 0.12, g: 0.7, type: 'sawtooth', delay: 0.16 },
        { f: 1175, d: 0.12, g: 0.75, type: 'sawtooth', delay: 0.32 },
        { f: 880, d: 0.12, g: 0.75, type: 'sawtooth', delay: 0.48 },
        { f: 1568, d: 0.2, g: 0.85, type: 'sawtooth', delay: 0.64 },
      ],
      'rapid-beeps': [
        { f: 1200, d: 0.06, g: 0.6, type: 'square' },
        { f: 1280, d: 0.06, g: 0.62, type: 'square', delay: 0.1 },
        { f: 1360, d: 0.06, g: 0.64, type: 'square', delay: 0.2 },
        { f: 1440, d: 0.06, g: 0.66, type: 'square', delay: 0.3 },
        { f: 1520, d: 0.12, g: 0.7, type: 'square', delay: 0.4 },
      ],
      'chime-double': [
        { f: 1046, d: 0.14, g: 0.5, type: 'sine' },
        { f: 1046, d: 0.14, g: 0.5, type: 'sine', delay: 0.2 },
      ],
    }

    function safe(run, fallback) {
      try {
        return run()
      } catch (_error) {
        return fallback
      }
    }

    function isRecord(value) {
      return typeof value === 'object' && value !== null && !Array.isArray(value)
    }

    function asText(value) {
      return typeof value === 'string' ? value : ''
    }

    function clip(value, limit) {
      const raw = asText(value).replace(/\s+/gu, ' ').trim()
      return raw.length <= limit ? raw : `${raw.slice(0, Math.max(1, limit - 1))}…`
    }

    function baseName(path) {
      const value = asText(path).replace(/[\\/]+$/u, '')
      const index = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'))
      return index >= 0 ? value.slice(index + 1) : value
    }

    function assetUrlOf(kind, assetId, url) {
      if (kind === 'asset' && /^[a-f0-9]{12}$/u.test(asText(assetId))) return `${ASSET_ROUTE_PREFIX}${asText(assetId)}`
      if (kind === 'url' && /^https?:\/\//iu.test(asText(url))) return asText(url)
      return ''
    }

    function normalizeSettings(raw) {
      const merged = { ...DEFAULTS }
      if (isRecord(raw)) {
        if (typeof raw.brand === 'string' && raw.brand.trim().length > 0) merged.brand = raw.brand.trim().slice(0, 24)
        if (isRecord(raw.animation)) {
          if (Object.hasOwn(ANIMATION_LABELS, raw.animation.preset)) merged.animationPreset = raw.animation.preset
          if (Number.isFinite(raw.animation.staggerMs)) merged.animationStaggerMs = Math.max(0, Math.min(2000, Math.trunc(raw.animation.staggerMs)))
          const image = isRecord(raw.animation.customImage) ? raw.animation.customImage : {}
          if (['none', 'url', 'asset'].includes(image.kind)) merged.customImageKind = image.kind
          merged.customImageUrl = asText(image.url)
          merged.customImageAssetId = asText(image.assetId)
        }
        if (isRecord(raw.sound)) {
          if (Object.hasOwn(SOUND_LABELS, raw.sound.preset)) merged.soundPreset = raw.sound.preset
          if (Number.isFinite(raw.sound.volume)) merged.soundVolume = Math.max(0, Math.min(1, raw.sound.volume))
          const custom = isRecord(raw.sound.custom) ? raw.sound.custom : {}
          if (['none', 'url', 'asset'].includes(custom.kind)) merged.customSoundKind = custom.kind
          merged.customSoundUrl = asText(custom.url)
          merged.customSoundAssetId = asText(custom.assetId)
        }
        if (isRecord(raw.escalation)) {
          if (typeof raw.escalation.enabled === 'boolean') merged.escalationEnabled = raw.escalation.enabled
          if (Number.isFinite(raw.escalation.intervalMs)) merged.escalationIntervalMs = Math.max(10000, Math.min(300000, Math.trunc(raw.escalation.intervalMs)))
          if (Number.isFinite(raw.escalation.maxStages)) merged.escalationMaxStages = Math.max(1, Math.min(10, Math.trunc(raw.escalation.maxStages)))
          if (Number.isFinite(raw.escalation.scaleStep)) merged.escalationScaleStep = Math.max(0, Math.min(0.2, raw.escalation.scaleStep))
          if (Number.isFinite(raw.escalation.scaleMax)) merged.escalationScaleMax = Math.max(0, Math.min(0.6, raw.escalation.scaleMax))
          if (Number.isFinite(raw.escalation.volumeStep)) merged.escalationVolumeStep = Math.max(0, Math.min(0.5, raw.escalation.volumeStep))
          const sound = isRecord(raw.escalation.sound) ? raw.escalation.sound : {}
          if (Object.hasOwn(ESCALATION_SOUND_LABELS, sound.preset)) merged.escalationSoundPreset = sound.preset
          const custom = isRecord(sound.custom) ? sound.custom : {}
          if (['none', 'url', 'asset'].includes(custom.kind)) merged.customEscalationSoundKind = custom.kind
          merged.customEscalationSoundUrl = asText(custom.url)
          merged.customEscalationSoundAssetId = asText(custom.assetId)
        }
        if (typeof raw.titleFlash === 'boolean') merged.titleFlash = raw.titleFlash
        if (isRecord(raw.secondReminder)) {
          if (typeof raw.secondReminder.enabled === 'boolean') merged.secondReminderEnabled = raw.secondReminder.enabled
          if (Number.isFinite(raw.secondReminder.idleMs)) merged.secondReminderIdleMs = Math.max(3000, Math.min(120000, Math.trunc(raw.secondReminder.idleMs)))
        }
        if (Number.isFinite(raw.testReminderIntervalMs)) merged.testReminderIntervalMs = Math.max(1000, Math.min(30000, Math.trunc(raw.testReminderIntervalMs)))
      }
      return merged
    }

    function settingsFromSnapshot(value) {
      if (!isRecord(value)) return { ...DEFAULTS }
      return normalizeSettings({
        brand: value.brand,
        animation: {
          preset: value.animationPreset,
          staggerMs: value.animationStaggerMs,
          customImage: { kind: value.customImageKind, url: value.customImageUrl, assetId: value.customImageAssetId },
        },
        sound: {
          preset: value.soundPreset,
          volume: value.soundVolume,
          custom: { kind: value.customSoundKind, url: value.customSoundUrl, assetId: value.customSoundAssetId },
        },
        escalation: {
          enabled: value.escalationEnabled,
          intervalMs: value.escalationIntervalMs,
          maxStages: value.escalationMaxStages,
          scaleStep: value.escalationScaleStep,
          scaleMax: value.escalationScaleMax,
          volumeStep: value.escalationVolumeStep,
          sound: {
            preset: value.escalationSoundPreset,
            custom: { kind: value.customEscalationSoundKind, url: value.customEscalationSoundUrl, assetId: value.customEscalationSoundAssetId },
          },
        },
        titleFlash: value.titleFlash,
        secondReminder: { enabled: value.secondReminderEnabled, idleMs: value.secondReminderIdleMs },
        testReminderIntervalMs: value.testReminderIntervalMs,
      })
    }

    function flatFromSettings(settings) {
      return {
        brand: settings.brand,
        animationPreset: settings.animationPreset,
        animationStaggerMs: settings.animationStaggerMs,
        customImageKind: settings.customImageKind,
        customImageUrl: settings.customImageUrl,
        customImageAssetId: settings.customImageAssetId,
        soundPreset: settings.soundPreset,
        soundVolume: settings.soundVolume,
        customSoundKind: settings.customSoundKind,
        customSoundUrl: settings.customSoundUrl,
        customSoundAssetId: settings.customSoundAssetId,
        escalationEnabled: settings.escalationEnabled,
        escalationIntervalMs: settings.escalationIntervalMs,
        escalationMaxStages: settings.escalationMaxStages,
        escalationScaleStep: settings.escalationScaleStep,
        escalationScaleMax: settings.escalationScaleMax,
        escalationVolumeStep: settings.escalationVolumeStep,
        escalationSoundPreset: settings.escalationSoundPreset,
        customEscalationSoundKind: settings.customEscalationSoundKind,
        customEscalationSoundUrl: settings.customEscalationSoundUrl,
        customEscalationSoundAssetId: settings.customEscalationSoundAssetId,
        titleFlash: settings.titleFlash,
        secondReminderEnabled: settings.secondReminderEnabled,
        secondReminderIdleMs: settings.secondReminderIdleMs,
        testReminderIntervalMs: settings.testReminderIntervalMs,
      }
    }

    /** One DOM element helper. */
    function el(tag, props, children) {
      const node = document.createElement(tag)
      if (isRecord(props)) {
        for (const [key, value] of Object.entries(props)) {
          if (value === undefined || value === null) continue
          if (key === 'class') node.className = String(value)
          else if (key === 'id') node.id = String(value)
          else if (key === 'style') node.style.cssText = String(value)
          else if (key === 'text') node.textContent = String(value)
          else if (key === 'on' && isRecord(value)) for (const [event, handler] of Object.entries(value)) if (typeof handler === 'function') node.addEventListener(event, handler)
          else if (key === 'attrs' && isRecord(value)) for (const [name, attrValue] of Object.entries(value)) if (attrValue !== null && attrValue !== undefined) node.setAttribute(name, String(attrValue))
          else if (key.startsWith('data-')) node.setAttribute(key, String(value))
        }
      }
      for (const child of children ?? []) {
        if (child === null || child === undefined || child === false) continue
        node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child)
      }
      return node
    }

    const BUILTIN_STYLE = `
@keyframes an-toast-up{from{opacity:0;transform:translateY(28px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes an-slide-right{from{opacity:0;transform:translateX(48vw) scale(.97)}to{opacity:1;transform:translateX(0) scale(1)}}
@keyframes an-fade-up{from{opacity:0;transform:translateY(22px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes an-bounce{0%{opacity:0;transform:translateY(32px) scale(.92)}55%{opacity:1;transform:translateY(-5px) scale(1.02)}80%{transform:translateY(2px) scale(.997)}100%{transform:translateY(0) scale(1)}}
@keyframes an-flip{from{opacity:0;transform:perspective(700px) rotateX(-70deg);transform-origin:bottom}to{opacity:1;transform:perspective(700px) rotateX(0);transform-origin:bottom}}
@keyframes an-zoom{from{opacity:0;transform:scale(.55)}to{opacity:1;transform:scale(1)}}
@keyframes an-leave{to{opacity:0;transform:translateY(10px) scale(.98)}}
@keyframes an-second-glow{0%,100%{background:rgba(255,74,58,.14);border-color:rgba(255,84,64,.5)}50%{background:rgba(255,74,58,.38);border-color:rgba(255,120,100,.95)}}
#${STACK_ID}{position:fixed;right:16px;bottom:16px;left:auto;top:auto;z-index:2147483600;display:flex;flex-direction:column;justify-content:flex-end;gap:8px;width:380px;max-width:calc(100vw - 24px);max-height:calc(100vh - 32px);overflow-y:auto;overflow-x:hidden;pointer-events:none;box-sizing:border-box;padding:0;font:13px/18px system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif}
#${STACK_ID}::-webkit-scrollbar{width:6px}
#${STACK_ID}::-webkit-scrollbar-thumb{background:rgba(255,159,67,.35);border-radius:3px}
.an-shell{pointer-events:none;width:100%;transition:transform .4s cubic-bezier(.2,.8,.2,1);transform:scale(var(--an-scale,1));transform-origin:bottom right}
.an-card{position:relative;display:flex;flex-direction:column;gap:6px;width:100%;box-sizing:border-box;pointer-events:none;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,164,64,.5);background:rgba(30,24,18,.94);color:#f6efe4;box-shadow:0 10px 28px rgba(0,0,0,.42)}
.an-card[data-stage="1"]{border-color:rgba(255,140,40,.72)}
.an-card[data-stage="2"]{border-color:rgba(255,110,30,.9)}
.an-card[data-stage="3"]{border-color:#ff5a1f;box-shadow:0 10px 32px rgba(255,90,31,.25)}
.an-card[data-stage="4"],.an-card[data-stage="5"]{border-color:#ff3d13;box-shadow:0 12px 36px rgba(255,61,19,.3)}
/* Second reminder is deliberately different from the first reminder (and from escalation): red card + explicit banner. */
.an-card[data-second="1"]{border-color:rgba(255,84,64,.9);border-left:4px solid #ff4a3a;background:linear-gradient(180deg,rgba(62,24,19,.98),rgba(40,20,16,.98));box-shadow:0 12px 34px rgba(255,74,58,.32)}
.an-card[data-second="1"] .an-head{color:#ffd3c7}
.an-card[data-second="1"] .an-dot{background:#ff5a4d;box-shadow:0 0 9px rgba(255,90,77,.95)}
.an-second-banner{display:flex;align-items:center;gap:6px;padding:4px 8px;border-radius:7px;border:1px solid rgba(255,84,64,.6);background:rgba(255,74,58,.16);color:#ffd9cf;font:700 12px/16px system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;letter-spacing:.3px;animation:an-second-glow 1.1s ease-in-out 2}
.an-card[data-second="1"] .an-headline{color:#ffd9cf}
.an-card[data-second="1"] .an-detail{color:#ffe2d8}
/* Escalated cards grow as a whole: text and box scale together, and the detail
   text is allowed more lines so nothing is clipped while the card is enlarged. */
.an-shell[data-stage="1"] .an-detail,.an-shell[data-stage="2"] .an-detail,.an-shell[data-stage="3"] .an-detail,.an-shell[data-stage="4"] .an-detail,.an-shell[data-stage="5"] .an-detail{-webkit-line-clamp:6}
.an-card[data-second="1"] .an-chip.an-second{color:#ffd9cf;border-color:rgba(255,84,64,.7);background:rgba(255,74,58,.2);font-weight:700}
.an-card[data-second="1"] .an-btn-primary{background:#ff6a4d;color:#2a1410}
.an-card[data-second="1"] .an-btn-primary:hover{background:#ff8168}
.an-card.an-arriving{animation-fill-mode:both;animation-duration:.34s;animation-timing-function:cubic-bezier(.2,.85,.25,1)}
.an-card[data-anim="toast-up"].an-arriving{animation-name:an-toast-up}
.an-card[data-anim="slide-right"].an-arriving{animation-name:an-slide-right}
.an-card[data-anim="fade-up"].an-arriving{animation-name:an-fade-up}
.an-card[data-anim="bounce"].an-arriving{animation-name:an-bounce}
.an-card[data-anim="flip"].an-arriving{animation-name:an-flip}
.an-card[data-anim="zoom"].an-arriving{animation-name:an-zoom}
.an-shell.an-leaving{animation:an-leave .18s ease-in forwards;pointer-events:none}
.an-thumb{display:block;width:100%;max-height:56px;object-fit:cover;border-radius:7px;background:rgba(255,255,255,.05)}
.an-head{display:flex;align-items:center;gap:7px;font-weight:600;font-size:13px;color:#ffe0b3}
.an-dot{width:7px;height:7px;border-radius:50%;background:#ff9f43;box-shadow:0 0 7px rgba(255,159,67,.8);flex:none}
.an-headline{flex:1;min-width:0;word-break:break-word}
.an-chip{font-size:10px;line-height:14px;padding:0 5px;border-radius:5px;border:1px solid rgba(255,159,67,.35);background:rgba(255,159,67,.13);color:#ffb86b;white-space:nowrap}
.an-chip.an-second{color:#ffd08a;border-color:rgba(255,208,138,.55);background:rgba(255,208,138,.16);font-weight:600}
.an-chip.an-upgraded{color:#ff8a4d;border-color:rgba(255,138,77,.45);background:rgba(255,138,77,.12)}
.an-detail{font-size:12px;line-height:17px;color:#d9cdbd;word-break:break-word;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.an-meta{display:flex;gap:6px;align-items:center;font-size:11px;line-height:15px;color:#9c9083;flex-wrap:wrap}
.an-meta span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.an-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:1px}
.an-btn{pointer-events:auto;cursor:pointer;border-radius:7px;padding:4px 11px;font:600 12px/16px system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif}
.an-btn-primary{border:none;background:#ff9f43;color:#231a10}
.an-btn-primary:hover{background:#ffb260}
.an-btn-ghost{border:1px solid rgba(255,255,255,.22);background:transparent;color:#cbbfae}
.an-btn-ghost:hover{color:#fff}
#${TOAST_ID}{position:fixed;left:12px;bottom:96px;z-index:2147483300;display:none;flex-direction:column;gap:3px;padding:9px 12px;border-radius:11px;border:1px solid rgba(84,200,120,.55);background:rgba(20,32,24,.96);color:#e8f6ec;box-shadow:0 8px 24px rgba(0,0,0,.4);font:13px/18px system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;pointer-events:none;max-width:330px;opacity:1;transition:opacity .3s ease}
#${TOAST_ID} .an-toast-title{font-weight:700;color:#8ee6a4;display:flex;align-items:center;gap:6px}
#${TOAST_ID} .an-toast-detail{font-size:12px;color:#b9d6c1;word-break:break-word}
.sentinel-settings{display:flex;flex-direction:column;gap:16px;max-width:760px;color:var(--dsw-alias-label-primary,#e8eaed);font:13px/19px system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif}
.sentinel-settings h3{margin:0 0 6px;font-size:13px;color:var(--dsw-alias-label-primary,#e8eaed);border-top:1px solid rgba(255,255,255,.08);padding-top:12px}
.sentinel-settings .sentinel-first h3{border-top:none;padding-top:0;margin-top:0}
.sentinel-hint{font-size:11px;color:var(--dsw-alias-label-tertiary,#8a93a3);line-height:1.55}
.sentinel-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:4px 0}
.sentinel-chips{display:flex;flex-wrap:wrap;gap:6px}
.sentinel-chip{border:1px solid rgba(255,255,255,.18);background:transparent;color:var(--dsw-alias-label-secondary,#b9c0cc);border-radius:7px;padding:3px 10px;cursor:pointer;font:12px/17px inherit}
.sentinel-chip[data-active="1"]{border-color:#ff9f43;background:rgba(255,159,67,.16);color:#ffc36b;font-weight:600}
.sentinel-input{flex:1;min-width:170px;background:rgba(0,0,0,.2);border:1px solid rgba(255,255,255,.18);border-radius:7px;color:inherit;padding:4px 8px;font:12px/17px inherit}
.sentinel-input[type="number"]{flex:none;width:96px;min-width:0}
.sentinel-input[type="range"]{min-width:120px}
.sentinel-btn{border-radius:7px;padding:4px 12px;cursor:pointer;font:600 12px/17px inherit;border:1px solid rgba(255,255,255,.2);background:transparent;color:var(--dsw-alias-label-secondary,#b9c0cc)}
.sentinel-btn.primary{border:none;background:#ff9f43;color:#231a10}
.sentinel-btn:hover{filter:brightness(1.08)}
.sentinel-status{font-size:12px;color:#8ee6a4;min-height:18px}
.sentinel-status.error{color:#ff9f7a}
.sentinel-preview{margin-top:6px;padding:10px;border:1px dashed rgba(255,159,67,.35);border-radius:9px;min-height:56px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.12)}
.sentinel-preview .an-card{width:100%;max-width:320px;pointer-events:none}
.sentinel-asset{border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:8px;margin-top:4px;display:flex;flex-direction:column;gap:6px}
.sentinel-asset img{max-height:52px;border-radius:6px;object-fit:cover}
.sentinel-asset audio{width:100%;height:28px}
`
    function ensureStyle() {
      if (document.getElementById(STYLE_ID) !== null) return
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.dataset.plugin = 'dsh-approval-notifier'
      style.textContent = BUILTIN_STYLE
      document.head.appendChild(style)
    }

    function apply(ctx) {
      if (typeof window === 'undefined' || typeof document === 'undefined') return
      const previous = window[GLOBAL_GUARD]
      if (previous !== undefined && previous !== null) safe(() => previous.dispose(), undefined)

      const state = {
        disposed: false,
        settings: { ...DEFAULTS },
        configRevision: '',
        hostRaw: new Map(),
        localRaw: new Map(),
        testEntries: new Map(),
        entries: new Map(),
        arrivalQueue: [],
        arrivalTimer: undefined,
        shakeTimer: undefined,
        batchSoundPlayed: false,
        lastBatchSoundAt: 0,
        escalationTimer: undefined,
        pollTimer: undefined,
        pollFailures: 0,
        hostOk: false,
        frame: undefined,
        nodes: new Map(),
        layer: undefined,
        highlight: undefined,
        hlCount: 0,
        renderScheduled: false,
        titleTimer: undefined,
        titleBase: undefined,
        audioCtx: undefined,
        audioEls: new Map(),
        stack: undefined,
        toast: undefined,
        toastTimer: undefined,
        toastHideTimer: undefined,
        toastVisible: false,
        testFast: false,
        testTimers: [],
        testCleanupTimer: undefined,
        lastActivityAt: Date.now(),
        settingsPageRegistered: false,
        configForm: undefined,
        lastDiag: 'boot',
      }

      const log = (...args) => safe(() => console.debug('[sentinel]', ...args), undefined)

      function sessionsSnapshot() {
        const list = safe(() => ctx.sessions.list, undefined)
        if (list === undefined || typeof list.getSnapshot !== 'function') return { ids: [], byId: {} }
        const snapshot = safe(() => list.getSnapshot(), undefined)
        return isRecord(snapshot) && isRecord(snapshot.byId) ? snapshot : { ids: [], byId: {} }
      }

      function workspaceLabel(sessionId, cwd) {
        const workspaces = safe(() => ctx.get('workspaces'), undefined)
        if (workspaces !== undefined && workspaces !== null && workspaces.list !== undefined) {
          const snapshot = safe(() => (typeof workspaces.list.getSnapshot === 'function' ? workspaces.list.getSnapshot() : undefined), undefined)
          const items = isRecord(snapshot) && Array.isArray(snapshot.items) ? snapshot.items : []
          for (const item of items) {
            if (!isRecord(item) || !Array.isArray(item.sessionIds)) continue
            if (item.sessionIds.indexOf(sessionId) === -1) continue
            const title = asText(item.title)
            if (title.length > 0) return title
          }
        }
        return baseName(cwd)
      }

      function sessionMeta(sessionId) {
        const byId = sessionsSnapshot().byId
        const row = byId[sessionId]
        const title = asText(isRecord(row) ? row.title : '') || asText(isRecord(row) ? row.displayTitle : '') || asText(sessionId) || '未知会话'
        const cwd = asText(isRecord(row) ? row.cwd : '')
        return { title, workspace: workspaceLabel(sessionId, cwd) }
      }

      function currentSessionId() {
        const uiSession = safe(() => ctx.uiSession, undefined)
        if (uiSession !== undefined && uiSession !== null) {
          const source = safe(() => uiSession.current, undefined)
          if (source !== undefined && source !== null && typeof source.getSnapshot === 'function') {
            const binding = safe(() => source.getSnapshot(), undefined)
            if (isRecord(binding) && typeof binding.key === 'string' && binding.key.length > 0) return binding.key
          }
        }
        const snapshot = sessionsSnapshot()
        for (const id of Array.isArray(snapshot.ids) ? snapshot.ids : []) {
          const row = snapshot.byId[id]
          if (isRecord(row) && isRecord(row.retainedBy) && (row.retainedBy.mainView ?? 0) > 0) return id
        }
        return undefined
      }

      function hasFocus() {
        return safe(() => (typeof document.hasFocus === 'function' ? document.hasFocus() : true), true) === true
      }

      // ── DOM: stack + toast ──────────────────────────────────────────────

      /** Remove any DOM left behind by older Sentinel versions (safe: ids are plugin-owned). */
      function purgeLegacyUi() {
        for (const id of LEGACY_IDS) {
          const node = document.getElementById(id)
          if (node !== null) safe(() => node.remove(), undefined)
        }
      }

      /** Measure the page (viewport) — the toast is anchored inside this box. */
      function viewportSize() {
        const visual = window.visualViewport
        const width = Math.round((visual !== null && visual !== undefined && visual.width > 0 ? visual.width : 0) || window.innerWidth || document.documentElement.clientWidth || 1024)
        const height = Math.round((visual !== null && visual !== undefined && visual.height > 0 ? visual.height : 0) || window.innerHeight || document.documentElement.clientHeight || 768)
        return { width, height }
      }

      /**
       * Find the native approval dialog's action buttons ("允许一次" etc.) so the
       * reminder cards can stay physically clear of them.
       */
      function approvalButtonRect() {
        const nodes = safe(() => [...document.querySelectorAll('button, [role="button"]')], [])
        let best
        for (const node of nodes) {
          const text = asText(node.textContent)
          if (!/允许一次|始终允许|允许|拒绝|不同意|同意/u.test(text)) continue
          const rect = safe(() => node.getBoundingClientRect(), undefined)
          if (rect === undefined || rect.width < 10 || rect.height < 10 || rect.top <= 0) continue
          if (best === undefined || rect.top > best.top) best = rect
        }
        return best
      }

      /**
       * Windows 11 style toast geometry: bottom-right corner of the page, growing
       * UPWARDS, never wider than a readable card and never taller than the page.
       * Width is derived from the measured page size instead of a fixed value.
       */
      function layout() {
        const stack = ensureStack()
        const toast = ensureToast()
        const { width: viewWidth, height: viewHeight } = viewportSize()
        const narrow = viewWidth < 560
        const gap = narrow ? 12 : 16
        const cardWidth = narrow
          ? Math.max(220, Math.min(viewWidth - 24 - 80, 380))
          : Math.max(300, Math.min(380, Math.round(viewWidth * 0.3)))
        // Escalation scales the whole card (text + box together). The stack is a
        // transparent track that leaves room on the left for that growth, so a
        // scaled card is never clipped and still sits against the right edge.
        const headroom = Math.ceil(cardWidth * (state.settings.escalationScaleMax ?? 0.3)) + 10
        // Keep the reminders physically clear of the composer / native approval
        // buttons at the bottom: anchor just above the input area when possible.
        let bottomOffset = 96
        const inputs = safe(() => [...document.querySelectorAll('textarea, [contenteditable="true"]')], [])
        let composerTop
        for (const input of inputs) {
          const rect = safe(() => input.getBoundingClientRect(), undefined)
          if (rect === undefined || rect.height <= 0 || rect.width <= 0) continue
          if (composerTop === undefined || rect.top < composerTop) composerTop = rect.top
        }
        if (composerTop !== undefined && composerTop > viewHeight * 0.45) {
          bottomOffset = Math.max(48, Math.round(viewHeight - composerTop + 12))
        }
        const applyStack = (bottom) => {
          stack.style.cssText = [
            'position:fixed',
            'top:auto',
            'left:auto',
            `right:${String(gap)}px`,
            `bottom:${String(bottom)}px`,
            'z-index:2147483600',
            'display:flex',
            'flex-direction:column',
            'justify-content:flex-end',
            'gap:8px',
            `width:${String(cardWidth + headroom)}px`,
            `padding-left:${String(headroom)}px`,
            `max-width:calc(100vw - ${String(gap * 2)}px)`,
            `max-height:calc(100vh - ${String(bottom + gap)}px)`,
            'overflow-y:auto',
            'overflow-x:hidden',
            'pointer-events:none',
            'box-sizing:border-box',
            'padding-top:0',
            'padding-right:0',
            'padding-bottom:0',
          ].join(';')
        }
        applyStack(bottomOffset)
        // If the native approval buttons would sit under the cards, jump above
        // them. Re-run on mount / escalation / removal so the "hole" follows the
        // reminder card size instead of covering the "允许一次" button.
        const approval = approvalButtonRect()
        if (approval !== undefined) {
          const stackRect = stack.getBoundingClientRect()
          const overlapsX = approval.right > stackRect.left + 2 && approval.left < stackRect.right - 2
          const overlapsY = approval.bottom + 8 > stackRect.top && approval.top - 8 < stackRect.bottom
          if (overlapsX && overlapsY) {
            const shifted = Math.round(viewHeight - approval.top + 14)
            if (shifted > bottomOffset) {
              bottomOffset = shifted
              applyStack(bottomOffset)
            }
          }
        }
        const sidebarRaw = safe(() => getComputedStyle(document.documentElement).getPropertyValue('--dsh-windows-sidebar-width'), '')
        let sidebarWidth = Number.parseFloat(sidebarRaw)
        if (!Number.isFinite(sidebarWidth) || sidebarWidth <= 0) {
          const aside = safe(() => document.querySelector('aside, [data-dsh-sidebar], [data-testid="sidebar"]'), undefined)
          const rect = aside !== null && aside !== undefined && typeof aside.getBoundingClientRect === 'function' ? aside.getBoundingClientRect() : undefined
          sidebarWidth = rect !== undefined && rect.width > 60 ? rect.width : 280
        }
        const collapsed = sidebarWidth < 80
        const toastWidth = Math.max(200, Math.min(collapsed ? 320 : sidebarWidth - 24, 340))
        toast.style.cssText = [
          'position:fixed',
          'top:auto',
          `left:${String(collapsed ? 64 : 12)}px`,
          `bottom:${String(Math.max(84, Math.round(viewHeight * 0.12)))}px`,
          `width:${String(toastWidth)}px`,
          'z-index:2147483700',
          `display:${state.toastVisible ? 'flex' : 'none'}`,
          'flex-direction:column',
          'gap:3px',
          'padding:9px 12px',
          'border-radius:11px',
          'border:1px solid rgba(84,200,120,.55)',
          'background:rgba(20,32,24,.96)',
          'color:#e8f6ec',
          'box-shadow:0 8px 24px rgba(0,0,0,.4)',
          'font:13px/18px system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif',
          'pointer-events:none',
          'opacity:1',
          'transition:opacity .3s ease',
          'box-sizing:border-box',
        ].join(';')
      }

      function ensureStack() {
        if (state.stack !== undefined && state.stack.isConnected !== false) return state.stack
        const stack = el('div', { id: STACK_ID })
        stack.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483600;display:flex;flex-direction:column;justify-content:flex-end;gap:8px;max-height:calc(100vh - 32px);overflow-y:auto;overflow-x:hidden;pointer-events:none'
        document.body.appendChild(stack)
        state.stack = stack
        return stack
      }

      function ensureToast() {
        if (state.toast !== undefined && state.toast.isConnected !== false) return state.toast
        const title = el('div', { class: 'an-toast-title' })
        const detail = el('div', { class: 'an-toast-detail' })
        const toast = el('div', { id: TOAST_ID }, [title, detail])
        toast.style.cssText = 'position:fixed;z-index:2147483700;display:none;flex-direction:column;pointer-events:none'
        document.body.appendChild(toast)
        state.toast = toast
        return toast
      }

      function repositionToast() {
        const { width: viewWidth, height: viewHeight } = viewportSize()
        const toast = ensureToast()
        const sidebarRaw = safe(() => getComputedStyle(document.documentElement).getPropertyValue('--dsh-windows-sidebar-width'), '')
        let sidebarWidth = Number.parseFloat(sidebarRaw)
        if (!Number.isFinite(sidebarWidth) || sidebarWidth <= 0) sidebarWidth = 280
        const collapsed = sidebarWidth < 80
        const toastWidth = Math.max(200, Math.min(collapsed ? 320 : sidebarWidth - 24, 340))
        toast.style.cssText = [
          'position:fixed',
          'top:auto',
          `left:${String(collapsed ? 64 : 12)}px`,
          `bottom:${String(Math.max(84, Math.round(viewHeight * 0.12)))}px`,
          `width:${String(toastWidth)}px`,
          'z-index:2147483700',
          `display:${state.toastVisible ? 'flex' : 'none'}`,
          'flex-direction:column',
          'gap:3px',
          'padding:9px 12px',
          'border-radius:11px',
          'border:1px solid rgba(84,200,120,.55)',
          'background:rgba(20,32,24,.96)',
          'color:#e8f6ec',
          'box-shadow:0 8px 24px rgba(0,0,0,.4)',
          'font:13px/18px system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif',
          'pointer-events:none',
          'opacity:1',
          'transition:opacity .3s ease',
          'box-sizing:border-box',
        ].join(';')
      }

      function showToast(titleText, detailText) {
        const toast = ensureToast()
        state.toastVisible = true
        repositionToast()
        toast.firstChild.textContent = `✅ ${titleText}`
        toast.lastChild.textContent = detailText
        toast.style.display = 'flex'
        toast.style.opacity = '1'
        if (state.toastTimer !== undefined) window.clearTimeout(state.toastTimer)
        if (state.toastHideTimer !== undefined) window.clearTimeout(state.toastHideTimer)
        state.toastTimer = window.setTimeout(() => {
          state.toastTimer = undefined
          if (state.toast !== undefined) state.toast.style.opacity = '0'
          state.toastHideTimer = window.setTimeout(() => {
            state.toastHideTimer = undefined
            state.toastVisible = false
            if (state.toast !== undefined) state.toast.style.display = 'none'
          }, TOAST_FADE_MS)
        }, TOAST_VISIBLE_MS)
      }

      // ── sound ───────────────────────────────────────────────────────────

      function audioContext() {
        if (state.audioCtx !== undefined) return state.audioCtx
        const Ctor = window.AudioContext || window.webkitAudioContext
        if (typeof Ctor !== 'function') return undefined
        state.audioCtx = safe(() => new Ctor(), undefined)
        return state.audioCtx
      }

      function playPreset(preset, volume) {
        const tones = PRESET_TONES[preset]
        if (tones === undefined || !(volume > 0)) return
        const audio = audioContext()
        if (audio === undefined || audio === null) return
        safe(() => {
          const play = () => {
            const now = audio.currentTime + 0.01
            for (const tone of tones) {
              const start = now + (tone.delay ?? 0)
              const oscillator = audio.createOscillator()
              const gain = audio.createGain()
              oscillator.type = tone.type
              oscillator.frequency.value = tone.f
              gain.gain.setValueAtTime(0.0001, start)
              gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, tone.g * volume), start + 0.015)
              gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.d)
              oscillator.connect(gain)
              gain.connect(audio.destination)
              oscillator.start(start)
              oscillator.stop(start + tone.d + 0.02)
            }
          }
          if (audio.state === 'suspended' && typeof audio.resume === 'function') {
            const resumed = audio.resume()
            if (resumed !== null && typeof resumed === 'object' && typeof resumed.then === 'function') resumed.then(play, () => {})
            else play()
            return
          }
          play()
        }, undefined)
      }

      function playCustom(kind, assetId, url, volume) {
        const src = assetUrlOf(kind, assetId, url)
        if (src.length === 0 || !(volume > 0)) return false
        safe(() => {
          const audio = new window.Audio(src)
          audio.volume = Math.max(0.01, Math.min(1, volume))
          const previous = state.audioEls.get(src)
          if (previous !== undefined) safe(() => previous.pause(), undefined)
          state.audioEls.set(src, audio)
          const promise = audio.play()
          if (promise !== null && typeof promise === 'object' && typeof promise.catch === 'function') promise.catch(() => {})
        }, undefined)
        return true
      }

      function playFirstSound() {
        const settings = state.settings
        if (playCustom(settings.customSoundKind, settings.customSoundAssetId, settings.customSoundUrl, settings.soundVolume)) return
        playPreset(settings.soundPreset, settings.soundVolume)
      }

      /**
       * Second reminder gets its own, clearly different cue (double chime) so it
       * is never confused with the first reminder nor with the 30s escalation.
       */
      function playSecondReminderSound() {
        const volume = Math.max(0.05, Math.min(1, state.settings.soundVolume * 1.05))
        playPreset('chime-double', volume)
      }

      function playEscalationSound(entry) {
        const settings = state.settings
        const volume = Math.max(0.05, Math.min(1, settings.soundVolume + entry.stage * settings.escalationVolumeStep))
        if (playCustom(settings.customEscalationSoundKind, settings.customEscalationSoundAssetId, settings.customEscalationSoundUrl, volume)) return
        playPreset(settings.escalationSoundPreset, volume)
      }

      // ── entries & cards ─────────────────────────────────────────────────

      function familyOf(kind) {
        return kind === 'approval' ? 'approval' : 'question'
      }

      function dedupeKeyOf(candidate) {
        if (typeof candidate.testKey === 'string' && candidate.testKey.length > 0) return candidate.testKey
        // Host pending items already carry a process-unique id: keying by it
        // guarantees one card per pending interaction (never merged by session).
        if (candidate.source === 'host' && asText(candidate.id).length > 0) return `host|${asText(candidate.id)}`
        const family = familyOf(candidate.kind)
        const callId = asText(candidate.callId)
        if (callId.length > 0) return `${family}|${candidate.sessionId}|${callId}`
        const toolName = asText(candidate.toolName)
        if (family === 'approval' && toolName.length > 0) return `${family}|${candidate.sessionId}|${toolName}`
        const storeKey = asText(candidate.storeKey)
        if (storeKey.length > 0) return `${family}|${candidate.sessionId}|${storeKey}`
        return `${family}|${candidate.sessionId}|${toolName}|${asText(candidate.reason).slice(0, 40)}`
      }

      function hostCandidate(raw) {
        return {
          source: 'host',
          id: raw.id,
          sessionId: asText(raw.sessionId),
          kind: raw.kind === 'question' ? 'question' : 'approval',
          toolName: asText(raw.toolName),
          callId: asText(raw.callId),
          reason: asText(raw.reason),
          storeKey: '',
          stage: Number.isFinite(raw.stage) ? Math.max(0, Math.min(5, Math.trunc(raw.stage))) : 0,
          at: Number.isFinite(raw.at) ? raw.at : Date.now(),
        }
      }

      function localCandidate(pending) {
        const display = pending.displayReason
        let reason = asText(pending.reason)
        if (isRecord(display)) reason = asText(display['zh-CN']) || asText(display.zh) || asText(display.en) || reason
        if (reason.length === 0 && Array.isArray(pending.questions) && pending.questions.length > 0) {
          const first = pending.questions[0]
          reason = isRecord(first) ? asText(first.question) || asText(first.header) : asText(first)
        }
        return {
          source: 'local',
          id: '',
          sessionId: asText(pending.sessionId),
          kind: asText(pending.kind) || 'approval',
          toolName: asText(pending.toolName),
          callId: pending.callId === undefined || pending.callId === null ? '' : asText(pending.callId),
          reason,
          storeKey: asText(pending.key),
          at: Date.now(),
        }
      }

      function visibleEntries() {
        return [...state.entries.values()].filter((entry) => !entry.acted && !entry.dismissed)
      }

      function entryHeadline(entry) {
        if (entry.family === 'approval') {
          if (entry.toolName === 'write' || entry.toolName === 'edit' || entry.toolName === 'str_replace_editor') return '文件修改确认'
          return `工具 ${entry.toolName.length > 0 ? entry.toolName : '?'} 请求审批`
        }
        if (entry.kind === 'plan-review') return '计划待审核'
        return '需要你回答问题'
      }

      function entryDetail(entry) {
        const text = clip(entry.reason, 180)
        if (text.length > 0) return text
        return entry.family === 'approval' ? '请求越权执行，请打开会话查看详情' : '请打开会话查看问题详情'
      }

      function cleanupEntry(entry) {
        if (entry.idleTimer !== undefined) {
          window.clearTimeout(entry.idleTimer)
          entry.idleTimer = undefined
        }
        if (entry.node !== undefined) {
          safe(() => entry.node.wrapper.remove(), undefined)
          entry.node = undefined
        }
      }

      function rebuildEntries() {
        if (state.disposed) return
        const view = viewStore()
        const candidates = []
        const seenSignatures = new Set()
        for (const raw of state.hostRaw.values()) {
          const candidate = hostCandidate(raw)
          const signature = signatureOf(candidate)
          if (seenSignatures.has(signature)) continue
          seenSignatures.add(signature)
          candidates.push(candidate)
        }
        // local sessionStatus is only a fallback: the host snapshot is
        // authoritative, and a matching local entry must never become a second
        // card for the same interaction ("one event = one reminder").
        if (state.hostOk !== true) {
          for (const pending of state.localRaw.values()) {
            const candidate = localCandidate(pending)
            const signature = signatureOf(candidate)
            if (seenSignatures.has(signature)) continue
            seenSignatures.add(signature)
            candidates.push(candidate)
          }
        }
        for (const test of state.testEntries.values()) candidates.push(test)
        const next = new Map()
        for (const candidate of candidates) {
          const key = dedupeKeyOf(candidate)
          if (next.has(key)) continue
          const existing = state.entries.get(key)
          const meta = sessionMeta(candidate.sessionId)
          const entry = existing ?? {
            key,
            createdAt: Date.now(),
            stage: 0,
            lastEscalationAt: Date.now(),
            acted: view.actedIds.has(key),
            dismissed: view.dismissedIds.has(key),
            test: candidate.test === true,
            secondReminderShown: view.secondIds.has(key),
            openedAt: 0,
            idleTimer: undefined,
            visible: view.visibleIds.has(key),
            node: undefined,
          }
          entry.sessionId = candidate.sessionId
          entry.kind = candidate.kind
          entry.family = familyOf(candidate.kind)
          entry.toolName = candidate.toolName
          entry.callId = candidate.callId
          entry.reason = candidate.reason
          entry.at = candidate.at
          if (existing === undefined && Number.isFinite(candidate.stage)) entry.stage = Math.max(0, Math.min(5, Math.trunc(candidate.stage)))
          entry.sessionTitle = candidate.test === true ? asText(candidate.sessionTitle) || meta.title : meta.title
          entry.workspace = candidate.test === true ? '测试工作区' : meta.workspace
          entry.hostId = candidate.source === 'host' ? candidate.id : entry.hostId
          if (candidate.test === true) entry.test = true
          if (candidate.source === 'host') entry.source = 'host'
          next.set(key, entry)
        }
        const fresh = []
        for (const [key, entry] of next) {
          if (state.entries.has(key)) continue
          if (entry.acted || entry.dismissed) continue
          entry.visible = false
          fresh.push(entry)
        }
        for (const [key, entry] of state.entries) {
          if (next.has(key)) continue
          cleanupEntry(entry)
        }
        state.entries = next
        if (fresh.some((entry) => (entry.stage ?? 0) > 0)) scheduleShakeClear()
        fresh.sort((left, right) => left.at - right.at)
        for (const entry of fresh) {
          if ((entry.stage ?? 0) > 0) {
            entry.shakeUntil = Date.now() + 3000
            scheduleShakeClear()
          }
          if (!state.arrivalQueue.includes(entry.key)) state.arrivalQueue.push(entry.key)
        }
        pumpArrivals()
        updateTitleFlash()
      }

      function pumpArrivals() {
        if (state.disposed) return
        if (state.arrivalTimer !== undefined) return
        if (state.arrivalQueue.length === 0) {
          renderStack()
          return
        }
        const stagger = Math.max(120, Math.min(2000, state.settings.animationStaggerMs))
        state.batchSoundPlayed = false
        const step = () => {
          state.arrivalTimer = undefined
          if (state.disposed) return
          let key
          let entry
          do {
            key = state.arrivalQueue.shift()
            entry = key === undefined ? undefined : state.entries.get(key)
          } while (key !== undefined && (entry === undefined || entry.acted || entry.dismissed))
          if (key === undefined || entry === undefined) {
            renderStack()
            return
          }
          entry.visible = true
          entry.lastEscalationAt = Date.now()
          viewStore().visibleIds.add(entry.key)
          if (state.batchSoundPlayed !== true) {
            state.batchSoundPlayed = true
            const now = Date.now()
            if (now - state.lastBatchSoundAt > 400) {
              state.lastBatchSoundAt = now
              safe(playFirstSound, undefined)
            }
          }
          renderStack()
          if (state.arrivalQueue.length > 0) state.arrivalTimer = window.setTimeout(step, stagger)
        }
        step()
      }

      function customImageUrl() {
        return assetUrlOf(state.settings.customImageKind, state.settings.customImageAssetId, state.settings.customImageUrl)
      }

      function mountCard(entry, options = {}) {
        const stack = ensureStack()
        const isSecond = options.secondReminder === true || entry.secondReminderShown === true
        const imageUrl = customImageUrl()
        const image = imageUrl.length > 0 ? el('img', { class: 'an-thumb', attrs: { src: imageUrl, alt: '' } }) : undefined
        const secondBanner = isSecond
          ? el('div', { class: 'an-second-banner', text: '⚠ 二次提醒 —— 还没有处理，请尽快确认（不是升级提醒）' })
          : undefined
        const secondChip = isSecond
          ? el('span', { class: 'an-chip an-second', text: '二次提醒' })
          : undefined
        const upgraded = el('span', { class: 'an-chip an-upgraded', text: '', style: 'display:none' })
        const kindChip = el('span', { class: 'an-chip', text: entry.family === 'approval' ? '审批' : '提问' })
        const card = el('div', {
          class: 'an-card an-arriving',
          data: { 'data-anim': state.settings.animationPreset, 'data-stage': '0', 'data-kind': entry.family, 'data-second': isSecond ? '1' : '0' },
        }, [
          secondBanner,
          image,
          el('div', { class: 'an-head' }, [
            el('span', { class: 'an-dot' }),
            el('span', { class: 'an-headline', text: isSecond ? `⚠ 二次提醒：${entryHeadline(entry)}` : entryHeadline(entry) }),
            secondChip,
          ]),
          el('div', { class: 'an-detail', text: entryDetail(entry) }),
          el('div', { class: 'an-meta' }, [
            kindChip,
            el('span', { text: entry.sessionTitle }),
            entry.workspace.length > 0 ? el('span', { text: `· ${entry.workspace}` }) : undefined,
            upgraded,
          ]),
          el('div', { class: 'an-actions' }, [
            el('button', { class: 'an-btn an-btn-ghost', text: '暂时忽略', attrs: { type: 'button' }, on: { click: () => handleDismiss(entry) } }),
            el('button', { class: 'an-btn an-btn-primary', text: '去处理', attrs: { type: 'button' }, on: { click: () => handleOpen(entry) } }),
          ]),
        ])
        const shell = el('div', { class: 'an-shell', data: { 'data-key': entry.key, 'data-session-id': entry.sessionId, 'data-stage': '0' } }, [card])
        entry.cardEl = shell
        entry.cardInnerEl = card
        stack.appendChild(shell)
        layout()
        // Newest reminder stays visible: the stack grows upward, so keep it
        // scrolled to the bottom edge when many reminders are queued.
        safe(() => {
          stack.scrollTop = stack.scrollHeight
        }, undefined)
        safe(() => card.addEventListener('animationend', () => card.classList.remove('an-arriving'), { once: true }), undefined)
        updateCardEscalation(entry)
        state.lastDiag = `card:${entry.family}${options.secondReminder === true ? ':second' : ''}`
      }

      function updateCardEscalation(entry) {
        if (entry.cardEl === undefined) return
        const scale = 1 + Math.min(entry.stage * state.settings.escalationScaleStep, state.settings.escalationScaleMax)
        entry.cardEl.style.setProperty('--an-scale', String(scale))
        entry.cardEl.setAttribute('data-stage', String(entry.stage))
        if (entry.cardInnerEl !== undefined) entry.cardInnerEl.setAttribute('data-stage', String(entry.stage))
        const upgraded = entry.cardEl.querySelector('.an-upgraded')
        if (upgraded !== null) {
          upgraded.textContent = entry.stage > 0 ? `升级 ${String(entry.stage)} 级` : ''
          upgraded.style.display = entry.stage > 0 ? 'inline' : 'none'
        }
        // The card grew: recompute the bottom-right anchor so it keeps clear of
        // the composer and of the native "允许一次 / 拒绝" buttons.
        layout()
      }

      function removeCard(entry, animate) {
        const shell = entry.cardEl
        entry.cardEl = undefined
        entry.cardInnerEl = undefined
        if (shell === undefined) return
        if (animate === false) {
          safe(() => shell.remove(), undefined)
          layout()
          return
        }
        safe(() => shell.classList.add('an-leaving'), undefined)
        window.setTimeout(() => {
          safe(() => shell.remove(), undefined)
          layout()
        }, 190)
      }

      // ── V4 layout engine: measured frame, bottom-anchored stacking,
      //    compression, >10 folding, expansion and allow-button highlight ──
      const V4_STYLE_ID = 'dsh-approval-notifier-v4-style'
      const V4_LAYER_ID = 'dsh-approval-notifier-v4-layer'
      const HIGHLIGHT_ID = 'dsh-approval-notifier-v4-highlight'
      const CARD_BASE_H = 128
      const MIN_FULL_H = 100
      const COMPACT_MIN_H = 20
      const COMPACT_MAX_H = 36
      const COMPACT_GAP = 2
      const FOLD_NATURAL_H = 88
      const CARD_GAP = 8
      const VIEW_KEY = '__DSH_SENTINEL_VIEW__'

      function viewStore() {
        const holder = window
        if (!isRecord(holder[VIEW_KEY])) {
          holder[VIEW_KEY] = {
            actedIds: new Set(),
            dismissedIds: new Set(),
            secondIds: new Set(),
            visibleIds: new Set(),
            expandedId: undefined,
            hoverKey: undefined,
          }
        }
        if (holder[VIEW_KEY].hoverKey === undefined) holder[VIEW_KEY].hoverKey = undefined
        return holder[VIEW_KEY]
      }

      function ensureV4Style() {
        let style = document.getElementById(V4_STYLE_ID)
        if (style === null) {
          style = document.createElement('style')
          style.id = V4_STYLE_ID
          document.head.appendChild(style)
        }
        // Always (re)write the current CSS so hot-reloaded tier/mode rules apply.
        style.textContent = `
#${V4_LAYER_ID}{position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483600;pointer-events:none;overflow:visible}
#${HIGHLIGHT_ID}{position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483650;pointer-events:none;overflow:visible}
.sn-wrap{position:absolute;right:0;display:flex;align-items:flex-end;justify-content:flex-end;transform-origin:bottom right;pointer-events:none;transition:bottom .2s cubic-bezier(.2,.8,.25,1),height .2s cubic-bezier(.2,.8,.25,1)}
.sn-enter{animation:sn-pop .3s cubic-bezier(.2,.85,.25,1) both}
@keyframes sn-pop{from{opacity:0;transform:translateY(20px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
.sn-leave{animation:sn-out .18s ease-in forwards}
@keyframes sn-out{to{opacity:0;transform:translateY(12px) scale(.97)}}
.sn-card{position:relative;display:flex;flex-direction:column;gap:3px;box-sizing:border-box;width:100%;height:${String(CARD_BASE_H)}px;padding:8px 10px;border-radius:12px;border:1px solid rgba(255,164,64,.5);background:rgba(30,24,18,.96);color:#f6efe4;box-shadow:0 10px 28px rgba(0,0,0,.42);transform-origin:bottom right;pointer-events:none;font:12px/16px system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif}
.sn-card[data-stage="1"]{border-color:rgba(255,140,40,.72)}
.sn-card[data-stage="2"]{border-color:rgba(255,110,30,.9)}
.sn-card[data-stage="3"]{border-color:#ff5a1f}
.sn-card[data-stage="4"],.sn-card[data-stage="5"]{border-color:#ff3d13}
.sn-card.sn-second{border-color:rgba(255,84,64,.9);border-left:4px solid #ff4a3a;background:linear-gradient(180deg,rgba(62,24,19,.98),rgba(40,20,16,.98));box-shadow:0 12px 34px rgba(255,74,58,.32)}
.sn-card.sn-expanded{border:2px solid #ffd27a;box-shadow:0 0 0 2px rgba(255,210,122,.25),0 0 26px rgba(255,199,90,.45)}
.sn-second-banner{padding:2px 7px;border-radius:6px;border:1px solid rgba(255,84,64,.6);background:rgba(255,74,58,.16);color:#ffd9cf;font:700 11px/15px system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif}
.sn-head{display:flex;align-items:center;gap:6px;font-weight:600;font-size:12px;line-height:16px;color:#ffe0b3;min-width:0}
.sn-dot{width:7px;height:7px;border-radius:50%;background:#ff9f43;flex:none}
.sn-headline{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sn-chip{font-size:9px;line-height:13px;padding:0 5px;border-radius:5px;border:1px solid rgba(255,159,67,.4);background:rgba(255,159,67,.12);color:#ffc36b;white-space:nowrap;flex:none}
.sn-chip.sn-stage{color:#ffd08a;border-color:rgba(255,208,138,.5)}
.sn-chip.sn-expand{color:#2a1c08;background:#ffd27a;border-color:#ffd27a;font-weight:700}
.sn-detail{font-size:11px;line-height:15px;color:#d9cdbd;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.sn-meta{font-size:10px;line-height:14px;color:#9c9083;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sn-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:auto}
.sn-btn{pointer-events:auto;cursor:pointer;border-radius:7px;padding:3px 10px;font:600 11px/15px system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif}
.sn-btn-primary{border:none;background:#ff9f43;color:#231a10}
.sn-btn-primary:hover{background:#ffb260}
.sn-btn-ghost{border:1px solid rgba(255,255,255,.22);background:transparent;color:#cbbfae}
.sn-fold{height:${String(FOLD_NATURAL_H)}px;cursor:pointer;pointer-events:auto;gap:2px;background:rgba(42,38,30,.97);border-color:rgba(190,168,120,.55)}
.sn-fold .sn-fold-line{font-size:10px;line-height:14px;color:#c9c0ad;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sn-fold-tag{display:inline-block;font:700 10px/14px system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;color:#ffd27a;border:1px solid rgba(255,210,122,.45);border-radius:5px;padding:0 5px;margin-right:6px}
.sn-hl{position:absolute;border:3px solid #5ee6f0;border-radius:10px;box-shadow:0 0 0 3px rgba(94,230,240,.22),0 0 18px rgba(94,230,240,.65);animation:sn-pulse 1.1s ease-in-out infinite}
.sn-hl-label{position:absolute;font:700 11px/15px system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;color:#04262a;background:#5ee6f0;border-radius:5px;padding:1px 6px;box-shadow:0 2px 8px rgba(0,0,0,.4)}
@keyframes sn-pulse{0%,100%{opacity:.75}50%{opacity:1}}
.sn-card{font-size:calc(12px * var(--sn-fs,1));line-height:calc(16px * var(--sn-fs,1))}
.sn-head{font-size:calc(12px * var(--sn-fs,1));line-height:calc(16px * var(--sn-fs,1))}
.sn-detail{font-size:calc(11px * var(--sn-fs,1));line-height:calc(15px * var(--sn-fs,1))}
.sn-meta{font-size:calc(10px * var(--sn-fs,1));line-height:calc(14px * var(--sn-fs,1))}
.sn-btn{font-size:calc(11px * var(--sn-fs,1));line-height:calc(15px * var(--sn-fs,1))}
.sn-chip{font-size:calc(9px * var(--sn-fs,1));line-height:calc(13px * var(--sn-fs,1))}
.sn-seq{font:700 calc(10px * var(--sn-fs,1))/calc(14px * var(--sn-fs,1)) system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;color:#ffd27a;border:1px solid rgba(255,210,122,.4);border-radius:5px;padding:0 5px;flex:none}
.sn-card[data-tier="compact"] .sn-detail,.sn-card[data-tier="compact"] .sn-meta{display:none}
.sn-card[data-tier="compact"]{pointer-events:auto;cursor:default;gap:2px}
.sn-card.sn-hover{pointer-events:auto;border-color:#ffd27a;box-shadow:0 0 0 2px rgba(255,210,122,.28),0 12px 32px rgba(0,0,0,.5)}
.sn-card.sn-hover .sn-detail,.sn-card.sn-hover .sn-meta{display:block}
.sn-compact-line{display:none;font:700 calc(12px * var(--sn-fs,1))/calc(16px * var(--sn-fs,1)) system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;color:#ffe3b0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%}
.sn-card[data-tier="compact"]{align-items:center;justify-content:flex-start;padding:1px 8px;gap:0;border:2px solid #ffd27a;border-radius:9px;background:linear-gradient(180deg,rgba(58,38,12,.98),rgba(36,22,7,.98));box-shadow:0 4px 14px rgba(0,0,0,.45)}
.sn-card[data-tier="compact"] .sn-head,.sn-card[data-tier="compact"] .sn-detail,.sn-card[data-tier="compact"] .sn-meta,.sn-card[data-tier="compact"] .sn-actions,.sn-card[data-tier="compact"] .sn-second-banner{display:none}
.sn-card[data-tier="compact"] .sn-compact-line{display:block}
.sn-card[data-tier="compact"][data-stage="1"]{border-color:#ffb347;border-width:3px;background:linear-gradient(180deg,rgba(64,42,14,.98),rgba(40,26,9,.98));box-shadow:0 0 12px rgba(255,179,71,.4)}
.sn-card[data-tier="compact"][data-stage="2"]{border-color:#ff8a2a;border-width:3px;background:linear-gradient(180deg,rgba(74,44,12,.98),rgba(46,26,8,.98));box-shadow:0 0 16px rgba(255,138,42,.55)}
.sn-card[data-tier="compact"][data-stage="3"]{border-color:#ff5a1f;border-width:4px;background:linear-gradient(180deg,rgba(84,40,12,.98),rgba(50,24,8,.98));box-shadow:0 0 20px rgba(255,90,31,.65)}
.sn-card[data-tier="compact"][data-stage="4"],.sn-card[data-tier="compact"][data-stage="5"]{border-color:#ff2f3d;border-width:4px;background:linear-gradient(180deg,rgba(92,34,22,.98),rgba(54,20,14,.98));box-shadow:0 0 24px rgba(255,47,61,.7)}
.sn-card.sn-shake{animation:sn-shake .18s linear 16}
@keyframes sn-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-2.5px)}75%{transform:translateX(2.5px)}}
.sn-card[data-tier="compact"].sn-hover .sn-compact-line{display:none}
.sn-card[data-tier="compact"].sn-hover{display:flex;flex-direction:column;align-items:stretch;padding:8px 10px;gap:3px;border:2px solid #ffd27a;background:rgba(30,24,18,.98)}
.sn-card[data-tier="compact"].sn-hover .sn-head,.sn-card[data-tier="compact"].sn-hover .sn-detail,.sn-card[data-tier="compact"].sn-hover .sn-meta,.sn-card[data-tier="compact"].sn-hover .sn-actions{display:flex}
.sn-card[data-tier="compact"].sn-hover .sn-head,.sn-card[data-tier="compact"].sn-hover .sn-detail,.sn-card[data-tier="compact"].sn-hover .sn-meta{display:block}
.sn-card[data-tier="compact"].sn-hover .sn-head{display:flex}
`
      }

      function ensureV4Layer() {
        if (state.layer !== undefined && state.layer.isConnected !== false) return state.layer
        const layer = el('div', { id: V4_LAYER_ID })
        document.body.appendChild(layer)
        state.layer = layer
        state.nodes = new Map()
        return layer
      }

      function ensureHighlightLayer() {
        if (state.highlight !== undefined && state.highlight.isConnected !== false) return state.highlight
        const layer = el('div', { id: HIGHLIGHT_ID })
        document.body.appendChild(layer)
        state.highlight = layer
        return layer
      }

      /**
       * Top edge of the bottom dock (composer input, or the native approval
       * dialog when it replaces the composer). Reminder cards are anchored
       * above this line so the dock — including 允许一次/拒绝 — stays visible.
       */
      function bottomDockTop(viewHeight) {
        let top
        for (const element of safe(() => [...document.querySelectorAll('textarea, [contenteditable="true"]')], [])) {
          const rect = safe(() => element.getBoundingClientRect(), undefined)
          if (rect === undefined || rect.height < 18 || rect.width < 180) continue
          if (rect.top < viewHeight * 0.45 || rect.top > viewHeight) continue
          if (top === undefined || rect.top < top) top = rect.top
        }
        const walker = safe(() => document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), undefined)
        if (walker !== undefined) {
          while (walker.nextNode()) {
            const value = asText(walker.currentNode.textContent)
            if (!/等待审批|等待批准|等待确认|Waiting for approval|允许本次操作使用/u.test(value)) continue
            let element = walker.currentNode.parentElement
            for (let depth = 0; depth < 10 && element !== null; depth += 1) {
              const rect = safe(() => element.getBoundingClientRect(), undefined)
              if (rect !== undefined && rect.width >= 300 && rect.height >= 80 && rect.top >= viewHeight * 0.5 && rect.bottom >= viewHeight * 0.8 && rect.top <= viewHeight - 40) {
                if (top === undefined || rect.top < top) top = rect.top
                break
              }
              element = element.parentElement
            }
          }
        }
        if (top === undefined) {
          // Fallback: the bottom dock may be an approval surface that hides the
          // composer. Its action buttons sit near the bottom; keep the cards
          // above the whole surface, not on top of its text.
          let buttonTop
          for (const element of safe(() => [...document.querySelectorAll('button, [role="button"]')], [])) {
            const text = asText(element.textContent)
            if (!/允许一次|始终允许|允许|拒绝|不同意|同意/u.test(text)) continue
            const rect = safe(() => element.getBoundingClientRect(), undefined)
            if (rect === undefined || rect.width < 10 || rect.height < 10) continue
            if (rect.bottom < viewHeight * 0.82 || rect.top < viewHeight * 0.5) continue
            if (buttonTop === undefined || rect.top < buttonTop) buttonTop = rect.top
          }
          if (buttonTop !== undefined) top = Math.max(viewHeight * 0.4, buttonTop - 100)
        }
        return top
      }

      /**
       * Measure the page. The frame follows the conversation area:
       * right edge = scrollbar left edge, bottom = just above the input dock
       * (composer / native approval dialog), top = the line under 对话/轨迹.
       */
      function measureFrame() {
        const visual = window.visualViewport
        const viewWidth = Math.round((visual?.width ?? 0) || window.innerWidth || document.documentElement.clientWidth || 1280)
        const viewHeight = Math.round((visual?.height ?? 0) || window.innerHeight || document.documentElement.clientHeight || 820)
        const scrollbar = Math.max(0, Math.round((window.innerWidth || viewWidth) - document.documentElement.clientWidth))
        const right = viewWidth - (scrollbar > 0 ? scrollbar : 17) - 2
        const top = 114
        const defaultBottom = viewHeight - 22
        const dockTop = bottomDockTop(viewHeight)
        const bottom = dockTop === undefined
          ? defaultBottom
          : Math.min(defaultBottom, Math.max(top + 140, Math.round(dockTop - 10)))
        const cardWidth = Math.max(260, Math.min(380, right - 268 - 16))
        return { viewWidth, viewHeight, top, bottom, right, cardWidth, topSafe: top, scrollbar }
      }

      function signatureOf(candidate) {
        const family = familyOf(candidate.kind)
        const callId = asText(candidate.callId)
        if (callId.length > 0) return `sig|${family}|${candidate.sessionId}|${callId}`
        return `sig|${family}|${candidate.sessionId}|${asText(candidate.toolName)}|${asText(candidate.reason).slice(0, 40)}`
      }

      function priorityOf(entryList) {
        return [...entryList].sort((left, right) => {
          const byStage = (right.stage ?? 0) - (left.stage ?? 0)
          if (byStage !== 0) return byStage
          return (right.at ?? 0) - (left.at ?? 0)
        })[0]
      }

      function foldKeyOf(items, position) {
        const raw = items.map((entry) => entry.key).join('~')
        return `fold|${position}|${String(items.length)}|${raw.slice(0, 160)}|${String(raw.length)}`
      }

      function buildButtons(onDismiss, onOpen) {
        const row = el('div', { class: 'sn-actions' })
        const dismiss = el('button', { class: 'sn-btn sn-btn-ghost', text: '暂时忽略', attrs: { type: 'button' } })
        dismiss.addEventListener('click', (event) => {
          event.stopPropagation()
          onDismiss()
        })
        const open = el('button', { class: 'sn-btn sn-btn-primary', text: '去处理', attrs: { type: 'button' } })
        open.addEventListener('click', (event) => {
          event.stopPropagation()
          onOpen()
        })
        row.appendChild(dismiss)
        row.appendChild(open)
        return row
      }

      function buildCardNode(item) {
        const entry = item.entry
        const wrapper = el('div', { class: 'sn-wrap' })
        const card = el('div', {
          class: `sn-card${entry.secondReminderShown === true ? ' sn-second' : ''}${item.expanded === true ? ' sn-expanded' : ''}`,
          data: { 'data-anim': state.settings.animationPreset, 'data-stage': '0', 'data-kind': entry.family, 'data-second': entry.secondReminderShown === true ? '1' : '0', 'data-tier': 'full' },
        })
        if (entry.secondReminderShown === true) card.appendChild(el('div', { class: 'sn-second-banner', text: '⚠ 二次提醒 —— 还没有处理，请尽快确认' }))
        const head = el('div', { class: 'sn-head' })
        head.appendChild(el('span', { class: 'sn-seq', text: '第 1 条' }))
        head.appendChild(el('span', { class: 'sn-dot' }))
        head.appendChild(el('span', { class: 'sn-headline', text: entryHeadline(entry) }))
        if (entry.secondReminderShown === true) head.appendChild(el('span', { class: 'sn-chip sn-expand', text: '二次提醒' }))
        if ((entry.stage ?? 0) > 0) head.appendChild(el('span', { class: 'sn-chip sn-stage sn-stage-chip', text: `升级 ${String(entry.stage)} 级` }))
        card.appendChild(head)
        card.appendChild(el('div', { class: 'sn-detail', text: entryDetail(entry) }))
        const metaParts = [entry.family === 'approval' ? '审批' : '提问', entry.sessionTitle]
        if (entry.workspace.length > 0) metaParts.push(entry.workspace)
        card.appendChild(el('div', { class: 'sn-meta', text: metaParts.join(' · ') }))
        card.appendChild(el('div', { class: 'sn-compact-line', text: `第 ${String(item.ordinal ?? 1)} 次 · ${entry.sessionTitle} · 第 ${String(entry.stage ?? 0)} 级` }))
        card.appendChild(buildButtons(() => dismissEntry(entry), () => openEntry(entry)))
        card.addEventListener('pointerenter', () => {
          if (card.dataset.tier !== 'compact' && card.classList.contains('sn-hover') !== true) return
          if (viewStore().hoverKey === entry.key) return
          viewStore().hoverKey = entry.key
          renderStack()
        })
        card.addEventListener('pointerleave', () => {
          if (viewStore().hoverKey !== entry.key) return
          viewStore().hoverKey = undefined
          renderStack()
        })
        wrapper.appendChild(card)
        return { wrapper, sig: `card|${item.expanded === true ? '1' : '0'}|${entry.secondReminderShown === true ? '1' : '0'}|${String(entry.stage ?? 0)}` }
      }

      function buildFoldNode(items, position) {
        const wrapper = el('div', { class: 'sn-wrap' })
        const card = el('div', { class: 'sn-card sn-fold' })
        const priority = priorityOf(items)
        const maxStage = items.reduce((value, entry) => Math.max(value, entry.stage ?? 0), 0)
        const names = [...new Set(items.map((entry) => entry.sessionTitle).filter((name) => name.length > 0))]
        const nameText = names.slice(0, 2).join('、')
        const head = el('div', { class: 'sn-head' })
        head.appendChild(el('span', { class: 'sn-dot' }))
        head.appendChild(el('span', { class: 'sn-headline', text: `已折叠 ${String(items.length)} 条提醒` }))
        head.appendChild(el('span', { class: 'sn-chip sn-stage', text: maxStage > 0 ? `最高 ${String(maxStage)} 级` : '折叠' }))
        card.appendChild(head)
        card.appendChild(el('div', { class: 'sn-fold-line', text: `作业：${nameText}${names.length > 2 ? ` 等 ${String(names.length)} 个` : ''}` }))
        card.appendChild(el('div', { class: 'sn-fold-line', text: `点击展开 · 最高优先级：${priority !== undefined ? entryHeadline(priority) : ''}` }))
        card.appendChild(buildButtons(
          () => {
            for (const entry of items) {
              entry.dismissed = true
              viewStore().dismissedIds.add(entry.key)
            }
            renderStack()
          },
          () => {
            const target = priorityOf(items)
            if (target !== undefined) openEntry(target)
          },
        ))
        card.addEventListener('click', () => expandFold(items))
        wrapper.appendChild(card)
        return { wrapper, sig: `fold|${items.map((entry) => entry.key).join(',')}|${position}` }
      }

      function displayModel() {
        const view = viewStore()
        const all = [...state.entries.values()]
          .filter((entry) => !entry.acted && !entry.dismissed && entry.visible === true)
          .sort((left, right) => (left.at ?? 0) - (right.at ?? 0))
        if (all.length === 0) {
          state.mode = 'full'
          state.layoutRatio = 1
          state.layoutGap = CARD_GAP
          return []
        }
        const frame = state.frame ?? measureFrame()
        const available = Math.max(120, frame.bottom - frame.top)
        const fontScaleOf = (entry) => 1 + Math.min((entry.stage ?? 0) * (state.settings.escalationScaleStep ?? 0.06), state.settings.escalationScaleMax ?? 0.3)
        const baseHeightOf = (entry) => CARD_BASE_H * fontScaleOf(entry)
        const minFullOf = (entry) => MIN_FULL_H * fontScaleOf(entry)
        const hoverKey = view.hoverKey
        const hovered = hoverKey !== undefined ? all.find((entry) => entry.key === hoverKey) : undefined
        const count = all.length
        const baseSum = all.reduce((sum, entry) => sum + baseHeightOf(entry), 0)
        const fullGapTotal = CARD_GAP * Math.max(0, count - 1)
        let mode = 'full'
        let gap = CARD_GAP
        const heights = new Map()
        if (baseSum + fullGapTotal > available) {
          // Keep the font constant: if the full text still fits when every card
          // is shrunk down to its minimum full-text height, use that.
          const minFullSum = all.reduce((sum, entry) => sum + minFullOf(entry), 0)
          if (minFullSum + fullGapTotal <= available) {
            mode = 'full-shrunk'
            const ratio = (available - fullGapTotal) / baseSum
            for (const entry of all) heights.set(entry.key, Math.max(minFullOf(entry), baseHeightOf(entry) * ratio))
          } else {
            // Otherwise ALL cards collapse to the compact yellow bars showing
            // only sequence / project / escalation level (no buttons). Higher
            // escalation levels get proportionally taller bars and larger text.
            mode = 'compact'
            gap = COMPACT_GAP
            const compactGapTotal = COMPACT_GAP * Math.max(0, count - 1)
            const hoverHeight = hovered !== undefined ? baseHeightOf(hovered) : 0
            const compactEntries = all.filter((entry) => entry !== hovered)
            const fontSum = compactEntries.reduce((sum, entry) => sum + fontScaleOf(entry), 0)
            const compactSpace = Math.max(40, available - compactGapTotal - hoverHeight)
            const perUnit = fontSum > 0 ? compactSpace / fontSum : 0
            for (const entry of all) {
              if (hovered !== undefined && entry === hovered) {
                heights.set(entry.key, baseHeightOf(entry))
                continue
              }
              const scaled = perUnit * fontScaleOf(entry)
              // Each escalation level gets a clearly taller/brighter bar, not
              // just a different label: +6px per level on top of the font growth.
              const level = Math.min(5, entry.stage ?? 0)
              const minHeight = (COMPACT_MIN_H + level * 4) * fontScaleOf(entry)
              const maxHeight = (COMPACT_MAX_H + level * 6) * fontScaleOf(entry)
              heights.set(entry.key, Math.max(minHeight, Math.min(maxHeight, scaled)))
            }
          }
        } else {
          for (const entry of all) heights.set(entry.key, baseHeightOf(entry))
        }
        state.mode = mode
        state.layoutGap = gap
        state.layoutRatio = mode === 'full' ? 1 : (() => {
          let ratio = 1
          for (const entry of all) {
            const height = heights.get(entry.key) ?? baseHeightOf(entry)
            ratio = Math.min(ratio, height / baseHeightOf(entry))
          }
          return ratio
        })()
        const items = []
        all.forEach((entry, index) => {
          const height = heights.get(entry.key) ?? baseHeightOf(entry)
          const tier = mode === 'full' || mode === 'full-shrunk' ? 'full' : (hovered === entry ? 'full' : 'compact')
          items.push({
            type: 'card',
            entry,
            expanded: entry === hovered,
            ordinal: index + 1,
            height,
            tier,
            fontScale: fontScaleOf(entry),
          })
        })
        return items
      }

      function nodeKeyOf(item) {
        if (item.type === 'fold') return foldKeyOf(item.items, item.position)
        return `card|${item.entry.key}`
      }

      function renderStack() {
        if (state.disposed) return
        const layer = ensureV4Layer()
        const frame = measureFrame()
        state.frame = frame
        const items = displayModel()
        state.compress = state.layoutRatio ?? 1
        const hoverKey = viewStore().hoverKey
        const gap = state.layoutGap ?? CARD_GAP
        let cursor = frame.bottom
        const seen = new Set()
        const rightOffset = Math.max(0, Math.round(frame.viewWidth - frame.right))
        for (let index = items.length - 1; index >= 0; index -= 1) {
          const item = items[index]
          const key = nodeKeyOf(item)
          seen.add(key)
          const expectedSig = item.type === 'fold'
            ? `fold|${item.items.map((entry) => entry.key).join(',')}|${item.position}`
            : `card|${item.expanded === true ? '1' : '0'}|${item.entry.secondReminderShown === true ? '1' : '0'}|${String(item.entry.stage ?? 0)}`
          let node = state.nodes.get(key)
          if (node !== undefined && node.sig !== expectedSig) {
            safe(() => node.wrapper.remove(), undefined)
            state.nodes.delete(key)
            node = undefined
          }
          if (node === undefined) {
            const built = item.type === 'fold' ? buildFoldNode(item.items, item.position) : buildCardNode(item)
            node = { wrapper: built.wrapper, sig: built.sig }
            layer.appendChild(node.wrapper)
            safe(() => node.wrapper.classList.add('sn-enter'), undefined)
            state.nodes.set(key, node)
          }
          const height = Math.max(16, Math.round(item.height))
          node.wrapper.style.width = `${String(frame.cardWidth)}px`
          node.wrapper.style.height = `${String(height)}px`
          node.wrapper.style.right = `${String(rightOffset)}px`
          node.wrapper.style.bottom = `${String(Math.round(frame.viewHeight - cursor))}px`
          node.wrapper.style.zIndex = String(20 + index)
          const inner = node.wrapper.firstChild
          if (inner !== null && inner !== undefined) {
            if (item.type === 'fold') {
              inner.style.width = `${String(frame.cardWidth)}px`
              inner.style.height = `${String(height)}px`
            } else {
              inner.style.width = `${String(frame.cardWidth)}px`
              inner.style.height = `${String(height)}px`
              // Font size is constant while compressing; only the content tier
              // changes. Escalation grows the font (and therefore the card).
              inner.style.setProperty('--sn-fs', String(item.fontScale ?? 1))
              inner.setAttribute('data-tier', item.tier ?? 'full')
              inner.setAttribute('data-stage', String(item.entry.stage ?? 0))
              inner.classList.toggle('sn-hover', hoverKey === item.entry.key)
              inner.classList.toggle('sn-shake', (item.entry.shakeUntil ?? 0) > Date.now())
              const seq = inner.querySelector('.sn-seq')
              if (seq !== null) seq.textContent = `第 ${String(item.ordinal)} 条`
              const compactLine = inner.querySelector('.sn-compact-line')
              if (compactLine !== null) {
                compactLine.textContent = `第 ${String(item.ordinal)} 次 · ${item.entry.sessionTitle} · 第 ${String(item.entry.stage ?? 0)} 级`
              }
            }
          }
          cursor -= height + gap
        }
        for (const [key, node] of [...state.nodes]) {
          if (seen.has(key)) continue
          state.nodes.delete(key)
          safe(() => node.wrapper.classList.add('sn-leave'), undefined)
          window.setTimeout(() => safe(() => node.wrapper.remove(), undefined), 190)
        }
        const cardKeys = items.filter((item) => item.type === 'card').map((item) => item.entry.key)
        if (state.renderedCardKeys !== undefined) {
          const added = cardKeys.filter((key) => !state.renderedCardKeys.has(key))
          if (added.length > 0 && Date.now() - state.lastBatchSoundAt > 400) {
            state.lastBatchSoundAt = Date.now()
            safe(playFirstSound, undefined)
          }
        }
        state.renderedCardKeys = new Set(cardKeys)
        updateAllowHighlight()
      }

      function scheduleShakeClear() {
        if (state.shakeTimer !== undefined) window.clearTimeout(state.shakeTimer)
        state.shakeTimer = window.setTimeout(() => {
          state.shakeTimer = undefined
          renderStack()
        }, 3200)
      }

      function scheduleRender() {
        if (state.renderScheduled) return
        state.renderScheduled = true
        window.requestAnimationFrame(() => {
          state.renderScheduled = false
          renderStack()
        })
      }

      function expandFold(items) {
        const target = priorityOf(items)
        if (target === undefined) return
        viewStore().expandedId = target.key
        target.visible = true
        viewStore().visibleIds.add(target.key)
        renderStack()
      }

      function nativeApprovalButtons() {
        const buttons = safe(() => [...document.querySelectorAll('button, [role="button"]')], [])
        const result = []
        for (const node of buttons) {
          if (node.closest(`#${V4_LAYER_ID}`) !== null) continue
          if (node.closest(`#${HIGHLIGHT_ID}`) !== null) continue
          const text = asText(node.textContent)
          if (!/允许一次|始终允许|允许|拒绝|不同意|同意/u.test(text)) continue
          const rect = safe(() => node.getBoundingClientRect(), undefined)
          if (rect === undefined || rect.width < 10 || rect.height < 10) continue
          if (rect.bottom < 0 || rect.top > window.innerHeight) continue
          // Only the bottom dock's approval buttons matter. Buttons that belong
          // to approval cards in the conversation history must not trigger the
          // overlay (the cards themselves already sit above the dock now).
          const frameNow = state.frame ?? measureFrame()
          if (rect.top < frameNow.bottom + 2) continue
          result.push({ rect, text: text.trim().slice(0, 12) })
        }
        return result
      }

      function updateAllowHighlight() {
        const layer = ensureHighlightLayer()
        layer.textContent = ''
        state.hlCount = 0
        if (state.disposed) return
        const buttons = nativeApprovalButtons()
        if (buttons.length === 0) return
        const cardRects = [...state.nodes.values()].map((node) => safe(() => node.wrapper.getBoundingClientRect(), undefined)).filter((rect) => rect !== undefined)
        const overlaps = buttons.filter((button) => cardRects.some((card) => !(button.rect.right < card.left || button.rect.left > card.right || button.rect.bottom < card.top || button.rect.top > card.bottom)))
        if (overlaps.length === 0) return
        for (const button of overlaps) {
          const rect = button.rect
          const ring = el('div', { class: 'sn-hl' })
          ring.style.left = `${String(Math.round(rect.left - 4))}px`
          ring.style.top = `${String(Math.round(rect.top - 4))}px`
          ring.style.width = `${String(Math.round(rect.width + 8))}px`
          ring.style.height = `${String(Math.round(rect.height + 8))}px`
          layer.appendChild(ring)
          const label = el('div', { class: 'sn-hl-label', text: `点击这里：${button.text}` })
          label.style.left = `${String(Math.round(rect.left - 4))}px`
          label.style.top = `${String(Math.round(rect.top - 24))}px`
          layer.appendChild(label)
          state.hlCount += 1
        }
      }

      // ── navigation / actions ────────────────────────────────────────────

      function activate(sessionId) {
        if (typeof sessionId !== 'string' || sessionId.length === 0) return
        safe(() => {
          window.focus()
        }, undefined)
        const uiWorkspace = safe(() => ctx.get('uiWorkspace'), undefined)
        if (uiWorkspace !== undefined && uiWorkspace !== null && typeof uiWorkspace.openSession === 'function') {
          const opened = safe(() => {
            uiWorkspace.openSession(sessionId)
            return true
          }, false)
          if (opened) return
        }
        safe(() => {
          for (const element of document.querySelectorAll('[data-session-id]')) {
            if (element.getAttribute('data-session-id') === sessionId) {
              element.click()
              return
            }
          }
        }, undefined)
      }

      function ackHost(ids, via) {
        if (ids.length === 0) return
        safe(() => {
          fetch(ACK_ROUTE, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ids, via: clip(via, 380) }),
            cache: 'no-store',
          }).catch(() => {})
        }, undefined)
      }

      function ackEntry(entry, mode) {
        const permission = 'in-harness'
        let current = ''
        safe(() => {
          current = asText(currentSessionId())
        }, undefined)
        const via = `${mode};focus=${hasFocus() ? '1' : '0'};hidden=${document.hidden ? '1' : '0'};cur=${current};perm=${permission}`
        state.lastDiag = clip(via, 200)
        const hostId = typeof entry.hostId === 'string' && entry.hostId.length > 0 ? entry.hostId : clip(entry.key, 120)
        ackHost([hostId], via)
      }

      function dismissEntry(entry) {
        if (entry === undefined || entry.dismissed) return
        entry.dismissed = true
        viewStore().dismissedIds.add(entry.key)
        if (entry.idleTimer !== undefined) {
          window.clearTimeout(entry.idleTimer)
          entry.idleTimer = undefined
        }
        if (entry.test !== true) ackEntry(entry, 'dismissed')
        else state.lastDiag = 'test:dismissed'
        renderStack()
        updateTitleFlash()
      }

      /**
       * 去处理: the clicked reminder always disappears (only itself), and for a
       * real pending interaction the page ALWAYS navigates to its session.
       * The other cards/fold groups are preserved (view state is persisted), and
       * navigation must not disturb later arrivals.
       */
      function openEntry(entry) {
        if (entry === undefined || entry.acted || entry.dismissed) return
        const view = viewStore()
        entry.acted = true
        view.actedIds.add(entry.key)
        if (entry.idleTimer !== undefined) {
          window.clearTimeout(entry.idleTimer)
          entry.idleTimer = undefined
        }
        renderStack()
        updateTitleFlash()
        if (entry.test === true) {
          showToast('提示有效，正在处理', `测试提醒 · 不会跳转（真实提醒会打开「${entry.sessionTitle}」）`)
          state.lastDiag = 'test:opened'
          armSecondReminder(entry)
          return
        }
        const others = [...state.entries.values()].filter((candidate) => candidate !== entry && !candidate.acted && !candidate.dismissed).length
        const detail = others > 0
          ? `${entry.sessionTitle}${entry.workspace.length > 0 ? ` · ${entry.workspace}` : ''}（其余 ${String(others)} 条提醒已保留）`
          : `${entry.sessionTitle}${entry.workspace.length > 0 ? ` · ${entry.workspace}` : ''}`
        showToast('提示有效，正在处理', detail)
        ackEntry(entry, 'opened')
        window.setTimeout(() => activate(entry.sessionId), 60)
        armSecondReminder(entry)
      }

      function handleOpen(entry) {
        openEntry(entry)
      }

      function handleDismiss(entry) {
        dismissEntry(entry)
      }

      /**
       * The "second reminder": only when the user clicked 去处理 and then did
       * NOTHING (no pointer/scroll/key activity) for the configured idle window.
       * Any activity counts as reading and keeps it quiet. This is NOT the 30s
       * escalation.
       */
      function armSecondReminder(entry) {
        if (state.settings.secondReminderEnabled !== true) return
        if (entry.secondReminderShown === true) return
        entry.openedAt = Date.now()
        const idleMs = Math.max(3000, Math.min(120000, state.settings.secondReminderIdleMs))
        if (entry.idleTimer !== undefined) window.clearTimeout(entry.idleTimer)
        entry.idleTimer = window.setTimeout(() => {
          entry.idleTimer = undefined
          if (state.disposed) return
          if (state.entries.get(entry.key) !== entry) return
          if (entry.acted !== true || entry.secondReminderShown === true) return
          if (document.visibilityState !== 'visible') return
          if (state.lastActivityAt > entry.openedAt) return
          entry.secondReminderShown = true
          entry.acted = false
          entry.visible = true
          entry.lastEscalationAt = Date.now()
          viewStore().secondIds.add(entry.key)
          viewStore().visibleIds.add(entry.key)
          // Bring the second reminder to the front, expanded/highlighted when
          // it was folded away among older reminders.
          viewStore().expandedId = entry.key
          renderStack()
          playSecondReminderSound()
          ackEntry(entry, 'second-reminder')
          updateTitleFlash()
          state.lastDiag = 'second-reminder'
        }, idleMs)
      }

      // ── escalation (30s, per entry) ─────────────────────────────────────

      function escalationTick() {
        if (state.disposed) return
        const settings = state.settings
        if (settings.escalationEnabled !== true) return
        const now = Date.now()
        const changed = []
        for (const entry of state.entries.values()) {
          if (entry.acted || entry.dismissed) continue
          if (entry.visible !== true) continue
          if ((entry.stage ?? 0) >= settings.escalationMaxStages) continue
          const interval = entry.test === true && state.testFast ? 3000 : settings.escalationIntervalMs
          if (now - entry.lastEscalationAt < interval) continue
          entry.lastEscalationAt = now
          entry.stage = (entry.stage ?? 0) + 1
          entry.shakeUntil = now + 3000
          changed.push(entry)
        }
        if (changed.length === 0) return
        scheduleShakeClear()
        for (const entry of changed) {
          playEscalationSound(entry)
          ackEntry(entry, `escalated;stage=${String(entry.stage)}`)
        }
        renderStack()
      }

      // ── title flash ─────────────────────────────────────────────────────

      function startTitleFlash() {
        if (state.titleTimer !== undefined) return
        if (state.settings.titleFlash !== true) return
        const base = safe(() => document.title, undefined)
        if (typeof base !== 'string') return
        state.titleBase = base
        let on = false
        state.titleTimer = window.setInterval(() => {
          safe(() => {
            on = !on
            const count = visibleEntries().length
            document.title = on ? `${state.settings.brand} · ⚠ 待确认 (${String(count)}) — ${base}` : base
          }, undefined)
        }, 900)
        safe(() => {
          document.title = `${state.settings.brand} · ⚠ 待确认 (${String(visibleEntries().length)}) — ${base}`
        }, undefined)
      }

      function stopTitleFlash() {
        if (state.titleTimer !== undefined) {
          safe(() => window.clearInterval(state.titleTimer), undefined)
          state.titleTimer = undefined
        }
        if (typeof state.titleBase === 'string') safe(() => {
          document.title = state.titleBase
        }, undefined)
        state.titleBase = undefined
      }

      function updateTitleFlash() {
        if (visibleEntries().length > 0) startTitleFlash()
        else stopTitleFlash()
      }

      // ── activity detection (for the second reminder) ────────────────────

      function onUserActivity() {
        const now = Date.now()
        if (now - state.lastActivityAt < 80) return
        state.lastActivityAt = now
      }

      // ── test reminders (1 card every 2s, so the order is observable) ────

      function clearTestReminders() {
        for (const timer of state.testTimers) safe(() => window.clearTimeout(timer), undefined)
        state.testTimers = []
        if (state.testCleanupTimer !== undefined) {
          window.clearTimeout(state.testCleanupTimer)
          state.testCleanupTimer = undefined
        }
        if (state.testEntries.size === 0) return
        for (const entry of state.entries.values()) if (entry.test === true) cleanupEntry(entry)
        state.testEntries.clear()
        rebuildEntries()
      }

      function addTestEntry(index) {
        if (state.disposed) return
        const key = `test|${String(Date.now())}|${String(index)}`
        const seconds = Math.max(1, Math.round((state.settings.testReminderIntervalMs ?? 3000) / 1000))
        state.testEntries.set(key, {
          source: 'test',
          test: true,
          testKey: key,
          id: '',
          sessionId: `test-session-${String(index)}`,
          kind: index === 2 ? 'question' : 'approval',
          toolName: 'test',
          callId: '',
          reason: `第 ${String(index + 1)}/3 条测试提醒（每 ${String(seconds)} 秒一条）：验证按 1→2→3 依次弹出，点一条只消一条；点去处理后 10 秒不动可看到二次提醒`,
          storeKey: '',
          sessionTitle: ['测试工作区 A', '测试工作区 B', '测试工作区 C'][index] ?? '测试工作区',
          at: Date.now(),
        })
        rebuildEntries()
      }

      function startTestReminders() {
        clearTestReminders()
        // One card every `testReminderIntervalMs` (default 3s): three entries at
        // once would hide the pop order the user is testing.
        const interval = Math.max(1000, Math.min(30000, state.settings.testReminderIntervalMs ?? 3000))
        for (let index = 0; index < 3; index += 1) {
          state.testTimers.push(window.setTimeout(() => addTestEntry(index), index * interval))
        }
        state.testCleanupTimer = window.setTimeout(() => clearTestReminders(), 120000)
      }

      // ── settings: official Plugins-page config form ─────────────────────
      //
      // The browser half registers a `plugins.bundle.config` page keyed by the
      // bundle package name. The page reads/writes the Host entry's volatile
      // Config through ctx.configForms; every change is saved with one
      // `mutate([{ op:'set', path:[field], value }])` call (official DSH way).

      function installSettingsPage() {
        if (React === undefined) return
        ctx.inject(['slots', 'configForms'], (scope) => {
          const slots = safe(() => scope.slots, undefined)
          const configForms = safe(() => scope.configForms, undefined)
          if (slots === undefined || configForms === undefined) return
          const form = safe(() => configForms.get(SETTINGS_NAMESPACE), undefined)
          if (form === undefined || form === null) return
          state.configForm = form
          const dispose = safe(() => slots.inject('plugins.bundle.config', () => slots.register({
            name: 'plugins.bundle.config',
            key: PACKAGE_NAME,
          }, SentinelConfigPage)), undefined)
          if (typeof dispose === 'function') scope.effect(() => dispose, 'approval-notifier: settings page')
          state.settingsPageRegistered = true
          log('settings page registered')
        })
      }

      function SentinelConfigPage(props) {
        const view = props !== null && typeof props === 'object' ? props.view : undefined
        if (view === 'summary') return null
        return React.createElement(SentinelSettingsForm, null)
      }

      function SentinelSettingsForm() {
        const h = React.createElement
        const configFormRef = React.useRef(undefined)
        if (configFormRef.current === undefined) configFormRef.current = state.configForm
        const [snapshot, setSnapshot] = React.useState(() => safe(() => (configFormRef.current?.getSnapshot?.() ?? null), null))
        const [draft, setDraft] = React.useState(() => {
          const current = safe(() => configFormRef.current?.getSnapshot?.(), undefined)
          return isRecord(current) && isRecord(current.value) ? flatFromSettings(settingsFromSnapshot(current.value)) : { ...DEFAULTS }
        })
        const [assets, setAssets] = React.useState([])
        const [status, setStatus] = React.useState('')
        const [statusError, setStatusError] = React.useState(false)
        const dirtyRef = React.useRef(false)
        const [dirty, setDirty] = React.useState(false)
        const [animateKey, setAnimateKey] = React.useState(0)
        const savedRef = React.useRef(draft)
        const [accelerate, setAccelerate] = React.useState(false)

        React.useEffect(() => {
          const configForm = configFormRef.current
          if (configForm === undefined || typeof configForm.subscribe !== 'function') return undefined
          const refresh = () => {
            const next = safe(() => configForm.getSnapshot(), undefined)
            if (next === undefined) return
            setSnapshot(next)
            if (!dirtyRef.current) {
              const value = isRecord(next.value) ? next.value : {}
              const flat = flatFromSettings(settingsFromSnapshot(value))
              savedRef.current = flat
              setDraft(flat)
            }
          }
          refresh()
          const unsubscribe = safe(() => configForm.subscribe(refresh), undefined)
          return () => {
            if (typeof unsubscribe === 'function') safe(unsubscribe, undefined)
          }
        }, [])

        React.useEffect(() => {
          let cancelled = false
          safe(() => {
            fetch(ASSETS_ROUTE, { headers: { accept: 'application/json' }, cache: 'no-store', credentials: 'same-origin' })
              .then((response) => (response.ok ? response.json() : undefined))
              .then((data) => {
                if (cancelled) return
                setAssets(isRecord(data) && Array.isArray(data.assets) ? data.assets : [])
              })
              .catch(() => {})
          }, undefined)
          return () => {
            cancelled = true
          }
        }, [])

        const edit = (key, value) => {
          dirtyRef.current = true
          setDirty(true)
          setDraft((previous) => ({ ...previous, [key]: value }))
        }

        const save = async () => {
          const configForm = configFormRef.current
          if (configForm === undefined || typeof configForm.mutate !== 'function') {
            setStatus('当前宿主未提供插件配置写入通道')
            setStatusError(true)
            return
          }
          const saved = savedRef.current
          const operations = []
          for (const key of Object.keys(FIELDS)) {
            if (draft[key] === saved[key]) continue
            operations.push({ op: 'set', path: [key], value: draft[key] })
          }
          if (operations.length === 0) {
            setStatus('没有需要保存的修改')
            setStatusError(false)
            return
          }
          setStatus('保存中…')
          setStatusError(false)
          try {
            await configForm.mutate(operations)
            savedRef.current = { ...draft }
            dirtyRef.current = false
            setDirty(false)
            setStatus(`已保存 ${String(operations.length)} 项设置，提醒立即生效`)
          } catch (error) {
            setStatus(`保存失败：${clip(error instanceof Error ? error.message : String(error), 160)}`)
            setStatusError(true)
          }
        }

        const reset = () => {
          dirtyRef.current = true
          setDirty(true)
          setDraft({ ...DEFAULTS })
          setStatus('已填入默认值，点保存后生效')
          setStatusError(false)
        }

        const upload = async (file, kind) => {
          if (file === undefined) return undefined
          setStatus(`上传中：${file.name}…`)
          setStatusError(false)
          try {
            const dataBase64 = await readFileBase64(file)
            const response = await fetch(ASSETS_ROUTE, {
              method: 'POST',
              headers: { 'content-type': 'application/json', accept: 'application/json' },
              body: JSON.stringify({ name: file.name, mime: file.type, dataBase64 }),
              credentials: 'same-origin',
            })
            const data = await response.json().catch(() => undefined)
            if (!response.ok || !isRecord(data) || data.ok !== true || !isRecord(data.asset)) {
              const error = isRecord(data) && typeof data.error === 'string' ? data.error : `HTTP ${String(response.status)}`
              setStatus(`上传失败：${clip(error, 140)}`)
              setStatusError(true)
              return undefined
            }
            setAssets((previous) => [...previous.filter((item) => item.id !== data.asset.id), data.asset])
            setStatus(kind === 'image' ? '图片已上传，点保存后生效' : '音频已上传，点保存后生效')
            return data.asset
          } catch (error) {
            setStatus(`上传失败：${clip(error instanceof Error ? error.message : String(error), 120)}`)
            setStatusError(true)
            return undefined
          }
        }

        const chips = (options, active, onPick) => h('div', { className: 'sentinel-chips' },
          Object.entries(options).map(([id, label]) => h('button', {
            key: id,
            type: 'button',
            className: 'sentinel-chip',
            'data-active': active === id ? '1' : '0',
            onClick: () => onPick(id),
          }, label)))

        const row = (label, control, hint) => h('div', { className: 'sentinel-row' }, [
          h('span', { key: 'label', className: 'sentinel-hint', style: { minWidth: '92px' } }, label),
          control,
          hint !== undefined ? h('span', { key: 'hint', className: 'sentinel-hint' }, hint) : undefined,
        ])

        const numberField = (key, min, max, step) => h('input', {
          className: 'sentinel-input',
          type: 'number',
          min,
          max,
          step,
          value: String(draft[key]),
          onChange: (event) => {
            const parsed = Number(event.target.value)
            if (Number.isFinite(parsed)) edit(key, Math.max(min, Math.min(max, parsed)))
          },
        })

        const secondsField = (key, minSeconds, maxSeconds) => h('input', {
          className: 'sentinel-input',
          type: 'number',
          min: minSeconds,
          max: maxSeconds,
          step: 1,
          value: String(Math.round(draft[key] / 1000)),
          onChange: (event) => {
            const parsed = Number(event.target.value)
            if (Number.isFinite(parsed)) edit(key, Math.max(minSeconds, Math.min(maxSeconds, Math.round(parsed))) * 1000)
          },
        })

        const toggle = (key, label) => h('label', { className: 'sentinel-row', style: { margin: 0 } }, [
          h('input', {
            key: 'input',
            type: 'checkbox',
            checked: draft[key] === true,
            onChange: (event) => edit(key, event.target.checked),
          }),
          h('span', { key: 'label' }, label),
        ])

        const imageUrl = assetUrlOf(draft.customImageKind, draft.customImageAssetId, draft.customImageUrl)
        const soundUrl = assetUrlOf(draft.customSoundKind, draft.customSoundAssetId, draft.customSoundUrl)
        const escalationSoundUrl = assetUrlOf(draft.customEscalationSoundKind, draft.customEscalationSoundAssetId, draft.customEscalationSoundUrl)
        const writable = isRecord(snapshot) && snapshot.writable === false ? false : true

        return h('div', { className: 'sentinel-settings' }, [
          h('div', { key: 'note', className: 'sentinel-first' }, [
            h('h3', { key: 'title' }, '哨兵 · 确认提醒设置'),
            h('div', { key: 'hint', className: 'sentinel-hint' }, '只在 DeepSeek Harness 内提醒：右下角卡片 + 提示音 + 标题提示。只提醒，绝不替你确认或拒绝。'),
          ]),
          h('section', { key: 'test' }, [
            h('h3', null, '测试'),
            h('div', { className: 'sentinel-row' }, [
              h('button', { key: 'run', type: 'button', className: 'sentinel-btn primary', onClick: () => {
                state.testFast = accelerate
                startTestReminders()
                const seconds = Math.max(1, Math.round((state.settings.testReminderIntervalMs ?? 3000) / 1000))
                setStatus(`测试提醒已开始：每 ${String(seconds)} 秒一条，共 3 条（自动连续弹出）`)
                setStatusError(false)
              } }, '测试提醒（连续 3 条）'),
              h('button', { key: 'stop', type: 'button', className: 'sentinel-btn', onClick: () => {
                clearTestReminders()
                setStatus('已停止测试提醒')
                setStatusError(false)
              } }, '停止测试'),
              h('label', { key: 'accel', className: 'sentinel-row', style: { margin: 0 } }, [
                h('input', { key: 'input', type: 'checkbox', checked: accelerate, onChange: (event) => setAccelerate(event.target.checked) }),
                h('span', { key: 'label' }, '加速演示(3秒/级)'),
              ]),
            ]),
            h('div', { key: 'hint', className: 'sentinel-hint' }, '点上方按钮后，三条提醒会按约 3 秒间隔自动连续弹出（无需任何操作）；点某条「去处理」后 10 秒内不动鼠标/键盘，可测试红色「二次提醒」。测试提醒不会确认任何真实操作。'),
          ]),
          h('section', { key: 'animation' }, [
            h('h3', null, '弹出动画'),
            chips(ANIMATION_LABELS, draft.animationPreset, (id) => edit('animationPreset', id)),
            row('逐条间隔(ms)', numberField('animationStaggerMs', 0, 2000, 10)),
            h('div', { className: 'sentinel-row' }, [
              h('button', { key: 'preview', type: 'button', className: 'sentinel-btn', onClick: () => setAnimateKey((key) => key + 1) }, '预览动画'),
            ]),
            h('div', { className: 'sentinel-preview', key: `preview-${String(animateKey)}` }, [
              h('div', { key: 'card', className: 'an-card an-arriving', 'data-anim': draft.animationPreset, 'data-stage': '0', style: { width: '100%', maxWidth: '320px', pointerEvents: 'none' } }, [
                imageUrl.length > 0 ? h('img', { key: 'img', className: 'an-thumb', src: imageUrl, alt: '' }) : null,
                h('div', { key: 'head', className: 'an-head' }, [h('span', { key: 'dot', className: 'an-dot' }), h('span', { key: 'text', className: 'an-headline' }, '预览：工具 pwsh 请求审批')]),
                h('div', { key: 'detail', className: 'an-detail' }, '这是弹出动画与自定义图片的预览效果。'),
                h('div', { key: 'meta', className: 'an-meta' }, [h('span', { key: 'chip', className: 'an-chip' }, '预览'), h('span', { key: 'session' }, '示例会话')]),
              ]),
            ]),
            h('div', { className: 'sentinel-hint' }, '自定义动画图片（网图或本地图片/GIF）：'),
            h('div', { className: 'sentinel-row' }, [
              h('input', {
                key: 'url',
                className: 'sentinel-input',
                type: 'text',
                placeholder: '粘贴图片/GIF 网址 (https://…)',
                value: draft.customImageUrl,
                onChange: (event) => edit('customImageUrl', event.target.value),
              }),
              h('button', { key: 'use', type: 'button', className: 'sentinel-btn', onClick: () => {
                edit('customImageKind', /^https?:\/\//iu.test(draft.customImageUrl) ? 'url' : 'none')
                edit('customImageAssetId', '')
              } }, '使用网址'),
              h('label', { key: 'file', className: 'sentinel-btn' }, [
                '选择本地文件',
                h('input', { key: 'input', type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp', style: { display: 'none' }, onChange: (event) => {
                  const file = event.target.files !== null && event.target.files.length > 0 ? event.target.files[0] : undefined
                  void upload(file, 'image').then((asset) => {
                    if (asset === undefined) return
                    edit('customImageKind', 'asset')
                    edit('customImageAssetId', asset.id)
                  })
                } }),
              ]),
              h('button', { key: 'clear', type: 'button', className: 'sentinel-btn', onClick: () => {
                edit('customImageKind', 'none')
                edit('customImageUrl', '')
                edit('customImageAssetId', '')
              } }, '清除'),
            ]),
            imageUrl.length > 0 ? h('img', { key: 'thumb', className: 'an-thumb', src: imageUrl, alt: '自定义图片预览', style: { maxHeight: '52px', marginTop: '4px' } }) : null,
          ]),
          h('section', { key: 'sound' }, [
            h('h3', null, '首次提示音'),
            chips(SOUND_LABELS, draft.soundPreset, (id) => edit('soundPreset', id)),
            row('音量', h('span', { key: 'vol', className: 'sentinel-row', style: { flex: 1 } }, [
              h('input', {
                key: 'range',
                className: 'sentinel-input',
                type: 'range',
                min: 0,
                max: 100,
                step: 5,
                value: String(Math.round(draft.soundVolume * 100)),
                onChange: (event) => edit('soundVolume', Number(event.target.value) / 100),
              }),
              h('button', { key: 'play', type: 'button', className: 'sentinel-btn', onClick: () => playPreset(draft.soundPreset, draft.soundVolume) }, '试听'),
            ])),
            h('div', { className: 'sentinel-hint' }, '自定义提示音（外链或本地音频）：'),
            h('div', { className: 'sentinel-row' }, [
              h('input', {
                key: 'url',
                className: 'sentinel-input',
                type: 'text',
                placeholder: '粘贴音频网址 (https://…)',
                value: draft.customSoundUrl,
                onChange: (event) => edit('customSoundUrl', event.target.value),
              }),
              h('button', { key: 'use', type: 'button', className: 'sentinel-btn', onClick: () => {
                edit('customSoundKind', /^https?:\/\//iu.test(draft.customSoundUrl) ? 'url' : 'none')
                edit('customSoundAssetId', '')
              } }, '使用网址'),
              h('label', { key: 'file', className: 'sentinel-btn' }, [
                '选择本地文件',
                h('input', { key: 'input', type: 'file', accept: 'audio/*', style: { display: 'none' }, onChange: (event) => {
                  const file = event.target.files !== null && event.target.files.length > 0 ? event.target.files[0] : undefined
                  void upload(file, 'audio').then((asset) => {
                    if (asset === undefined) return
                    edit('customSoundKind', 'asset')
                    edit('customSoundAssetId', asset.id)
                  })
                } }),
              ]),
              h('button', { key: 'play', type: 'button', className: 'sentinel-btn', onClick: () => playCustom(draft.customSoundKind, draft.customSoundAssetId, draft.customSoundUrl, draft.soundVolume) }, '试听'),
              h('button', { key: 'clear', type: 'button', className: 'sentinel-btn', onClick: () => {
                edit('customSoundKind', 'none')
                edit('customSoundUrl', '')
                edit('customSoundAssetId', '')
              } }, '清除'),
            ]),
            soundUrl.length > 0 ? h('audio', { key: 'audio', className: 'sentinel-asset', src: soundUrl, controls: true }) : null,
          ]),
          h('section', { key: 'escalation' }, [
            h('h3', null, '30 秒分级升级（只放大该条）'),
            toggle('escalationEnabled', '启用分级升级：未处理时卡片逐级放大、提示音逐级更急更响'),
            row('间隔(秒)', secondsField('escalationIntervalMs', 10, 300), '(最小 10 秒)'),
            row('最大级数', numberField('escalationMaxStages', 1, 10, 1)),
            h('div', { className: 'sentinel-hint' }, '升级提示音（与首次提示音不同）：'),
            chips(ESCALATION_SOUND_LABELS, draft.escalationSoundPreset, (id) => edit('escalationSoundPreset', id)),
            h('div', { className: 'sentinel-row' }, [
              h('button', { key: 'play', type: 'button', className: 'sentinel-btn', onClick: () => {
                const volume = Math.max(0.05, Math.min(1, draft.soundVolume + draft.escalationVolumeStep * 2))
                playPreset(draft.escalationSoundPreset, volume)
              } }, '试听升级音'),
            ]),
            h('div', { className: 'sentinel-row' }, [
              h('input', {
                key: 'url',
                className: 'sentinel-input',
                type: 'text',
                placeholder: '自定义升级音网址 (https://…)',
                value: draft.customEscalationSoundUrl,
                onChange: (event) => edit('customEscalationSoundUrl', event.target.value),
              }),
              h('button', { key: 'use', type: 'button', className: 'sentinel-btn', onClick: () => {
                edit('customEscalationSoundKind', /^https?:\/\//iu.test(draft.customEscalationSoundUrl) ? 'url' : 'none')
                edit('customEscalationSoundAssetId', '')
              } }, '使用网址'),
              h('label', { key: 'file', className: 'sentinel-btn' }, [
                '本地音频',
                h('input', { key: 'input', type: 'file', accept: 'audio/*', style: { display: 'none' }, onChange: (event) => {
                  const file = event.target.files !== null && event.target.files.length > 0 ? event.target.files[0] : undefined
                  void upload(file, 'audio').then((asset) => {
                    if (asset === undefined) return
                    edit('customEscalationSoundKind', 'asset')
                    edit('customEscalationSoundAssetId', asset.id)
                  })
                } }),
              ]),
              h('button', { key: 'clear', type: 'button', className: 'sentinel-btn', onClick: () => {
                edit('customEscalationSoundKind', 'none')
                edit('customEscalationSoundUrl', '')
                edit('customEscalationSoundAssetId', '')
              } }, '清除'),
            ]),
            escalationSoundUrl.length > 0 ? h('audio', { key: 'audio', className: 'sentinel-asset', src: escalationSoundUrl, controls: true }) : null,
          ]),
          h('section', { key: 'second' }, [
            h('h3', null, '二次提醒（去处理后 10 秒无操作）'),
            toggle('secondReminderEnabled', '启用二次提醒：点「去处理」后若完全没有操作，再提醒一次并标注「二次提醒」'),
            row('空闲(毫秒)', numberField('secondReminderIdleMs', 3000, 120000, 1000), '(默认 10000)'),
            h('div', { key: 'hint', className: 'sentinel-hint' }, '有滚动、点击、按键、触摸任一操作时视为正在阅读，不打扰。二次提醒使用醒目的红色卡片 + “⚠ 二次提醒”横幅 + 双响提示音，与首次提醒明显不同，也不是 30 秒升级。'),
          ]),
          h('section', { key: 'misc' }, [
            h('h3', null, '其他'),
            row('提醒品牌名', h('input', {
              key: 'brand',
              className: 'sentinel-input',
              type: 'text',
              value: draft.brand,
              onChange: (event) => edit('brand', event.target.value.slice(0, 24)),
            })),
            toggle('titleFlash', '窗口标题闪烁待确认数量'),
          ]),
          h('div', { key: 'footer', className: 'sentinel-row', style: { borderTop: '1px solid rgba(255,255,255,.1)', paddingTop: '12px' } }, [
            h('button', { key: 'save', type: 'button', className: 'sentinel-btn primary', disabled: !writable, onClick: () => void save() }, '保存'),
            h('button', { key: 'reset', type: 'button', className: 'sentinel-btn', onClick: reset }, '恢复默认'),
            dirty ? h('span', { key: 'dirty', className: 'sentinel-hint' }, '有未保存的修改') : null,
            h('span', { key: 'status', className: statusError ? 'sentinel-status error' : 'sentinel-status' }, status),
          ]),
        ])
      }

      function readFileBase64(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onerror = () => reject(new Error('读取文件失败'))
          reader.onload = () => {
            const result = typeof reader.result === 'string' ? reader.result : ''
            const comma = result.indexOf(',')
            resolve(comma >= 0 ? result.slice(comma + 1) : '')
          }
          reader.readAsDataURL(file)
        })
      }

      // ── polling ─────────────────────────────────────────────────────────

      function scheduleNext(delay) {
        if (state.disposed) return
        if (state.pollTimer !== undefined) window.clearTimeout(state.pollTimer)
        state.pollTimer = window.setTimeout(() => {
          void poll()
        }, Math.max(500, Math.min(delay, 15000)))
      }

      function geometryDiag() {
        const frame = state.frame ?? measureFrame()
        const nodes = [...state.nodes.values()]
        let inside = true
        let minTop = Number.POSITIVE_INFINITY
        let maxBottom = 0
        for (const node of nodes) {
          const rect = safe(() => node.wrapper.getBoundingClientRect(), undefined)
          if (rect === undefined) continue
          minTop = Math.min(minTop, rect.top)
          maxBottom = Math.max(maxBottom, rect.bottom)
          if (rect.top < frame.top - 4 || rect.bottom > frame.bottom + 4 || rect.right > frame.right + 4) inside = false
        }
        let normal = 0
        let folded = 0
        let compact = 0
        for (const node of nodes) {
          if (node.wrapper.querySelector('.sn-fold') !== null) folded += 1
          else normal += 1
          const tierNode = node.wrapper.querySelector('.sn-card[data-tier="compact"]')
          if (tierNode !== null) compact += 1
        }
        const expanded = viewStore().hoverKey !== undefined ? '1' : '0'
        const bounds = nodes.length > 0 ? `${Math.round(minTop)},${Math.round(maxBottom)}` : '-'
        return `vw=${String(frame.viewWidth)}x${String(frame.viewHeight)};frame=${String(frame.top)},${String(frame.bottom)},${String(frame.right)};cw=${String(frame.cardWidth)};mode=${state.mode ?? 'full'};items=${String(nodes.length)};normal=${String(normal)};folded=${String(folded)};compact=${String(compact)};expanded=${expanded};inside=${inside ? '1' : '0'};bounds=${bounds};compress=${(state.layoutRatio ?? 1).toFixed(3)};hl=${String(state.hlCount)}`
      }

      function aliveDiag() {
        let current = ''
        safe(() => {
          current = asText(currentSessionId())
        }, undefined)
        const stages = visibleEntries().map((entry) => entry.stage).join(',')
        const second = [...state.entries.values()].filter((entry) => entry.secondReminderShown === true).length
        return `alive;page=${state.settingsPageRegistered ? '1' : '0'};pending=${String(visibleEntries().length)};second=${String(second)};stage=${stages};cfg=${clip(state.configRevision, 16)};focus=${hasFocus() ? '1' : '0'};hidden=${document.hidden ? '1' : '0'};geom=${geometryDiag()};cur=${current};last=${clip(state.lastDiag ?? '', 100)}`
      }

      async function poll() {
        if (state.disposed) return
        let delay = 1200
        try {
          const diag = encodeURIComponent(clip(aliveDiag(), 500))
          const response = await fetch(`${PENDING_ROUTE}?diag=${diag}`, {
            method: 'GET',
            headers: { accept: 'application/json' },
            cache: 'no-store',
            credentials: 'same-origin',
          })
          if (!response.ok) {
            state.pollFailures += 1
            scheduleNext(Math.min(delay * 2, 8000))
            return
          }
          const data = await response.json()
          state.pollFailures = 0
          state.hostOk = true
          if (isRecord(data)) {
            if (isRecord(data.settings)) {
              state.settings = normalizeSettings(data.settings)
              state.configRevision = asText(data.configRevision)
            }
            const list = Array.isArray(data.pending) ? data.pending : []
            state.hostRaw.clear()
            for (const raw of list) if (isRecord(raw) && typeof raw.id === 'string') state.hostRaw.set(raw.id, raw)
            rebuildEntries()
          }
        } catch (_error) {
          state.pollFailures += 1
          state.hostOk = false
          if (state.pollFailures === 3) log('host route unavailable; using the client pending store only')
          delay = Math.min(delay * 2, 8000)
        }
        scheduleNext(delay)
      }

      function syncLocalStore() {
        const uiSession = safe(() => ctx.uiSession, undefined)
        if (uiSession === undefined || uiSession === null) return
        const store = safe(() => uiSession.sessionStatus, undefined)
        if (store === undefined || typeof store.getSnapshot !== 'function') return
        const snapshot = safe(() => store.getSnapshot(), undefined)
        if (!(snapshot instanceof Map)) return
        state.localRaw.clear()
        for (const [sessionId, status] of snapshot) {
          if (!isRecord(status) || !isRecord(status.pendingInteraction)) continue
          state.localRaw.set(String(sessionId) + ':' + asText(status.pendingInteraction.key), status.pendingInteraction)
        }
        rebuildEntries()
      }

      // ── lifecycle ───────────────────────────────────────────────────────

      function dispose() {
        if (state.disposed) return
        state.disposed = true
        if (state.pollTimer !== undefined) safe(() => window.clearTimeout(state.pollTimer), undefined)
        if (state.escalationTimer !== undefined) safe(() => window.clearInterval(state.escalationTimer), undefined)
        if (state.titleTimer !== undefined) safe(() => window.clearInterval(state.titleTimer), undefined)
        if (state.toastTimer !== undefined) safe(() => window.clearTimeout(state.toastTimer), undefined)
        if (state.toastHideTimer !== undefined) safe(() => window.clearTimeout(state.toastHideTimer), undefined)
        clearTestReminders()
        if (state.arrivalTimer !== undefined) safe(() => window.clearTimeout(state.arrivalTimer), undefined)
        if (state.shakeTimer !== undefined) safe(() => window.clearTimeout(state.shakeTimer), undefined)
        for (const entry of state.entries.values()) {
          if (entry.idleTimer !== undefined) safe(() => window.clearTimeout(entry.idleTimer), undefined)
        }
        state.entries.clear()
        for (const node of state.nodes.values()) safe(() => node.wrapper.remove(), undefined)
        state.nodes.clear()
        if (state.layer !== undefined) safe(() => state.layer.remove(), undefined)
        if (state.highlight !== undefined) safe(() => state.highlight.remove(), undefined)
        state.layer = undefined
        state.highlight = undefined
        if (state.stack !== undefined) safe(() => state.stack.remove(), undefined)
        if (state.toast !== undefined) safe(() => state.toast.remove(), undefined)
        for (const audio of state.audioEls.values()) safe(() => audio.pause(), undefined)
        state.audioEls.clear()
        if (state.audioCtx !== undefined && typeof state.audioCtx.close === 'function') safe(() => state.audioCtx.close(), undefined)
        state.audioCtx = undefined
        state.stack = undefined
        state.toast = undefined
        safe(() => {
          if (window[GLOBAL_GUARD] !== undefined && window[GLOBAL_GUARD] !== null && window[GLOBAL_GUARD].dispose === dispose) window[GLOBAL_GUARD] = undefined
        }, undefined)
        log('disposed')
      }

      // Expose the config form captured by installSettingsPage to the page.
      installSettingsPage()

      purgeLegacyUi()
      ensureStyle()
      ensureV4Style()
      ensureToast()
      ensureV4Layer()
      ensureHighlightLayer()
      renderStack()
      window[GLOBAL_GUARD] = { dispose }
      ctx.effect(() => () => dispose(), 'approval-notifier: whole ui')

      // Session titles / workspace labels arrive after the pending snapshot.
      ctx.effect(() => {
        const list = safe(() => ctx.sessions.list, undefined)
        if (list === undefined || typeof list.subscribe !== 'function') return () => {}
        const disposer = safe(() => list.subscribe(() => {
          if (state.entries.size > 0) rebuildEntries()
        }), undefined)
        return () => {
          if (typeof disposer === 'function') safe(disposer, undefined)
        }
      }, 'approval-notifier: session title refresh')

      // Global pending-interaction store: fallback when the host route is unreachable.
      ctx.effect(() => {
        const uiSession = safe(() => ctx.uiSession, undefined)
        if (uiSession === undefined || uiSession === null) return () => {}
        const store = safe(() => uiSession.sessionStatus, undefined)
        if (store === undefined || typeof store.subscribe !== 'function') return () => {}
        const disposer = safe(() => store.subscribe(() => syncLocalStore()), undefined)
        syncLocalStore()
        return () => {
          if (typeof disposer === 'function') safe(disposer, undefined)
        }
      }, 'approval-notifier: pending store fallback')

      state.escalationTimer = window.setInterval(() => safe(escalationTick, undefined), 1000)

      // User-activity detection for the second reminder. Any pointer, scroll,
      // wheel, key or touch event counts as "reading / acting" and suppresses it.
      for (const eventName of ['pointermove', 'pointerdown', 'wheel', 'keydown', 'touchstart', 'focus']) {
        safe(() => window.addEventListener(eventName, onUserActivity, { passive: true, capture: true }), undefined)
      }
      safe(() => document.addEventListener('scroll', onUserActivity, { passive: true, capture: true }), undefined)
      safe(() => document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') onUserActivity()
      }), undefined)
      safe(() => window.addEventListener('resize', () => {
        state.frame = undefined
        renderStack()
      }), undefined)
      safe(() => window.addEventListener('scroll', () => updateAllowHighlight(), { passive: true, capture: true }), undefined)
      safe(() => document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          renderStack()
          updateAllowHighlight()
        }
      }), undefined)

      void poll()
    }

    exports.inject = ['sessions', 'uiSession']
    exports.apply = apply
    return module.exports
  },
})
