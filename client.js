/**
 * dsh-agent-personality — Client half (v2).
 *
 * 1. conversation.chat.turnTail (order 11, right after dsh-cost-meter's 10):
 *    the closing line, slipped into the cost meter's <summary>.
 * 2. settings.section: four tabs.
 *      人格卡 — persona card, worldview, emotion variable, optimize/preview
 *      记忆   — one diary row per turn
 *      关系网 — character sheet, relationship network, small graph
 *      设置   — switches, learning, proactive plan, diagnostics
 */

window.__ModuleLoader__.load({
  id: 'dsh-agent-personality',
  factory: function (require) {
    'use strict'

    var React = require('react')
    var h = React.createElement
    var useEffect = React.useEffect
    var useRef = React.useRef
    var useState = React.useState
    var useCallback = React.useCallback

    var API = '/api/agent-personality-v1'
    var CLIENT_BUILD = '55'
    // 关系卡面正在编辑的那份草稿和自动保存计时器（放在模块作用域，防抖时才拿得到最新值）
    var charDraftLive = null
    var charSaveTimer = null
    var NS = 'dsh-agent-personality'
    var TABS = [
      { id: 'persona', label: '性格' },
      { id: 'memory', label: '记忆' },
      { id: 'network', label: '关系' },
      { id: 'source', label: '主动学习' },
      { id: 'settings', label: '设置' },
    ]

    // 学习结果按这三类分开放，一条一条勾着导入
    var LEARN_GROUPS = [
      { id: 'persona', label: '性格', target: 'Information.md', hint: '她自己的性格、爱好、说话习惯' },
      { id: 'relation', label: '关系', target: 'Relation.md', hint: '其他角色是谁、和她什么关系' },
      { id: 'worldview', label: '世界观', target: 'Information.md', hint: '这个世界怎么运转、有哪些组织' },
      { id: 'memory', label: '记忆', target: 'Memory.md', hint: '其他对得上号的设定' },
    ]

    function learnTagOf(tag) {
      var value = String(tag || '')
      return LEARN_GROUPS.some(function (group) { return group.id === value }) ? value : 'memory'
    }

    function learnKey(entry, index) {
      return learnTagOf(entry && entry.tag) + '|' + String((entry && entry.text) || '') + '|' + String(index)
    }

    // ------------------------------------------------------------ http

    function readJson(response) {
      return response.json().then(function (data) {
        if (!response.ok || data.ok === false) {
          throw new Error((data && data.error) || ('HTTP ' + response.status))
        }
        return data
      })
    }

    function apiGet(path) {
      return fetch(API + path, { cache: 'no-store', credentials: 'same-origin' }).then(readJson)
    }

    function apiPost(path, body) {
      return fetch(API + path, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {}),
      }).then(readJson)
    }

    // ------------------------------------------------------------ styles

    var CSS = [
      '.ap-root{box-sizing:border-box;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.55}',
      '.ap-root *{box-sizing:border-box}',
      '.ap-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px}',
      '.ap-title{margin:0;font-size:17px;font-weight:650;letter-spacing:.01em}',
      '.ap-sub{margin:4px 0 0;color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.ap-tabs{display:flex;gap:4px;border-bottom:1px solid var(--dsw-alias-border-l1);margin-bottom:16px;flex-wrap:wrap}',
      '.ap-tab{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);padding:8px 12px;border-radius:8px 8px 0 0;cursor:pointer;font-size:13px;position:relative;top:1px}',
      '.ap-tab:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}',
      '.ap-tab.active{color:var(--dsw-alias-label-primary);border-bottom:2px solid var(--dsw-alias-brand-primary);font-weight:600}',
      '.ap-card{display:flex;flex-direction:column;gap:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);padding:16px 14px;margin-bottom:14px}',
      '.ap-card h3{margin:0;padding-bottom:2px;font-size:13px;font-weight:650;color:var(--dsw-alias-label-primary);display:flex;align-items:center;gap:8px}',
      '.ap-card h3 small{font-weight:400;color:var(--dsw-alias-label-secondary);font-size:11.5px}',
      '.ap-tags{display:flex;flex-direction:column;gap:6px;margin:2px 0 0}',
      '.ap-tag{font-size:12px;line-height:1.55;color:var(--dsw-alias-label-secondary);border-left:2px solid var(--dsw-alias-border-l2);padding-left:8px}',
      '.ap-note{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.ap-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.ap-row:last-child{border-bottom:0}',
      '.ap-row-label{font-size:13px;font-weight:550}',
      '.ap-row-desc{font-size:12px;color:var(--dsw-alias-label-secondary);margin-top:2px;max-width:420px}',
      '.ap-textarea{width:100%;box-sizing:border-box;min-height:340px;max-height:340px;overflow:auto;resize:vertical;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);padding:11px 12px;font-family:ui-monospace,SFMono-Regular,Consolas,"Microsoft YaHei",monospace;font-size:12.5px;line-height:1.7;white-space:pre-wrap;word-break:break-word;outline:none;margin:8px 0 0}',
      '.ap-textarea:focus{border-color:var(--dsw-alias-label-secondary);box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-label-secondary) 18%, transparent)}',
      '.ap-textarea.short{min-height:130px;max-height:130px}',
      '.ap-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:2px}',
      '.ap-btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12.5px;font-weight:400;line-height:1;white-space:nowrap;cursor:pointer;transition:background .12s ease,border-color .12s ease,opacity .12s ease}',
      '.ap-btn:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-secondary)}',
      '.ap-btn:active{background:var(--dsw-alias-bg-layer-2)}',
      '.ap-btn:disabled{opacity:.5;cursor:not-allowed}',
      '.ap-btn:disabled:hover{background:transparent;border-color:var(--dsw-alias-border-l2)}',
      '.ap-btn:focus-visible{outline:2px solid var(--dsw-alias-label-secondary);outline-offset:2px}',
      '.ap-btn.primary{border-color:var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);font-weight:400}',
      '.ap-btn.primary:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-secondary)}',
      '.ap-btn.danger{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary);background:transparent}',
      '.ap-btn.danger:hover{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent);border-color:var(--dsw-alias-state-error-primary)}',
      '.ap-btn.ghost{border-color:var(--dsw-alias-border-l2);background:transparent}',
      '.ap-btn.ghost:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-secondary)}',
      '.ap-btn.tiny{height:24px;padding:0 8px;font-size:11.5px;border-radius:6px}',
      '.ap-ver{padding:1px 6px;border-radius:4px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary);font-size:10px;letter-spacing:.04em}',
      '.ap-spacer{flex:1}',
      '.ap-meta{display:flex;flex-wrap:wrap;gap:14px;margin-top:8px;color:var(--dsw-alias-label-secondary);font-size:11.5px;font-variant-numeric:tabular-nums}',
      '.ap-pill{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);font-size:11.5px;color:var(--dsw-alias-label-secondary)}',
      '.ap-pill.on{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}',
      '.ap-affection{display:flex;align-items:baseline;gap:10px;margin:2px 0 10px;flex-wrap:wrap}',
      '.ap-affection strong{font-size:36px;line-height:1;font-weight:700;font-variant-numeric:tabular-nums}',
      '.ap-affection strong.neg{color:var(--dsw-alias-state-error-primary)}',
      '.ap-affection span{color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.ap-scale{position:relative;height:10px;border-radius:999px;background:linear-gradient(90deg,rgba(240,138,180,.15),var(--dsw-alias-bg-layer-2) 50%,rgba(240,138,180,.35));border:1px solid var(--dsw-alias-border-l1);margin:6px 0 2px}',
      '.ap-scale i{position:absolute;top:-4px;width:6px;height:18px;border-radius:3px;background:var(--dsw-alias-brand-primary);transform:translateX(-50%);box-shadow:0 0 0 2px var(--dsw-alias-bg-layer-1);transition:left .3s ease}',
      '.ap-scale b{position:absolute;left:50%;top:-2px;width:1px;height:14px;background:var(--dsw-alias-border-l2)}',
      '.ap-scale-labels{display:flex;justify-content:space-between;color:var(--dsw-alias-label-secondary);font-size:10.5px;margin-top:2px}',
      '.ap-bar{height:8px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);overflow:hidden;border:1px solid var(--dsw-alias-border-l1)}',
      '.ap-bar > i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--dsw-alias-brand-primary),#f08ab4);transition:width .3s ease}',
      '.ap-meter-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:12px}',
      '.ap-gradient{position:relative;height:12px;border-radius:999px;overflow:visible;border:1px solid var(--dsw-alias-border-l1)}',
      '.ap-gradient::before{content:"";position:absolute;left:50%;top:-4px;bottom:-4px;width:1px;background:var(--dsw-alias-border-l2);opacity:.75}',
      '.ap-gradient > i{position:absolute;top:50%;width:12px;height:12px;margin-left:-6px;margin-top:-6px;border-radius:50%;background:#fff;box-shadow:0 1px 5px rgba(0,0,0,.4);transition:left .3s ease}',
      // 情感：左蓝 → 中间零界点 → 右粉
      '.ap-emotion{background:linear-gradient(90deg,#7aaaff 0%,#b6ccfa 45%,#f8c6da 55%,#f08ab4 100%)}',
      '.ap-energy{background:linear-gradient(90deg,#7aaaff 0%,#becff5 45%,#ffb4b4 55%,#ff5a5a 100%)}',
      '.ap-ev{margin-top:14px}',
'.ap-ev-head{display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;padding:8px 10px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer;transition:border-color .15s ease,background .15s ease}',
'.ap-ev-head:hover{border-color:var(--dsw-alias-border-l2);background:color-mix(in srgb, var(--dsw-alias-label-primary) 4%, var(--dsw-alias-bg-layer-2))}',
'.ap-ev-title{font-weight:600;letter-spacing:.2px}',
'.ap-ev-chip{font-size:10.5px;line-height:1;padding:3px 7px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
'.ap-ev-caret{margin-left:auto;font-size:10px;color:var(--dsw-alias-label-tertiary);transition:transform .15s ease}',
'.ap-ev-head.open .ap-ev-caret{color:var(--dsw-alias-label-secondary)}',
'.ap-ev-list{margin-top:8px;display:flex;flex-direction:column;gap:6px;max-height:280px;overflow-y:auto;padding-right:2px}',
'.ap-ev-item{display:flex;align-items:baseline;gap:8px;padding:7px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);border-left:2px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);font-size:11.5px;line-height:1.55}',
'.ap-ev-item.up{border-left-color:var(--dsw-alias-state-success-primary)}',
'.ap-ev-item.down{border-left-color:var(--dsw-alias-state-error-primary)}',
'.ap-ev-item:hover{border-color:var(--dsw-alias-border-l2)}',
'.ap-ev-badge{flex:0 0 auto;font-size:10.5px;line-height:1;padding:3px 6px;border-radius:5px;color:var(--dsw-alias-label-secondary);background:color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent)}',
'.ap-ev-badge.energy{color:var(--dsw-alias-label-tertiary)}',
'.ap-ev-delta{flex:0 0 auto;min-width:34px;text-align:right;font-variant-numeric:tabular-nums;font-weight:650}',
'.ap-ev-item.up .ap-ev-delta{color:var(--dsw-alias-state-success-primary)}',
'.ap-ev-item.down .ap-ev-delta{color:var(--dsw-alias-state-error-primary)}',
'.ap-ev-text{flex:1;min-width:0;color:var(--dsw-alias-label-primary);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word}',
'.ap-ev-time{flex:0 0 auto;font-size:10.5px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;white-space:nowrap}',
'.ap-evidence{margin-top:8px;display:flex;flex-direction:column;gap:4px;max-height:260px;overflow:auto}',
      '.ap-evidence-row{display:flex;gap:8px;align-items:baseline;font-size:11.5px;color:var(--dsw-alias-label-secondary)}',
      '.ap-evidence-kind{min-width:28px;color:var(--dsw-alias-label-tertiary)}',
      '.ap-evidence-text{flex:1;color:var(--dsw-alias-label-primary)}',
      '.ap-evidence-time{font-size:10.5px;color:var(--dsw-alias-label-tertiary)}',
      '.ap-pending{border:1px dashed var(--dsw-alias-border-l2);border-radius:10px;padding:10px 12px;margin-top:10px;background:var(--dsw-alias-bg-layer-2)}',
      '.ap-pending-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}',
      '.ap-pending-text{margin:0 0 8px;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-primary)}',
      '.ap-learn-groups{display:flex;flex-direction:column;gap:10px;margin:4px 0 10px}',
      '.ap-learn-group{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:8px 10px}',
      '.ap-learn-head{display:flex;align-items:baseline;gap:8px;margin-bottom:6px;font-size:13px}',
      '.ap-learn-row{display:flex;align-items:flex-start;gap:8px;padding:4px 0;font-size:12px;line-height:1.55;cursor:pointer}',
      '.ap-learn-text{flex:1;word-break:break-word}',
      '.ap-plan-head{display:flex;align-items:baseline;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l1)}',
'.ap-plan-head strong{font-size:13px;font-weight:650}',
'.ap-plan-list{display:flex;flex-direction:column;gap:6px;margin:10px 0 4px;max-height:212px;overflow-y:auto;padding-right:2px}',
'.ap-plan-item{display:flex;align-items:center;gap:8px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:6px 9px;font-size:12px;line-height:1.5}',
'.ap-plan-main{flex:1;min-width:0;overflow:hidden}',
'.ap-plan-topic{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
'.ap-plan-meta{margin-top:2px;font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
'.ap-learn-list{display:flex;flex-direction:column;flex-wrap:nowrap;gap:6px;max-height:226px;overflow-y:auto;padding-right:2px}',
      '.ap-learn-item{display:flex;align-items:center;gap:8px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:6px 9px;flex:0 0 auto;height:52px;box-sizing:border-box;overflow:hidden;font-size:12px;line-height:1.55}',
      '.ap-learn-item .ap-learn-text{flex:1;min-width:0;overflow:hidden;max-height:38px}',
      '.ap-learn-acts{display:flex;align-items:center;gap:6px;flex:none}',
      '.ap-stack{margin-top:8px;display:flex;flex-direction:column;gap:6px}',
      '.ap-stack-row{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:6px 8px;background:var(--dsw-alias-bg-layer-2)}',
      '.ap-skill{display:flex;align-items:center;gap:12px}',
      '.ap-skill .ap-note{max-width:360px;text-align:right}',
      '.ap-skill-row{display:flex;align-items:center;gap:12px;padding:9px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}',
      '.ap-skill-row+.ap-skill-row{margin-top:8px}',
      '.ap-skill-main{display:flex;align-items:baseline;gap:10px;min-width:0;flex:1}',
      '.ap-skill-plugin{font-size:12px;padding:1px 7px;border-radius:6px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);white-space:nowrap}',
      '.ap-skill-purpose{font-size:12.5px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.ap-stack-head{display:flex;gap:8px;align-items:center;font-size:12px}',
      '.ap-stack-title{flex:0 1 auto;color:var(--dsw-alias-label-primary)}',
      '.ap-stack-body{margin-top:6px;font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-secondary);word-break:break-all}',
      '.ap-graph-edge{font-size:14px;fill:var(--dsw-alias-label-tertiary);cursor:pointer}',
      '.ap-mood{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}',
      '.ap-mood-card{flex:1;min-width:130px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px 12px;background:var(--dsw-alias-bg-layer-2)}',
      '.ap-mood-card b{display:block;font-size:14px;margin-top:2px}',
      '.ap-mood-card small{color:var(--dsw-alias-label-secondary);font-size:11.5px}',
      '.ap-mem-list{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:7px}',
      '.ap-mem-list li{padding:8px 10px;border-left:2px solid var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2);border-radius:0 8px 8px 0;font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.ap-empty{padding:16px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:12px;border:1px dashed var(--dsw-alias-border-l2);border-radius:10px}',
      '.ap-toast{position:sticky;bottom:0;margin:12px 0 0;padding:9px 12px;border-radius:9px;font-size:12px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay);z-index:2}',
      '.ap-toast.err{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}',
      '.ap-toast.ok{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}',
      '.ap-switch{position:relative;display:inline-block;flex:0 0 auto;width:40px;height:22px;padding:0;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:color-mix(in srgb, var(--dsw-alias-label-primary) 26%, transparent);cursor:pointer;transition:background .16s ease,border-color .16s ease;vertical-align:middle}',
      '.ap-switch:hover{border-color:var(--dsw-alias-label-tertiary)}',
      '.ap-switch:focus-visible{outline:2px solid var(--dsw-alias-label-secondary);outline-offset:2px}',
      '.ap-switch i{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.45);transition:transform .16s ease,background .16s ease;pointer-events:none}',
      '.ap-switch.on{background:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}',
      '.ap-switch.on:hover{border-color:var(--dsw-alias-state-success-primary)}',
      '.ap-switch.on i{transform:translateX(20px);background:#fff}',
      '.ap-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}',
      '.ap-kv{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px 12px;background:var(--dsw-alias-bg-layer-2);min-width:0}',
      '.ap-kv small{display:block;color:var(--dsw-alias-label-secondary);font-size:11px;margin-bottom:3px}',
      '.ap-kv code{font-family:ui-monospace,Consolas,monospace;font-size:11.5px;word-break:break-all;color:var(--dsw-alias-label-primary)}',
      '.ap-code{display:block;margin-top:6px;padding:8px 10px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);font-family:ui-monospace,Consolas,monospace;font-size:11.5px;word-break:break-all;color:var(--dsw-alias-label-secondary)}',
      '.ap-turn-slot{display:block;margin-top:5px;font-size:12px;color:var(--dsw-alias-label-secondary);opacity:.8}',
      '.ap-turn-closing{display:inline;margin-left:10px;color:var(--dsw-alias-label-secondary);opacity:.8;font-size:12px;font-weight:400;letter-spacing:.01em;vertical-align:baseline}',
      '.ap-turn-closing:before{content:"·";margin-right:6px;opacity:.55}',
      '.ap-preview{display:flex;flex-direction:column;gap:6px;margin-top:10px;padding:12px 14px;border-radius:10px;background:var(--dsw-alias-bg-layer-2);border-left:3px solid var(--dsw-alias-brand-primary);font-size:14px;line-height:1.6}',
      '.ap-preview small{color:var(--dsw-alias-label-secondary);font-size:11.5px}',
      '.ap-loading{padding:28px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.ap-error{margin:0 0 12px;padding:10px 12px;border-radius:9px;border:1px solid var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary);font-size:12px}',
      '.ap-field{display:flex;flex-direction:column;gap:6px;font-size:11.5px;color:var(--dsw-alias-label-secondary);min-width:0}',
      '.ap-input{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:7px 9px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12.5px;width:100%;outline:none;font-family:inherit}',
      '.ap-input:focus{border-color:var(--dsw-alias-label-secondary);box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-label-secondary) 18%, transparent)}',
      '.ap-input{height:32px;box-sizing:border-box}',
      '.ap-table{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed}',
      '.ap-table th{text-align:left;color:var(--dsw-alias-label-secondary);font-weight:500;padding:6px 4px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:11px}',
      '.ap-table td{padding:2px 2px}',
      '.ap-table input{border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-primary);padding:6px;border-radius:6px;width:100%;font-size:12px;font-family:inherit;outline:none}',
      '.ap-table input:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.ap-table input:focus{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-secondary)}',
      '.ap-graph-scroll{max-height:520px;overflow-y:auto;overflow-x:hidden}',
      '.ap-graph{width:100%;height:auto;display:block;margin-top:4px}',
      '.ap-graph text{fill:var(--dsw-alias-label-secondary);font-size:16px}',
      '.ap-graph .self{fill:var(--dsw-alias-brand-primary)}',
      '.ap-mates{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px;margin:14px 0 6px}',
      '.ap-mate{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:11px 12px;background:var(--dsw-alias-bg-layer-2)}',
      '.ap-mate-head{display:flex;align-items:center;gap:10px}',
      '.ap-mate-avatar{width:26px;height:26px;flex:0 0 26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:650;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2)}',
      '.ap-mate-title{min-width:0}',
      '.ap-mate-name{font-size:12.5px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.ap-mate-meta{margin-top:2px;font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.ap-mate-notes{margin-top:9px;padding-top:8px;border-top:1px dashed var(--dsw-alias-border-l1);font-size:11.5px;line-height:1.5;color:var(--dsw-alias-label-secondary)}',
      '.ap-mate-facts{margin:7px 0 0;padding-left:16px;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}',
      '.ap-mate-facts li{margin:3px 0}',
      '.ap-mate-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:12px 0 4px;max-height:236px;overflow-y:auto;padding-right:2px}',
      '.ap-mate-card{padding:12px 13px;min-height:66px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 6px 18px rgba(0,0,0,.14);cursor:pointer;transition:border-color .18s ease,box-shadow .18s ease}',
      '.ap-mate-card:hover{box-shadow:0 10px 26px rgba(0,0,0,.2)}',
      '.ap-mate-card.open{grid-column:1 / -1;cursor:default;border-color:var(--dsw-alias-brand-primary);box-shadow:0 14px 34px rgba(0,0,0,.24)}',
      '.ap-mate-toggle{font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.ap-deck-face{display:flex;align-items:center;gap:10px;min-width:0}',
      '.ap-deck-avatar{width:30px;height:30px;flex:0 0 30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:650;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2)}',
      '.ap-deck-title{min-width:0}',
      '.ap-deck-name{font-size:13px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.ap-deck-meta{margin-top:2px;font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.ap-deck-body{margin-top:12px;padding-top:11px;border-top:1px dashed var(--dsw-alias-border-l1);display:flex;flex-direction:column;gap:9px}',
      '.ap-deck-field{display:flex;flex-direction:column;gap:4px}',
      '.ap-deck-field small{font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.ap-deck-field input,.ap-deck-field textarea{width:100%;box-sizing:border-box;padding:6px 8px;font-size:12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.ap-deck-notes{min-height:64px;line-height:1.5;resize:vertical;font-family:inherit}',
      '.ap-md-view{margin:8px 0 0;padding:11px 12px;max-height:340px;overflow:auto;font-size:11.5px;line-height:1.6;white-space:pre-wrap;word-break:break-word;border-radius:10px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}',
      '.ap-diary{display:flex;flex-direction:column;gap:8px;margin-top:10px;max-height:480px;overflow:auto;padding-right:2px}',
      '.ap-diary-row{display:flex;gap:12px;align-items:flex-start;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-2)}',
      '.ap-diary-time{flex:0 0 88px;color:var(--dsw-alias-label-secondary);font-size:11px;font-variant-numeric:tabular-nums;padding-top:2px}',
      '.ap-diary-body{flex:1;min-width:0}',
      '.ap-diary-text{font-size:12.5px;word-break:break-word}',
      '.ap-diary-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:5px;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.ap-signed{font-variant-numeric:tabular-nums;font-weight:600}',
      '.ap-signed.neg{color:var(--dsw-alias-state-error-primary)}',
      '.ap-signed.pos{color:var(--dsw-alias-state-success-primary)}',
      '.ap-details{margin-top:6px}',
      '.ap-details summary{cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:12px;padding:4px 0}',
      '@media (max-width:560px){.ap-textarea{min-height:260px;max-height:260px}.ap-head{flex-direction:column;gap:8px}.ap-diary-time{flex-basis:64px}}',
    ].join('\n')

    // ------------------------------------------------------------ turn tail

    // 正文里藏着的那句心里话（<!--内心：…-->）不该出现在气泡里：
    // 它是给费用行右边用的，这里把原文里那截注释抹掉
    function hideInnerThoughts(root) {
      var scope = root || document.body
      if (!scope) return
      var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, null)
      var hits = []
      while (walker.nextNode()) {
        var value = walker.currentNode.nodeValue || ''
        if (value.indexOf('<!--') < 0 || value.indexOf('内心') < 0) continue
        hits.push(walker.currentNode)
      }
      for (var i = 0; i < hits.length; i += 1) {
        var node = hits[i]
        var text = node.nodeValue || ''
        var start = text.indexOf('<!--')
        if (start < 0) continue
        var end = text.indexOf('-->', start)
        end = end < 0 ? text.length : end + 3
        node.nodeValue = (text.slice(0, start) + text.slice(end)).replace(/\s+$/, '')
      }
    }

    function TurnTail(props) {
      var sessionId = props && props.sessionId ? String(props.sessionId) : ''
      var endSeq = props && props.turn && props.turn.end ? props.turn.end.seq : null
      var [text, setText] = useState('')
      var [visible, setVisible] = useState(false)
      var [attached, setAttached] = useState(null)
      var anchorRef = useRef(null)

      useEffect(function () {
        if (!sessionId || endSeq === null || endSeq === undefined) {
          setVisible(false)
          return undefined
        }
        var stopped = false
        var controller = new AbortController()
        var timer = setTimeout(function () { controller.abort() }, 27000)
        setText('')
        setVisible(true)
        fetch(API + '/closing?session=' + encodeURIComponent(sessionId) + '&seq=' + encodeURIComponent(String(endSeq)) + '&wait=1', {
          cache: 'no-store',
          credentials: 'same-origin',
          signal: controller.signal,
        })
          .then(readJson)
          .then(function (data) {
            if (stopped) return
            if (data.enabled === false) {
              setVisible(false)
              return
            }
            if (data.closing && data.closing.text) setText(String(data.closing.text))
            else setVisible(false)
          })
          .catch(function () {
            if (!stopped) setVisible(false)
          })
          .finally(function () { clearTimeout(timer) })
        return function () {
          stopped = true
          clearTimeout(timer)
          controller.abort()
        }
      }, [sessionId, endSeq])

      useEffect(function () {
        hideInnerThoughts(document.body)
        if (!visible || !text) return undefined
        var anchor = anchorRef.current
        if (!anchor) return undefined
        var node = document.createElement('span')
        node.className = 'ap-turn-closing'
        node.setAttribute('data-agent-personality', 'closing')
        node.textContent = text
        node.title = 'agent-personality'

        var target = null
        function isCostSummary(node) {
          var content = node.textContent || ''
          return content.indexOf('本轮费用') >= 0 || content.indexOf('Turn cost') >= 0
        }
        function findSummary() {
          // The cost meter registers at order 10 and this entry at 11, so the
          // matching <summary> precedes this cell. Walking previous siblings
          // avoids grabbing a different turn's cost line.
          var cursor = anchor
          for (var depth = 0; depth < 7 && cursor; depth += 1) {
            var sibling = cursor.previousElementSibling
            while (sibling) {
              var candidates = []
              if (sibling.tagName === 'SUMMARY') candidates = [sibling]
              else if (sibling.querySelectorAll) candidates = sibling.querySelectorAll('summary')
              for (var i = 0; i < candidates.length; i += 1) {
                if (!isCostSummary(candidates[i])) continue
                if (candidates[i].querySelector('.ap-turn-closing')) continue
                return candidates[i]
              }
              sibling = sibling.previousElementSibling
            }
            cursor = cursor.parentElement
          }
          // Fallback: an ancestor-scoped lookup for layouts that wrap rows.
          var upper = anchor.parentElement
          for (var level = 0; level < 4 && upper; level += 1) {
            var nodes = upper.querySelectorAll('summary')
            for (var j = 0; j < nodes.length; j += 1) {
              if (!isCostSummary(nodes[j])) continue
              if (nodes[j].querySelector('.ap-turn-closing')) continue
              return nodes[j]
            }
            upper = upper.parentElement
          }
          return null
        }

        function ensure() {
          if (target && target.isConnected === false) target = null
          if (target === null) target = findSummary()
          if (target !== null) {
            // 一行费用后面只放一条心里话：重复挂上来的先清掉
            var stale = target.querySelectorAll('.ap-turn-closing')
            for (var s = 0; s < stale.length; s += 1) {
              if (stale[s] !== node && stale[s].parentNode) stale[s].parentNode.removeChild(stale[s])
            }
            // 「本轮费用 ≈ ¥0.23」整段常常只是一个文本节点，拆不开里面的金额：
            // 直接把收尾语补到费用行的末尾，永远落在金额之后，不会夹在标签和数字中间
            if (node.parentNode !== target) target.appendChild(node)
            else if (target.lastChild !== node) target.appendChild(node)
            setAttached(function (previous) { return previous === true ? previous : true })
          } else {
            setAttached(function (previous) { return previous === false ? previous : false })
          }
        }

        ensure()
        var interval = setInterval(ensure, 800)
        var stop = setTimeout(function () { clearInterval(interval) }, 22000)
        return function () {
          clearInterval(interval)
          clearTimeout(stop)
          try {
            if (node.parentNode) node.parentNode.removeChild(node)
          } catch (error) {
            // the summary was removed with its turn
          }
        }
      }, [visible, text])

      if (!visible || !text) return h('span', { ref: anchorRef, hidden: true, 'aria-hidden': 'true' })
      return h(
        'span',
        { ref: anchorRef, className: 'ap-turn-slot', title: 'agent-personality' },
        attached === false ? text : null,
      )
    }

    // ------------------------------------------------------------ helpers

    function Switch(props) {
      return h(
        'button',
        {
          type: 'button',
          role: 'switch',
          'aria-checked': props.checked ? 'true' : 'false',
          className: 'ap-switch' + (props.checked ? ' on' : ''),
          onClick: function () { props.onChange(!props.checked) },
          'aria-label': props.label,
        },
        h('i', null),
      )
    }

    function Row(props) {
      return h(
        'div',
        { className: 'ap-row' },
        h('div', null,
          h('div', { className: 'ap-row-label' }, props.label),
          props.desc ? h('div', { className: 'ap-row-desc' }, props.desc) : null,
        ),
        props.children,
      )
    }

    function Field(props) {
      return h(
        'label',
        { className: 'ap-field' },
        h('span', null, props.label),
        h('input', {
          className: 'ap-input',
          value: props.value,
          placeholder: props.placeholder || '',
          onChange: function (event) { props.onChange(event.target.value) },
        }),
      )
    }

    function shortTime(value) {
      if (!value) return '—'
      var date = new Date(value)
      if (Number.isNaN(date.getTime())) return String(value)
      var p = function (n) { return String(n).padStart(2, '0') }
      return (date.getMonth() + 1) + '-' + p(date.getDate()) + ' ' + p(date.getHours()) + ':' + p(date.getMinutes())
    }

    function fullTime(value) {
      if (!value) return '—'
      var date = new Date(value)
      if (Number.isNaN(date.getTime())) return String(value)
      var p = function (n) { return String(n).padStart(2, '0') }
      return date.getFullYear() + '-' + p(date.getMonth() + 1) + '-' + p(date.getDate()) + ' ' + p(date.getHours()) + ':' + p(date.getMinutes())
    }

    function bytesLabel(chars) {
      if (!Number.isFinite(Number(chars))) return '—'
      return Number(chars).toLocaleString() + ' 字符'
    }

    function tagLabel(tag) {
      if (tag === 'persona') return '人格'
      if (tag === 'relation') return '关系'
      if (tag === 'worldview') return '世界观'
      return '人格'
    }

    function signed(value) {
      var number = Number(value) || 0
      var text = Number.isInteger(number) ? String(number) : number.toFixed(2)
      return (number > 0 ? '+' : '') + text
    }

    function splitList(value) {
      return String(value || '')
        .split(/[、,，]/)
        .map(function (item) { return item.trim() })
        .filter(function (item) { return item !== '' })
    }

    // ------------------------------------------------------------ graph

    function NetworkGraph(props) {
      var center = props.center || '我'
      var rows = (props.rows || []).slice(0, 40)
      var links = (props.links || []).slice(0, 60)
      // 画布按卡片内宽设计（弯口 800），CSS 再拉满整格；人多了画布就长高
      var width = 880
      var [zoom, setZoom] = useState(1)
      // 放大之后左键拖动挪视野：pan 用画布坐标，拖动时按缩放比换算
      var [pan, setPan] = useState({ x: 0, y: 0 })
      var svgRef = useRef(null)
      var dragRef = useRef(null)
      var zoomRef = useRef(zoom)
      var panRef = useRef(pan)
      var skipClickRef = useRef(false)
      zoomRef.current = zoom
      panRef.current = pan
      useEffect(function () {
        var el = svgRef.current
        if (!el) return undefined
        function handleWheel(event) {
          if (!event.deltaY) return
          // 人超过 10 个：滚轮先用来往下翻，把剩下的人看全；放大就靠拖
          if ((props.rows || []).length > 10 && zoomRef.current <= 1) return
          event.preventDefault()

          setZoom(function (prev) {
            var next = prev * (event.deltaY < 0 ? 1.12 : 1 / 1.12)
            var value = Math.min(3, Math.max(0.5, Math.round(next * 100) / 100))
            if (value <= 1) setPan({ x: 0, y: 0 })
            return value
          })
        }
        function handleDown(event) {
          if (event.button !== 0 || zoomRef.current <= 1) return
          dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            baseX: panRef.current.x,
            baseY: panRef.current.y,
            moved: false,
          }
          if (typeof el.setPointerCapture === 'function') el.setPointerCapture(event.pointerId)
        }
        function handleMove(event) {
          var drag = dragRef.current
          if (!drag) return
          var dx = event.clientX - drag.startX
          var dy = event.clientY - drag.startY
          if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true
          if (!drag.moved) return
          event.preventDefault()
          var rect = el.getBoundingClientRect()
          var ratio = rect.width > 0 ? width / rect.width : 1
          setPan({ x: drag.baseX + dx * ratio, y: drag.baseY + dy * ratio })
        }
        function handleUp(event) {
          var drag = dragRef.current
          dragRef.current = null
          if (drag && drag.moved) {
            // 拖完别把这一下当成点了节点
            skipClickRef.current = true
            setTimeout(function () { skipClickRef.current = false }, 0)
          }
          if (typeof el.releasePointerCapture === 'function' && event.pointerId !== undefined) {
            try { el.releasePointerCapture(event.pointerId) } catch { /* 已经放开就算了 */ }
          }
        }
        function handleClick(event) {
          if (!skipClickRef.current) return
          skipClickRef.current = false
          event.stopPropagation()
          event.preventDefault()
        }
        el.addEventListener('wheel', handleWheel, { passive: false })
        el.addEventListener('pointerdown', handleDown)
        el.addEventListener('pointermove', handleMove)
        el.addEventListener('pointerup', handleUp)
        el.addEventListener('pointercancel', handleUp)
        el.addEventListener('click', handleClick, true)
        return function () {
          el.removeEventListener('wheel', handleWheel)
          el.removeEventListener('pointerdown', handleDown)
          el.removeEventListener('pointermove', handleMove)
          el.removeEventListener('pointerup', handleUp)
          el.removeEventListener('pointercancel', handleUp)
          el.removeEventListener('click', handleClick, true)
        }
      }, [])
      var count = Math.max(rows.length, 1)
      var height = Math.min(560, Math.max(400, 360 + rows.length * 20))
      var cx = width / 2
      var cy = height / 2
      // 圈一直撑到画布边上，人少也不缩成一小坨
      var radius = width / 2 - 96
      var radiusY = height / 2 - 62
      var nodes = rows.map(function (row, index) {
        var angle = (Math.PI * 2 * index) / count - Math.PI / 2
        return {
          name: row.name,
          x: cx + Math.cos(angle) * radius,
          y: cy + Math.sin(angle) * radiusY,
          top: Math.sin(angle) < -0.35,
        }
      })

      // 关系字贴在线的上侧右端：字的底边压在线段上面，顺着线的方向往上右铺开
      function pushEdgeLabel(children, key, x1, y1, x2, y2, text, onPick) {
        if (text === '') return
        var midX = (x1 + x2) / 2
        var midY = (y1 + y2) / 2
        // 字贴着线段走：按线段夹角顺时针转过去，翻过去的就再转 180° 保持正着看
        var deg = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI
        if (deg > 90) deg -= 180
        if (deg < -90) deg += 180
        children.push(h('text', {
          key: 'edge-' + key,
          className: 'ap-graph-edge',
          x: midX, y: midY,
          textAnchor: 'middle',

          // 基线贴着线上沿：dy 只留一点点缝，字的底边就在线段上面
          dy: -2,
          transform: 'rotate(' + deg.toFixed(1) + ' ' + midX + ' ' + midY + ')',
          onClick: onPick,
        }, text))
      }

      var children = []
      // 人物之间的连线先画，压在主节点下面
      var byName = {}
      nodes.forEach(function (node) { byName[String(node.name)] = node })
      links.forEach(function (link, index) {
        var a = byName[String(link.from || '')]
        var b = byName[String(link.to || '')]
        if (!a || !b) return
        // 弯一点，避免和「她—这个人」的直线叠在一起
        var mx = (a.x + b.x) / 2
        var my = (a.y + b.y) / 2
        var nx = -(b.y - a.y)
        var ny = b.x - a.x
        var len = Math.sqrt(nx * nx + ny * ny) || 1
        var bulge = 26
        var qx = mx + (nx / len) * bulge
        var qy = my + (ny / len) * bulge
        children.push(h('path', {
          key: 'link-path-' + index,
          d: 'M ' + a.x + ' ' + a.y + ' Q ' + qx + ' ' + qy + ' ' + b.x + ' ' + b.y,
          fill: 'none',
          stroke: 'var(--dsw-alias-border-l2)',
          strokeWidth: 1,
          strokeDasharray: '4 3',
        }))
        var label = String(link.label || '')
        if (label !== '') {
          // 取曲线正中间那一点，再顺着切线方向转过去：字贴在线的上侧、往右上铺开
          var lx = 0.25 * a.x + 0.5 * qx + 0.25 * b.x
          var ly = 0.25 * a.y + 0.5 * qy + 0.25 * b.y
          var tx = b.x - qx
          var ty = b.y - qy
          var deg = (Math.atan2(ty, tx) * 180) / Math.PI
          if (deg > 90) deg -= 180
          if (deg < -90) deg += 180
          children.push(h('text', {
            key: 'link-label-' + index,
            className: 'ap-graph-edge',
            x: lx,
            y: ly,
            textAnchor: 'middle',

            dy: -2,
            transform: 'rotate(' + deg.toFixed(1) + ' ' + lx + ' ' + ly + ')',
            onClick: function () {
              if (typeof props.onLink !== 'function') return
              var next = window.prompt('「' + a.name + '」和「' + b.name + '」之间', label)
              if (typeof next === 'string' && next !== label) props.onLink(index, next.slice(0, 20))
            },
          }, label))
        }
      })

      children.push(h('circle', { key: 'self-dot', className: 'self', cx: cx, cy: cy, r: 12 }))
      children.push(h('text', { key: 'self-text', x: cx, y: cy + 36, textAnchor: 'middle' }, center))
      nodes.forEach(function (node, index) {
        var relation = String((rows[index] && rows[index].relation) || '')
        children.push(h('line', {
          key: 'line-' + node.name,
          x1: cx, y1: cy, x2: node.x, y2: node.y,
          stroke: 'var(--dsw-alias-border-l2)',
          strokeWidth: 1,
        }))
        pushEdgeLabel(children, 'r' + index + '-' + node.name, cx, cy, node.x, node.y, relation, function () {
          if (typeof props.onEdge !== 'function') return
          var next = window.prompt('和「' + node.name + '」的关系', relation)
          if (typeof next === 'string' && next !== relation) props.onEdge(index, next.slice(0, 20))
        })
        children.push(h('circle', { key: 'dot-' + node.name, cx: node.x, cy: node.y, r: 7.5, fill: 'var(--dsw-alias-label-secondary)' }))
        children.push(h('text', {
          key: 'label-' + node.name,
          x: node.x,
          y: node.top ? node.y + 24 : node.y - 14,
          textAnchor: 'middle',
        }, node.name))
      })
      var svg = h('svg', {
        className: 'ap-graph',

        ref: svgRef,
        viewBox: '0 0 ' + width + ' ' + height,
        preserveAspectRatio: 'xMidYMid meet',
        role: 'img',
        style: { cursor: zoom > 1 ? 'grab' : 'zoom-in', touchAction: 'none' },
      }, h('g', {
        key: 'zoom-layer',
        transform: 'translate(' + (pan.x) + ' ' + (pan.y) + ') translate(' + cx + ' ' + cy + ') scale(' + zoom + ') translate(' + (-cx) + ' ' + (-cy) + ')',
      }, children))
      // 人多了就在卡片里滚动着看，别把下面的内容挤走
      if (rows.length <= 10) return svg
      return h('div', { className: 'ap-graph-scroll' }, svg)
    }

    // ------------------------------------------------------------ settings

    function Section() {
      var [state, setState] = useState(null)
      var [loading, setLoading] = useState(true)
      var [error, setError] = useState('')
      var [tab, setTab] = useState('persona')
      var [personaDraft, setPersonaDraft] = useState('')
      var [relationDraft, setRelationDraft] = useState('')
      var [relationDirty, setRelationDirty] = useState(false)
      var [learnPicked, setLearnPicked] = useState({})
      var [draftDirty, setDraftDirty] = useState(false)
      var [charDraft, setCharDraft] = useState(null)
      var [charDirty, setCharDirty] = useState(false)
      var [busy, setBusy] = useState('')
      var [toast, setToast] = useState(null)
      var [urlDraft, setUrlDraft] = useState('')
      var [showAllDiary, setShowAllDiary] = useState(false)
      var [openEvidence, setOpenEvidence] = useState(false)
      var [proactiveBusy, setProactiveBusy] = useState(false)
      var [proactiveNote, setProactiveNote] = useState('')
      var [proactiveDraft, setProactiveDraft] = useState('')
      var [openLearn, setOpenLearn] = useState('')
      var [focusMate, setFocusMate] = useState('')

      var notify = useCallback(function (kind, message) {
        setToast({ kind: kind, text: message })
      }, [])

      var adopt = useCallback(function (data) {
        setState(data)
        setPersonaDraft(data.persona.content)
        setRelationDraft((data.cardBodies && data.cardBodies.relation) || '')
        setRelationDirty(false)
        setCharDraft(JSON.parse(JSON.stringify(data.character)))
        charDraftLive = JSON.parse(JSON.stringify(data.character))
        setUrlDraft((data.config && data.config.learnUrl) || '')
        setProactiveDraft((data.config && data.config.proactiveSessionId) || '')
        setDraftDirty(false)
        setCharDirty(false)
      }, [])

      // 刷新时页面别跳动：记住外层滚动位置，重挂之后放回去
      var panelRef = useRef(null)
      function findScroller() {
        var node = panelRef.current
        while (node && node !== document.body) {
          if (node.scrollHeight > node.clientHeight + 4) {
            var style = window.getComputedStyle(node)
            if (/(auto|scroll)/.test(String(style.overflowY))) return node
          }
          node = node.parentElement
        }
        return document.scrollingElement || document.documentElement
      }
      function restoreScroll(top) {
        if (!(top > 0)) return
        // 等这一帧渲染完再放回去，不然会被随后的一次重排冲掉
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            var host = findScroller()
            if (host) host.scrollTop = top
          })
        })
      }
      var load = useCallback(function () {
        var scroller = findScroller()
        var top = scroller ? scroller.scrollTop : 0
        setLoading(true)
        apiGet('/state?cv=' + encodeURIComponent(CLIENT_BUILD))
          .then(function (data) {
            adopt(data)
            setError('')
            restoreScroll(top)
          })
          .catch(function (cause) { setError(cause.message) })
          .finally(function () { setLoading(false) })
      }, [adopt])

      useEffect(function () { load() }, [load])

      useEffect(function () {
        if (!toast) return undefined
        var timer = setTimeout(function () { setToast(null) }, 4600)
        return function () { clearTimeout(timer) }
      }, [toast])

      function run(key, promise, okText) {
        if (busy) return
        setBusy(key)
        promise
          .then(function (data) {
            if (okText) notify('ok', okText)
            return data
          })
          .catch(function (cause) { notify('err', cause.message) })
          .finally(function () { setBusy('') })
      }

      function savePersona() {
        run('save-persona', apiPost('/persona', { content: personaDraft }).then(function (data) {
          setState(function (previous) {
            var next = JSON.parse(JSON.stringify(previous))
            next.persona = data.persona
            return next
          })
          setDraftDirty(false)
        }), '人格已保存，下一轮生效')
      }

      function saveRelationMd() {
        run('save-relation', apiPost('/relation-md', { content: relationDraft }).then(function (data) {
          setState(function (previous) {
            var next = JSON.parse(JSON.stringify(previous))
            next.cardBodies = Object.assign({}, next.cardBodies, { relation: data.content })
            if (next.character) next.character.relationManual = data.manual === true
            return next
          })
          setRelationDirty(false)
        }), '关系文件已按你改的存下，卡面变动不会再覆盖它')
      }

      function rebuildRelationMd() {
        run('rebuild-relation', apiPost('/relation-md', { auto: true }).then(function (data) {
          setState(function (previous) {
            var next = JSON.parse(JSON.stringify(previous))
            next.cardBodies = Object.assign({}, next.cardBodies, { relation: data.content })
            if (next.character) next.character.relationManual = data.manual === true
            return next
          })
          setRelationDraft(data.content || '')
          setRelationDirty(false)
        }), '已经按卡面重写关系文件')
      }

      function saveSource() {
        run('source', apiPost('/config', {
          learnUrl: String(urlDraft || '').trim(),
        }).then(function () {
          notify('ok', '主动学习已保存')
          load()
        }), '')
      }

      // 「立即学习」：先把上面填的网址/作品存下去，再马上跑一次主动学习
      function learnNow() {
        run('learn-now', apiPost('/config', {
          learnUrl: String(urlDraft || '').trim(),
        }).then(function () {
          return apiPost('/research', {})
        }).then(function (data) {
          var report = data && data.report ? data.report : null
          notify(report && report.ok ? 'ok' : 'err', report && report.ok ? '这一轮学完了' : '这次没学成，下面有原因')
          load()
        }), '')
      }



      function saveProactiveSession() {
        var value = String(proactiveDraft || '').trim()
        if (value === '') {
          notify('err', '先把主动对话用的 Session ID 填进去')
          return
        }
        if (!/^session-[0-9a-zA-Z-]+$/.test(value)) {
          notify('err', 'Session ID 长这样：session-xxxx')
          return
        }
        run('proactive', apiPost('/config', { proactiveSessionId: value }).then(function () {
          setProactiveDraft(value)
          notify('ok', '主动对话会话已保存')
          load()
        }), '')
      }

      function confirmLearning() {
        var rows = (state.knowledge && state.knowledge.pending && state.knowledge.pending.entries) || []
        if (rows.length === 0) {
          notify('err', '没有待确认的内容')
          return
        }
        run('confirm', apiPost('/learning/confirm', { pick: rows }).then(function (data) {
          notify('ok', '已写入对应的那一份')
          setLearnPicked({})
          if (data.knowledge) {
            setState(function (previous) {
              var next = JSON.parse(JSON.stringify(previous))
              next.knowledge = data.knowledge
              return next
            })
          }
          load()
        }), '')
      }

      // 单条保存：只把这一条写进对应的那一份，别的留在待确认里
      function saveLearnItem(entry) {
        run('confirm-one', apiPost('/learning/confirm', { pick: [entry] }).then(function (data) {
          notify('ok', '这一条已写入')
          setLearnPicked({})
          if (data.knowledge) {
            setState(function (previous) {
              var next = JSON.parse(JSON.stringify(previous))
              next.knowledge = data.knowledge
              return next
            })
          }
          load()
        }), '')
      }

      // 单条舍弃：只把这一条从待确认里去掉，不动已经写好的内容
      function dropLearnItem(entry) {
        var pending = state.knowledge && state.knowledge.pending
        if (!pending || typeof pending.id !== 'string') return
        run('learn-drop', apiPost('/learning/delete', { id: pending.id, text: String(entry && entry.text || ''), tag: String(entry && entry.tag || '') }).then(function (data) {
          if (data.knowledge) {
            setState(function (previous) {
              var next = JSON.parse(JSON.stringify(previous))
              next.knowledge = data.knowledge
              return next
            })
          }
          notify('ok', '这一条不要了')
          load()
        }), '')
      }

      // 已确认里删一条：知识里去掉，对应的那一份 md 里也把那一行删掉
      function deleteConfirmedItem(rowId, entry) {
        run('learn-del-one', apiPost('/learning/delete', {
          id: String(rowId || ''),
          text: String(entry && entry.text || ''),
          tag: String(entry && entry.tag || ''),
          single: true,
        }).then(function (data) {
          if (data && data.knowledge) {
            setState(function (previous) {
              var next = JSON.parse(JSON.stringify(previous))
              next.knowledge = data.knowledge
              return next
            })
          }
          notify('ok', '已删除，那一份文件里也同步去掉了')
          load()
        }), '')
      }
      function deleteLearning(id) {
        run('learn-delete', apiPost('/learning/delete', { id: id }).then(function (data) {
          if (data.knowledge) {
            setState(function (previous) {
              var next = JSON.parse(JSON.stringify(previous))
              next.knowledge = data.knowledge
              return next
            })
          }
          notify('ok', '已删除，人格里的那行也一起删了')
          load()
        }), '')
      }

      function patchConfig(key, value) {
        setState(function (previous) {
          var next = JSON.parse(JSON.stringify(previous))
          next.config[key] = value
          return next
        })
        var patch = {}
        patch[key] = value
        apiPost('/config', patch)
          .then(function () {})
          .catch(function (cause) { notify('err', cause.message) })
      }

      // 改完停手 0.7 秒就自动存一次：卡面一改，Relation.md 当场跟着改
      function scheduleCharacterSave() {
        if (charSaveTimer !== null) clearTimeout(charSaveTimer)
        charSaveTimer = setTimeout(function () {
          charSaveTimer = null
          var draft = charDraftLive
          if (!draft) return
          apiPost('/character', { character: draft }).then(function (data) {
            setState(function (previous) {
              var next = JSON.parse(JSON.stringify(previous))
              next.character = data.character
              return next
            })
            setCharDirty(false)
            return apiGet('/state?cv=' + encodeURIComponent(CLIENT_BUILD))
          }).then(function (data) {
            if (!data) return
            setState(function (previous) {
              var next = JSON.parse(JSON.stringify(previous))
              if (data.cardBodies) next.cardBodies = data.cardBodies
              return next
            })
          }).catch(function () {})
        }, 700)
      }

      function saveCharacter() {
        if (charSaveTimer !== null) { clearTimeout(charSaveTimer); charSaveTimer = null }
        run('save-character', apiPost('/character', { character: charDraft }).then(function (data) {
          setState(function (previous) {
            var next = JSON.parse(JSON.stringify(previous))
            next.character = data.character
            return next
          })
          setCharDirty(false)
          load()
        }), '关系已保存')
      }

      function editRow(index, key, value) {
        setCharDraft(function (previous) {
          var next = JSON.parse(JSON.stringify(previous))
          next.relationships[index][key] = value
          charDraftLive = next
          return next
        })
        setCharDirty(true)
        scheduleCharacterSave()
      }

      function addRow() {
        setCharDraft(function (previous) {
          var next = JSON.parse(JSON.stringify(previous))
          next.relationships.push({ name: '', relation: '', group: '', notes: '' })
          charDraftLive = next
          return next
        })
        setCharDirty(true)
        scheduleCharacterSave()
      }

      function removeRow(index) {
        setCharDraft(function (previous) {
          var next = JSON.parse(JSON.stringify(previous))
          next.relationships.splice(index, 1)
          charDraftLive = next
          return next
        })
        setCharDirty(true)
        scheduleCharacterSave()
      }

      // 两个人之间的关系（不是和她）：一样改完就自动存，Relation.md 跟着改
      function editLink(index, key, value) {
        setCharDraft(function (previous) {
          var next = JSON.parse(JSON.stringify(previous))
          if (!Array.isArray(next.links)) next.links = []
          if (!next.links[index]) return next
          next.links[index][key] = value
          charDraftLive = next
          return next
        })
        setCharDirty(true)
        scheduleCharacterSave()
      }


      function deleteDiary(id) {
        run('diary', apiPost('/diary', { deleteId: id }).then(function (data) {
          setState(function (previous) {
            var next = JSON.parse(JSON.stringify(previous))
            next.diary = data.diary
            return next
          })
        }), '已删除这条记忆')
      }

      function clearDiary() {
        if (!window.confirm('清空全部日记？人格里「学到的」不会删除。')) return
        run('diary', apiPost('/diary', { clear: true }).then(function (data) {
          setState(function (previous) {
            var next = JSON.parse(JSON.stringify(previous))
            next.diary = data.diary
            return next
          })
        }), '日记已清空')
      }

      // 测试用：把情感推回初始值（50 / 精力满 / 平静）
      function resetEmotion() {
        if (!window.confirm('把情感变量推回初始值？情感会回到 50、精力满、心情平静，变化记录清空。')) return
        run('emotion-reset', apiPost('/emotion-reset', {}).then(function () {
          load()
        }), '情感变量已初始化')
      }

      // 清掉她图上所有的子智能体会话；清完就不再新建，等他再点一次恢复
      function clearJudgeChildren() {
        var paused = !!(state && state.judge && state.judge.paused)
        if (paused) {
          run('judge-clear', apiPost('/judge-clear', { resume: true }).then(function () {
            load()
          }), '子智能体已恢复')
          return
        }
        if (!window.confirm('清掉所有的子智能体会话？清完之后她就不再自己生新的，直到你再点一次恢复。')) return
        run('judge-clear', apiPost('/judge-clear', {}).then(function (data) {
          var count = Number(data && data.archived) || 0
          notify('ok', '清掉了 ' + count + ' 个子智能体会话，暂时不再新建')
          load()
        }))
      }

      function proactiveNow() {
        if (proactiveBusy) return
        setProactiveBusy(true)
        setProactiveNote('正在把话递过去…')
        apiPost('/proactive-now', {}).then(function (data) {
          var created = !!(data && data.created === true)
          var sessionId = (data && data.sessionId) || ''
          var where = (state && state.workspace && (state.workspace.effective || state.workspace.configured)) || ''
          var text = created
            ? '已在工作区里新建了主动会话' + (where ? '（' + where + '）' : '') + '，她在那儿开口了'
            : '已经在她的会话里开口了' + (sessionId ? '：' + sessionId.replace(/^session-/, '').slice(0, 8) : '') + '，没归档就会一直用那一个'
          setProactiveNote(text)
          notify('ok', text)
          setProactiveBusy(false)
        }).catch(function (error) {
          var message = '主动对话失败：' + (error && error.message ? error.message : error)
          setProactiveNote(message)
          notify('err', message)
          setProactiveBusy(false)
        })
      }

      if (loading && !state) return h('div', { className: 'ap-root' }, h('div', { className: 'ap-loading' }, '正在读取人格数据…'))
      if (error !== '') {
        return h('div', { className: 'ap-root' },
          h('div', { className: 'ap-error', role: 'alert' }, error),
          h('div', { className: 'ap-toolbar' }, h('button', { type: 'button', className: 'ap-btn', onClick: load }, '重试')),
        )
      }
      if (!state) return h('div', { className: 'ap-root' }, h('div', { className: 'ap-loading' }, '…'))

var emotion = state.emotion || { affection: 50, mood: '平静', energy: 100, stage: { label: '平常' }, evidence: [] }
      var affection = Math.max(0, Math.min(100, Number(emotion.affection) || 0))
      var energy = Math.max(0, Math.min(100, Number(emotion.energy) || 0))
      var evidence = emotion.evidence || []
      var judgePaused = !!(state.judge && state.judge.paused)
      var memory = state.memory || { bytes: 0, limit: 2048 * 1024 }
      var memoryPercent = memory.limit > 0 ? Math.min(100, (memory.bytes / memory.limit) * 100) : 0
      var knowledge = state.knowledge || {}
      var cards = state.cards || {}
      var learnedFacts = (knowledge.facts || []).map(function (row) {
        return String((row && row.text) || row || '').trim()
      }).filter(function (text) { return text !== '' })
      var confirmed = knowledge.confirmed || []
      var pending = knowledge.pending || null

      var emotionCard = h('div', { className: 'ap-card' },
        h('h3', null, '情感变量'),
        h('div', { className: 'ap-meter-head' },
          h('span', null, '情感'),
          h('span', null, Math.round(affection) + '%'),
        ),
        h('div', { className: 'ap-gradient ap-emotion' }, h('i', { style: { left: affection + '%' } })),
        h('div', { className: 'ap-meter-head', style: { marginTop: '14px' } },
          h('span', null, '精力'),
          h('span', null, Math.round(energy) + '%'),
        ),
        h('div', { className: 'ap-gradient ap-energy' }, h('i', { style: { left: energy + '%' } })),
        h('div', { className: 'ap-toolbar', style: { marginTop: '14px' } },
          h('button', {
            type: 'button',
            className: 'ap-btn',
            disabled: busy !== '',
            onClick: resetEmotion,
            title: '把情感和精力推回初始值，方便试档位',
          }, '初始化情感变量'),
          h('div', { className: 'ap-spacer' }),
          h('button', {
            type: 'button',
            className: 'ap-btn ' + (judgePaused ? '' : 'danger'),
            disabled: busy !== '',
            onClick: clearJudgeChildren,
            title: judgePaused ? '她已经不再自己生新的子智能体了，点这里恢复' : '清掉她图上所有的子智能体会话，并且清完不再新建',
          }, judgePaused ? '恢复子智能体' : '清除子智能体会话'),
        ),
        evidence.length === 0
          ? h('div', { className: 'ap-empty', style: { marginTop: '12px' } }, '还没有变化记录。每轮聊完都会记一条。')
          : h('div', { className: 'ap-ev' },
              h('button', {
                type: 'button',
                className: 'ap-ev-head' + (openEvidence ? ' open' : ''),
                onClick: function () { setOpenEvidence(!openEvidence) },
                title: openEvidence ? '收起变化证据' : '展开变化证据'
              },
                h('span', { className: 'ap-ev-title' }, '变化证据'),
                h('span', { className: 'ap-ev-chip' }, evidence.length + ' 条'),
                h('span', { className: 'ap-ev-caret' }, openEvidence ? '▴' : '▾'),
              ),
              openEvidence
                ? h('div', { className: 'ap-ev-list' },
                    ...evidence.map(function (row, index) {
                      var delta = Number(row.delta)
                      var positive = delta > 0
                      var isEnergy = row.kind === 'energy'
                      return h('div', { className: 'ap-ev-item ' + (positive ? 'up' : 'down'), key: 'ev' + index },
                        h('span', { className: 'ap-ev-badge' + (isEnergy ? ' energy' : '') }, isEnergy ? '精力' : '情感'),
                        h('span', { className: 'ap-ev-delta' }, signed(delta)),
                        h('span', { className: 'ap-ev-text', title: String(row.reason || '') }, row.reason || '—'),
                        h('span', { className: 'ap-ev-time' }, fullTime(row.at)),
                      )
                    }),
                  )
                : null,
            ),
      )

      var personaPanel = h('div', null,
        emotionCard,
        h('div', { className: 'ap-card' },
          h('h3', null, '人格 ', h('small', null, (state.persona.name || '（未命名）') + ' · ' + bytesLabel(state.persona.chars))),
          h('textarea', {
            className: 'ap-textarea',
            value: personaDraft,
            spellCheck: false,
            onChange: function (event) { setPersonaDraft(event.target.value); setDraftDirty(true) },
          }),
          h('div', { className: 'ap-toolbar' },
            h('button', { type: 'button', className: 'ap-btn primary', disabled: busy !== '', onClick: savePersona }, '保存'),
            h('span', { className: 'ap-note' }, draftDirty ? '有未保存修改' : '已保存 · ' + shortTime(state.persona.updatedAt)),
          ),
        ),
      )

      var personaId = (state.config && state.config.personaSessionId) || ''
      // 记忆只记家里的对话（绑定会话 + 她主动开口的会话）；工位上的留在「最近在忙的事」
      var homeIds = [personaId, (state.config && state.config.proactiveSessionId) || '']
        .map(function (item) { return String(item || '').trim() })
        .filter(function (item) { return item !== '' })
      var diaryRows = homeIds.length === 0
        ? (state.diary || [])
        : (state.diary || []).filter(function (row) {
            var rowSession = String(row.sessionId || '')
            return rowSession === '' || homeIds.indexOf(rowSession) >= 0
          })
      var memoryPanel = h('div', null,
        h('div', { className: 'ap-card' },
          h('h3', null, '记忆 ', h('small', null, (memory.bytes / 1024).toFixed(1) + ' KB / ' + (memory.limit / 1024 / 1024).toFixed(0) + ' MB')),
          h('div', { className: 'ap-bar' }, h('i', { style: { width: Math.max(2, memoryPercent) + '%' } })),
          h('div', { className: 'ap-toolbar' },
            h('button', { type: 'button', className: 'ap-btn primary', title: '记忆只记家里这个会话', onClick: function () { setShowAllDiary(true) } }, '家'),
            h('button', {
              type: 'button',
              className: 'ap-btn',
              disabled: proactiveBusy,
              onClick: proactiveNow,
            }, proactiveBusy ? '正在开口…' : '立即主动对话'),
            h('div', { className: 'ap-spacer' }),
            h('button', { type: 'button', className: 'ap-btn danger', disabled: busy !== '' || diaryRows.length === 0, onClick: clearDiary }, '清空日记'),
          ),
          proactiveNote !== ''
            ? h('div', { className: 'ap-note', style: { marginTop: '8px' } }, proactiveNote)
            : null,
        ),
        h('div', { className: 'ap-card' },
          h('h3', null, '日记 ', h('small', null, diaryRows.length + ' 条 · 满了先淡忘最旧的')),
          diaryRows.length === 0
            ? h('div', { className: 'ap-empty', style: { marginTop: '12px' } }, '还没有日记。在家里聊完一轮就会自动出现。')
            : h('div', { className: 'ap-diary' },
                ...diaryRows.map(function (row) {
                  return h('div', { className: 'ap-diary-row', key: row.id },
                    h('div', { className: 'ap-diary-time' }, fullTime(row.at)),
                    h('div', { className: 'ap-diary-body' },
                      h('div', { className: 'ap-diary-text' }, row.summary || '（空）'),
                    ),
                    h('button', { type: 'button', className: 'ap-btn tiny ghost', title: '删除这条', onClick: function () { deleteDiary(row.id) } }, '×'),
                  )
                }),
              ),
        ),
      )

      var character = charDraft || { name: '', aliases: [], gender: '', appearance: '', hobbies: [], team: '', relationships: [] }
      function editRelation(index, value) {
        var rows = (character.relationships || []).map(function (row, cursor) {
          return cursor === index ? Object.assign({}, row, { relation: value }) : row
        })
        setCharDraft(Object.assign({}, character, { relationships: rows }))
        charDraftLive = Object.assign({}, character, { relationships: rows })
        setCharDirty(true)
        scheduleCharacterSave()
      }
      // 关系卡面：一行两张卡，点一张就地展开全部字段
      var mateRows = character.relationships || []
      var mateCards = mateRows.map(function (row, index) {
        var meta = [row.group, row.relation].map(function (item) { return String(item || '').trim() }).filter(function (item) { return item !== '' }).join(' · ')
        var name = String(row.name || '').trim()
        var learned = name === '' ? [] : learnedFacts.filter(function (text) { return text.indexOf(name) >= 0 }).slice(0, 3)
        var focused = focusMate === 'mate' + index
        return h('div', {
          className: 'ap-mate-card' + (focused ? ' open' : ''),
          key: 'mate' + index,
          onClick: function (event) {
            var tag = String((event && event.target && event.target.tagName) || '')
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'A' || tag === 'SELECT') return
            if (focused) setFocusMate('')
            else setFocusMate('mate' + index)
          },
        },
          h('div', { className: 'ap-deck-face' },
            h('span', { className: 'ap-deck-avatar' }, name.slice(0, 1) || '？'),
            h('div', { className: 'ap-deck-title' },
              h('div', { className: 'ap-deck-name' }, name || '未命名'),
              h('div', { className: 'ap-deck-meta' }, meta !== '' ? meta : '所属还没填'),
            ),
            h('div', { className: 'ap-spacer' }),
            h('span', { className: 'ap-mate-toggle' }, focused ? '收起' : '展开'),
          ),
          focused
            ? h('div', { className: 'ap-deck-body' },
                h('label', { className: 'ap-deck-field' },
                  h('small', null, '名字'),
                  h('input', { value: row.name, onChange: function (event) { editRow(index, 'name', event.target.value) } }),
                ),
                h('label', { className: 'ap-deck-field' },
                  h('small', null, '所属'),
                  h('input', { value: row.group, onChange: function (event) { editRow(index, 'group', event.target.value) } }),
                ),
                h('label', { className: 'ap-deck-field' },
                  h('small', null, '和我的关系'),
                  h('input', { value: row.relation, onChange: function (event) { editRow(index, 'relation', event.target.value) } }),
                ),
                h('label', { className: 'ap-deck-field' },
                  h('small', null, '基本信息（一行一条，写成「外观：…」「生日：…」）'),
                  h('textarea', { className: 'ap-deck-notes', value: row.notes, onChange: function (event) { editRow(index, 'notes', event.target.value) } }),
                ),
                learned.length > 0
                  ? h('ul', { className: 'ap-mate-facts' }, learned.map(function (text, cursor) {
                      return h('li', { key: 'fact' + cursor }, text.length > 120 ? text.slice(0, 120) + '…' : text)
                    }))
                  : null,
                h('div', { className: 'ap-toolbar' },
                  h('button', { type: 'button', className: 'ap-btn tiny ghost', onClick: function () { setFocusMate('') } }, '收起'),
                  h('div', { className: 'ap-spacer' }),
                  h('button', { type: 'button', className: 'ap-btn tiny ghost', onClick: function () { removeRow(index); setFocusMate('') } }, '× 删掉这张'),
                ),
              )
            : null,
        )
      })

      var networkPanel = h('div', null,
        // 关系图放在最上面，卡面在它下面
        h('div', { className: 'ap-card' },
          h('h3', null, '关系图 ', h('small', null, '点连线上的字可以直接改')),
          mateRows.length > 0
            ? h(NetworkGraph, {
                center: character.name || '我',
                rows: character.relationships,
                links: character.links || [],
                onEdge: editRelation,
                onLink: function (index, value) { editLink(index, 'label', value) },
              })
            : h('div', { className: 'ap-empty' }, '还没有关系条目。'),
        ),
        h('div', { className: 'ap-card' },
          h('h3', null, '关系 ', h('small', null, mateRows.length + ' 张卡面 · 点一张就展开')),
          mateRows.length > 0
            ? h('div', { className: 'ap-mate-list' }, ...mateCards)
            : h('div', { className: 'ap-empty', style: { marginTop: '10px' } }, '还没有关系条目，下面加一条吧。'),
          h('div', { className: 'ap-toolbar' },
            h('button', { type: 'button', className: 'ap-btn', onClick: function () { addRow(); setFocusMate('') } }, '+ 添加关系'),
            h('div', { className: 'ap-spacer' }),
            h('button', { type: 'button', className: 'ap-btn primary', disabled: busy !== '', onClick: saveCharacter }, '保存'),
          ),
        ),
        h('div', { className: 'ap-card' },
          h('h3', null, '关系 ', h('small', null, '插件按卡面自动生成，想手改就直接改这里')),
          h('textarea', {
            className: 'ap-textarea',
            value: relationDraft,
            spellCheck: false,
            onChange: function (event) { setRelationDraft(event.target.value); setRelationDirty(true) },
          }),
          h('div', { className: 'ap-toolbar' },
            h('button', { type: 'button', className: 'ap-btn primary', disabled: busy !== '', onClick: saveRelationMd }, '保存'),
            h('button', { type: 'button', className: 'ap-btn ghost', disabled: busy !== '', onClick: rebuildRelationMd }, '按卡面重写'),
            h('span', { className: 'ap-note' },
              relationDirty
                ? '有未保存修改'
                : state.character && state.character.relationManual === true
                  ? '现在是手改的版本，卡面改动不会再覆盖它'
                  : '跟着卡面自动更新'),
          ),
        ),
      )

      var config = state.config || {}
      var sourcePanel = h('div', null,
        h('div', { className: 'ap-card' },
          h('h3', null, '主动学习 ', h('small', null, '主要学习内容')),
          h('div', { className: 'ap-grid' },
            h(Field, { label: '学习网址', value: urlDraft, placeholder: 'https://example.com/wiki', onChange: setUrlDraft }),
          ),
          h('div', { className: 'ap-toolbar' },
            h('button', { type: 'button', className: 'ap-btn primary', disabled: busy !== '', onClick: saveSource }, '保存'),
            h('button', { type: 'button', className: 'ap-btn', disabled: busy !== '', onClick: learnNow }, '立即学习'),
          ),
        ),
        h('div', { className: 'ap-card' },
          h('h3', null, '学习内容 ', h('small', null, '确认后才会写进对应的那一份')),
          pending
            ? h('div', { className: 'ap-pending' },
                h('div', { className: 'ap-pending-head' },
                  h('strong', null, '待确认'),
                  h('span', { className: 'ap-note' }, fullTime(pending.at)),
                ),
                (pending.entries || []).length > 0
                  ? h('div', { className: 'ap-learn-groups' },
                      ...LEARN_GROUPS.map(function (group) {
                        var rows = (pending.entries || [])
                          .map(function (entry, index) { return { entry: entry, index: index } })
                          .filter(function (item) { return learnTagOf(item.entry.tag) === group.id })
                        if (rows.length === 0) return null
                        return h('div', { className: 'ap-learn-group', key: 'lg-' + group.id },
                          h('div', { className: 'ap-learn-head' },
                            h('strong', null, group.label),
                            h('span', { className: 'ap-note' }, rows.length + ' 条 → ' + group.target + ' · ' + group.hint),
                          ),
                          h('div', { className: 'ap-learn-list' },
                            ...rows.map(function (item) {
                              var key = learnKey(item.entry, item.index)
                              var from = item.entry.url || (pending.urls && pending.urls[0]) || ''
                              return h('div', {
                                className: 'ap-learn-item',
                                key: key,
                                title: from !== '' ? '来源：' + from : '',
                              },
                                h('span', { className: 'ap-learn-text' }, String(item.entry.text || '')),
                                h('span', { className: 'ap-learn-acts' },
                                  h('button', {
                                    type: 'button',
                                    className: 'ap-btn tiny ghost',
                                    disabled: busy !== '',
                                    onClick: function () { dropLearnItem(item.entry) },
                                  }, '舍弃'),
                                  h('button', {
                                    type: 'button',
                                    className: 'ap-btn tiny primary',
                                    disabled: busy !== '',
                                    onClick: function () { saveLearnItem(item.entry) },
                                  }, '保存'),
                                ),
                              )
                            }),
                          ),
                        )
                      }),
                    )
                  : null,
                h('div', { className: 'ap-toolbar' },
                  h('button', { type: 'button', className: 'ap-btn primary', disabled: busy !== '', onClick: confirmLearning }, '全部写入'),
                  h('button', { type: 'button', className: 'ap-btn', disabled: busy !== '', onClick: function () { deleteLearning(pending.id) } }, '全部舍弃'),
                ),
              )
            : null,
          (function () {
            var flat = []
            confirmed.forEach(function (row) {
              (row.entries || []).forEach(function (entry, index) {
                flat.push({ row: row, entry: entry, key: String(row.id) + ':' + index })
              })
            })
            if (flat.length === 0) {
              return h('div', { className: 'ap-pending', style: { marginTop: '10px' } },
                h('div', { className: 'ap-pending-head' }, h('strong', null, '已确认')),
                h('div', { className: 'ap-empty' }, '还没有确认过的学习结果。'),
              )
            }
            return h('div', { className: 'ap-pending', style: { marginTop: '10px' } },
              h('div', { className: 'ap-pending-head' },
                h('strong', null, '已确认'),
                h('span', { className: 'ap-note' }, flat.length + ' 条 · 写进对应的那一份，删掉也会同步删掉'),
              ),
              h('div', { className: 'ap-learn-groups' },
                ...LEARN_GROUPS.map(function (group) {
                  var rows = flat.filter(function (item) { return learnTagOf(item.entry.tag) === group.id })
                  if (rows.length === 0) return null
                  return h('div', { className: 'ap-learn-group', key: 'cg-' + group.id },
                    h('div', { className: 'ap-learn-head' },
                      h('strong', null, group.label),
                      h('span', { className: 'ap-note' }, rows.length + ' 条 → ' + group.target + ' · ' + group.hint),
                    ),
                    h('div', { className: 'ap-learn-list' },
                      ...rows.map(function (item) {
                        var from = item.entry.url || (item.row.urls && item.row.urls[0]) || ''
                        return h('div', {
                          className: 'ap-learn-item',
                          key: item.key,
                          title: from !== '' ? '来源：' + from : '',
                        },
                          h('span', { className: 'ap-learn-text' }, String(item.entry.text || '')),
                          h('span', { className: 'ap-learn-acts' },
                            h('button', {
                              type: 'button',
                              className: 'ap-btn tiny ghost',
                              disabled: busy !== '',
                              onClick: function () { deleteConfirmedItem(item.row.id, item.entry) },
                            }, '删除'),
                          ),
                        )
                      }),
                    ),
                  )
                }),
              ),
            )
          })(),
        ),
      )

      var settingsPanel = h('div', null,
        h('div', { className: 'ap-card' },
          h('h3', null, '开关'),
          h(Row, { label: '主动学习' },
            h(Switch, { checked: config.learning !== false, label: '主动学习', onChange: function (value) { patchConfig('learning', value) } })),
          h(Row, { label: '主动对话' },
            h(Switch, { checked: config.proactive !== false, label: '主动对话', onChange: function (value) { patchConfig('proactive', value) } })),
          h(Row, { label: '子智能体模拟判断' },
            h(Switch, {
              checked: config.judgeBySubagent !== false,
              label: '子智能体模拟判断',
              onChange: function (value) { patchConfig('judgeBySubagent', value) },
            })),
          h('div', { className: 'ap-grid' },
            h('label', { className: 'ap-field' },
              h('input', {
                className: 'ap-input',
                type: 'text',
                placeholder: '主动对话Session ID',
                value: proactiveDraft,
                onChange: function (event) { setProactiveDraft(event.target.value) },
              }),
            ),
          ),
          h('div', { className: 'ap-toolbar' },
            h('button', { type: 'button', className: 'ap-btn primary', disabled: busy !== '', onClick: saveProactiveSession }, '保存'),
          ),
        ),
        h('div', { className: 'ap-card' },
          h('h3', null, '状态与路径'),
          h('div', { className: 'ap-grid' },
            ...[
              ['数据目录', state.dataDir],
              ['信息 Information.md', cards.personality || (state.persona && state.persona.path)],
              ['记忆 Memory.md', cards.memory],
              ['情感与精力 EmotionsEnergy.md', cards.emotions],
              ['关系 Relation.md', cards.relation],
              ['陪伴日期', state.since ? String(state.since).slice(0, 10) : ''],
            ].map(function (row, index) {
              var label = row[0]
              var target = String(row[1] || '')
              return h('div', { className: 'ap-kv', key: 'card' + index },
                h('small', null, label),
                h('code', null, target === '' ? '—' : target),
              )
            }),
          ),
          knowledge.lastError ? h('p', { className: 'ap-note' }, '上次学习失败：' + knowledge.lastError) : null,
          state.plan && state.plan.lastError ? h('p', { className: 'ap-note' }, '定时提醒：' + state.plan.lastError) : null,
        ),
      )

      return h('div', { className: 'ap-root', ref: panelRef },
        h('div', { className: 'ap-head' },
          h('div', null,
            h('h2', { className: 'ap-title' }, '人格与情感'),
            h('p', { className: 'ap-sub' }, '人格是底，情感是变量，说话特点是最后一层。'),
          ),
          h('div', { className: 'ap-pill' + (config.enabled !== false ? ' on' : '') }, config.enabled !== false ? '已启用' : '已停用'),
          h('span', { className: 'ap-ver' }, 'btn-v7'),
        ),
        h('div', { className: 'ap-tabs' },
          ...TABS.map(function (item) {
            return h('button', {
              key: item.id,
              type: 'button',
              className: 'ap-tab' + (tab === item.id ? ' active' : ''),
              onClick: function () { setTab(item.id) },
            }, item.label)
          }),
        ),
        tab === 'persona' ? personaPanel : null,
        tab === 'memory' ? memoryPanel : null,
        tab === 'network' ? networkPanel : null,
        tab === 'source' ? sourcePanel : null,
        tab === 'settings' ? settingsPanel : null,
        toast ? h('div', { className: 'ap-toast ' + (toast.kind === 'err' ? 'err' : 'ok') }, toast.text) : null,
      )
    }

    // ------------------------------------------------------------ boundary

    class Boundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      static getDerivedStateFromError(error) {
        return { error: error }
      }

      componentDidCatch(error) {
        console.error('[agent-personality] settings section crashed', error)
      }

      render() {
        if (this.state.error) {
          return h('div', { className: 'ap-root' },
            h('div', { className: 'ap-error', role: 'alert' },
              '人格与情感设置页出错：' + String(this.state.error && this.state.error.message ? this.state.error.message : this.state.error)),
            h('button', { type: 'button', className: 'ap-btn', onClick: function () { this.setState({ error: null }) }.bind(this) }, '重试'),
          )
        }
        return this.props.children
      }
    }

    // ------------------------------------------------------------ apply

    function apply(ctx) {
      ctx.effect(function () {
        var id = 'dsh-agent-personality-styles'
        if (document.getElementById(id) === null) {
          var style = document.createElement('style')
          style.id = id
          style.setAttribute('data-dsh-agent-personality', '')
          style.textContent = CSS
          document.head.appendChild(style)
          // 样式以宿主实时下发为准，这样改样式不必重启客户端
          fetch(API + '/ui.css?t=' + Date.now(), { cache: 'no-store', credentials: 'same-origin' })
            .then(function (response) { return response.ok ? response.text() : '' })
            .then(function (text) {
              if (text && text.indexOf('.ap-') !== -1 && style.parentNode !== null) style.textContent = text
            })
            .catch(function () { })
        }
        return function () {
          var element = document.getElementById(id)
          if (element !== null && element.parentNode !== null) element.parentNode.removeChild(element)
        }
      }, 'agent-personality: styles')

      ctx.slots.inject('conversation.chat.turnTail', function () {
        return ctx.slots.register({
          name: 'conversation.chat.turnTail',
          id: 'agent-personality-turn',
          order: 11,
          locale: NS,
        }, TurnTail)
      })

      ctx.slots.inject('settings.section', function () {
        return ctx.slots.register({
          name: 'settings.section',
          id: 'agent-personality',
          order: 47,
          locale: NS,
          label: function () { return '人格与情感' },
        }, function (props) {
          return h(Boundary, null, h(Section, props || {}))
        })
      })
    }

    return {
      name: 'agent-personality',
      inject: ['slots'],
      apply: apply,
    }
  },
})
